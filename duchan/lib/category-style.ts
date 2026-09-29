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

/** מידות לכל צורה ולכל גודל, בפיקסלים. */
export const CATEGORY_DIMENSIONS = {
  text: {
    sm: { font: 12, padY: 6, padX: 12 },
    md: { font: 13, padY: 8, padX: 14 },
    lg: { font: 15, padY: 11, padX: 18 },
  },
  icon: {
    sm: { font: 12, padY: 5, padX: 10, icon: 20 },
    md: { font: 13, padY: 6, padX: 12, icon: 26 },
    lg: { font: 15, padY: 8, padX: 14, icon: 32 },
  },
  circle: {
    sm: { font: 11, box: 52 },
    md: { font: 12, box: 66 },
    lg: { font: 13.5, box: 84 },
  },
  square: {
    sm: { font: 11, box: 58 },
    md: { font: 12, box: 76 },
    lg: { font: 13.5, box: 98 },
  },
  card: {
    sm: { font: 12, w: 112, h: 70 },
    md: { font: 13, w: 140, h: 88 },
    lg: { font: 15, w: 176, h: 112 },
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
