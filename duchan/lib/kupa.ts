import type { IconName } from "@/app/icons";

/**
 * קופת הדוכן — מטבעות, אותות ורמות.
 *
 * שלב 1: הכל מחושב מהנתונים שכבר קיימים (מוצרים, הזמנות, כניסות, פרטי
 * תשלום). אין טבלה ואין מצב לתחזק, ולכן גם אין מה לרמות: אותו קלט נותן
 * תמיד אותן מטבעות. החישוב רץ בשרת (/api/kupa); הדפדפן רק מציג.
 *
 * מה שחשוב כאן הוא הקצב: חמשת האותות הראשונים קלים מאוד ומגיעים בדקות
 * הראשונות (פתיחה, מוצר, תמונה, תשלום, תיאור) — ויחד הם כבר מעלים רמה.
 * מרינה: "בהתחלה ממש ממש פשוט וקל שירגישו הצלחה".
 *
 * מה שלא עושים, בכוונה: אין רצף שנשבר, אין דירוג, אין מטבעות שפגים,
 * ואין קנייה של מטבעות בכסף.
 */

export interface KupaStats {
  products: number;
  productsWithPhoto: number;
  payReady: boolean;
  about: boolean;
  views: number;
  /** הזמנות שלא בוטלו, בלי הזמנות מהטלפון של הצוות עצמו */
  orders: number;
  /** הזמנות ששולמו/נמסרו (בלי הזמנות עצמיות) — תאריך יצירה ב-ISO */
  paid: { at: string; total: number }[];
  /** משימות שהנתונים מראים שבוצעו (סרטון למוצר, קופון…) */
  quests?: Partial<Record<QuestKey, boolean>>;
  /** כמה שבועות שונים היה בהם משהו בדוכן (מוצר, הזמנה, חידה). לא מתאפס. */
  activeWeeks?: number;
  /** סכום מה שנקנה בחנות הקישוטים (0059) */
  spent?: number;
}

/* ── משימות ──
   כל משימה נבדקת מהנתונים — אין "עשיתי" שאפשר ללחוץ בלי לעשות. בכל שבוע
   אחת מהן מוצגת כ"משימת השבוע" (מתחלפת לפי מספר השבוע), ואפשר לדלג. */
export type QuestKey = "video" | "describe" | "category" | "featured" | "coupon" | "promo" | "mystery" | "drop" | "ship";
export const QUEST_COINS = 25;
export const QUESTS: { key: QuestKey; title: string; how: string; href: string; minutes: number; icon: IconName }[] = [
  { key: "video", title: "סרטון של 5 שניות", how: "מצלמים סרטון קצר לאחד המוצרים — רואים איך הוא נראה ביד.", href: "/dashboard/products", minutes: 2, icon: "video" },
  { key: "describe", title: "תיאורים שמוכרים", how: "כותבים תיאור קצר לשלושה מוצרים: ממה הוא עשוי, ולמי הוא מתאים.", href: "/dashboard/products", minutes: 4, icon: "pencil" },
  { key: "category", title: "סדר בדוכן", how: "יוצרים קטגוריה ומכניסים אליה מוצר — ככה קל יותר למצוא מוצרים.", href: "/dashboard/products", minutes: 2, icon: "box" },
  { key: "featured", title: "המומלץ שלי", how: "בוחרים מוצר אחד ומסמנים אותו כמומלץ, שיופיע בראש הדוכן.", href: "/dashboard/products", minutes: 1, icon: "star" },
  { key: "coupon", title: "קופון לחברים", how: "יוצרים קוד הנחה ושולחים אותו לחברים.", href: "/dashboard/settings#coupons", minutes: 3, icon: "gift" },
  { key: "promo", title: "הודעה לקונים", how: "כותבים הודעה קצרה שמופיעה בראש הדוכן, למשל מבצע או מתנה.", href: "/dashboard/settings#promo", minutes: 2, icon: "megaphone" },
  { key: "mystery", title: "שקית הפתעה", how: "מוסיפים מוצר שהוא שקית הפתעה — הקונים לא יודעים מה בפנים.", href: "/dashboard/products?new=1", minutes: 3, icon: "gift" },
  { key: "drop", title: "דרופ", how: "קובעים שמוצר ייפתח להזמנה בשעה מסוימת, ומספרים לחברים מתי.", href: "/dashboard/products", minutes: 3, icon: "hourglass" },
  { key: "ship", title: "גם משלוחים", how: "מגדירים אם שולחים בדואר ובכמה — ככה גם מי שגר רחוק יכול לקנות.", href: "/dashboard/settings#shipping", minutes: 2, icon: "box" },
];

/* ── כרטיסיית ניקובים ──
   ניקוב על כל שבוע שהיה בו משהו בדוכן. 6 ניקובים = כרטיסייה מלאה = 60
   מטבעות, ומתחילים כרטיסייה חדשה. שבוע שמפספסים לא מוחק כלום. */
export const PUNCHES_PER_CARD = 6;
export const CARD_COINS = 60;

