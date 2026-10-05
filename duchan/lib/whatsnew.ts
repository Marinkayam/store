import type { IconName } from "@/app/icons";

/**
 * "חדש בדוכן" — הבאנר בראש מסך ההזמנות אחרי עדכון גדול.
 *
 * מרינה: "תעשה באנר של כל הדברים החדשים בדוכן".
 *
 * שלושה כללים:
 *   1. נסגר ב-X, והסגירה נשמרת לגרסה (localStorage, לפי version).
 *   2. רק לדוכנים שנוצרו *לפני* releasedAt — מי שפתח/ה דוכן אתמול לא
 *      צריך/ה "חדש", מבחינתו/ה ככה זה תמיד היה (וממילא יש לו/ה את מסלול
 *      הצעדים). זה גם מה ששומר על הבדיקות: דוכני בדיקה נוצרים טריים.
 *   3. עדכון חדש = מחליפים version, releasedAt ו-items. לא צוברים היסטוריה.
 *
 * כל פריט הוא לינק למקום שבו משתמשים בו — באנר שרק מספר ולא לוקח לשם
 * הוא עוד טקסט לקרוא.
 */
export type WhatsNewItem = { key: string; icon: IconName; title: string; text: string; href: string; fresh?: boolean };

export const WHATSNEW: { version: string; releasedAt: string; title: string; items: WhatsNewItem[] } = {
  version: "2026-10-new",
  releasedAt: "2026-10-05T00:00:00Z",
  title: "חדש בדוכן!",
  items: [
    { key: "stats", icon: "chart", title: "מי מסתכל על הדוכן", text: "כמה נכנסו, מאיפה, ומה הכי מעניין", href: "/dashboard/stats", fresh: true },
    { key: "push", icon: "bell", title: "התראה על כל הזמנה", text: "הטלפון מצלצל כשמישהו מזמין", href: "/dashboard/settings#app", fresh: true },
    { key: "kupa", icon: "coin", title: "קופת הדוכן", text: "מטבעות, אותות וחידות כסף", href: "/dashboard/kupa" },
    { key: "drop", icon: "hourglass", title: "דרופ", text: "מוצר שנפתח בשעה שבוחרים", href: "/dashboard/products" },
    { key: "mystery", icon: "gift", title: "מוצר בהפתעה", text: "בלי לגלות מה בפנים", href: "/dashboard/products" },
    { key: "coupons", icon: "receipt", title: "קופונים", text: "קוד הנחה לחברים", href: "/dashboard/settings#coupons" },
    { key: "team", icon: "heart", title: "דוכן משותף", text: "מנהלים את הדוכן עם חבר/ה", href: "/dashboard/settings#team" },
  ],
};
