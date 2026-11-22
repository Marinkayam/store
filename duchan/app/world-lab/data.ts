import type { ThemeKey } from "@/lib/themes";
import type { ArtName } from "@/app/home/items";

/**
 * נתוני הניסוי של עולם דוכן. הכול בדוי: שמות, חנויות ומוצרים.
 * אין כאן קריאה למסד ואין נתונים של ילדים אמיתיים.
 *
 * העולם הוא מישור אחד ביחידות עולם. המצלמה מתקרבת ומתרחקת מעליו, וכל
 * "רמה" (עיר, קניון, רחוב, דוכן) היא גובה מצלמה, לא מסך נפרד.
 */

/**
 * העיר מצוירת ביחידות משלה (2400×4400) ומוגדלת פי CITY_K אל העולם. ההגדלה
 * מפנה מקום לבית ספר שלם בגוש המרכזי: שש כיתות, כל אחת עם קניון בגודל מלא.
 */
export const CITY_K = 3.6;
export const WORLD = { w: 2400 * CITY_K, h: 4400 * CITY_K };
/** נקודה בציור העיר → נקודה בעולם */
export const cityPt = (x: number, y: number) => ({ x: x * CITY_K, y: y * CITY_K });

/** בית הספר: הגוש המרכזי של העיר */
export const CAMPUS = { x: 2400, y: 3984, w: 3840, h: 5208 };
export const SCHOOL_NAME = "בית ספר הדקל";
export const OTHER_SCHOOL = "בית ספר הגפן";
export const CLASS_NAME = "ה׳2";

const LOT = { w: 1100, h: 1480, gap: 135, top: 800, between: 260 };
const lotAt = (row: number, col: number) => ({
  x: CAMPUS.x + LOT.gap + col * (LOT.w + LOT.gap),
  y: CAMPUS.y + LOT.top + row * (LOT.h + LOT.between),
  w: LOT.w,
  h: LOT.h,
});

/** הקניון של הכיתה שלי: אחד משישה מתחמים בחצר בית הספר */
export const MALL = lotAt(0, 1);

export interface ClassLot {
  id: string;
  name: string;
  grade: string;
  x: number; y: number; w: number; h: number;
  /** כמה דוכנים יש בכיתה כשבית הספר כבר גדל. 0 = מקום פנוי לכיתה. */
  stalls: number;
  mine?: boolean;
}

/** שתי שכבות, שלוש כיתות בכל אחת. רק לכיתה שלי נכנסים; האחרות נראות מבחוץ. */
export const CLASSES: ClassLot[] = [
  { id: "h1", name: "ה׳1", grade: "שכבת ה׳", ...lotAt(0, 0), stalls: 5 },
  { id: "h2", name: CLASS_NAME, grade: "שכבת ה׳", ...lotAt(0, 1), stalls: 11, mine: true },
  { id: "h3", name: "ה׳3", grade: "שכבת ה׳", ...lotAt(0, 2), stalls: 0 },
  { id: "v1", name: "ו׳1", grade: "שכבת ו׳", ...lotAt(1, 0), stalls: 6 },
  { id: "v2", name: "ו׳2", grade: "שכבת ו׳", ...lotAt(1, 1), stalls: 0 },
  { id: "v3", name: "ו׳3", grade: "שכבת ו׳", ...lotAt(1, 2), stalls: 3 },
];
export const GRADE_ROWS = [
  { name: "שכבת ה׳", y: CAMPUS.y + LOT.top - 70 },
  { name: "שכבת ו׳", y: CAMPUS.y + LOT.top + LOT.h + LOT.between - 70 },
];

/**
 * סוג הקהילה. אותה עיר, אותם רחובות ואותם דוכנים; מה שמשתנה הוא מי השכנים:
 * כיתה בבית ספר, או כיכר בשכונה. כל מה שתלוי בסוג יושב כאן, כדי שהעולם עצמו
 * לא יידע אם הוא בית ספר או שכונה.
 */