/** מספר השבוע (שעון ישראל), רציף מאז 1970 — לסבב משימות ולניקובים */
export function weekIndex(iso: string | Date): number {
  const d = new Date(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) + "T00:00:00Z");
  return Math.floor((d.getTime() / 86400000 + 4) / 7);
}

export type BadgeKey =
  | "open" | "first_product" | "photo" | "pay_ready" | "about"
  | "five_products" | "views10" | "first_order" | "first_sale"
  | "views50" | "hundred" | "ten_sales";

export interface BadgeDef {
  key: BadgeKey;
  title: string;
  icon: IconName;
  coins: number;
  /** מה עושים כדי להשיג — קצר, בגוף רבים */
  how: string;
  /** לאן הכפתור "בואו נעשה את זה" מוביל */
  href?: string;
  /** מה למדנו — מופיע במסך החגיגה ובאלבום */
  lesson: string;
  /** אות ששווה לשתף (מסך חגיגה עם כפתור שיתוף) */
  share?: string;
}

export const BADGES: BadgeDef[] = [
  { key: "open", title: "הדוכן נפתח", icon: "stall", coins: 10, how: "פותחים דוכן",
    lesson: "כל עסק מתחיל ברגע שמחליטים לפתוח אותו. את הצעד הזה כבר עשית.",
    share: "פתחתי דוכן משלי 🎪 בואו לראות 👇" },
  { key: "first_product", title: "המוצר הראשון", icon: "camera", coins: 20, how: "מוסיפים מוצר אחד",
    href: "/dashboard/products?new=1",
    lesson: "מוצר במכירה הוא ההתחלה של כל מכירה. בלי מוצר, אין מה לקנות." },
  { key: "photo", title: "תמונה שמוכרת", icon: "gallery", coins: 10, how: "מוסיפים תמונה למוצר",
    href: "/dashboard/products",
    lesson: "קונים מחליטים בעיניים. תמונה ברורה באור יום מוכרת יותר מכל הסבר." },
  { key: "pay_ready", title: "יודעים איך משלמים לי", icon: "coins", coins: 20, how: "בוחרים איך משלמים לך (ביט, פייבוקס או מזומן)",
    href: "/dashboard/settings#payment",
    lesson: "כשברור איך משלמים, קונים לא מתלבטים ולא נעלמים באמצע." },
  { key: "about", title: "מספרים על הדוכן", icon: "pencil", coins: 10, how: "כותבים משפט על הדוכן",
    href: "/dashboard/settings#design",
    lesson: "אנשים אוהבים לקנות ממי שהם מכירים. משפט אחד עליך עושה את ההבדל." },
  { key: "five_products", title: "חמישה מוצרים", icon: "bag", coins: 30, how: "מגיעים לחמישה מוצרים בדוכן",
    href: "/dashboard/products?new=1",
    lesson: "מבחר גדול יותר = יותר סיכוי שכל מי שנכנס ימצא משהו בשבילו." },
  { key: "views10", title: "10 כניסות", icon: "eye", coins: 15, how: "שולחים את הלינק לחברים ולמשפחה",
    href: "/dashboard/settings#share",
    lesson: "בלי שאנשים רואים את הדוכן, אין מכירות. לשתף זה חצי מהעבודה." },
  { key: "first_order", title: "ההזמנה הראשונה", icon: "receipt", coins: 40, how: "מישהו מזמין דרך הלינק שלך",
    href: "/dashboard/settings#share",
    lesson: "מישהו בחר לקנות ממך. זה סימן שהמוצר והמחיר מתאימים.",
    share: "קיבלתי את ההזמנה הראשונה בדוכן שלי 🎉 בואו לראות מה עוד יש 👇" },
  { key: "first_sale", title: "המכירה הראשונה", icon: "gem", coins: 50, how: "מסמנים הזמנה כ\"שולם\" כשהכסף הגיע",
    href: "/dashboard",
    lesson: "הרווחת כסף אמיתי ממשהו שבחרת למכור. זו יזמות.",
    share: "מכרתי את המוצר הראשון בדוכן שלי 🛍️ בואו לראות 👇" },
  { key: "views50", title: "50 כניסות", icon: "megaphone", coins: 30, how: "ממשיכים לשתף, למשל בסטורי או בקבוצה",
    href: "/dashboard/settings#share",
    lesson: "כל מי שנכנס יכול לספר לעוד מישהו. ככה דוכן קטן נהיה מוכר." },
  { key: "hundred", title: "₪100 במכירות", icon: "star", coins: 50, how: "מגיעים ל-₪100 בהזמנות ששולמו",
    href: "/dashboard",
    lesson: "₪100 זה לא מזל. זה עסק שעובד.",
    share: "הדוכן שלי עבר ₪100 במכירות 💯 בואו לראות 👇" },
  { key: "ten_sales", title: "עשר מכירות", icon: "party", coins: 60, how: "עשר הזמנות ששולמו",
    href: "/dashboard",
    lesson: "עשר מכירות אומרות שזה לא היה חד-פעמי. יש לך לקוחות.",
    share: "עשר מכירות בדוכן שלי 🔟 תודה לכל מי שקנה! בואו לראות 👇" },
];

