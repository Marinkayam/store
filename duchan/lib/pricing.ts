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
 * המחיר שגובים בפועל.
 *
 * מחושב פעם אחת בטעינת המודול ולא בכל קריאה: כך אותו מספר מוצג במסך,
 * נכנס להודעה להורה ונרשם בחמ"ל, ואין מצב שהמחיר משתנה באמצע התהליך.
 */
export const ACTIVATION_PRICE = launchActive() ? LAUNCH_PRICE : FULL_PRICE;
export const IS_LAUNCH = ACTIVATION_PRICE < FULL_PRICE;

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
 * שמדבר על הילד/ה בגוף שלישי ("היא/הוא בוחר/ת סגנון") קורא כאילו מישהו מדבר מעליהם.
 * את החלק שמופנה להורה מפרידים במפורש, ורק שם עוברים לגוף שלישי.
 */
export const GETS = [
  {
    icon: "🏪",
    title: "חנות אמיתית",
    body: "עם שם, עיצוב וכתובת משלך. לא משחק, דוכן שאפשר לשלוח לחברים ולסבתא.",
  },
  {
    icon: "🔗",
    title: "לינק פרטי משלך",
    body: "קישור קצר ששולחים למי שרוצים. לא מופיע בגוגל, ואי אפשר להגיע אליו בלעדיו.",
  },
  {
    icon: "📸",
    title: "20 מוצרים עם תמונות",
    body: "מצלמים מהטלפון והתמונה מסתדרת לבד. אפשר גם סרטון קצר לכל מוצר.",
  },
  {
    icon: "🎨",
    title: "שישה עיצובים",
    body: "בוחרים סגנון והחנות משתנה מיד על המסך. אפשר להחליף מתי שרוצים.",
  },
  {
    icon: "🛒",
    title: "סל והזמנות",
    body: "קונים בוחרים מוצרים ולוחצים, ונפתח וואטסאפ עם ההזמנה כבר כתובה.",
  },
  {
    icon: "📦",
    title: "מלאי",
    body: 'כמה יש מכל דבר ומה נגמר. יורד לבד כשמסמנים "שולם".',
  },
  {
    icon: "💰",
    title: "הקופה שלי",
    body: "ההכנסות, כמה הזמנות היו, ומה הכי נמכר.",
  },
  {
    icon: "✨",
    title: "עוזרת כתיבה",
    body: "מצלמים מוצר ומקבלים הצעה לתיאור, ועורכים איך שרוצים, זה הטקסט שלכם.",
  },
  {
    icon: "♾️",
    title: "לתמיד",
    body: "תשלום אחד. בלי מנוי חודשי, בלי עמלה על מכירות, בלי הפתעות.",
  },
];

/** מה ההורה קונה באמת. זה מה שמצדיק את המחיר בשיחה בבית. */
export const LEARNS = [
  { skill: "תמחור", what: "כמה לבקש כדי שגם ימכר וגם ישתלם" },
  { skill: "ניהול מלאי", what: "מה יש, מה נגמר, מתי להזמין עוד" },
  { skill: "שיווק", what: "שאף אחד לא קונה ממה שהוא לא ראה" },
  { skill: "שירות לקוחות", what: "לענות, לעמוד במילה, לסגור מסירה" },
  { skill: "חשבון של כסף אמיתי", what: "הכנסה, רווח, כמה נשאר בפועל" },
  { skill: "התמדה", what: "שהמכירה השנייה קשה יותר מהראשונה" },
];

/** ההחזר — הטיעון החזק ביותר, ולכן הוא מחושב ולא כתוב ביד. */
export const PAYBACK = [
  { what: "סקווישים", unit: 15 },
  { what: "צמידים", unit: 30 },
  { what: "חולצות שקטנו", unit: 40 },
].map((r) => {
  const qty = Math.ceil(ACTIVATION_PRICE / r.unit);
  return { ...r, qty, total: qty * r.unit };
});