export type CommunityKind = "class" | "hood";
export interface Community {
  kind: CommunityKind;
  /** שמות הרמות בסולם */
  levels: string[];
  /** המקום שמעל הקהילה: בית הספר או השכונה */
  place: string;
  otherPlace: string;
  emptyPlace: string;
  /** השלט על הבניין שבראש המתחם */
  sign: string;
  /** שם לכל מתחם, לפי המזהה שלו */
  lots: Record<string, string>;
  rows: [string, string];
  /** "הקניון של ה׳2" / "השוק של כיכר התמר" */
  mallOf: (lot: string) => string;
  /** "קניון" / "שוק" */
  mall: string;
  /** "הכיתה" / "הכיכר" */
  unit: string;
  /** "כיתה" / "כיכר" */
  unitWord: string;
  /** מה רואה מי שלא שייך */
  outsiders: string;
  /** מי רואה את הדוכנים, ומי רואה גם שמות פרטיים */
  seenBy: string;
  namesBy: string;
  neighbor: string;
  hint0: string;
  hint1: string;
  locked: Record<number, string>;
  stages: string[];
  garden: string;
  board: string;
  bell: { label: string; text: string };
  marketName: string;
  marketWhen: string;
}

export const COMMUNITIES: Record<CommunityKind, Community> = {
  class: {
    kind: "class",
    levels: ["עיר", "בית ספר", "קניון", "רחוב", "דוכן"],
    place: "בית ספר הדקל",
    otherPlace: "בית ספר הגפן",
    emptyPlace: "מקום פנוי לבית ספר נוסף",
    sign: "בית ספר הדקל",
    lots: { h1: "ה׳1", h2: "ה׳2", h3: "ה׳3", v1: "ו׳1", v2: "ו׳2", v3: "ו׳3" },
    rows: ["שכבת ה׳", "שכבת ו׳"],
    mallOf: (lot) => `הקניון של ${lot}`,
    mall: "קניון",
    unit: "הכיתה",
    unitWord: "כיתה",
    outsiders: "מי שלא אושר לבית הספר לא רואה כלום.",
    seenBy: "ילדים והורים מבית הספר",
    namesBy: "רק הכיתה",
    neighbor: "חברה או חבר מהכיתה",
    hint0: "נוגעים בבית הספר כדי להתקרב",
    hint1: "נוגעים בכיתה כדי להיכנס לקניון שלה",
    locked: {
      2: "הקניון של הכיתה ייפתח כשיהיו בו 3 דוכנים. אפשר להזמין חברים למקומות הפנויים.",
      1: "בית הספר ייפתח כשתהיה עוד כיתה עם דוכנים.",
      0: "העיר תיפתח כשיהיה בה עוד בית ספר עם דוכנים.",
    },
    stages: ["דוכן אחד", "3 דוכנים בכיתה", "8 דוכנים בכיתה", "11 דוכנים בכיתה", "עוד כיתות בבית הספר", "עוד בית ספר בעיר"],
    garden: "הגינה של הכיתה",
    board: "לוח המודעות של הכיתה",
    bell: { label: "הפעמון של בית הספר", text: "צלצול! ההפסקה הגדולה התחילה, והקניונים של הכיתות נפתחים." },
    marketName: "יריד כיתתי",
    marketWhen: "יום שישי, בהפסקה הגדולה",
  },
  hood: {
    kind: "hood",
    levels: ["עיר", "שכונה", "שוק", "רחוב", "דוכן"],
    place: "שכונת הדקלים",
    otherPlace: "שכונת הגפן",
    emptyPlace: "מקום פנוי לשכונה נוספת",
    sign: "מרכז קהילתי",
    lots: { h1: "כיכר הרימון", h2: "כיכר התמר", h3: "כיכר הזית", v1: "כיכר התאנה", v2: "כיכר החרוב", v3: "כיכר השקד" },
    rows: ["", ""],
    mallOf: (lot) => `השוק של ${lot}`,
    mall: "שוק",
    unit: "הכיכר",
    unitWord: "כיכר",
    outsiders: "מי שלא אושר לשכונה לא רואה כלום.",
    seenBy: "משפחות מהשכונה",
    namesBy: "רק הכיכר",
    neighbor: "שכנה או שכן מהכיכר",
    hint0: "נוגעים בשכונה כדי להתקרב",
    hint1: "נוגעים בכיכר כדי להיכנס לשוק שלה",
    locked: {
      2: "השוק של הכיכר ייפתח כשיהיו בו 3 דוכנים. אפשר להזמין שכנים למקומות הפנויים.",
      1: "השכונה תיפתח כשתהיה עוד כיכר עם דוכנים.",
      0: "העיר תיפתח כשתהיה בה עוד שכונה עם דוכנים.",
    },
    stages: ["דוכן אחד", "3 דוכנים בכיכר", "8 דוכנים בכיכר", "11 דוכנים בכיכר", "עוד כיכרות בשכונה", "עוד שכונה בעיר"],
    garden: "הגינה של הכיכר",
    board: "לוח המודעות של הכיכר",
    bell: { label: "הפעמון של המרכז הקהילתי", text: "צלצול! השווקים של הכיכרות נפתחים." },
    marketName: "יום שוק שכונתי",
    marketWhen: "יום שישי בבוקר",
  },
};

