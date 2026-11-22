import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { randomPassword } from "@/lib/otp";
import { logLoginEvent } from "@/lib/login-events";
import { STALL_SVG, EMPTY_STALL_SVG } from "./stall-svg";

// /enter/[token] — כניסה בקישור חד-פעמי, בלי סמס.
//
// **שני צעדים, לא אחד — בגלל וואטסאפ.** כששולחים קישור בוואטסאפ,
// השרתים שלו פותחים אותו (GET) כדי לייצר תצוגה מקדימה — ובגרסה
// הראשונה זה שרף את הטוקן לפני שהילדה בכלל לחצה. לכן:
//   GET  — רק בודק שהקישור בתוקף ומציג כפתור "להיכנס". לא שורף.
//   POST — הלחיצה על הכפתור. שורף אטומית ופותח סשן.
// בוטים של תצוגה מקדימה עושים GET ולא לוחצים על כפתורים.
//
// הסשן נפתח לאותו חשבון טלפון בדיוק כמו בכניסת סמס: אותה משתמשת,
// אותו אוסף, אותה חנות. שום דבר לא נמחק ולא נוצר כפול.
//
// זיהוי המשתמשת ופתיחת הסשן משוכפלים בכוונה מ-/api/auth/sms/verify
// ולא חולצו לפונקציה משותפת: מסלול הכניסה בסמס הוא הקריטי במערכת,
// ולא נוגעים בו בשביל מסלול גיבוי.

const syntheticEmail = (phone: string) => `${phone}@phone.duchan.app`;

/* ── מסכי הדוכן (?to=store) בשפה של דוכן ──
   מרינה, 11.2026, על המסך הקודם (אימוג'י שקית ועיגול סגול): "תעצב את זה
   בסגנון של הדוכן יפה עם הוראות". האיור הוא הדוכן של מסך הפתיחה, הכפתור
   מרובע ושחור כמו בכל האפליקציה, ומתחתיו שלושה צעדים קצרים: ילדה שנכנסת
   בקישור הזה היא בדרך כלל ילדה שהסמס לא הגיע אליה, ושנתקעה פעם. */

