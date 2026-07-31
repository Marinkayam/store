import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { randomPassword } from "@/lib/otp";

// GET /enter/[token] — כניסה בקישור חד-פעמי, בלי סמס.
//
// הילדה מקבלת את הקישור בוואטסאפ מהמנהלת ולוחצת. הטוקן נשרף מיד
// (עדכון אטומי — שתי לחיצות במקביל לא פותחות שני סשנים), ואז נפתח
// סשן לאותו חשבון טלפון בדיוק כמו בכניסת סמס: אותה משתמשת, אותו
// אוסף, אותה חנות. שום דבר לא נמחק ולא נוצר כפול.
//
// זיהוי המשתמשת ופתיחת הסשן משוכפלים בכוונה מ-/api/auth/sms/verify
// ולא חולצו לפונקציה משותפת: מסלול הכניסה בסמס הוא הקריטי במערכת,
// ולא נוגעים בו בשביל מסלול גיבוי.

const syntheticEmail = (phone: string) => `${phone}@phone.duchan.app`;

/** מסך כישלון קטן: מה קרה ומה עושים, בלי ז'רגון. */
function failPage(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<style>body{font-family:Heebo,system-ui,sans-serif;background:#fbf8f3;color:#262626;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.c{max-width:22rem}h1{font-size:1.25rem;margin:0 0 8px}p{color:#5b564e;line-height:1.7;margin:0 0 20px}
a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 28px;
border-radius:999px;background:#756192;color:#fff;text-decoration:none;font-weight:500}</style></head>
<body><div class="c"><h1>${title}</h1><p>${body}</p><a href="/login">לכניסה עם קוד</a></div></body></html>`,
    { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return failPage("הקישור לא תקין", "נראה שהקישור הגיע חתוך. בקשי קישור חדש ממי ששלחה לך אותו.");
  }

  const db = supabaseAdmin();

  /* שריפה אטומית: רק הבקשה שתפסה את השורה כשעוד לא נוצלה ממשיכה */
  const { data: link } = await db
    .from("login_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("phone, pilot_token")
    .maybeSingle();

  if (!link?.phone) {
    return failPage(
      "הקישור כבר נוצל או שפג תוקפו",
      "קישור כניסה עובד פעם אחת בלבד, ל-24 שעות. בקשי חדש ממי ששלחה לך אותו."
    );
  }
  const phone = link.phone;

  /* ── מי המשתמשת — אותם שלושה שלבים כמו באימות סמס ── */
  let userId: string | null = null;
  const { data: known } = await db.from("phone_accounts").select("user_id").eq("phone", phone).maybeSingle();
  if (known) {
    userId = known.user_id;
  } else {
    const { data: existingStore } = await db
      .from("stores")
      .select("owner_id")
      .eq("contact_phone", phone)
      .not("owner_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingStore?.owner_id) {
      userId = existingStore.owner_id;
    } else {
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email: syntheticEmail(phone),
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { phone },
      });
      if (createErr || !created.user) {
        return failPage("לא הצלחנו להיכנס", "משהו השתבש אצלנו. נסי ללחוץ שוב על הקישור בעוד רגע.");
      }
      userId = created.user.id;
    }
    await db.from("phone_accounts").insert({ phone, user_id: userId });
  }
  if (!userId) return failPage("לא הצלחנו להיכנס", "נסי שוב בעוד רגע.");

  const { data: existing } = await db.auth.admin.getUserById(userId);
  const email = existing.user?.email;
  if (!email) return failPage("לא הצלחנו להיכנס", "נסי שוב בעוד רגע.");

  /* ── פתיחת סשן — magic link שנצרך כאן בשרת, כמו באימות סמס ── */
  const supa = await supabaseServer();
  let signedIn = false;
  try {
    const { data: gen, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const hashed = gen?.properties?.hashed_token;
    if (!linkErr && hashed) {
      const { error } = await supa.auth.verifyOtp({ token_hash: hashed, type: "email" });
      if (!error) signedIn = true;
      else console.error("[enter] verifyOtp failed:", error.message);
    } else {
      console.error("[enter] generateLink unavailable:", linkErr?.message ?? "no hashed_token");
    }
  } catch (e) {
    console.error("[enter] magic link path threw:", e instanceof Error ? e.message : e);
  }
  if (!signedIn) {
    const password = randomPassword();
    const { error: updErr } = await db.auth.admin.updateUserById(userId, { password });
    if (updErr) return failPage("לא הצלחנו להיכנס", "נסי שוב בעוד רגע.");
    const { error: signInErr } = await supa.auth.signInWithPassword({ email, password });
    if (signInErr) return failPage("לא הצלחנו להיכנס", "נסי שוב בעוד רגע.");
  }

  /* ── סימון פיילוט לילדה חדשה — אותו מנגנון כמו במסלול הסמס ── */
  if (link.pilot_token) {
    const { data: claimed } = await db.rpc("squish_claim_pilot_token", {
      p_token: link.pilot_token,
      p_user: userId,
    });
    if (claimed !== true) console.error(JSON.stringify({ op: "enter.pilot.claim", result: "rejected" }));
  }

  /* ── לאן: חנות ← דשבורד; אוסף ← האוסף; כלום ← סקוויש ── */
  const [{ data: store }, { data: profile }] = await Promise.all([
    db.from("stores").select("id").eq("owner_id", userId).limit(1).maybeSingle(),
    db.from("squish_profiles").select("id").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  const dest = store ? "/dashboard" : profile ? "/squish/collection" : "/squish";
  return NextResponse.redirect(new URL(dest, _req.nextUrl.origin));
}
