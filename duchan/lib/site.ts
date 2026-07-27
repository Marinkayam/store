/**
 * הכתובת הפומבית של דוכן.
 *
 * צריך אותה למקומות שבהם URL יחסי לא מספיק:
 *   • metadataBase — כדי ש-Next יבנה כתובות מוחלטות לתגיות OpenGraph
 *   • תצוגה מקדימה בוואטסאפ — הכרטיס נבנה בשרת של וואטסאפ, לא בדפדפן,
 *     ולכן כל URL חייב להיות מלא
 *
 * נקבע ב-NEXT_PUBLIC_SITE_URL. אין כאן דומיין קשיח בכוונה: ברירת מחדל שגויה
 * מייצרת כרטיסי שיתוף שמצביעים לדומיין הלא נכון בלי שאף אחד שם לב.
 * ב-Cloudflare Pages נופלים ל-CF_PAGES_URL, שהוא תמיד הכתובת האמיתית של הדיפלוי.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.CF_PAGES_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

/** כתובת מוחלטת מנתיב יחסי. `absolute("/s/k3m9p")` */
export const absolute = (path: string) =>
  `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * הכתובת שמופיעה בתנאי השימוש ובמדיניות הפרטיות.
 * חייבת להיות תיבה שבאמת נקראת — זו הכתובת שאליה הורה יפנה בבקשת מחיקת נתונים.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@duchan.app";

/**
 * ערוץ יצירת הקשר שמוצג בתנאי השימוש, במדיניות הפרטיות ובהצהרת הנגישות —
 * וואטסאפ ולא מייל, כי זו התיבה שבאמת נבדקת. אותו מספר וברירת מחדל כמו
 * HelpButton, כדי שלא יהיו שני מספרים שונים באתר.
 */
export const CONTACT_WHATSAPP = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "972545888471").replace(/\D/g, "");
export const contactWhatsappUrl = (msg: string) =>
  `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(msg)}`;
