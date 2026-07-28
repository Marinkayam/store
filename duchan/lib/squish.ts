/**
 * Squish Club — מקור האמת היחיד לטיפוסים, לתוויות ולכללי המוצר.
 *
 * הערכים הפנימיים באנגלית ויציבים; העברית היא תצוגה בלבד. אסור לשנות ערך
 * קיים אחרי שהוא נשמר בדאטהבייס — רק להוסיף חדש, בדיוק כמו מפתחות ערכות
 * הנושא של דוכן.
 */

export type SquishyType =
  | "needoh"
  | "water"
  | "sand"
  | "ice"
  | "bubble_blowing"
  | "eye_popping"
  | "taba"
  | "clay"
  | "foam"
  | "other";

export type SquishSize = "small" | "medium" | "large" | "huge";
export type SquishCondition = "new" | "like_new" | "good" | "used" | "flawed";
export type SquishTradeStatus =
  | "keep"
  | "open_for_trade"
  | "maybe_trade"
  | "reserved"
  | "traded"
  | "moved_to_duchan";
export type SquishVisibility = "private" | "direct_friends" | "extended_circle" | "group_only";

export const SQUISH_TYPES: { key: SquishyType; label: string }[] = [
  { key: "needoh", label: "נידו" },
  { key: "water", label: "מים" },
  { key: "sand", label: "חול" },
  { key: "ice", label: "קרח" },
  { key: "bubble_blowing", label: "מפריח בועה" },
  { key: "eye_popping", label: "מוציא עיניים" },
  { key: "taba", label: "טאבה" },
  { key: "clay", label: "קליי" },
  { key: "foam", label: "ספוג" },
  { key: "other", label: "אחר" },
];

export const SQUISH_SIZES: { key: SquishSize; label: string }[] = [
  { key: "small", label: "קטן" },
  { key: "medium", label: "בינוני" },
  { key: "large", label: "גדול" },
  { key: "huge", label: "ענק" },
];

export const SQUISH_CONDITIONS: { key: SquishCondition; label: string }[] = [
  { key: "new", label: "חדש" },
  { key: "like_new", label: "כמו חדש" },
  { key: "good", label: "מצב טוב" },
  { key: "used", label: "משומש" },
  { key: "flawed", label: "יש פגם קטן" },
];

/** שלוש הבחירות שהבעלים עושה. השאר נקבעות על ידי המערכת. */
export const SQUISH_TRADE_CHOICES: { key: SquishTradeStatus; label: string; hint: string }[] = [
  { key: "keep", label: "נשאר אצלי", hint: "לא מוצע לטרייד" },
  { key: "open_for_trade", label: "פתוח לטרייד", hint: "יופיע לחברות ב'לגלות'" },
  { key: "maybe_trade", label: "אולי לטרייד", hint: "רק אצלי באוסף, לא ב'לגלות'" },
];

export const SQUISH_VISIBILITY: { key: SquishVisibility; label: string; hint: string }[] = [
  { key: "private", label: "רק אני", hint: "אף אחת לא רואה את האוסף" },
  { key: "direct_friends", label: "החברות שלי", hint: "מי שהוספת למעגל" },
  { key: "extended_circle", label: "גם חברות של חברות", hint: "מעגל רחב יותר" },
  { key: "group_only", label: "קבוצות פרטיות", hint: "רק מי שאיתך בקבוצה" },
];

const label = <T extends string>(list: { key: T; label: string }[], key: T | null | undefined) =>
  list.find((x) => x.key === key)?.label ?? "";

export const typeLabel = (k: SquishyType | null | undefined) => label(SQUISH_TYPES, k);
export const sizeLabel = (k: SquishSize | null | undefined) => label(SQUISH_SIZES, k);
export const conditionLabel = (k: SquishCondition | null | undefined) => label(SQUISH_CONDITIONS, k);

/**
 * כמה פריטים צריך לפני שאפשר להיכנס ל"לגלות", לשתף קישור או להציע טרייד.
 * זה לא מספר שרירותי: אוסף של פחות משלושה לא נראה כמו אוסף, ואי אפשר
 * להציע ממנו כלום.
 */
export const MIN_ITEMS = 3;

/** קוד אקראי לקישור. לא כינוי ולא שם — כמו slug של חנות. */
export function squishCode(len = 6): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789"; // בלי תווים שמתבלבלים
  let out = "";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += abc[buf[i] % abc.length];
  return out;
}

/** גרסת נוסח אישור ההורים. משתנה כשהנוסח משתנה, ונשמר יחד עם החותמת. */
export const PARENT_AWARENESS_VERSION = "squish-2026-07";
export const PARENT_AWARENESS_COPY =
  "אני מאשרת שההורה שלי יודע שאני משתמשת ב-Squish Club ומאשר לי להעלות פריטים ולהציע טריידים.";

export interface SquishItem {
  id: string;
  owner_user_id: string;
  profile_id: string;
  name: string;
  squishy_type: SquishyType;
  custom_type: string | null;
  size: SquishSize;
  condition: SquishCondition;
  condition_note: string | null;
  trade_status: SquishTradeStatus;
  wanted_description: string | null;
  image_key: string | null;
  video_key: string | null;
  poster_key: string | null;
  sort_order: number;
  duchan_product_id: string | null;
  created_at: string;
}

export interface SquishProfile {
  id: string;
  user_id: string;
  nickname: string;
  general_city: string | null;
  collection_title: string | null;
  collection_code: string;
  collection_visibility: SquishVisibility;
  theme: string;
  cover_preset: string | null;
  parent_awareness_at: string | null;
  completed_trades: number;
}