function storeShell(title: string, inner: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:Heebo,system-ui,sans-serif;background:#fbf8f3;color:#262626;margin:0;min-height:100vh;display:flex;justify-content:center}
.c{width:100%;max-width:24rem;padding:20px 20px 32px;display:flex;flex-direction:column;align-items:stretch}
.art{display:block;width:100%;max-width:300px;margin:8px auto 0}
h1{font-size:1.6rem;font-weight:500;letter-spacing:-.01em;margin:6px 0 6px;text-align:center}
.sub{font-weight:300;color:#5b564e;line-height:1.6;margin:0 0 22px;text-align:center;font-size:1.05rem}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:54px;width:100%;border:0;border-radius:0;
background:#262626;color:#fff;font:inherit;font-weight:500;font-size:1.05rem;cursor:pointer;text-decoration:none}
.btn:active{transform:translateY(1px)}.btn[disabled]{opacity:.55}
.btn:focus-visible{outline:3px solid #4a3a66;outline-offset:2px}
ol{list-style:none;counter-reset:s;margin:26px 0 0;padding:0;border-top:1.5px solid #262626}
li{counter-increment:s;display:flex;gap:12px;align-items:baseline;padding:13px 0;border-bottom:1px solid #e4ddd2;font-weight:300;line-height:1.55;font-size:.98rem}
li::before{content:counter(s);flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#b89ac8;color:#262626;font-weight:500;font-size:.9rem}
li b{font-weight:500}
.note{font-weight:300;color:#5b564e;font-size:.88rem;line-height:1.55;margin:16px 0 0;text-align:center}
</style></head>
<body><main class="c">${inner}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

/** מסך כישלון קטן: מה קרה ומה עושים, בלי ז'רגון. */
function failPage(store: boolean, title: string, body: string) {
  if (store) {
    return storeShell(
      title,
      `${EMPTY_STALL_SVG}<h1>${title}</h1><p class="sub">${body}</p><a class="btn" href="/login">לכניסה עם קוד</a>`,
      410
    );
  }
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

/**
 * ?to=store — קישור שנוצר בחמ"ל של דוכן, למוכרת שהסמס לא מגיע אליה.
 * בלי זה הקישור מכוון לסקוויש. הטוקן הוא הסוד; הפרמטר רק בוחר לאן לנחות.
 * הטופס שולח POST לאותה כתובת, כך שהפרמטר עובר הלאה לבד.
 */
const forStore = (req: NextRequest) => req.nextUrl.searchParams.get("to") === "store";

/** מסך הכניסה: כפתור אחד. קיים כדי שרק לחיצה אנושית תשרוף את הטוקן. */
function welcomePage(token: string, store = false) {
  /* הטופס ננעל אחרי לחיצה: לחיצה כפולה שרפה פעם את הקישור, והילדה ראתה
     "הקישור כבר נוצל" למרות שנכנסה. */
  const once = `onsubmit="var b=this.querySelector('button');b.disabled=true;b.textContent='נכנסים…'"`;
  if (store) {
    return storeShell(
      "דוכן",
      `${STALL_SVG}
<h1>הקישור שלכם מוכן</h1>
<p class="sub">נכנסים בלי קוד ובלי סיסמה.</p>
<form method="post" ${once}><button class="btn" type="submit">להיכנס ←</button></form>
<ol>
<li><span>לוחצים <b>להיכנס</b>, פעם אחת, ומחכים רגע.</span></li>
<li><span>אין לכם עוד דוכן? כותבים לו שם, מוסיפים מוצר ובוחרים צבע.</span></li>
<li><span>בסוף לוחצים <b>לפתוח את הדוכן</b>. לא צריך קוד.</span></li>
</ol>
<p class="note">הקישור עובד פעם אחת, ותקף 24 שעות.</p>`
    );
  }
  return new NextResponse(
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${store ? "דוכן" : "סקוויש קלאב · דוכן"}</title>
<style>body{font-family:Heebo,system-ui,sans-serif;background:#fbf8f3;color:#262626;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.c{max-width:22rem}.m{font-size:56px;margin-bottom:4px}h1{font-size:1.3rem;margin:0 0 8px}
p{color:#5b564e;line-height:1.7;margin:0 0 22px}
button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 34px;
border-radius:999px;background:#756192;color:#fff;border:0;font:inherit;font-weight:500;font-size:1rem;cursor:pointer;width:100%}
button:active{transform:translateY(1px)}</style></head>
<body><div class="c"><div class="m">${store ? "🛍️" : "🧸"}</div><h1>הקישור שלכם מוכן</h1>
<p>לוחצים פעם אחת — ונכנסים. בלי קוד ובלי סיסמה.</p>
<form method="post" ${once}><button type="submit">להיכנס ←</button></form></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return failPage(forStore(_req), "הקישור לא תקין", "נראה שהקישור הגיע חתוך. אפשר לבקש קישור חדש ממי ששלח אותו.");
  }

  /* קריאה בלבד — תצוגה מקדימה של וואטסאפ מגיעה לכאן ולא שורפת כלום */
  const db = supabaseAdmin();
  const { data: peek } = await db
    .from("login_links")
    .select("used_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!peek || peek.used_at || new Date(peek.expires_at).getTime() < Date.now()) {
    return failPage(forStore(_req), 
      "הקישור כבר נוצל או שפג תוקפו",
      "קישור כניסה עובד פעם אחת בלבד, ותקף 24 שעות. אפשר לבקש חדש ממי ששלח אותו."
    );
  }
  return welcomePage(token, forStore(_req));
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return failPage(forStore(_req), "הקישור לא תקין", "נראה שהקישור הגיע חתוך. אפשר לבקש קישור חדש ממי ששלח אותו.");
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
    // ללחיצה על קישור שנוצל/פג עדיין יש מספר — כדי שהמנהלת תראה ש"הקישור לא עבד"
    const { data: known } = await db.from("login_links").select("phone, used_at").eq("token", token).maybeSingle();
    if (known?.phone) {
      await logLoginEvent(_req, { phone: known.phone, kind: "link_failed", detail: known.used_at ? "הקישור כבר נוצל" : "הקישור פג תוקף" });
    }
    return failPage(forStore(_req), 
      "הקישור כבר נוצל או שפג תוקפו",
      "קישור כניסה עובד פעם אחת בלבד, ותקף 24 שעות. אפשר לבקש חדש ממי ששלח אותו."
    );
  }
  const phone = link.phone;
  /* הקישור כבר נשרף. אם משהו נשבר מכאן, החמ"ל צריך לדעת שזה קרה ואיפה —
     אחרת היא תראה "קישור שנוצל" ותחשוב שהיא נכנסה. */
  const failAfter = async (step: string) => {
    await logLoginEvent(_req, { phone, kind: "link_failed", detail: step });
    return failPage(forStore(_req), "הכניסה לא הצליחה", "אפשר לנסות שוב בעוד רגע, או לבקש קישור חדש.");
  };
  await logLoginEvent(_req, { phone, kind: "link_used" });

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
    // רק חשבון ותיק במייל שעוד לא קשור למספר (ראו אימות הסמס)
    const { data: ownerHasPhone } = existingStore?.owner_id
      ? await db.from("phone_accounts").select("phone").eq("user_id", existingStore.owner_id).limit(1).maybeSingle()
      : { data: null };
    if (existingStore?.owner_id && !ownerHasPhone) {
      userId = existingStore.owner_id;
    } else {
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email: syntheticEmail(phone),
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { phone },
      });
      if (createErr || !created.user) {
        return failAfter("פתיחת חשבון");
      }
      userId = created.user.id;
    }
    await db.from("phone_accounts").insert({ phone, user_id: userId });
  }
  if (!userId) return failAfter("זיהוי החשבון");

  const { data: existing } = await db.auth.admin.getUserById(userId);
  const email = existing.user?.email;
  if (!email) return failAfter("חשבון בלי כתובת פנימית");

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
    if (updErr) return failAfter("החלפת סיסמה");
    const { error: signInErr } = await supa.auth.signInWithPassword({ email, password });
    if (signInErr) return failAfter("פתיחת סשן");
  }

  /* ── סימון פיילוט לילדה חדשה — אותו מנגנון כמו במסלול הסמס ── */
  if (link.pilot_token) {
    const { data: claimed } = await db.rpc("squish_claim_pilot_token", {
      p_token: link.pilot_token,
      p_user: userId,
    });
    if (claimed !== true) console.error(JSON.stringify({ op: "enter.pilot.claim", result: "rejected" }));
  }

  /* ── לאן ──
     סקוויש קודם: הקישור נוצר בחמ"ל של סקוויש כדי שילדה תנסה את
     המועדון — גם אם במקרה יש לה דוכן על אותו מספר. ים נחתה ככה
     בדשבורד של דוכן במקום בסקווישים. הדוכן אחרון, לא ראשון. */
  const [{ data: store }, { data: profile }] = await Promise.all([
    db.from("stores").select("id").eq("owner_id", userId).limit(1).maybeSingle(),
    db.from("squish_profiles").select("id").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  const dest = forStore(_req) ? (store ? "/dashboard" : "/onboarding")
    : profile ? "/squish/collection"
    : link.pilot_token ? "/squish"
    : store ? "/dashboard"
    : "/squish";
  return NextResponse.redirect(new URL(dest, _req.nextUrl.origin), 303);
}
