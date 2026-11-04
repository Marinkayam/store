/**
 * מלאי לכל אפשרות (מיגרציה 0065): {"ורוד": 3, "כחול": 0}.
 *
 * null / חסר = אין מלאי לפי אפשרות, והמוצר עובד כמו תמיד עם stock אחד.
 * כשיש — stock הוא הסכום, ואפשרות שאין לה מפתח נחשבת "בלי הגבלה משלה"
 * (מוגבלת רק בסך הכל). כך אפשרות שנוספה אחרי ההגדרה לא נחסמת בטעות.
 */
export type OptionStock = Record<string, number>;

/** מה שבא מה-DB → מפה תקינה, או null */
export function parseOptionStock(raw: unknown): OptionStock | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: OptionStock = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** כמה יש מהאפשרות הזו. null = אין לה מלאי משלה */
export function stockOfOption(raw: unknown, option: string | null | undefined): number | null {
  if (!option) return null;
  const m = parseOptionStock(raw);
  return m && option in m ? m[option] : null;
}

/** המפה ששומרים: רק אפשרויות שקיימות ברשימה, וסכום לשדה stock */
export function buildOptionStock(options: string[], counts: Record<string, number>): { map: OptionStock; total: number } {
  const map: OptionStock = {};
  for (const o of options) map[o] = Math.max(0, Math.floor(counts[o] ?? 0));
  return { map, total: Object.values(map).reduce((s, n) => s + n, 0) };
}
