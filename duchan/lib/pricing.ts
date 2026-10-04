/**
 * מודל התשלום של דוכן: תשלום אחד, בהפעלה.
 * בונים בחינם, משלמים רק כשרוצים לפרסם ולשתף את הלינק.
 *
 * אנחנו לא סולקים כסף ולא שומרים פרטי אשראי: התשלום עובר בביט/פייבוקס
 * ישירות למנהלת, והיא מאשרת את החנות ידנית. זו החלטה מכוונת —
 * סליקה מקטינים בילדים היא עולם רגולטורי שלם, וכאן אין בו צורך.
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/** המחיר המלא. זה מה שיהיה אחרי ההשקה. */
export const FULL_PRICE = num(process.env.NEXT_PUBLIC_ACTIVATION_PRICE, 200);

/**
 * מחיר השקה, עם תאריך סיום.
 *
 * התאריך הוא מקור אמת אחד: המחיר, השורה שמופיעה על המסכים והחישוב של
 * ההחזר כולם נגזרים ממנו. כשהוא עובר, הכל חוזר למחיר המלא לבד — בלי
 * שאף אחד יצטרך לזכור לשנות משהו, ובלי מבצע שנשאר תלוי באוויר חודשיים.
 *
 * השוואה בזמן שרת ובזמן לקוח יכולה ליפול על אזור זמן; לכן הגבול הוא סוף
 * היום בישראל, מפורש.
 */
export const LAUNCH_PRICE = num(process.env.NEXT_PUBLIC_LAUNCH_PRICE, 50);
export const LAUNCH_UNTIL = new Date(
  process.env.NEXT_PUBLIC_LAUNCH_UNTIL ?? "2026-07-30T20:59:59Z"
);

export function launchActive(now: Date = new Date()): boolean {
  return LAUNCH_PRICE < FULL_PRICE && now.getTime() <= LAUNCH_UNTIL.getTime();
}