/** דוכן בעולם: רוחב 100 יחידות, מצויר במרחב 240×176 של KupaStall */
export const STALL = { w: 100, h: (100 * 176) / 240, ground: (100 * 150) / 240 };
export const PITCH = 116;

/** גובה המצלמה: 0 הכי רחוק, 4 הכי קרוב */
export type Level = 0 | 1 | 2 | 3 | 4;
export const LV = { city: 0, school: 1, mall: 2, street: 3, stall: 4 } as const;
export const LEVEL_NAMES = ["city", "school", "mall", "street", "stall"] as const;
export const LEVEL_LABELS = ["עיר", "בית ספר", "קניון", "רחוב", "דוכן"] as const;

/**
 * שלבי צמיחה. רמה נפתחת רק כשיש בה מה לראות:
 * דוכן אחד רואה רחוב קטן; שלושה דוכנים פותחים את הקניון של הכיתה; כיתה
 * נוספת פותחת את בית הספר; בית ספר נוסף פותח את העיר.
 */
export interface Stage {
  label: string;
  size: ClassSize;
  /** הרמה הכי רחוקה שפתוחה */
  far: Level;
}
export const STAGES: Stage[] = [
  { label: "דוכן אחד", size: 1, far: 3 },
  { label: "3 דוכנים בכיתה", size: 3, far: 2 },
  { label: "8 דוכנים בכיתה", size: 8, far: 2 },
  { label: "11 דוכנים בכיתה", size: 11, far: 2 },
  { label: "עוד כיתות בבית הספר", size: 11, far: 1 },
  { label: "עוד בית ספר בעיר", size: 11, far: 0 },
];
export const LOCKED_REASON: Record<number, string> = {
  2: "הקניון של הכיתה ייפתח כשיהיו בו 3 דוכנים. אפשר להזמין חברים למקומות הפנויים.",
  1: "בית הספר ייפתח כשתהיה עוד כיתה עם דוכנים.",
  0: "העיר תיפתח כשיהיה בה עוד בית ספר עם דוכנים.",
};

/**
 * גודל המבנה בעולם. נקבע לפי "נקודות" שמקבלים על שיתוף, על הזמנת חברים ועל
 * בניית הדוכן, ולא לפי מכירות: כמה מכרה ילדה נשאר בינה לבין ההורים שלה.
 * הנקודות עצמן נראות רק לבעלת הדוכן. כל השאר רואים רק את המבנה.
 */
export type Tier = 1 | 2 | 3 | 4;
export const TIERS: { at: number; name: string }[] = [
  { at: 0, name: "דוכן" },
  { at: 100, name: "דוכן מואר" },
  { at: 250, name: "חנות" },
  { at: 500, name: "חנות גדולה" },
];
export const tierOf = (points: number): Tier => TIERS.reduce<number>((t, x, i) => (points >= x.at ? i + 1 : t), 1) as Tier;
/**
 * על מה מקבלים נקודות. על תוצאה ולא על שליחה: הודעה שנשלחה אי אפשר לספור, ולא
 * רוצים לתגמל הצפה. ותיקות ומוצרים נספרים לפי המצב (כמה שבועות, כמה מוצרים
 * יש עכשיו), ולכן מחיקה והוספה מחדש לא מוסיפות כלום.
 */
