import type { SquishItem } from "./squish";

/**
 * מדבקות — מקור אמת יחיד לסמל, לצבע ולסדר.
 *
 * שתי משפחות, ובכוונה לא באותו מקום בדאטהבייס:
 *
 *   **אישית** (`squish_items.stickers`) — דעה של הילדה. "נדיר בעיניי",
 *   "חדש באוסף". היא בוחרת, ואף אחד לא סותר.
 *
 *   **פעולה** — נגזרת ממצב אמיתי ולא נשמרת כתווית:
 *     · "פתוח לטרייד" מ-`trade_status`
 *     · "אהוב עליי" מ-`squish_profiles.favorite_item_id`
 *   אם הן היו תוויות, אפשר היה לסמן "פתוח לטרייד" על פריט שכבר נעול
 *   בטרייד — והמדבקה הייתה משקרת בדיוק ברגע שהיא הכי חשובה.
 *
 * **"נדיר בעיניי" ולא "נדיר".** אין קטלוג שיודע כמה קיימים בעולם.
 * הניסוח נותן את תחושת האספנות בלי להמציא עובדה.
 */

export type StickerKey = "trade" | "rare" | "loved" | "new";

export interface Sticker {
  key: StickerKey;
  label: string;
  glyph: string;
  /** רקע העיגול בגלריה */
  bg: string;
  fg: string;
  /** מדבקה אישית נבחרת ביד; מדבקת פעולה נגזרת ממצב */
  personal: boolean;
  hint?: string;
}

/**
 * הסדר כאן הוא הסדר שבו הן מוצגות, וזו החלטה ולא מקריות:
 * טרייד ראשון כי הוא היחיד שמזמין פעולה מחברה שרואה את הכרטיס.
 */
export const STICKERS: Sticker[] = [
  {
    key: "trade",
    label: "פתוח לטרייד",
    glyph: "⇄",
    bg: "#8B7BC8",
    fg: "#FFFFFF",
    personal: false,
    hint: "חברות מהמעגל שלך יוכלו להציע עליו טרייד.",
  },
  {
    key: "rare",
    label: "נדיר בעיניי",
    glyph: "★",
    bg: "#E8B44A",
    fg: "#FFFFFF",
    personal: true,
  },
  {
    key: "loved",
    label: "אהוב עליי",
    glyph: "♥",
    bg: "#E79AAE",
    fg: "#FFFFFF",
    personal: false,
    hint: "אחד לאוסף — הוא יופיע בראש הגלריה.",
  },
  {
    key: "new",
    label: "חדש באוסף",
    glyph: "✦",
    bg: "#8FBF9F",
    fg: "#FFFFFF",
    personal: true,
  },
];

export const stickerBy = (key: StickerKey) => STICKERS.find((s) => s.key === key)!;

/** המדבקות האישיות בלבד — אלה שנשמרות בעמודה. */
export const PERSONAL_KEYS = ["rare", "new"] as const;
export type PersonalKey = (typeof PERSONAL_KEYS)[number];

/** יותר משלוש מדבקות על תמונה קטנה זה כבר לא סימן, זה רעש. */
export const MAX_SHOWN = 3;

/**
 * מה להציג על הכרטיס, לפי הסדר, עד שלוש.
 *
 * פריט ש*נעול* בטרייד או שכבר הוחלף לא מקבל מדבקת "פתוח לטרייד" —
 * הוא באמת לא פתוח.
 */
export function stickersFor(
  item: Pick<SquishItem, "trade_status"> & { stickers?: string[] | null },
  isFavorite = false
): Sticker[] {
  const own = new Set(item.stickers ?? []);
  const out: Sticker[] = [];
  if (item.trade_status === "open_for_trade") out.push(stickerBy("trade"));
  if (own.has("rare")) out.push(stickerBy("rare"));
  if (isFavorite) out.push(stickerBy("loved"));
  if (own.has("new")) out.push(stickerBy("new"));
  return out.slice(0, MAX_SHOWN);
}
