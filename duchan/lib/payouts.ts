/**
 * איך הקונה משלמת לילדה.
 *
 * חשוב להבדיל בין שני סוגי הכסף במערכת, כי הם לא נוגעים זה בזה:
 *   • התשלום לדוכן   — ₪200 חד-פעמי על הקמת החנות, למנהלת. `lib/pricing.ts`.
 *   • הכסף של הילדה  — מה שקונה משלמת לה על מוצר. הקובץ הזה.
 *
 * אנחנו לא מסלקים ולא מתווכים: הפונקציות כאן רק מנסחות לקונה איך לשלם,
 * והסיכום בפועל נעשה בוואטסאפ בין הצדדים. אין עמלה ואין גישה לכסף.
 */

export interface PayoutPrefs {
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
}

/** שמות אמצעי התשלום שהחנות מקבלת. בטוח להצגה ב-HTML — אין כאן מספרים. */
export function payoutLabels(p: PayoutPrefs): string[] {
  const out: string[] = [];
  if (p.payout_bit) out.push("ביט");
  if (p.payout_paybox) out.push("פייבוקס");
  if (p.payout_cash) out.push("מזומן");
  return out;
}

/** "ביט, מזומן" · מחרוזת ריקה כשלא נבחר כלום (אז פשוט לא מציגים שורה) */
export function payoutSummary(p: PayoutPrefs): string {
  return payoutLabels(p).join(", ");
}

/**
 * השורה שנכנסת להודעת הוואטסאפ של ההזמנה.
 * נבנית בלקוח רק אחרי שהשרת אישר את ההזמנה, יחד עם שאר ההודעה.
 */
export function payoutOrderLine(p: PayoutPrefs): string {
  const labels = payoutLabels(p);
  const note = p.payout_note?.trim();
  if (!labels.length && !note) return "";
  const head = labels.length ? `אפשר לשלם ב: ${labels.join(" / ")}` : "";
  return [head, note].filter(Boolean).join("\n");
}
