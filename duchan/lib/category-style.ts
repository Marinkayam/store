/**
 * עיצוב שורת הקטגוריות בדוכן (מיגרציה 0052).
 *
 * שלוש החלטות של המוכרת:
 *   צורה  — רק טקסט · אייקון וטקסט · עיגולים · ריבועים · כרטיסים
 *   גודל  — קטן · בינוני · גדול
 *   לכל קטגוריה — אמוג'י או תמונה משלה. תמונה גוברת. בלי כלום — האות
 *   הראשונה של השם, כך שאין אף פעם משבצת ריקה.
 *
 * הצבעים, הפינות והגופן מגיעים מהערכה ומהסגנון של הדוכן (משתני --s-*),
 * כך שהקטגוריות תמיד משתלבות במה שנבחר, בלי בחירה נוספת.
 *
 * ערך לא מוכר נופל לברירת המחדל. אסור למחוק מפתח — חנות ששמרה אותו
 * תחזור לברירת המחדל בשקט.
 */

export type CategoryLayout = "text" | "icon" | "circle" | "square" | "card";
export type CategorySize = "sm" | "md" | "lg";

export interface CategoryMetaItem {
  emoji?: string;
  /** מפתח R2: {storeId}/cat/{uuid}.webp */
  image?: string;
}
export type CategoryMeta = Record<string, CategoryMetaItem>;

export const CATEGORY_LAYOUTS: { key: CategoryLayout; label: string; hint: string }[] = [
  { key: "text", label: "רק טקסט", hint: "נקי ופשוט" },
  { key: "icon", label: "אייקון וטקסט", hint: "אמוג'י או תמונה קטנה ליד השם" },
  { key: "circle", label: "עיגולים", hint: "תמונה עגולה והשם מתחת" },
  { key: "square", label: "ריבועים", hint: "משבצת עם תמונה והשם מתחת" },
  { key: "card", label: "כרטיסים", hint: "תמונה גדולה והשם עליה" },
];

export const CATEGORY_SIZES: { key: CategorySize; label: string }[] = [
  { key: "sm", label: "קטן" },
  { key: "md", label: "בינוני" },
  { key: "lg", label: "גדול" },
];

export function layoutOrDefault(v: string | null | undefined): CategoryLayout {
  return CATEGORY_LAYOUTS.some((l) => l.key === v) ? (v as CategoryLayout) : "text";
}

export function sizeOrDefault(v: string | null | undefined): CategorySize {
  return v === "sm" || v === "lg" ? v : "md";
}

/** רק אובייקט עם שדות מוכרים — מה שמגיע מהדאטהבייס לא נסמך עליו עיוור. */
export function cleanMeta(v: unknown): CategoryMeta {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: CategoryMeta = {};
  for (const [name, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const item: CategoryMetaItem = {};
    if (typeof r.emoji === "string" && r.emoji.trim()) item.emoji = r.emoji.trim().slice(0, 8);
    if (typeof r.image === "string" && r.image.trim()) item.image = r.image.trim().slice(0, 200);
    if (item.emoji || item.image) out[name] = item;
  }
  return out;
}

/**
 * מידות לכל צורה ולכל גודל, בפיקסלים.
 *
 * gap — הרווח בין פריט לפריט. גדל עם הגודל ועם הצורה: עיגול של 84px
 * עם 12px לידו נראה דחוס, צ'יפ קטן עם 22px נראה מפוזר. after — הרווח
 * מתחת לשורה, עד רשת המוצרים, כדי שהקטגוריות לא ייצמדו לכרטיסים.
 */
export const CATEGORY_DIMENSIONS = {
  text: {
    sm: { font: 12, padY: 7, padX: 13, gap: 8, after: 16 },
    md: { font: 13, padY: 9, padX: 16, gap: 10, after: 20 },
    lg: { font: 15, padY: 12, padX: 20, gap: 12, after: 22 },
  },
  icon: {
    sm: { font: 12, padY: 5, padX: 12, icon: 22, inner: 6, gap: 8, after: 16 },
    md: { font: 13, padY: 6, padX: 14, icon: 28, inner: 8, gap: 10, after: 20 },
    lg: { font: 15, padY: 7, padX: 18, icon: 34, inner: 10, gap: 12, after: 22 },
  },
  circle: {
    sm: { font: 11.5, box: 56, gap: 14, after: 18 },
    md: { font: 12.5, box: 68, gap: 18, after: 22 },
    lg: { font: 13.5, box: 84, gap: 22, after: 24 },
  },
  square: {
    sm: { font: 11.5, box: 60, gap: 12, after: 18 },
    md: { font: 12.5, box: 76, gap: 16, after: 22 },
    lg: { font: 13.5, box: 98, gap: 18, after: 24 },
  },
  card: {
    sm: { font: 12, w: 116, h: 74, gap: 10, after: 18 },
    md: { font: 13, w: 144, h: 92, gap: 12, after: 22 },
    lg: { font: 15, w: 180, h: 116, gap: 14, after: 24 },
  },
} as const;

/**
 * גודל התמונה שכדאי להעלות, כמו שכתוב במסך. התמונה נחתכת לריבוע ונשמרת
 * ב-CATEGORY_IMAGE_PX — חד גם בכרטיס הגדול בטלפון עם מסך צפוף.
 */
export const CATEGORY_IMAGE_PX = 600;
export const CATEGORY_IMAGE_HINT =
  "הכי יפה: תמונה ריבועית, לפחות 600×600 פיקסלים. תמונה אחרת תיחתך לריבוע מהאמצע.";

/** אמוג'ים מוכנים — מה שדוכנים של ילדות מוכרים בפועל. */
export const CATEGORY_EMOJIS = [
  "🧸", "🎀", "💎", "🌈", "🍓", "🍭", "🧁", "🍩",
  "⭐", "🌸", "🦄", "🐱", "🐶", "🎨", "✂️", "🧶",
  "📿", "💍", "👜", "🎒", "📚", "✏️", "💅", "🎁",
  "🔮", "🫧", "🍦", "🌙", "🎈", "💖", "🧊", "💧",
];

/** האייקון של "הכל" בצורות שיש בהן אייקון. */
export const ALL_ICON = "🛍️";