export const LEVELS = [
  { at: 0, name: "עגלה קטנה" },
  { at: 60, name: "דוכן" },
  { at: 160, name: "דוכן עם סוכך" },
  { at: 350, name: "דוכן עם שלט" },
  { at: 650, name: "דוכן מואר" },
  { at: 1100, name: "כוכב השוק" },
] as const;

/** כל הזמנה ששולמה: 10 מטבעות, עד 3 ביום (שעון ישראל). "שולם" מסמנים לבד,
 *  אז התקרה שומרת שהמשחק יתגמל מכירות ולא לחיצות. */
export const SALE_COINS = 10;
export const SALES_PER_DAY = 3;

export interface BadgeState extends BadgeDef {
  reached: boolean;
  have: number;
  need: number;
}

export interface QuestState {
  key: QuestKey;
  title: string;
  how: string;
  href: string;
  minutes: number;
  icon: IconName;
  done: boolean;
}

export interface Kupa {
  /** כל מה שהורווח אי פעם — קובע את הרמה */
  coins: number;
  /** מה שאפשר להוציא בחנות: coins פחות מה שנקנה */
  balance: number;
  spent: number;
  /** כמה מהמטבעות הגיעו ממכירות (ולא מאותות) */
  saleCoins: number;
  level: number;
  levelName: string;
  /** null ברמה האחרונה */
  next: { name: string; at: number; missing: number; progress: number } | null;
  badges: BadgeState[];
  quests: QuestState[];
  questCoins: number;
  activeWeeks: number;
  /** ניקובים בכרטיסייה הנוכחית (0–5) וכמה כרטיסיות כבר מלאות */
  punches: number;
  cards: number;
}

function israelDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

export function levelOf(coins: number): number {
  let lv = 0;
  LEVELS.forEach((l, i) => {
    if (coins >= l.at) lv = i;
  });
  return lv;
}

export function computeKupa(s: KupaStats): Kupa {
  const revenue = s.paid.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  const progress: Record<BadgeKey, [number, number]> = {
    open: [1, 1],
    first_product: [s.products, 1],
    photo: [s.productsWithPhoto, 1],
    pay_ready: [s.payReady ? 1 : 0, 1],
    about: [s.about ? 1 : 0, 1],
    five_products: [s.products, 5],
    views10: [s.views, 10],
    first_order: [s.orders, 1],
    first_sale: [s.paid.length, 1],
    views50: [s.views, 50],
    hundred: [Math.floor(revenue), 100],
    ten_sales: [s.paid.length, 10],
  };
  const badges = BADGES.map((b) => {
    const [have, need] = progress[b.key];
    return { ...b, have: Math.min(have, need), need, reached: have >= need };
  });

  const perDay = new Map<string, number>();
  for (const p of s.paid) {
    const d = israelDay(p.at);
    perDay.set(d, Math.min(SALES_PER_DAY, (perDay.get(d) ?? 0) + 1));
  }
  const saleCoins = [...perDay.values()].reduce((a, n) => a + n * SALE_COINS, 0);
  const quests = QUESTS.map((q) => ({ ...q, done: !!s.quests?.[q.key] }));
  const questCoins = quests.filter((q) => q.done).length * QUEST_COINS;
  const activeWeeks = Math.max(1, s.activeWeeks ?? 1); // שבוע הפתיחה הוא הניקוב הראשון
  const cards = Math.floor(activeWeeks / PUNCHES_PER_CARD);
  const coins =
    badges.reduce((a, b) => a + (b.reached ? b.coins : 0), 0) + saleCoins + questCoins + cards * CARD_COINS;
  const spent = Math.max(0, s.spent ?? 0);

  const level = levelOf(coins);
  const nl = LEVELS[level + 1];
  const next = nl
    ? {
        name: nl.name,
        at: nl.at,
        missing: nl.at - coins,
        progress: (coins - LEVELS[level].at) / (nl.at - LEVELS[level].at),
      }
    : null;
  return {
    coins,
    balance: Math.max(0, coins - spent),
    spent,
    saleCoins,
    level,
    levelName: LEVELS[level].name,
    next,
    badges,
    quests,
    questCoins,
    activeWeeks,
    punches: activeWeeks % PUNCHES_PER_CARD,
    cards,
  };
}

/** משימת השבוע: מתחילים מהמשימה שהשבוע "שלה", ולוקחים את הראשונה שעוד לא
 *  בוצעה ולא דילגו עליה. null = כל המשימות בוצעו. */
export function weekQuest(k: Kupa, week: number, skipped: string[] = []): QuestState | null {
  const n = k.quests.length;
  for (let i = 0; i < n; i++) {
    const q = k.quests[(week + i) % n];
    if (!q.done && !skipped.includes(q.key)) return q;
  }
  return k.quests.find((q) => !q.done) ?? null;
}

/** האות הבא לעבוד עליו: הראשון ברשימה שעוד לא הושג */
export function nextBadge(k: Kupa): BadgeState | null {
  return k.badges.find((b) => !b.reached) ?? null;
}
