import type { PublicProduct } from "./types";

/**
 * תגיות מוצר.
 *
 * מוצר מקבל **תגית אחת**, לפי סדר עדיפות. זו לא הגבלה טכנית אלא החלטת עיצוב:
 * ברשת של שתי עמודות בטלפון, שלוש תגיות על כרטיס אחד הופכות את כולן לרעש
 * ולא אומרות לקונה כלום. תגית אחת נקראת בסריקה מהירה.
 *
 * הסדר הוא לפי מה שדוחף להחלטה עכשיו: דחיפות ← הוכחה חברתית ← מחיר ← נדירות
 * ← חדשות. "חדש" אחרון כי הוא הכי חלש — כל מוצר היה חדש פעם.
 */
export type BadgeKey = "last" | "best" | "sale" | "rare" | "new";

// הצבעים מהדיזיין סיסטם: נמכר=אפרסק, חדש=לבנדר, נדיר=זית, מומלץ=שמנת.
export const BADGES: Record<BadgeKey, { emoji: string; label: string; bg: string; fg: string }> = {
  last: { emoji: "⌛", label: "אחרון במלאי", bg: "#E3C26F", fg: "#3A2E12" },
  best: { emoji: "⭐", label: "הכי נמכר", bg: "#D9967A", fg: "#FFFFFF" },
  sale: { emoji: "🎁", label: "מבצע", bg: "#B9824A", fg: "#FFFFFF" },
  rare: { emoji: "💎", label: "נדיר", bg: "#A8A46D", fg: "#FFFFFF" },
  new:  { emoji: "🌿", label: "חדש",  bg: "#B89AC8", fg: "#FFFFFF" },
};

/** מוצר נחשב חדש בשבוע הראשון שלו. */
const NEW_DAYS = 7;

/** התגיות שהילדה בוחרת בעצמה — אלה היחידות שנשמרות ב-DB. */
export const PICKABLE: { key: "rare" | "sale"; emoji: string; label: string }[] = [
  { key: "rare", emoji: BADGES.rare.emoji, label: BADGES.rare.label },
  { key: "sale", emoji: BADGES.sale.emoji, label: BADGES.sale.label },
];

/**
 * התגית שתוצג למוצר. `bestSellerId` מגיע מחישוב על הזמנות ששולמו —
 * ראה bestSellerOf למטה.
 */
export function badgeFor(
  p: PublicProduct,
  bestSellerId: string | null,
  soldIds: Set<string> = new Set()
): BadgeKey | null {
  // "אזל" הוא לא תגית אלא רצועה על התמונה, ומטופל בנפרד
  if (p.track_stock && p.stock === 0) return null;
  /**
   * "אחרון במלאי" רק אחרי שנמכרה ממנו לפחות יחידה אחת.
   *
   * רוב מה שנמכר כאן הוא דבר יחיד — סקוויש אחד, צמיד אחד — ולכן כמות 1 היא
   * מצב הפתיחה הרגיל ולא נדירות. בלי התנאי הזה כל הדוכן מתמלא ברצועות
   * צהובות ביום הראשון, והתגית שאמורה לומר "תמהרי" לא אומרת כלום.
   */
  if (p.track_stock && p.stock === 1 && soldIds.has(p.id)) return "last";
  if (bestSellerId && p.id === bestSellerId) return "best";
  if (p.badge === "sale") return "sale";
  if (p.badge === "rare") return "rare";
  if (Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 24 * 60 * 60 * 1000) return "new";
  return null;
}

/** המוצרים שכבר נמכרה מהם לפחות יחידה אחת (הזמנות ששולמו בלבד). */
export function soldProductIds(
  orders: { items: { id?: string; name: string; qty: number }[] }[],
  products: { id: string; name: string }[]
): string[] {
  const live = new Set(products.map((p) => p.id));
  const nameToId = new Map(products.map((p) => [p.name, p.id]));
  const ids = new Set<string>();
  for (const o of orders) {
    for (const item of o.items ?? []) {
      const id = item.id ?? nameToId.get(item.name);
      if (id && live.has(id) && (Number(item.qty) || 0) > 0) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * המוצר שנמכר הכי הרבה, מתוך הזמנות ששולמו בלבד.
 *
 * הזמנה במצב sent היא כוונה, לא מכירה — הקונה יכולה ללחוץ ולא לשלוח בפועל.
 * כוכב שמבוסס על כוונות היה הופך את התגית לחסרת משמעות, וזו בדיוק התגית
 * שאמורה ללמד שהצלחה נמדדת במה שקרה ולא במה שכמעט קרה.
 *
 * דרושות לפחות שתי יחידות — מכירה בודדת אינה "הכי נמכר", היא מכירה.
 */
export function bestSellerOf(
  orders: { items: { id?: string; name: string; qty: number }[] }[],
  products: { id: string; name: string }[]
): string | null {
  const byId = new Map<string, number>();
  const live = new Set(products.map((p) => p.id));
  const nameToId = new Map(products.map((p) => [p.name, p.id]));

  for (const o of orders) {
    for (const item of o.items ?? []) {
      // הזמנות ותיקות נשמרו בלי מזהה מוצר — נופלים לשם, וזה מדויק מספיק
      const id = item.id ?? nameToId.get(item.name);
      // מוצר שנמחק או הוסתר עדיין מופיע בהזמנות ישנות. בלי הסינון הזה הוא
      // "מנצח" בספירה, והכוכב נעלם מכל החנות במקום לעבור למוכר הבא.
      if (!id || !live.has(id)) continue;
      byId.set(id, (byId.get(id) ?? 0) + (Number(item.qty) || 0));
    }
  }

  // תיקו לא מייצר מנצח. "הכי נמכר" שנקבע לפי סדר השורות בטבלה הוא לא הישג
  // אלא מקריות, והוא היה קופץ בין שני מוצרים בכל רענון.
  let winner: string | null = null;
  let top = 1; // לפחות שתיים
  let tied = false;
  for (const [id, qty] of byId) {
    if (qty > top) {
      top = qty;
      winner = id;
      tied = false;
    } else if (qty === top && winner) {
      tied = true;
    }
  }
  return tied ? null : winner;
}
