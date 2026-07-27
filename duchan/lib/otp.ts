import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

/**
 * קוד חד-פעמי בן שש ספרות.
 *
 * randomInt ולא Math.random: קוד אימות שאפשר לנחש מהזמן שבו נוצר הוא לא קוד
 * אימות. שש ספרות עם חמישה ניסיונות ותוקף של עשר דקות נותנות סיכוי ניחוש
 * של 1 ל-200,000 לכל מספר.
 */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * הקוד לא נשמר. נשמר HMAC שלו יחד עם המספר, כך שגיבוי שדלף לא מאפשר
 * להתחבר, ושורה של מספר אחד לא שווה לשורה של מספר אחר עם אותו קוד.
 *
 * המפתח הוא ה-service role key, שקיים תמיד בשרת ולעולם לא בלקוח. כך אין
 * עוד משתנה סביבה שמישהי צריכה לזכור להגדיר — ומשתנה שנשכח היה הופך את
 * ה-HMAC לקבוע ידוע.
 */
export function hashCode(phone: string, code: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY חסר, אי אפשר לגבב קוד");
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** השוואה בזמן קבוע — השוואת מחרוזות רגילה מדליפה כמה תווים התאימו. */
export function codeMatches(phone: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(phone, code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * הסיסמה של המשתמשת מוחלפת בכל כניסה ולעולם לא יוצאת מהשרת.
 * randomBytes ישירות — 256 ביט של אקראיות קריפטוגרפית, בלי גזירות מיותרות.
 */
export function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}
