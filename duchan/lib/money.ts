/**
 * מחירים עם אגורות (מיגרציה 0049).
 *
 * הכל מחושב באגורות שלמות ורק בסוף מחולק ל-100. 10.90 × 3 בנקודה צפה
 * יוצא 32.699999…, ומספר כזה בהודעת וואטסאפ או בסה"כ נראה כמו באג.
 */

/** 15 → "15", 10.9 → "10.90". מחיר שלם נשאר בלי ".00", כמו שהיה תמיד. */
export function formatPrice(n: number | string | null | undefined): string {
  const cents = Math.round((Number(n) || 0) * 100);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** מחיר × כמות, בלי שגיאות עיגול. */
export function lineTotal(price: number | string, qty: number): number {
  return (Math.round((Number(price) || 0) * 100) * qty) / 100;
}

/** סכום של כמה מחירים, בלי שגיאות עיגול. */
export function sumPrices(values: (number | string | null | undefined)[]): number {
  return values.reduce<number>((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;
}

/**
 * מה שהמוכרת מקלידה → מספר. מקבל "10.90", "10,90", "₪10.9", " 15 ".
 * מחזיר null כשאין כאן מחיר. עיגול לשתי ספרות.
 */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[₪\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * ניקוי תוך כדי הקלדה בשדה מחיר: ספרות, נקודה אחת (פסיק הופך לנקודה),
 * ועד שתי ספרות אחריה. "10,905" → "10.90".
 */
export function typedPrice(raw: string, maxWhole = 5): string {
  const s = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = s.split(".");
  const w = whole.slice(0, maxWhole);
  return rest.length ? `${w}.${rest.join("").slice(0, 2)}` : w;
}
