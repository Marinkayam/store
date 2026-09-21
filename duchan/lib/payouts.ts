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
  /** הלינק הישן, מלפני הפיצול — עדיין מכובד כשאין עמודה חדשה */
  payout_link?: string | null;
  /** לינק ביט ולינק פייבוקס נפרדים (0046) — יכולים להוביל לשני
      מספרי טלפון שונים, למשל אבא ואח. */
  payout_bit_link?: string | null;
  payout_paybox_link?: string | null;
}

/** רק ביט ופייבוקס. אותן רשימות בדיוק כמו בטריגר (0018 → 0044 → 0046).
    payboxapp.page.link נוסף אחרי תלונה מהשטח: זה הפורמט שאפליקציית
    פייבוקס באמת מעתיקה ללוח, והוא נדחה — אז אף ילדה לא הצליחה לשמור. */
const BIT_HOSTS = /^https:\/\/([a-z0-9-]+\.)*bitpay\.co\.il(\/|$)/i;
const PAYBOX_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link)(\/|$)/i;

export function isBitLink(url: string): boolean {
  return BIT_HOSTS.test(url.trim());
}
export function isPayboxLink(url: string): boolean {
  return PAYBOX_HOSTS.test(url.trim());
}
export function isPayoutLink(url: string): boolean {
  return isBitLink(url) || isPayboxLink(url);
}

/**
 * הלינק כפי שמותר להציג אותו לקונה, ואיך לקרוא לו.
 *
 * הבדיקה חוזרת גם כאן ולא רק בשמירה: שורה שנכתבה לפני הטריגר, או ידנית
 * מהדאטהבייס, לא תהפוך לקישור יוצא בדף פומבי.
 */
export function payoutLink(
  p: PayoutPrefs,
  method?: PayMethod | null
): { url: string; label: string; method: PayMethod } | null {
  /* מאז 0046 יש לינק לכל אמצעי — הם יכולים להוביל לשני מספרים שונים.
     הלינק הישן (payout_link) עדיין מכובד לחנות שלא עודכנה, לפי הסוג
     שנגזר מהכתובת שלו. */
  const legacy = p.payout_link?.trim();
  const bitUrl =
    p.payout_bit_link?.trim() || (legacy && isBitLink(legacy) ? legacy : "");
  const payboxUrl =
    p.payout_paybox_link?.trim() || (legacy && isPayboxLink(legacy) ? legacy : "");

  const pick = (m: PayMethod): { url: string; label: string; method: PayMethod } | null => {
    if (m === "bit" && bitUrl && isBitLink(bitUrl))
      return { url: bitUrl, label: "תשלום בביט", method: "bit" };
    if (m === "paybox" && payboxUrl && isPayboxLink(payboxUrl))
      return { url: payboxUrl, label: "תשלום בפייבוקס", method: "paybox" };
    return null;
  };

  if (method) return method === "cash" ? null : pick(method);
  // בלי אמצעי מבוקש — הלינק הראשון שקיים (לתצוגה כללית)
  return pick("bit") ?? pick("paybox");
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
 * שורת הלינק בהודעת ההזמנה: "לינק לתשלום: https://...".
 *
 * ההחלטה המקורית הייתה להציג את הלינק רק במסך ולא בהודעה, כדי שהודעה
 * שמועברת הלאה לא תגרור אותו איתה. מרינה ביקשה את ההפך (2026-08):
 * שהקישור יגיע לקונה מיד עם ההזמנה, בלי שהילדה תצטרך לשלוח אותו
 * בחזרה. הסיכון ממילא נמוך — הלינק כבר פומבי בדף הדוכן עצמו.
 *
 * הגבול שנשאר: הלינק נכנס רק כשהוא תואם את מה שהקונה בחרה (או כשלא
 * בחרה כלום). קונה שבחרה מזומן, או פייבוקס כשהלינק הוא ביט, לא
 * מקבלת קישור שלא רלוונטי לה. הטלפון של הילדה לא נכנס להודעה לעולם.
 */
export function paymentLinkLine(p: PayoutPrefs, chosen?: PayMethod | null): string {
  const link = payoutLink(p, chosen ?? undefined);
  if (!link) return "";
  return `לינק לתשלום: ${link.url}`;
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
