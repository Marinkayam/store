import type { ThemeKey } from "@/lib/themes";
import type { ArtName } from "@/app/home/items";

/**
 * נתוני הניסוי של עולם דוכן. הכול בדוי: שמות, חנויות ומוצרים.
 * אין כאן קריאה למסד ואין נתונים של ילדים אמיתיים.
 *
 * העולם הוא מישור אחד ביחידות עולם. המצלמה מתקרבת ומתרחקת מעליו, וכל
 * "רמה" (עיר, קניון, רחוב, דוכן) היא גובה מצלמה, לא מסך נפרד.
 */

export const WORLD = { w: 2400, h: 4400 };
/** מתחם הקניון הכיתתי בתוך העיר */
export const MALL = { x: 650, y: 1090, w: 1100, h: 1480 };
/** דוכן בעולם: רוחב 100 יחידות, מצויר במרחב 240×176 של KupaStall */
export const STALL = { w: 100, h: (100 * 176) / 240, ground: (100 * 150) / 240 };
export const PITCH = 116;

export const CLASS_NAME = "ה׳2";

export type Level = 0 | 1 | 2 | 3;
export const LEVEL_NAMES = ["city", "mall", "street", "stall"] as const;
export const LEVEL_LABELS = ["עיר", "קניון", "רחוב", "דוכן"] as const;

export type Emblem = "heart" | "star" | "sun" | "leaf" | "gem" | "flower" | "moon" | "drop";

export interface Deco {
  flowers: boolean;
  openSign: boolean;
  cat: boolean;
}

export interface LabProduct {
  art: ArtName;
  name: string;
  price: number;
  /** תמונת מוצר אמיתית (כתובת). כשיש, היא מוצגת במקום האיור. */
  image?: string | null;
}

export interface LabStore {
  id: string;
  name: string;
  /** שם קצר, לאות שבדף החנות */
  short: string;
  /** מה כתוב על השלט של הדוכן. עד 14 תווים, כמו בדוכן של המשחק. */
  sign: string;
  tagline: string;
  theme: ThemeKey;
  /** צבע הסוכך והבד. ברירת המחדל: הצבע הראשי של הערכה. */
  awning: string;
  emblem: Emblem;
  /** תמונת הפרופיל של החנות. כשיש, היא על השלט במקום הסמל. */
  avatar?: string | null;
  products: LabProduct[];
  deco: Deco;
  mine?: boolean;
}

/** צבעי הסוכך שאפשר לבחור בעיצוב הדוכן (הצבעים הראשיים של הערכות) */
export const AWNINGS: { key: string; label: string; color: string }[] = [
  { key: "berry", label: "לבנדר", color: "#8858A2" },
  { key: "bubble", label: "מסטיק", color: "#C23B6E" },
  { key: "melon", label: "אבטיח", color: "#C9403A" },
  { key: "lemon", label: "לימונדה", color: "#E3B93A" },
  { key: "mint", label: "מנטה", color: "#23785A" },
  { key: "slush", label: "ברד כחול", color: "#2563A8" },
];

