import "server-only";

// SMS להורה דרך sms4free.co.il (חינם עד כמה הודעות ביום — מספיק לקצב פתיחת חנויות).
// אם משתני הסביבה לא מוגדרים — מדלגים בשקט; ה-SMS הוא שכבת יידוע, לא תלות.

import { displayPhone } from "./phone";

export async function sendParentSms(parentPhoneE164: string, message: string): Promise<boolean> {
  const key = process.env.SMS4FREE_KEY;
  const user = process.env.SMS4FREE_USER;
  const pass = process.env.SMS4FREE_PASS;
  const sender = process.env.SMS4FREE_SENDER;
  if (!key || !user || !pass || !sender) return false;

  // sms4free מצפה לפורמט מקומי: 0501234567
  const recipient = displayPhone(parentPhoneE164).replace(/-/g, "");

  try {
    const res = await fetch("https://api.sms4free.co.il/ApiSMS/v2/SendSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, user, pass, sender, recipient, msg: message }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    // ה-API מחזיר מספר חיובי (כמות שנשלחה) או {status > 0}
    const status = typeof data === "number" ? data : Number(data?.status ?? data);
    return Number.isFinite(status) && status > 0;
  } catch {
    return false;
  }
}

export function parentOpeningMessage(storeName: string, storeUrl: string, parentUrl: string): string {
  return (
    `דוכן: החנות "${storeName}" נפתחה עכשיו והמספר הזה הוזן כטלפון של ההורה.\n` +
    `צפייה: ${storeUrl}\n` +
    `ניהול הורה (השהיה בלחיצה): ${parentUrl}`
  );
}
