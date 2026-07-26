import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { sendSms, smsConfigured } from "@/lib/sms";
import { generateCode, hashCode, OTP_TTL_MINUTES } from "@/lib/otp";

/**
 * האם המספר הזה הוא של המנהלת.
 *
 * כשהיא מנסה להיכנס, השגיאה מציגה את התשובה האמיתית של הספק במקום נוסח
 * כללי. בלי זה הסיבה קבורה בלוגים של השרת, והדרך היחידה לדעת מה שבור היא
 * לפתוח את וורסל ולחפש — וזה בדיוק מה שהופך תקלה של דקה לשעה.
 * לילדה זה נשאר כללי תמיד; אין לה מה לעשות עם "sender לא מאושר".
 */
function isOwner(phone: string): boolean {
  return (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean)
    .includes(phone);
}

// POST /api/auth/sms/start { phone } — שולח קוד בסמס.
//
// כל הודעה כאן עולה כסף אמיתי, ולכן ההגבלות הן בקרת עלות בדיוק כמו שהן
// בקרת אבטחה. בלעדיהן מספיק סקריפט אחד כדי לרוקן את החבילה של מרינה.

const RESEND_SECONDS = 60;
const PER_PHONE_PER_DAY = 5;
const PER_IP_PER_DAY = 15;

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");

  if (!smsConfigured()) {
    // למנהלת מפרטים איזה משתנה בדיוק חסר, כדי שלא תצטרך לנחש בין ארבעה
    const missing = (["SMS4FREE_KEY", "SMS4FREE_USER", "SMS4FREE_PASS"] as const).filter(
      (k) => !process.env[k]
    );
    return NextResponse.json(
      {
        error:
          phone && isOwner(phone)
            ? `חסר בוורסל: ${missing.join(", ")} — לסמן Production ואז Redeploy`
            : "שליחת הקודים לא מוגדרת עדיין",
      },
      { status: 503 }
    );
  }

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
  if (insErr) {
    // עד עכשיו השגיאה הזו נבלעה בלי לוג ובלי פירוט, וכל תקלה בכתיבה — טבלה
    // חסרה, מפתח service role שגוי, הרשאה — נראתה בדיוק אותו דבר.
    console.error("[sms] otp insert failed:", insErr.message, insErr.code ?? "");
    return NextResponse.json(
      {
        error: isOwner(phone)
          ? `כתיבה ל-DB נכשלה: ${insErr.message}`
          : "משהו השתבש, נסי שוב",
      },
      { status: 500 }
    );
  }

  const sent = await sendSms(phone, `${code} — קוד הכניסה שלך לדוכן. תקף ל-${OTP_TTL_MINUTES} דקות.`);
  if (!sent.ok) {
    console.error("[sms] send failed:", sent.reason, sent.code ?? "");
    return NextResponse.json(
      {
        error: isOwner(phone)
          ? `הספק דחה: ${sent.reason}${sent.code ? ` (${sent.code})` : ""}`
          : "לא הצלחנו לשלוח את הקוד. נסי שוב עוד רגע",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, ttlMinutes: OTP_TTL_MINUTES });
}