export const STORES: LabStore[] = [
  {
    id: "noa", mine: true, name: "הסקווישים של נועה", short: "נועה", sign: "סקווישי נועה", tagline: "סקווישים, סליים וכדורים קופצים",
    theme: "berry", awning: "#8858A2", emblem: "heart",
    products: [
      { art: "squishy", name: "סקוויש חתול", price: 12 },
      { art: "slime", name: "סליים נצנצים", price: 15 },
      { art: "ball", name: "כדור קופץ", price: 6 },
      { art: "teddy", name: "דובי קטן", price: 18 },
    ],
    deco: { flowers: true, openSign: false, cat: true },
  },
  {
    id: "maya", name: "הציורים של מאיה", short: "מאיה", sign: "ציורי מאיה", tagline: "ציורים קטנים וספלים מצוירים",
    theme: "candy", awning: "#A65330", emblem: "sun",
    products: [
      { art: "painting", name: "ציור נוף", price: 20 },
      { art: "mug", name: "ספל מצויר", price: 25 },
      { art: "painting", name: "ציור שקיעה", price: 20 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "itai", name: "המכוניות של איתי", short: "איתי", sign: "מכוניות איתי", tagline: "מכוניות קטנות וכדורים",
    theme: "slush", awning: "#2563A8", emblem: "star",
    products: [
      { art: "car", name: "מכונית ירוקה", price: 10 },
      { art: "ball", name: "כדור פסים", price: 6 },
      { art: "car", name: "מכונית מירוץ", price: 14 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
  {
    id: "beads", name: "חרוזים וחברים", short: "חרוזים", sign: "חרוזים וחברים", tagline: "שרשראות וצמידים בעבודת יד",
    theme: "mint", awning: "#23785A", emblem: "gem",
    products: [
      { art: "necklace", name: "שרשרת חרוזים", price: 16 },
      { art: "bracelets", name: "שלישיית צמידים", price: 12 },
      { art: "necklace", name: "שרשרת קיץ", price: 18 },
    ],
    deco: { flowers: true, openSign: true, cat: false },
  },
  {
    id: "teddy", name: "דובי ושות׳", short: "דובי", sign: "דובי ושות׳", tagline: "בובות רכות שמחפשות בית",
    theme: "minimal", awning: "#8D6236", emblem: "leaf",
    products: [
      { art: "teddy", name: "דובי חום", price: 22 },
      { art: "squishy", name: "סקוויש ארנב", price: 12 },
      { art: "teddy", name: "דובי קטן", price: 18 },
    ],
    deco: { flowers: false, openSign: false, cat: true },
  },
  {
    id: "slime", name: "סליים סטודיו", short: "סליים", sign: "סליים סטודיו", tagline: "סליים בכל הצבעים",
    theme: "pastel", awning: "#577157", emblem: "drop",
    products: [
      { art: "slime", name: "סליים ירוק", price: 14 },
      { art: "slime", name: "סליים ענן", price: 16 },
      { art: "mug", name: "כוס ערבוב", price: 9 },
    ],
    deco: { flowers: true, openSign: false, cat: false },
  },
  {
    id: "mugs", name: "ספלים מצוירים", short: "ספלים", sign: "ספלים מצוירים", tagline: "ספל לכל בוקר",
    theme: "lemon", awning: "#E3B93A", emblem: "flower",
    products: [
      { art: "mug", name: "ספל לב", price: 24 },
      { art: "painting", name: "תחתית מצוירת", price: 10 },
      { art: "mug", name: "ספל פסים", price: 24 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "balls", name: "הכדורים של יובל", short: "יובל", sign: "כדורי יובל", tagline: "כדורים קופצים ומכוניות",
    theme: "melon", awning: "#C9403A", emblem: "moon",
    products: [
      { art: "ball", name: "כדור ענק", price: 9 },
      { art: "car", name: "מכונית כיס", price: 8 },
      { art: "ball", name: "כדור זוהר", price: 11 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
  {
    id: "rainbow", name: "צמידי קשת", short: "קשת", sign: "צמידי קשת", tagline: "צמידים בצבעי הקשת",
    theme: "bubble", awning: "#C23B6E", emblem: "heart",
    products: [
      { art: "bracelets", name: "צמידי קשת", price: 12 },
      { art: "necklace", name: "שרשרת לב", price: 16 },
      { art: "bracelets", name: "צמיד חברות", price: 7 },
    ],
    deco: { flowers: true, openSign: false, cat: false },
  },
  {
    id: "tamar", name: "פינת היצירה של תמר", short: "תמר", sign: "היצירה של תמר", tagline: "ציורים, צמידים והפתעות",
    theme: "cloud", awning: "#716E43", emblem: "leaf",
    products: [
      { art: "painting", name: "ציור פרחים", price: 18 },
      { art: "bracelets", name: "צמיד חוטים", price: 8 },
      { art: "squishy", name: "סקוויש הפתעה", price: 10 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "stars", name: "כוכבים קטנים", short: "כוכבים", sign: "כוכבים קטנים", tagline: "דברים קטנים שעושים שמח",
    theme: "night", awning: "#7B63A8", emblem: "star",
    products: [
      { art: "squishy", name: "סקוויש כוכב", price: 12 },
      { art: "ball", name: "כדור לילה", price: 9 },
      { art: "necklace", name: "שרשרת כוכבים", price: 17 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
];

export type ClassSize = 3 | 8 | 11;

export type PlotKind = "stall" | "empty" | "garden";
export interface Plot {
  id: string;
  zone: "A" | "B";
  /** מרכז הדוכן על הציר האופקי, וקו הקרקע שלו (יחידות עולם) */
  cx: number;
  by: number;
  kind: PlotKind;
  store?: LabStore;
}

export const ZONES = {
  A: { name: "רחוב הסוככים", by: MALL.y + 330, x0: MALL.x + 86, n: 9 },
  B: { name: "סמטת הפנסים", by: MALL.y + 1130, x0: MALL.x + 318, n: 5 },
} as const;

const byId = (id: string) => STORES.find((s) => s.id === id)!;

/** סדר החנויות הבדויות: שמונה לרחוב הסוככים, ושלוש לסמטה */
const FICTION = ["maya", "itai", "beads", "noa", "teddy", "slime", "mugs", "balls", "rainbow", "tamar", "stars"];

/**
 * מי עומד איפה, לפי גודל הכיתה.
 *   3  — פינה: שלושה דוכנים צמודים, ומשני הצדדים מקום פנוי. שאר הרחוב גינה.
 *   8  — הרחוב מלא, עם מקום פנוי אחד באמצע. הסמטה נפתחה וריקה.
 *   11 — גם בסמטה יש שלושה דוכנים.
 * מקום פנוי הוא מקום פנוי: לא ממלאים אותו בדוכן שלא קיים.
 *
 * list — החנויות להציב, לפי הסדר. בלי הערך הזה: החנויות הבדויות.
 * אם יש פחות חנויות ממקומות, הראשון שנשאר ריק הוא "מקום פנוי" והשאר גינה.
 */
export function layout(size: ClassSize, list?: LabStore[]): Plot[] {
  const pool = list ?? (size === 3 ? ["maya", "noa", "itai"] : FICTION).map(byId);
  type Slot = number | "empty" | "garden";
  const a: Slot[] = size === 3 ? ["garden", "garden", "empty", 0, 1, 2, "empty", "garden", "garden"] : [0, 1, 2, 3, "empty", 4, 5, 6, 7];
  const b: Slot[] = size === 3 ? ["garden", "garden", "garden", "garden", "garden"] : size === 8 ? ["garden", "empty", "empty", "empty", "garden"] : ["empty", 8, 9, 10, "empty"];
  const make = (zone: "A" | "B", row: Slot[]): Plot[] => {
    let opened = row.includes("empty");
    return row.map((v, i) => {
      const z = ZONES[zone];
      const base = { id: `${zone}${i}`, zone, cx: z.x0 + PITCH * i, by: z.by };
      if (typeof v === "number") {
        const store = pool[v];
        if (store) return { ...base, kind: "stall" as const, store };
        if (!opened) { opened = true; return { ...base, kind: "empty" as const }; }
        return { ...base, kind: "garden" as const };
      }
      return { ...base, kind: v };
    });
  };
  return [...make("A", a), ...make("B", b)];
}

/** הסמטה נפתחת רק כשיש מספיק דוכנים ברחוב הראשי */
export const alleyOpen = (size: ClassSize) => size >= 8;

export interface Surprise {
  id: string;
  /** מרכז האזור שנוגעים בו, ורדיוס (יחידות עולם) */
  x: number;
  y: number;
  r: number;
  /** מאיזו רמה אפשר לגעת בה */
  from: Level;
  to: Level;
  label: string;
  text: string;
}

export const SURPRISES: Surprise[] = [
  { id: "fountain", x: MALL.x + 550, y: MALL.y + 660, r: 74, from: 2, to: 3, label: "המזרקה", text: "זרקת מטבע למזרקה וביקשת משאלה." },
  { id: "board", x: MALL.x + 232, y: MALL.y + 548, r: 46, from: 2, to: 3, label: "לוח המודעות", text: "לוח המודעות של הכיתה. כאן מספרים מה חדש בקניון." },
  { id: "hopscotch", x: MALL.x + 842, y: MALL.y + 790, r: 52, from: 2, to: 3, label: "קלאס", text: "קלאס! אחת, שתיים, שלוש, קפיצה." },
  { id: "garden", x: MALL.x + 205, y: MALL.y + 795, r: 80, from: 2, to: 3, label: "הגינה של הכיתה", text: "השקית את הגינה. פרח חדש לכל דוכן שנפתח בכיתה." },
  { id: "cat", x: MALL.x + 610, y: MALL.y + 900, r: 30, from: 2, to: 3, label: "החתול של הקניון", text: "מיאו. החתול של הקניון אוהב לנמנם ליד המזרקה." },
  { id: "ducks", x: 300, y: 1500, r: 150, from: 0, to: 1, label: "הברווזים בפארק", text: "גע גע. באגם של הפארק גרים שלושה ברווזים." },
  { id: "tower", x: 300, y: 150, r: 110, from: 0, to: 1, label: "מגדל המים", text: "מגדל מים. פעם כך הגיעו המים לכל הבתים בעיר." },
  { id: "boat", x: 1700, y: 4110, r: 120, from: 0, to: 1, label: "סירת המפרש", text: "הים התיכון. בהמשך יהיה אפשר להתרחק עוד, עד למפת ישראל." },
];

export const NOTICES = [
  "יריד כיתתי ביום שישי, בהפסקה הגדולה.",
  "סמטת הפנסים מחפשת דוכנים חדשים.",
  "תודה לכל מי שהשקה את הגינה השבוע.",
];