export type PointKey = "week" | "product" | "visit" | "join_visit" | "join_store" | "market";
export const POINT_SOURCES: { key: PointKey; label: string; points: number; cap?: string; max?: number }[] = [
  { key: "week", label: "שבוע שהדוכן פעיל", points: 10 },
  { key: "product", label: "מוצר עם תמונה בדוכן", points: 10, cap: "עד 10 מוצרים", max: 10 },
  { key: "visit", label: "מישהו נכנס לדוכן מהקישור שלכם", points: 5, cap: "עד 30 ביום" },
  { key: "join_visit", label: "משפחה הצטרפה לקניון בהזמנתכם", points: 20 },
  { key: "join_store", label: "נפתח דוכן בהזמנתכם", points: 60 },
  { key: "market", label: "השתתפות ביום שוק", points: 30 },
];
/** הדוכן שלי בתחילת ההדמיה: שלושה שבועות ושלושה מוצרים */
export const MY_START_COUNTS: Record<PointKey, number> = { week: 3, product: 3, visit: 0, join_visit: 0, join_store: 0, market: 0 };
export const pointsOf = (counts: Record<PointKey, number>) => POINT_SOURCES.reduce((sum, x) => sum + (counts[x.key] ?? 0) * x.points, 0);

/** שעת השקיעה בקירוב לכל חודש בישראל. מהשעה הזאת ועד שש בבוקר העולם בלילה. */
const SUNSET = [17, 17.5, 18, 19, 19.5, 20, 20, 19.5, 18.75, 17.75, 16.75, 16.75];
export const isNightAt = (d: Date) => {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 6 || h >= SUNSET[d.getMonth()];
};

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
  /** השם הפרטי של בעל/ת הדוכן. מוצג רק בתוך הקניון של הכיתה, לא בדף החנות. */
  owner?: string;
  /** דוכן שנפתח זה עתה דרך הזמנה */
  fresh?: boolean;
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
  /** גודל המבנה בעולם (ראה TIERS). בלי ערך: דוכן רגיל. */
  tier?: Tier;
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
    id: "noa", mine: true, name: "הסקווישים של נוני", short: "נוני", sign: "סקווישי נוני", owner: "נועה", tagline: "סקווישים, סליים וכדורים קופצים",
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
    id: "maya", tier: 3, name: "הציורים של מאיה", short: "מאיה", sign: "ציורי מאיה", owner: "מאיה", tagline: "ציורים קטנים וספלים מצוירים",
    theme: "candy", awning: "#A65330", emblem: "sun",
    products: [
      { art: "painting", name: "ציור נוף", price: 20 },
      { art: "mug", name: "ספל מצויר", price: 25 },
      { art: "painting", name: "ציור שקיעה", price: 20 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "itai", tier: 1, name: "המכוניות של איתי", short: "איתי", sign: "מכוניות איתי", owner: "איתי", tagline: "מכוניות קטנות וכדורים",
    theme: "slush", awning: "#2563A8", emblem: "star",
    products: [
      { art: "car", name: "מכונית ירוקה", price: 10 },
      { art: "ball", name: "כדור פסים", price: 6 },
      { art: "car", name: "מכונית מירוץ", price: 14 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
  {
    id: "beads", tier: 2, name: "חרוזים וחברים", short: "חרוזים", sign: "חרוזים וחברים", owner: "שירה", tagline: "שרשראות וצמידים בעבודת יד",
    theme: "mint", awning: "#23785A", emblem: "gem",
    products: [
      { art: "necklace", name: "שרשרת חרוזים", price: 16 },
      { art: "bracelets", name: "שלישיית צמידים", price: 12 },
      { art: "necklace", name: "שרשרת קיץ", price: 18 },
    ],
    deco: { flowers: true, openSign: true, cat: false },
  },
  {
    id: "teddy", tier: 1, name: "דובי ושות׳", short: "דובי", sign: "דובי ושות׳", owner: "עומר", tagline: "בובות רכות שמחפשות בית",
    theme: "minimal", awning: "#8D6236", emblem: "leaf",
    products: [
      { art: "teddy", name: "דובי חום", price: 22 },
      { art: "squishy", name: "סקוויש ארנב", price: 12 },
      { art: "teddy", name: "דובי קטן", price: 18 },
    ],
    deco: { flowers: false, openSign: false, cat: true },
  },
  {
    id: "slime", tier: 4, name: "סליים סטודיו", short: "סליים", sign: "סליים סטודיו", owner: "ליה", tagline: "סליים בכל הצבעים",
    theme: "pastel", awning: "#577157", emblem: "drop",
    products: [
      { art: "slime", name: "סליים ירוק", price: 14 },
      { art: "slime", name: "סליים ענן", price: 16 },
      { art: "mug", name: "כוס ערבוב", price: 9 },
    ],
    deco: { flowers: true, openSign: false, cat: false },
  },
  {
    id: "mugs", tier: 2, name: "ספלים מצוירים", short: "ספלים", sign: "ספלים מצוירים", owner: "דניאל", tagline: "ספל לכל בוקר",
    theme: "lemon", awning: "#E3B93A", emblem: "flower",
    products: [
      { art: "mug", name: "ספל לב", price: 24 },
      { art: "painting", name: "תחתית מצוירת", price: 10 },
      { art: "mug", name: "ספל פסים", price: 24 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "balls", tier: 1, name: "הכדורים של יובל", short: "יובל", sign: "כדורי יובל", owner: "יובל", tagline: "כדורים קופצים ומכוניות",
    theme: "melon", awning: "#C9403A", emblem: "moon",
    products: [
      { art: "ball", name: "כדור ענק", price: 9 },
      { art: "car", name: "מכונית כיס", price: 8 },
      { art: "ball", name: "כדור זוהר", price: 11 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
  {
    id: "rainbow", tier: 3, name: "צמידי קשת", short: "קשת", sign: "צמידי קשת", owner: "רוני", tagline: "צמידים בצבעי הקשת",
    theme: "bubble", awning: "#C23B6E", emblem: "heart",
    products: [
      { art: "bracelets", name: "צמידי קשת", price: 12 },
      { art: "necklace", name: "שרשרת לב", price: 16 },
      { art: "bracelets", name: "צמיד חברות", price: 7 },
    ],
    deco: { flowers: true, openSign: false, cat: false },
  },
  {
    id: "tamar", tier: 2, name: "פינת היצירה של תמר", short: "תמר", sign: "היצירה של תמר", owner: "תמר", tagline: "ציורים, צמידים והפתעות",
    theme: "cloud", awning: "#716E43", emblem: "leaf",
    products: [
      { art: "painting", name: "ציור פרחים", price: 18 },
      { art: "bracelets", name: "צמיד חוטים", price: 8 },
      { art: "squishy", name: "סקוויש הפתעה", price: 10 },
    ],
    deco: { flowers: false, openSign: true, cat: false },
  },
  {
    id: "stars", tier: 1, name: "כוכבים קטנים", short: "כוכבים", sign: "כוכבים קטנים", owner: "אלה", tagline: "דברים קטנים שעושים שמח",
    theme: "night", awning: "#7B63A8", emblem: "star",
    products: [
      { art: "squishy", name: "סקוויש כוכב", price: 12 },
      { art: "ball", name: "כדור לילה", price: 9 },
      { art: "necklace", name: "שרשרת כוכבים", price: 17 },
    ],
    deco: { flowers: false, openSign: false, cat: false },
  },
];

export type ClassSize = 1 | 3 | 8 | 11;

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

/**
 * הדוכנים של המתחמים האחרים. מי שמבקר במתחם שאינו שלו רואה את הדוכן ואת
 * המוצרים, אבל לא שמות פרטיים, ולכן לדוכנים האלה אין כאן בעלים בכלל.
 */
type Row = [id: string, name: string, sign: string, tagline: string, theme: ThemeKey, awning: string, emblem: Emblem, tier: Tier, arts: [ArtName, string, number][]];
const mk = ([id, name, sign, tagline, theme, awning, emblem, tier, arts]: Row): LabStore => ({
  id, name, sign, tagline, theme, awning, emblem, tier, short: name.split(" ")[0],
  products: arts.map(([art, n, price]) => ({ art, name: n, price })),
  deco: { flowers: tier >= 2, openSign: tier >= 3, cat: false },
});
export const LOT_STORES: Record<string, LabStore[]> = {
  h1: ([
    ["h1a", "סטודיו חימר", "סטודיו חימר", "ספלים וציורים בעבודת יד", "candy", "#A65330", "sun", 2, [["mug", "ספל מנוקד", 22], ["painting", "ציור קטן", 14], ["mug", "ספל פסים", 22]]],
    ["h1b", "גלגלים", "גלגלים", "מכוניות וכדורים", "slush", "#2563A8", "star", 1, [["car", "מכונית מרוץ", 9], ["ball", "כדור קופץ", 5], ["car", "ג׳יפ קטן", 11]]],
    ["h1c", "צמידי חברות", "צמידי חברות", "צמידים ושרשראות", "bubble", "#C23B6E", "flower", 3, [["bracelets", "צמיד חוטים", 8], ["necklace", "שרשרת חרוזים", 16], ["bracelets", "צמיד כפול", 12]]],
    ["h1d", "פינת הדובים", "פינת הדובים", "בובות רכות", "lemon", "#E3B93A", "moon", 1, [["teddy", "דובי חום", 18], ["squishy", "סקוויש ענן", 10], ["teddy", "דובי לבן", 18]]],
    ["h1e", "סליים וצבע", "סליים וצבע", "סליים בכל הצבעים", "mint", "#23785A", "drop", 2, [["slime", "סליים ירוק", 12], ["slime", "סליים נצנצים", 15], ["painting", "ציור מופשט", 14]]],
  ] as Row[]).map(mk),
  v1: ([
    ["v1a", "הגלריה הקטנה", "הגלריה הקטנה", "ציורים על קנבס קטן", "pastel", "#8858A2", "leaf", 3, [["painting", "נוף ים", 20], ["painting", "חתול ישן", 18], ["mug", "ספל מצויר", 24]]],
    ["v1b", "כדורים ועוד", "כדורים ועוד", "כדורים קופצים ומכוניות", "melon", "#C9403A", "sun", 1, [["ball", "כדור זוהר", 7], ["car", "מכונית כיס", 8], ["ball", "כדור ענק", 9]]],
    ["v1c", "תכשיטי ים", "תכשיטי ים", "שרשראות עם צדפים", "slush", "#2563A8", "gem", 4, [["necklace", "שרשרת צדף", 20], ["bracelets", "צמיד גלים", 10], ["necklace", "שרשרת כוכב", 18]]],
    ["v1d", "רך ונעים", "רך ונעים", "בובות וסקווישים", "bubble", "#C23B6E", "heart", 2, [["teddy", "ארנב רך", 20], ["squishy", "סקוויש תות", 11], ["squishy", "סקוויש אבוקדו", 11]]],
    ["v1e", "מעבדת הסליים", "מעבדת הסליים", "סליים שמכינים בבית", "mint", "#23785A", "drop", 1, [["slime", "סליים שקוף", 13], ["slime", "סליים קצף", 13], ["ball", "כדור לחיץ", 6]]],
    ["v1f", "ספל טוב", "ספל טוב", "ספל לכל בוקר", "lemon", "#E3B93A", "star", 2, [["mug", "ספל שמש", 22], ["mug", "ספל לב", 22], ["painting", "תחתית מצוירת", 9]]],
  ] as Row[]).map(mk),
  v3: ([
    ["v3a", "קופסת ההפתעות", "קופסת הפתעות", "דברים קטנים ושמחים", "candy", "#A65330", "star", 1, [["squishy", "סקוויש הפתעה", 9], ["ball", "כדור קופץ", 5], ["car", "מכונית קטנה", 8]]],
    ["v3b", "חרוז וחוט", "חרוז וחוט", "צמידים בהזמנה", "berry", "#8858A2", "gem", 2, [["bracelets", "צמיד שם", 14], ["necklace", "שרשרת חוט", 12], ["bracelets", "צמיד קשת", 10]]],
    ["v3c", "צבעי מים", "צבעי מים", "ציורים וספלים", "slush", "#2563A8", "drop", 1, [["painting", "ציור פרחים", 15], ["mug", "ספל כחול", 22], ["painting", "ציור ים", 15]]],
  ] as Row[]).map(mk),
};
/** באיזה גודל מסדרים מתחם אחר, לפי מספר הדוכנים שבו */
export const lotSize = (n: number): ClassSize => (n <= 3 ? 3 : n <= 8 ? 8 : 11);

/** מי מהדוכנים בכיתה שלי נרשם ליום השוק */
export const MARKET_IN = ["maya", "beads", "slime", "mugs", "rainbow", "tamar"];

/** סדר החנויות הבדויות: שמונה לרחוב הסוככים, ושלוש לסמטה */
const FICTION = ["maya", "itai", "beads", "noa", "teddy", "slime", "mugs", "balls", "rainbow", "tamar", "stars"];

/**
 * מי עומד איפה, לפי גודל הכיתה.
 *   1  — הדוכן שלי לבד, ומשני הצדדים מקום פנוי להזמין אליו חברים.
 *   3  — פינה: שלושה דוכנים צמודים, ומשני הצדדים מקום פנוי. שאר הרחוב גינה.
 *   8  — הרחוב מלא, עם מקום פנוי אחד באמצע. הסמטה נפתחה וריקה.
 *   11 — גם בסמטה יש שלושה דוכנים.
 * מקום פנוי הוא מקום פנוי: לא ממלאים אותו בדוכן שלא קיים.
 *
 * list — החנויות להציב, לפי הסדר. בלי הערך הזה: החנויות הבדויות.
 * אם יש פחות חנויות ממקומות, הראשון שנשאר ריק הוא "מקום פנוי" והשאר גינה.
 */
export function layout(size: ClassSize, list?: LabStore[]): Plot[] {
  const pool = list ?? (size === 1 ? ["noa"] : size === 3 ? ["maya", "noa", "itai"] : FICTION).map(byId);
  type Slot = number | "empty" | "garden";
  const a: Slot[] =
    size === 1 ? ["garden", "garden", "garden", "empty", 0, "empty", "garden", "garden", "garden"]
    : size === 3 ? ["garden", "garden", "empty", 0, 1, 2, "empty", "garden", "garden"]
    : [0, 1, 2, 3, "empty", 4, 5, 6, 7];
  const b: Slot[] = size <= 3 ? ["garden", "garden", "garden", "garden", "garden"] : size === 8 ? ["garden", "empty", "empty", "empty", "garden"] : ["empty", 8, 9, 10, "empty"];
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
  { id: "fountain", x: MALL.x + 550, y: MALL.y + 660, r: 74, from: 3, to: 4, label: "המזרקה", text: "זרקתם מטבע למזרקה וביקשתם משאלה." },
  { id: "board", x: MALL.x + 232, y: MALL.y + 548, r: 46, from: 3, to: 4, label: "לוח המודעות", text: "לוח המודעות של הכיתה. כאן מספרים מה חדש בקניון." },
  { id: "hopscotch", x: MALL.x + 842, y: MALL.y + 790, r: 52, from: 3, to: 4, label: "קלאס", text: "קלאס! אחת, שתיים, שלוש, קפיצה." },
  { id: "garden", x: MALL.x + 205, y: MALL.y + 795, r: 80, from: 3, to: 4, label: "הגינה של הכיתה", text: "השקיתם את הגינה. פרח חדש לכל דוכן שנפתח בכיתה." },
  { id: "cat", x: MALL.x + 610, y: MALL.y + 900, r: 30, from: 3, to: 4, label: "החתול של הקניון", text: "מיאו. החתול של הקניון אוהב לנמנם ליד המזרקה." },
  { id: "bell", x: CAMPUS.x + CAMPUS.w / 2, y: CAMPUS.y + 420, r: 330, from: 1, to: 1, label: "הפעמון של בית הספר", text: "צלצול! ההפסקה הגדולה התחילה, והקניונים של הכיתות נפתחים." },
  { id: "ducks", ...cityPt(300, 1500), r: 150 * CITY_K, from: 0, to: 0, label: "הברווזים בפארק", text: "גע גע. באגם של הפארק גרים שלושה ברווזים." },
  { id: "tower", ...cityPt(300, 150), r: 110 * CITY_K, from: 0, to: 0, label: "מגדל המים", text: "מגדל מים. פעם כך הגיעו המים לכל הבתים בעיר." },
  { id: "boat", ...cityPt(1700, 4110), r: 120 * CITY_K, from: 0, to: 0, label: "סירת המפרש", text: "הים התיכון. בהמשך יהיה אפשר להתרחק עוד, עד למפת ישראל." },
];

export const NOTICES = [
  "יריד כיתתי ביום שישי, בהפסקה הגדולה.",
  "סמטת הפנסים מחפשת דוכנים חדשים.",
  "תודה לכל מי שהשקה את הגינה השבוע.",
];
