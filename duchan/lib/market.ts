/**
 * השוק של העיר (0077). טיפוסים משותפים לשרת ולדפדפן.
 */
export type MarketState = "none" | "parent" | "active";

export type MarketStall = {
  slug: string;
  name: string;
  emoji: string | null;
  avatar_key: string | null;
  away: boolean;
  mine: boolean;
  products: { name: string; price: number; image_key: string | null }[];
};

/** לינק אישי להורה לאישור השוק (אותו טוקן כמו בדף ההורה) */
export const marketParentPath = (slug: string, token: string) => `/parent/${slug}/market?t=${token}`;
