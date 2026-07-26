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

  if (!otp) return NextResponse.json({ error: "לא ביקשנו קוד למספר הזה. נסי שוב" }, { status: 400 });
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
        return NextResponse.json({ error: "לא הצלחנו לפתוח חשבון. נסי שוב" }, { status: 500 });
      }
      userId = created.user.id;
      isNew = true;
    }
    await db.from("phone_accounts").insert({ phone, user_id: userId });
  }
  if (!userId) return NextResponse.json({ error: "לא הצלחנו להיכנס. נסי שוב" }, { status: 500 });

  // מחליפים סיסמה ונכנסים איתה מיד. הסיסמה נזרקת בסוף הבקשה.
  const password = randomPassword();
  const { data: updated, error: updErr } = await db.auth.admin.updateUserById(userId, { password });
  if (updErr || !updated.user?.email) {
    return NextResponse.json({ error: "לא הצלחנו להיכנס. נסי שוב" }, { status: 500 });
  }

  const supa = await supabaseServer();
  const { error: signInErr } = await supa.auth.signInWithPassword({
    email: updated.user.email,
    password,
  });
  if (signInErr) return NextResponse.json({ error: "לא הצלחנו להיכנס. נסי שוב" }, { status: 500 });

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
