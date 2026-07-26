import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { sendSms, smsConfigured } from "@/lib/sms";
import { generateCode, hashCode, OTP_TTL_MINUTES } from "@/lib/otp";

// POST /api/auth/sms/start { phone } — שולח קוד בסמס.
//
// כל הודעה כאן עולה כסף אמיתי, ולכן ההגבלות הן בקרת עלות בדיוק כמו שהן
// בקרת אבטחה. בלעדיהן מספיק סקריפט אחד כדי לרוקן את החבילה של מרינה.

const RESEND_SECONDS = 60;
const PER_PHONE_PER_DAY = 5;
const PER_IP_PER_DAY = 15;

export async function POST(req: NextRequest) {
  if (!smsConfigured()) {
    return NextResponse.json({ error: "שליחת הקודים לא מוגדרת עדיין" }, { status: 503 });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return NextResponse.json({ error: "המספר לא נראה תקין — בדקי אותו שוב" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(`duchan:${ip}`).digest("hex").slice(0, 32);

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // האם כבר נשלח קוד ממש עכשיו — מונע הצפה של אותו מספר בלחיצות חוזרות
  const { data: recent } = await db
    .from("phone_otps")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && now - new Date(recent.created_at).getTime() < RESEND_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_SECONDS * 1000 - (now - new Date(recent.created_at).getTime())) / 1000);
    return NextResponse.json({ error: `כבר שלחנו קוד. אפשר לבקש שוב בעוד ${wait} שניות` }, { status: 429 });
  }

  const [{ count: phoneCount }, { count: ipCount }] = await Promise.all([
    db.from("phone_otps").select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", dayAgo),
    db.from("phone_otps").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", dayAgo),
  ]);
  if ((phoneCount ?? 0) >= PER_PHONE_PER_DAY || (ipCount ?? 0) >= PER_IP_PER_DAY) {
    return NextResponse.json({ error: "יותר מדי בקשות היום. נסי שוב מחר" }, { status: 429 });
  }

  const code = generateCode();
  const { error: insErr } = await db.from("phone_otps").insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(now + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    ip_hash: ipHash,
  });
  if (insErr) return NextResponse.json({ error: "משהו השתבש, נסי שוב" }, { status: 500 });

  const sent = await sendSms(phone, `${code} — קוד הכניסה שלך לדוכן. תקף ל-${OTP_TTL_MINUTES} דקות.`);
  if (!sent.ok) {
    // הסיבה האמיתית נשארת בלוג של מרינה. לילדה אין מה לעשות עם "sender לא מאושר".
    console.error("[sms] send failed:", sent.reason, sent.code ?? "");
    return NextResponse.json({ error: "לא הצלחנו לשלוח את הקוד. נסי שוב עוד רגע" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ttlMinutes: OTP_TTL_MINUTES });
}
