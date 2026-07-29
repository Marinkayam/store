/**
 * סקוויש קלאב — מקור האמת היחיד לטיפוסים, לתוויות ולכללי המוצר.
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
  { key: "extended_circle", label: "גם המעגל המורחב", hint: "חברות של החברות שלך" },
];

/* group_only ירד מהרשימה: שום דבר לא יוצר קשר מסוג group_member, ולכן
   בחירה בו הסתירה את האוסף מכולן. ערך ה-enum נשאר בדאטהבייס — מחיקת
   ערך enum שוברת כל שורה שמצביעה עליו — והנתונים הועברו במיגרציה 0032. */

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

/** השם בעברית. המוצר מדבר לילדות, ו-Squish Club באנגלית לא נקרא. */
export const BRAND = "סקוויש קלאב";

/** אמוג'י לתמונת הפרופיל, כשעוד לא הועלתה תמונה. כמו בדוכן. */
export const SQUISH_EMOJIS = ["🧸", "🐸", "🦄", "🍡", "🐙", "☁️", "🍓", "🐥", "🌈", "🧁"];

/** רשימת המבוקשים ברמת האוסף: סוג, צבע, ותיאור חופשי. */
export interface Wish {
  id: string;
  profile_id: string;
  squishy_type: SquishyType | null;
  color: string | null;
  description: string | null;
  sort_order: number;
}
export const MAX_WISHES = 8;
export const WISH_COLORS = [
  "ורוד", "סגול", "ירוק", "כחול", "צהוב", "לבן", "שחור", "פסטל", "שקוף", "צבעוני",
];

/** שמות לדוגמה לגלריה. שם אמיתי, לא "האוסף של X". */
export const GALLERY_NAME_HINTS = [
  "המדף הוורוד",
  "אוסף הקסמים",
  "פינת הסקווישים",
  "המדף הרך",
  "אוסף הנדירים",
];

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

/**
 * אישור הורה חד-פעמי — מאחורי דגל, כבוי כברירת מחדל.
 *
 * כל עוד הוא כבוי, תיבת הסימון הקיימת היא הדרך היחידה, בדיוק כמו היום.
 * הגרסה נשמרת יחד עם ההחלטה, כדי שאם הנוסח ישתנה יהיה ברור על מה אישרו.
 */
export const PARENT_APPROVAL_VERSION = "parent-approval-2026-07";
export const PARENT_APPROVAL_COPY = [
  "הילדה שלך פתחה אוסף סקווישים בסקוויש קלאב.",
  "מה שהיא יכולה לעשות שם: להעלות תמונות וסרטונים של הסקווישים שלה, להזמין חברות שהיא מכירה, ולהציע להן החלפה של סקווישי בסקווישי.",
  "מה שאין שם: מכירה, כסף, משלוחים, חיפוש ציבורי, צ'אט, וכתובת או בית ספר.",
  "כשההחלפה מסוכמת, האפליקציה פותחת שיחת וואטסאפ בין שתי הילדות כדי שיקבעו מקום וזמן. המפגש עצמו הוא באחריותכם, ואנחנו מבקשים במפורש שיתואם בידיעת הורה.",
  "אפשר לבטל את האישור בכל רגע בפנייה אלינו, והאוסף יימחק.",
];

export function parentApprovalEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SQUISH_PARENT_APPROVAL === "1";
}
export const PARENT_AWARENESS_COPY =
  "אני מאשרת שההורה שלי יודע שאני משתמשת בסקוויש קלאב ומאשר לי להעלות פריטים ולהציע טריידים.";

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
  /** מדבקות אישיות: rare / new. טרייד ואהוב נגזרים ממצב ולא נשמרים כאן. */
  stickers: string[] | null;
  wanted_description: string | null;
  image_key: string | null;
  video_key: string | null;
  poster_key: string | null;
  series: string | null;
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
  about: string | null;
  collection_code: string;
  collection_visibility: SquishVisibility;
  theme: string;
  emoji: string;
  avatar_key: string | null;
  cover_key: string | null;
  cover_preset: string | null;
  favorite_item_id: string | null;
  parent_awareness_at: string | null;
  completed_trades: number;
}

/* ── קישורי הזמנה ──
   התוקף והתקרה נאכפים בדאטהבייס (מיגרציה 0032). הערכים כאן הם רק
   לתצוגה, כדי שהמסך יגיד את אותו דבר שהשרת יאכוף. */

export const INVITE_DAYS = 30;
export const INVITE_MAX_USES = 10;

export type InviteState = "ok" | "not_found" | "revoked" | "expired" | "exhausted";

/** מה להגיד למי שנחתה על קישור שאינו תקף. */
export const INVITE_STATE_COPY: Record<Exclude<InviteState, "ok">, string> = {
  not_found: "לא מצאנו את ההזמנה. אולי הקישור לא שלם.",
  revoked: "הקישור הזה כבר לא פעיל.",
  expired: "הקישור הזה פג. אפשר לבקש קישור חדש.",
  exhausted: "הקישור הזה כבר שימש את מספר החברות שהוגדר לו.",
};

/** שמות מוצעים לקישור — במקום קבוצות. */
export const INVITE_LABELS = ["חוג ריקוד", "הכיתה שלי", "בנות האקרובטיקה", "החברות מהשכונה"];
