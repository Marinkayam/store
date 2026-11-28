/**
 * מצב חופשה (0076). מרינה, 11.2026: "כן תתחיל הכל" (סבב 4 סעיף 2).
 *
 * הדוכן בחופשה כש-away דלוק, ועוד לא עבר away_until (כולל היום עצמו, לפי
 * שעון ישראל). אחרי התאריך הדוכן נפתח לבד, בלי שמישהו יצטרך לזכור.
 * בחופשה הדוכן גלוי עם המוצרים, ורק ההזמנה סגורה (גם בשרת, /api/orders).
 */
export function isAway(s: { away?: boolean | null; away_until?: string | null } | null | undefined, now: Date = new Date()): boolean {
  if (!s?.away) return false;
  if (!s.away_until) return true;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  return today <= s.away_until;
}

/** "חוזרים ב-12.12" או "חוזרים בקרוב" */
export function awayLine(s: { away_until?: string | null }): string {
  if (!s.away_until) return "חוזרים בקרוב";
  const [, m, d] = s.away_until.split("-");
  return `חוזרים ב-${Number(d)}.${Number(m)}`;
}