/** "30.7.2026" — לתצוגה */
export const LAUNCH_UNTIL_LABEL = LAUNCH_UNTIL.toLocaleDateString("he-IL", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

/**
 * מבצע חד-פעמי — החלטת מרינה, 3.10.2026: "רק ₪20 לפתוח חנות".
 *
 * קבוע בקוד ולא במשתנה סביבה בכוונה: משתנה ב-Vercel שנשכח מהשקה קודמת
 * לא יכול לדרוס אותו בשקט. בלי תאריך סיום — המבצע נגמר כשמחליטים, וזה
 * שינוי של שורה אחת: PROMO_PRICE = 0 מחזיר הכל למחיר הרגיל.
 */
export const PROMO_PRICE: number = 20;
export const PROMO_ACTIVE = PROMO_PRICE > 0 && PROMO_PRICE < FULL_PRICE;

/**
 * המחיר שגובים בפועל.
 *
 * מחושב פעם אחת בטעינת המודול ולא בכל קריאה: כך אותו מספר מוצג במסך,
 * נכנס להודעה להורה ונרשם בחמ"ל, ואין מצב שהמחיר משתנה באמצע התהליך.
 */
export const ACTIVATION_PRICE = PROMO_ACTIVE ? PROMO_PRICE : launchActive() ? LAUNCH_PRICE : FULL_PRICE;
export const IS_LAUNCH = ACTIVATION_PRICE < FULL_PRICE;

/**
 * שם ההנחה, לכל המסכים: "מבצע חד-פעמי" או "מחיר השקה · עד 30.7.2026".
 * מקום אחד, כדי שלא יהיה מסך שעוד כתוב בו מחיר השקה שנגמר.
 */
export const DEAL_LABEL = PROMO_ACTIVE ? "מבצע חד-פעמי" : `מחיר השקה · עד ${LAUNCH_UNTIL_LABEL}`;

/** לינק תשלום אישי. ריק = מציגים את המספר לביט ידני. */
export const PAY_BIT_URL = process.env.NEXT_PUBLIC_PAY_BIT_URL ?? "";
/**
 * קבוצת התשלום בפייבוקס. השימוש בפייבוקס חינם, ולכן זו הדרך המומלצת —
 * נכנסים לקבוצה "הקמת דוכן" ומשלמים שם.
 */
export const PAY_PAYBOX_URL =
  process.env.NEXT_PUBLIC_PAY_PAYBOX_URL ?? "https://links.payboxapp.com/4dGOrULw84b";
/**
 * המספר שאליו שולחים ביט, ושבו פותחים וואטסאפ עם המנהלת. E.164 בלי +.
 * ברירת המחדל היא מספר המכירות, כדי שמסך התשלום לא יישאר בלי דרך לשלם
 * כשמשתנה הסביבה לא מוגדר.
 */
export const OWNER_WHATSAPP =
  process.env.NEXT_PUBLIC_OWNER_WHATSAPP ?? process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "972545888471";

export const PAYMENT_METHODS = ["bit", "paybox", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<string, string> = {
  bit: "ביט",
  paybox: "פייבוקס",
  other: "אחר",
  gift: "מתנה",
};

/**
 * מה נכלל במחיר. מקור אמת יחיד — גם לדף המחיר וגם למסך ההפעלה.
 *
 * הכל בגוף שני, אלייך. שני המסכים האלה מוצגים לילדה עצמה, ולכן טקסט
 * שמדבר על הילד/ה בגוף שלישי קורא כאילו מישהו מדבר מעליהם.
 *
 * מרינה: "שיהיה שם את כל הדברים המגניבים שעשינו". מחולק לארבע קבוצות,
 * עם אייקונים מהשפה של הדוכן (app/icons.tsx) ולא אימוג'ים. כל שורה כאן
 * היא משהו שקיים באפליקציה עכשיו — לא הבטחה.
 */
export type Get = { icon: import("@/app/icons").IconName; title: string; body: string };
export const GET_GROUPS: { key: string; title: string; tone: string; items: Get[] }[] = [
  {
    key: "stall",
    title: "הדוכן שלך",
    tone: "var(--lavender)",
    items: [
      { icon: "stall", title: "דוכן אמיתי עם לינק פרטי", body: "שם, תמונה ועיצוב משלך. לא מופיע בגוגל, מגיעים אליו רק עם הלינק." },
      { icon: "palette", title: "עיצובים, רקעים וסגנונות", body: "בוחרים צבעים, רקע וסגנון, והדוכן משתנה מיד. אפשר להחליף מתי שרוצים." },
      { icon: "camera", title: "מוצרים עם תמונה וסרטון", body: "מצלמים מהטלפון והתמונה מסתדרת לבד. אפשר גם סרטון קצר לכל מוצר." },
      { icon: "sparkle", title: "עוזרת כתיבה", body: "מצלמים מוצר ומקבלים הצעה לתיאור. עורכים איך שרוצים, זה הטקסט שלך." },
      { icon: "box", title: "קטגוריות ומלאי", body: "מסדרים מוצרים לפי סוג, ורואים מה נשאר. כשמשהו נגמר הוא מסומן \"אזל\" לבד." },
    ],
  },
  {
    key: "sell",
    title: "למכור כמו עסק",
    tone: "#E3C26F",
    items: [
      { icon: "basket", title: "סל והזמנות בוואטסאפ", body: "קונים בוחרים ולוחצים, ונפתח וואטסאפ עם ההזמנה כבר כתובה." },
      { icon: "coins", title: "תשלום בביט או בפייבוקס", body: "הקונים משלמים ישירות אלייך. אנחנו לא נוגעים בכסף ולא לוקחים עמלה." },
      { icon: "gift", title: "קופונים והנחות", body: "קוד הנחה לחברים, מבצע לחג. רואים כמה פעמים השתמשו בו." },
      { icon: "hourglass", title: "דרופים", body: "מוצר חדש שנפתח בשעה שבוחרים. כולם מחכים, ואז: עכשיו!" },
      { icon: "bag", title: "שקית הפתעה", body: "מוכרים משהו בלי לגלות מה בפנים. הקונים אוהבים הפתעות." },
    ],
  },
  {
    key: "fun",
    title: "קופת הדוכן: כיף ולומדים",
    tone: "var(--olive)",
    items: [
      { icon: "coin", title: "מטבעות, אותות ורמות", body: "כל צעד בדוכן שווה מטבעות, והדוכן גדל: מעגלה קטנה ועד כוכב השוק." },
      { icon: "star", title: "חידות כסף שלא לומדים בבית ספר", body: "מעל 100 חידות על מחיר, הנחה, רווח וצרכנות. כוכב על כל תשובה נכונה." },
      { icon: "check", title: "משימות שבועיות", body: "משימה חדשה כל שבוע, וכרטיסייה שמתמלאת על כל שבוע פעיל." },
      { icon: "plant", title: "חנות קישוטים", body: "קונים במטבעות פרחים, שלט \"פתוח\", סוכך זהב וחתול של הדוכן." },
      { icon: "moon", title: "יום ולילה", body: "בלילה הדוכן נדלק: ירח, כוכבים ונורות." },
    ],
  },
  {
    key: "together",
    title: "ביחד עם חברים",
    tone: "var(--blush)",
    items: [
      { icon: "heart", title: "דוכן משותף", body: "פותחים דוכן עם חברים: אחד מנהל, והשותפים עוזרים." },
      { icon: "megaphone", title: "הודעות מוכנות לשיתוף", body: "טקסטים לסטטוס ולסטורי ורעיונות לסרטון בטיקטוק. מעתיקים ומפרסמים." },
      { icon: "phone", title: "אפליקציה במסך הבית", body: "מוסיפים את הדוכן למסך הבית של הטלפון, ונכנסים בלחיצה." },
      { icon: "infinity", title: "לתמיד", body: "תשלום אחד. בלי מנוי חודשי, בלי עמלה על מכירות, בלי הפתעות." },
    ],
  },
];
/** רשימה שטוחה — למסך ההפעלה, שמראה רק את הראשונים */
export const GETS: Get[] = GET_GROUPS.flatMap((g) => g.items);

/** מה ההורה קונה באמת. זה מה שמצדיק את המחיר בשיחה בבית. */
export const LEARNS = [
  { skill: "תמחור", what: "כמה לבקש כדי שגם יימכר וגם ישתלם" },
  { skill: "ניהול מלאי", what: "מה יש, מה נגמר, מתי להזמין עוד" },
  { skill: "שיווק", what: "שאף אחד לא קונה משהו שהוא לא ראה" },
  { skill: "שירות לקוחות", what: "לענות, לעמוד במילה, לסגור מסירה" },
  { skill: "חשבון של כסף אמיתי", what: "הכנסה, רווח, כמה נשאר בפועל" },
  { skill: "התמדה", what: "שהמכירה השנייה קשה יותר מהראשונה" },
];

/**
 * ההחזר — הטיעון החזק ביותר, ולכן הוא מחושב ולא כתוב ביד.
 * המחשבון בדף המחיר מתחיל מהדוגמאות האלה (מרינה: "תוריד את חולצות שקטנו").
 */
export const PAYBACK_EXAMPLES = [
  { what: "סקוויש", icon: "heart", unit: 15 },
  { what: "צמיד", icon: "gem", unit: 12 },
  { what: "ציור", icon: "palette", unit: 25 },
] as const;
