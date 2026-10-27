/**
 * מבצעים על מוצר (מיגרציה 0064). שלושה סוגים, שהמוכרת בוחרת אחד מהם:
 *
 *   sale    — מחיר מבצע: ₪10 במקום ₪15. כל יחידה במחיר המבצע.
 *   free    — 1+1 / 2+1 / 3+1: על כל `buy` יחידות, עוד אחת מתנה.
 *   bundle  — כמות במחיר: 2 ב-₪15. כל `qty` יחידות במחיר הזה, השאר רגיל.
 *
 * מקור אחד לחישוב: הדוכן, הסל, בדיקת הקופון והשרת שכותב את ההזמנה. השרת
 * מחשב מחדש מה-DB — הדפדפן רק מציג.
 *
 * המבצע תמיד *לטובת* הקונה: אם המוכרת שינתה מחיר אחר כך והמבצע כבר לא
 * זול יותר (2 ב-₪15 כשהמחיר ירד ל-₪7), נשאר המחיר הרגיל. כך שינוי מחיר
 * אף פעם לא נחסם בגלל מבצע ישן, ואף קונה לא משלמת יותר "בגלל מבצע".
 *
 * הכל באגורות שלמות, כמו lib/money.ts.
 */

export type Deal =
  | { type: "sale"; price: number }
  | { type: "free"; buy: number }
  | { type: "bundle"; qty: number; price: number };

export const FREE_BUY = [1, 2, 3, 4, 5] as const;
export const BUNDLE_QTY = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const cents = (n: number | string) => Math.round((Number(n) || 0) * 100);
const fmt = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
const isInt = (n: unknown, lo: number, hi: number) =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const isMoney = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000;

/** מה שבא מה-DB (jsonb) או מטופס → מבצע תקין, או null. כל צורה אחרת נזרקת. */
export function parseDeal(raw: unknown): Deal | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.type === "sale" && isMoney(d.price)) return { type: "sale", price: d.price as number };
  if (d.type === "free" && isInt(d.buy, 1, 5)) return { type: "free", buy: d.buy as number };
  if (d.type === "bundle" && isInt(d.qty, 2, 10) && isMoney(d.price))
    return { type: "bundle", qty: d.qty as number, price: d.price as number };
  return null;
}

/** המבצע באמת זול יותר מהמחיר הרגיל? אחרת הוא לא מוצג ולא מחושב. */
export function dealActive(price: number | string, deal: Deal | null | undefined): deal is Deal {
  if (!deal) return false;
  const p = cents(price);
  if (p <= 0) return false;
  if (deal.type === "sale") return cents(deal.price) < p;
  if (deal.type === "free") return true;
  return cents(deal.price) < p * deal.qty;
}

/** התווית הקצרה, על המוצר ובסל: "1+1" · "2 ב-₪15" · "מבצע ₪10" */
export function dealLabel(deal: Deal): string {
  if (deal.type === "sale") return `מבצע ₪${fmt(cents(deal.price))}`;
  if (deal.type === "free") return `${deal.buy}+1`;
  return `${deal.qty} ב-₪${fmt(cents(deal.price))}`;
}

/** משפט אחד שמסביר לקונה מה מקבלים */
export function dealExplain(price: number | string, deal: Deal): string {
  if (deal.type === "sale") return `במקום ₪${fmt(cents(price))}`;
  if (deal.type === "free")
    return deal.buy === 1 ? "קונים אחד, השני מתנה" : `קונים ${deal.buy}, ה-${deal.buy + 1} מתנה`;
  const save = cents(price) * deal.qty - cents(deal.price);
  return `במקום ₪${fmt(cents(price) * deal.qty)}. חוסכים ₪${fmt(save)}`;
}

/** כמה עולות `qty` יחידות, עם המבצע. באגורות. */
function dealCents(price: number | string, qty: number, deal: Deal | null | undefined): number {
  const p = cents(price);
  const normal = p * qty;
  if (!dealActive(price, deal)) return normal;
  let c = normal;
  if (deal.type === "sale") c = cents(deal.price) * qty;
  else if (deal.type === "free") c = (qty - Math.floor(qty / (deal.buy + 1))) * p;
  else c = Math.floor(qty / deal.qty) * cents(deal.price) + (qty % deal.qty) * p;
  return Math.min(c, normal);
}

/** כמה עולות `qty` יחידות, עם המבצע. בשקלים. */
export function dealTotal(price: number | string, qty: number, deal: Deal | null | undefined): number {
  return dealCents(price, qty, deal) / 100;
}

/**
 * "עוד אחד וזה 2 ב-₪15" — מה חסר בסל כדי שהמבצע יתפוס (או יתפוס שוב).
 * null כשאין מה להציע (מחיר מבצע חל תמיד; או שהכמות כבר "מלאה").
 */
export function dealNudge(price: number | string, qty: number, deal: Deal | null | undefined): string | null {
  if (!dealActive(price, deal) || deal.type === "sale" || qty < 1) return null;
  const size = deal.type === "free" ? deal.buy + 1 : deal.qty;
  const missing = (size - (qty % size)) % size;
  if (missing === 0) return null;
  if (deal.type === "free") {
    // 1+1 עם אחד בסל: "עוד אחד — והוא מתנה"
    return missing === 1 ? "עוד אחד, והוא מתנה" : `עוד ${missing}, והאחרון מתנה`;
  }
  return `${missing === 1 ? "עוד אחד" : `עוד ${missing}`} וזה ${dealLabel(deal)}`;
}

export type DealLineIn = { productId: string; price: number | string; qty: number; deal: Deal | null | undefined };
export type DealLineOut = { line: number; saved: number; label: string | null };

/**
 * הסל כולו. אותו מוצר בשני צבעים הוא שתי שורות, אבל מבצע "2 ב-₪15" חל
 * על שתיהן יחד — ורוד אחד וכחול אחד זה 2. לכן מחשבים לכל מוצר על הכמות
 * הכוללת, ואת החיסכון מחלקים בין השורות שלו (כל שורה לכל היותר עד אפס).
 */
export function applyDeals(lines: DealLineIn[]): DealLineOut[] {
  const out: DealLineOut[] = lines.map((l) => ({ line: (cents(l.price) * l.qty) / 100, saved: 0, label: null }));
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => groups.set(l.productId, [...(groups.get(l.productId) ?? []), i]));
  for (const idx of groups.values()) {
    const first = lines[idx[0]];
    if (!dealActive(first.price, first.deal)) continue;
    const qty = idx.reduce((s, i) => s + lines[i].qty, 0);
    let left = cents(first.price) * qty - dealCents(first.price, qty, first.deal);
    if (left <= 0) continue;
    // מהשורה האחרונה אחורה: "השני מתנה" יורד מהשורה שנוספה אחרונה
    for (const i of [...idx].reverse()) {
      const normal = cents(lines[i].price) * lines[i].qty;
      const take = Math.min(left, normal);
      out[i] = { line: (normal - take) / 100, saved: take / 100, label: dealLabel(first.deal) };
      left -= take;
    }
    // שורות שלא ירד מהן כלום עדיין שייכות למבצע — שהתווית תופיע על כולן
    for (const i of idx) if (!out[i].label) out[i].label = dealLabel(first.deal);
  }
  return out;
}
