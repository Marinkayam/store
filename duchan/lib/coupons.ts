/**
 * קופונים (מיגרציה 0054).
 *
 * כל החישוב באגורות, כמו ב-money.ts. ההנחה לעולם לא גדולה מהסכום, והיא
 * מחושבת בשרת — הלקוח מציג אותה, אבל ההזמנה נכתבת לפי מה שהשרת חישב.
 */
import { formatPrice } from "./money";

export type CouponKind = "percent" | "amount";

export interface Coupon {
  id: string;
  store_id: string;
  code: string;
  kind: CouponKind;
  value: number | string;
  min_total: number | string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_by?: "store" | "admin" | null;
  created_at?: string;
  deleted_at?: string | null;
}

/** קוד כמו שהמוכרת או הקונה הקלידו → הצורה השמורה: אותיות גדולות, בלי רווחים. */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** אותו כלל כמו ה-check בדאטהבייס. */
export function isValidCode(code: string): boolean {
  return /^[A-Z0-9א-ת_-]{3,20}$/.test(code);
}

/** "10% הנחה" / "₪15 הנחה" */
export function couponLabel(c: Pick<Coupon, "kind" | "value">): string {
  return c.kind === "percent" ? `${formatPrice(c.value)}% הנחה` : `₪${formatPrice(c.value)} הנחה`;
}

/** ההנחה בשקלים על סכום מוצרים נתון. לא יותר מהסכום עצמו. */
export function discountFor(c: Pick<Coupon, "kind" | "value">, subtotal: number): number {
  const sub = Math.round(subtotal * 100);
  const off =
    c.kind === "percent"
      ? Math.round((sub * Math.min(100, Number(c.value))) / 100)
      : Math.round(Number(c.value) * 100);
  return Math.max(0, Math.min(sub, off)) / 100;
}

/**
 * האם הקופון חל על הזמנה כזו עכשיו. מחזיר הודעה לקונה כשלא —
 * ההודעות אומרות מה הבעיה, לא רק "לא תקין".
 */
export function couponProblem(c: Coupon, subtotal: number, now = new Date()): string | null {
  if (!c.active || c.deleted_at) return "הקוד הזה לא פעיל כרגע";
  if (c.expires_at && new Date(c.expires_at) <= now) return "תוקף הקוד הזה נגמר";
  if (c.max_uses != null && c.used_count >= c.max_uses) return "הקוד הזה כבר נוצל עד הסוף";
  if (c.min_total != null && subtotal < Number(c.min_total))
    return `הקוד חל על הזמנות של ₪${formatPrice(c.min_total)} ומעלה. עוד ₪${formatPrice(Number(c.min_total) - subtotal)} והוא עובד`;
  return null;
}

/** תיאור קצר של התנאים, לרשימה בדשבורד ובחמ"ל. */
export function couponTerms(c: Coupon): string {
  const parts: string[] = [];
  if (c.min_total != null) parts.push(`מינימום ₪${formatPrice(c.min_total)}`);
  if (c.max_uses != null) parts.push(`${c.used_count}/${c.max_uses} שימושים`);
  else parts.push(`${c.used_count} שימושים`);
  if (c.expires_at) parts.push(`עד ${new Date(c.expires_at).toLocaleDateString("he-IL")}`);
  return parts.join(" · ");
}

/** מצב לתצוגה: פעיל / כבוי / נגמר / פג תוקף. */
export function couponStatus(c: Coupon, now = new Date()): { label: string; live: boolean } {
  if (!c.active) return { label: "כבוי", live: false };
  if (c.expires_at && new Date(c.expires_at) <= now) return { label: "פג תוקף", live: false };
  if (c.max_uses != null && c.used_count >= c.max_uses) return { label: "נוצל", live: false };
  return { label: "פעיל", live: true };
}

/**
 * בדיקת הטופס ליצירת קופון — אותו דבר אצל המוכרת ואצל המנהלת.
 * מחזיר את השורה לשמירה, או הודעת שגיאה.
 */
export interface CouponDraft {
  code: string;
  kind: CouponKind;
  value: string;
  minTotal: string;
  maxUses: string;
  expires: string; // YYYY-MM-DD
}

export function draftToRow(
  d: CouponDraft
): { row: Record<string, unknown> } | { error: string } {
  const code = normalizeCode(d.code);
  if (!isValidCode(code)) return { error: "קוד: 3 עד 20 אותיות או ספרות, בלי רווחים" };
  const value = Number(String(d.value).replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return { error: "כמה הנחה? צריך מספר גדול מ-0" };
  if (d.kind === "percent" && value > 100) return { error: "אחוז ההנחה יכול להיות עד 100" };
  const minTotal = d.minTotal.trim() === "" ? null : Number(d.minTotal.replace(",", "."));
  if (minTotal != null && (!Number.isFinite(minTotal) || minTotal < 0)) return { error: "סכום מינימלי לא תקין" };
  const maxUses = d.maxUses.trim() === "" ? null : Math.floor(Number(d.maxUses));
  if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) return { error: "מספר שימושים צריך להיות 1 או יותר" };
  let expiresAt: string | null = null;
  if (d.expires) {
    // עד סוף היום שנבחר, לפי שעון ישראל בערך — 23:59 UTC+3
    const t = new Date(`${d.expires}T20:59:59Z`);
    if (Number.isNaN(t.getTime())) return { error: "תאריך לא תקין" };
    if (t <= new Date()) return { error: "התאריך כבר עבר" };
    expiresAt = t.toISOString();
  }
  return {
    row: {
      code,
      kind: d.kind,
      value: Math.round(value * 100) / 100,
      min_total: minTotal == null ? null : Math.round(minTotal * 100) / 100,
      max_uses: maxUses,
      expires_at: expiresAt,
      active: true,
    },
  };
}
