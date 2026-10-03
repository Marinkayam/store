/**
 * מה שותף/ה רשאי/ת לשנות בדוכן — העתק של הרשימה ב-guard_store_member_update
 * (מיגרציה 0057). הדאטהבייס הוא שאוכף; כאן רק כדי ששמירה של שותף/ה לא
 * תשלח שדות אחרים בכלל (גם בלי שינוי — נרמול קטן של טלפון היה מפיל את כל
 * השמירה).
 */
export const PARTNER_FIELDS = [
  "display_name", "emoji", "tagline", "theme", "cover_key", "cover_preset", "avatar_key",
  "about", "city", "ships", "shipping_note", "shipping_price", "order_intro", "order_outro",
  "promo_on", "promo_title", "promo_text", "categories", "look", "bg_pattern", "bg_key",
  "category_layout", "category_size", "category_meta", "featured_title", "show_sold_out", "status",
] as const;

export function partnerPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const allowed = new Set<string>(PARTNER_FIELDS);
  return Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k))) as Partial<T>;
}

/** מקטעים ב"הדוכן שלי" שרק ראש הדוכן פותח */
export const OWNER_ONLY_SECTIONS = ["payment", "details"] as const;
