import "server-only";

/**
 * שליחת סמס דרך sms4free.
 *
 * המפתחות נקראים מהסביבה בכל קריאה ולא נתפסים במודול, כדי שהחלפת מפתח
 * בוורסל תיכנס לתוקף בלי שינוי קוד.
 *
 * שים לב: עם עשר ההודעות החינמיות הראשונות הספק מרשה לשלוח רק כאשר שדה
 * ה-sender הוא מספר הנייד שאיתו נרשמת. אחרי רכישת חבילה אפשר שם מותג.
 */

/** ברירת המחדל היא הספק האמיתי. ההחלפה קיימת כדי שהבדיקות לא ישלחו הודעות. */
const endpoint = () =>
  process.env.SMS4FREE_ENDPOINT || "https://api.sms4free.co.il/ApiSMS/v2/SendSMS";

export type SmsResult = { ok: true } | { ok: false; reason: string; code?: number };

/** האם השירות מוגדר בכלל. בלי זה אין טעם להציג מסך אימות. */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.SMS4FREE_KEY && process.env.SMS4FREE_USER && process.env.SMS4FREE_PASS
  );
}

/**
 * קודי השגיאה של הספק. הם מגיעים כמספר שלילי; מספר חיובי הוא כמות ההודעות
 * שנשלחו בפועל. הנוסח כאן הוא למנהלת בלוג, לא לילדה — לילדה מוחזר תמיד
 * משפט אחד כללי, כדי לא לחשוף מה קרה בצד השרת.
 */
function providerReason(code: number): string {
  switch (code) {
    case 0:
      return "ההודעה נשלחה אל מספר לא תקין";
    case -1:
      return "שם משתמש, סיסמה או מפתח שגויים";
    case -2:
      return "אין מספיק יתרת הודעות בחשבון";
    case -3:
      return "הנמען חסום או לא תקין";
    case -4:
      return "שדה sender לא מאושר לחשבון הזה";
    case -5:
      return "תוכן ההודעה ריק או ארוך מדי";
    case -6:
      return "יותר מדי בקשות אל הספק";
    default:
      return `הספק החזיר קוד ${code}`;
  }
}

export async function sendSms(toE164: string, msg: string): Promise<SmsResult> {
  const key = process.env.SMS4FREE_KEY;
  const user = process.env.SMS4FREE_USER;
  const pass = process.env.SMS4FREE_PASS;
  if (!key || !user || !pass) return { ok: false, reason: "שירות הסמס לא מוגדר" };

  // הספק מצפה למספר ישראלי מקומי (05X…), לא לפורמט הבינלאומי שאנחנו שומרים
  const recipient = toE164.startsWith("972") ? "0" + toE164.slice(3) : toE164;
  const sender = (process.env.SMS4FREE_SENDER || user).slice(0, 11);

  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, user, pass, sender, recipient, msg }),
      // ספק חיצוני לא מחזיק את הבקשה שלנו פתוחה לנצח
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "לא הצלחנו להגיע לספק הסמס" };
  }

  if (!res.ok) return { ok: false, reason: `הספק החזיר HTTP ${res.status}` };

  // התיעוד מבטיח אובייקט עם status ו-message, אבל בפועל חוזר לפעמים מספר גולמי
  const raw = await res.text();
  let status: number;
  try {
    const parsed = JSON.parse(raw);
    status = Number(typeof parsed === "object" && parsed !== null ? parsed.status : parsed);
  } catch {
    status = Number(raw.trim());
  }

  if (!Number.isFinite(status)) return { ok: false, reason: `תשובה לא מובנת מהספק: ${raw.slice(0, 80)}` };
  if (status > 0) return { ok: true };
  return { ok: false, reason: providerReason(status), code: status };
}
