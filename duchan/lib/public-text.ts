/**
 * פרטי קשר לא מוצגים בטקסט ציבורי של דוכן.
 *
 * בעלי דוכן כותבים טקסט חופשי (תיאור, הודעה לקונים, תיאור מוצר), ולפעמים
 * מקלידים בו מספר טלפון: "להזמנות 050-…". הטקסט הזה מוצג לכל מי שנכנס
 * לדוכן, והמספר של ילד/ה לא אמור להופיע שם. הקונים מקבלים את המספר רק אחרי
 * ששלחו הזמנה (app/api/orders), ולא לפני.
 *
 * כאן לא מוחקים דבר מהמסד: הטקסט נשמר כמו שנכתב, ורק בדרך לדף הציבורי
 * (lib/store-public.ts) מוסרים ממנו מספרי טלפון, כתובות מייל, קישורים ושמות
 * משתמש ברשתות. שאר הטקסט נשאר כמו שהוא.
 *
 * מה *לא* נחשב מספר טלפון: מחירים, כמויות, מידות, שנים. רק רצף של 9 עד 10
 * ספרות שמתחיל ב-0 (או 972), גם כשיש בין הספרות רווחים, מקפים או נקודות.
 */

// 050-123-4567 · 0501234567 · 050 12 34 567 · +972 50 123 4567 · 972501234567
const PHONE = /(?<![\d₪])(?:(?:\+|00)?972[-. ]?|0)(?:[-. ]?\d){8,9}(?!\d)/g;
const EMAIL = /[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /(?:https?:\/\/|www\.)\S+|(?:wa\.me|t\.me|bit\.ly|linktr\.ee)\/\S*|\b[a-z0-9-]+\.(?:com|co\.il|net|org|app|me|io|link)(?:\/\S*)?/gi;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_.]{3,}/g;

const ALL = [EMAIL, URL, PHONE, HANDLE];

export function hasContact(text: string | null | undefined): boolean {
  if (!text) return false;
  return ALL.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function redactContacts<T extends string | null | undefined>(text: T): T {
  if (!text) return text;
  let out: string = text;
  for (const re of ALL) out = out.replace(re, " ");
  if (out === text) return text;
  out = out
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        // מה שנשאר תלוי באוויר אחרי שהמספר ירד: "להזמנות: " → "להזמנות"
        .replace(/[\s:：\-–—,|/(]+$/u, "")
        .replace(/\(\s*\)/g, "")
        .trim()
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out as T;
}
