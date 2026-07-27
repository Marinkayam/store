import "server-only";

/**
 * התראות טלגרם למרינה — חנות חדשה נפתחה, או ילדה הצהירה ששילמה ומחכה
 * לאישור. פייר-אנד-פורגט בכוונה: אם טלגרם לא מגיב, זה לא אמור לעכב או
 * לשבור את הפעולה של הילדה בצד השני.
 *
 * המפתחות נקראים מהסביבה בכל קריאה, לא נתפסים במודול, כדי שהחלפתם
 * בוורסל תיכנס לתוקף בלי שינוי קוד.
 */

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      // ספק חיצוני לא מחזיק את הבקשה שלנו פתוחה לנצח
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    // לא זורקים הלאה: התראה שנכשלה היא לוג, לא תקלה בפעולה של הילדה
    console.error("[telegram] send failed:", e instanceof Error ? e.message : e);
  }
}
