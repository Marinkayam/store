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

export type PayMethod = "bit" | "paybox" | "cash";

export interface PayoutPrefs {
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  payout_link?: string | null;
}

/** רק ביט ופייבוקס. אותה רשימה בדיוק כמו בטריגר שבמיגרציה 0018. */
const PAY_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|bitpay\.co\.il)(\/|$)/i;

export function isPayoutLink(url: string): boolean {
  return PAY_HOSTS.test(url.trim());
}

/**
 * הלינק כפי שמותר להציג אותו לקונה, ואיך לקרוא לו.
 *
 * הבדיקה חוזרת גם כאן ולא רק בשמירה: שורה שנכתבה לפני הטריגר, או ידנית
 * מהדאטהבייס, לא תהפוך לקישור יוצא בדף פומבי.
 */
export function payoutLink(
  p: PayoutPrefs
): { url: string; label: string; method: PayMethod } | null {
  const url = p.payout_link?.trim();
  if (!url || !isPayoutLink(url)) return null;
  // האמצעי נגזר מהכתובת, כדי שאפשר יהיה להציג את הלינק רק למי שבחרה
  // באמצעי שלו. קודם התנאי במסך היה מקובע ל-paybox, ולכן לינק של ביט
  // נשמר יפה בהגדרות ולא הוצג לקונה אף פעם.
  const isBit = /bitpay/i.test(url);
  return {
    url,
    label: isBit ? "תשלום בביט" : "תשלום בפייבוקס",
    method: isBit ? "bit" : "paybox",
  };
}

/** אמצעי התשלום שהחנות מקבלת, כרשימה שאפשר לבחור ממנה. */
export function payMethods(p: PayoutPrefs): { key: PayMethod; label: string }[] {
  const out: { key: PayMethod; label: string }[] = [];
  if (p.payout_bit) out.push({ key: "bit", label: "ביט" });
  if (p.payout_paybox) out.push({ key: "paybox", label: "פייבוקס" });
  if (p.payout_cash) out.push({ key: "cash", label: "מזומן" });
  return out;
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
 * שורת התשלום בהודעת ההזמנה: "בחרתי לשלם ב: ביט".
 *
 * שלוש גרסאות היו כאן, וזו הנכונה:
 *   "אשלם בביט"          — הבטחה, ובשלב הזה עוד לא שילמו.
 *   "מקבלים תשלום בביט / פייבוקס" — מה שהדוכן מקבל, כלומר משהו שבעלת
 *                          הדוכן כבר יודעת. לא הוסיף לה כלום.
 *   "בחרתי לשלם ב: ביט"   — עובדה על *הבחירה* של הקונה, וזה בדיוק מה
 *                          שהיא צריכה כדי לדעת למה לצפות.
 *
 * ריק כשאין אמצעי תשלום מסומן — אז גם אין מה לבחור.
 */
export function payoutLine(p: PayoutPrefs, chosen?: PayMethod | null): string {
  const label = payMethods(p).find((m) => m.key === chosen)?.label;
  if (label) return `בחרתי לשלם ב: ${label}`;
  // לא נבחר כלום (או שהאמצעי כבר לא מסומן) — נופלים למה שהדוכן מקבל
  const labels = payoutLabels(p);
  return labels.length ? `אפשר לשלם ב: ${labels.join(" / ")}` : "";
}

/**
 * שורת המסירה: "בחרתי בשיטת מסירה: משלוח".
 *
 * גם כאן זו בחירה של הקונה הזו ולא הגדרה של הדוכן. כשהדוכן לא מציע
 * משלוח בכלל אין שורה — לא הייתה בחירה.
 */
export function deliveryLine(
  opts: { ships: boolean; wantsShipping: boolean; note?: string | null; price?: number | null }
): string {
  if (!opts.ships) return "";
  if (!opts.wantsShipping) return "בחרתי בשיטת מסירה: מסירה אישית";
  const extra = [opts.note?.trim() || "בתיאום", opts.price ? `₪${opts.price}` : ""]
    .filter(Boolean)
    .join(" · ");
  return `בחרתי בשיטת מסירה: משלוח · ${extra}`;
}
