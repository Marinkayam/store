import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { codeMatches, randomPassword, OTP_MAX_ATTEMPTS } from "@/lib/otp";

// POST /api/auth/sms/verify { phone, code } — מאמת את הקוד ופותח סשן.
//
// אין כאן סיסמה שהילדה מכירה. לכל משתמשת יש סיסמה אקראית שנוצרת בשרת,
// מוחלפת בכל כניסה, ולעולם לא נשלחת לדפדפן. היא קיימת רק כדי ש-Supabase
// יוכל להנפיק סשן אמיתי, כך שכל שאר המערכת — RLS, מידלוור, הדשבורד —
// ממשיכה לעבוד בדיוק כמו קודם בלי לדעת שהכניסה השתנתה.

/** כתובת פנימית. אף אחת לא רואה אותה ואף אחת לא מקבלת אליה דואר. */
const syntheticEmail = (phone: string) => `${phone}@phone.duchan.app`;

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  const code = (body.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 6) {
    return NextResponse.json({ error: "הקוד צריך להיות שש ספרות" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: otp } = await db
    .from("phone_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return NextResponse.json({ error: "לא ביקשנו קוד למספר הזה. לנסות שוב" }, { status: 400 });
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "הקוד פג. אפשר לבקש חדש" }, { status: 400 });
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "יותר מדי ניסיונות. בקשי קוד חדש" }, { status: 429 });
  }

  if (!codeMatches(phone, code, otp.code_hash)) {
    // הספירה עולה לפני התשובה, אחרת אפשר לנסות בלי הגבלה במקביל
    await db.from("phone_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
    return NextResponse.json(
      { error: left > 0 ? `הקוד לא נכון. נשארו ${left} ניסיונות` : "יותר מדי ניסיונות. בקשי קוד חדש" },
      { status: 400 }
    );
  }

  // הקוד נשרף מיד. גם אם כל השאר ייכשל, אי אפשר להשתמש בו פעמיים.
  await db.from("phone_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

  // מי המשתמשת:
  // 1. מספר שכבר אומת בעבר
  // 2. חנות קיימת שנרשמה במייל וזה מספר הוואטסאפ שלה — כך מי שכבר רשומה
  //    נכנסת לחנות שלה בלי שנצטרך להעביר אותה ידנית
  // 3. משתמשת חדשה
  let userId: string | null = null;
  let isNew = false;

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
        return NextResponse.json({ error: "לא הצלחנו לפתוח חשבון. לנסות שוב" }, { status: 500 });
      }
      userId = created.user.id;
      isNew = true;
    }
    await db.from("phone_accounts").insert({ phone, user_id: userId });
  }
  if (!userId) return NextResponse.json({ error: "לא הצלחנו להיכנס. לנסות שוב" }, { status: 500 });

  const { data: existing } = await db.auth.admin.getUserById(userId);
  const email = existing.user?.email;
  if (!email) return NextResponse.json({ error: "לא הצלחנו להיכנס. לנסות שוב" }, { status: 500 });

  const supa = await supabaseServer();

  /**
   * פתיחת הסשן, בלי לגעת בסיסמה.
   *
   * קודם זה עבד ע"י החלפת הסיסמה בכל כניסה וכניסה איתה. זה עבד, אבל
   * Supabase מנתק את *כל* הסשנים האחרים של המשתמשת כשהסיסמה משתנה —
   * ובאייפון, אפליקציה במסך הבית, ספארי והדפדפן שבתוך וואטסאפ הם שלושה
   * מקומות נפרדים עם עוגיות נפרדות. כל כניסה באחד מהם ניתקה את השניים
   * האחרים, וכל ניתוק כזה עלה עוד סמס — עד שנגמרה המכסה היומית.
   *
   * magic link שנצרך מיד כאן בשרת פותח סשן חדש ומשאיר את הקיימים חיים.
   */
  let signedIn = false;
  try {
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const hashed = link?.properties?.hashed_token;
    if (linkErr || !hashed) {
      console.error("[sms] generateLink unavailable:", linkErr?.message ?? "no hashed_token");
    } else {
      const { error } = await supa.auth.verifyOtp({ token_hash: hashed, type: "email" });
      if (error) console.error("[sms] verifyOtp failed:", error.message);
      else signedIn = true;
    }
  } catch (e) {
    console.error("[sms] magic link path threw:", e instanceof Error ? e.message : e);
  }

  // נפילה לאחור למסלול הישן. הוא מנתק סשנים אחרים, אבל כניסה שעובדת
  // עדיפה על כניסה שנשברה בגלל שינוי בצד של Supabase.
  if (!signedIn) {
    const password = randomPassword();
    const { error: updErr } = await db.auth.admin.updateUserById(userId, { password });
    if (updErr) return NextResponse.json({ error: "לא הצלחנו להיכנס. לנסות שוב" }, { status: 500 });
    const { error: signInErr } = await supa.auth.signInWithPassword({ email, password });
    if (signInErr) return NextResponse.json({ error: "לא הצלחנו להיכנס. לנסות שוב" }, { status: 500 });
  }

  // האם כבר יש לה חנות — הלקוח צריך לדעת אם להמשיך לאונבורדינג או לדשבורד
  const { data: store } = await db
    .from("stores")
    .select("slug")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ ok: true, isNew, hasStore: !!store, phone });
}
