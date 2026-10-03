import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import A11yMenu, { A11Y_BOOT } from "./a11y-menu";
import CookieNote from "./cookie-note";

export const metadata: Metadata = {
  // בלי metadataBase, Next בונה תגיות OpenGraph עם נתיבים יחסיים
  // וואטסאפ לא יודע לפתור אותם — התצוגה המקדימה יוצאת בלי תמונה.
  metadataBase: new URL(SITE_URL),
  title: "דוכן",
  description: "דוכן קטן שפותחים לבד",
  /* דרך metadata ולא <link> ידני: כך מקטע יכול להחליף אותו (סקוויש, חמ"ל)
     במקום ששני manifest-ים יישבו בדף והדפדפן ייקח את הראשון. */
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /* בלי maximumScale: חסימת הגדלה בצביטה היא הפרת נגישות (WCAG 1.4.4).
     היא הייתה שם כדי שאייפון לא יעשה זום לבד כשנכנסים לשדה — את זה
     פותרים בשדות של 16px במסכי מגע (globals.css). */
  /* cover: באייפון בלי זה env(safe-area-inset-bottom) הוא 0, וכפתורים
     שיושבים בתחתית המסך נדחסים מתחת לפס הבית ("הכפתור לא נראה טוב").
     שורת הסטטוס למעלה לא מושפעת — status-bar-style הוא default. */
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Heebo לכל האתר — כותרות ותצוגה במשקל 800/700, גוף בטקסט ב-400/500. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* אייפון מתעלם מ-manifest ומ-SVG כשמוסיפים למסך הבית. בלי
            apple-touch-icon הוא שם צילום מסך מוקטן של הדף במקום אייקון,
            ובלי apple-mobile-web-app-capable הוא פותח בספארי עם הכתובת
            למעלה במקום כאפליקציה. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="דוכן" />
        {/* הגדרות הנגישות השמורות — לפני הציור הראשון, בלי קפיצה */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} />
      </head>
      <body>
        {/* דילוג לתוכן — לניווט במקלדת. מוסתר עד שמגיעים אליו בטאב */}
        <a href="#main" className="skip-link">דילוג לתוכן</a>
        <CookieNote />
        <div id="main" tabIndex={-1} className="outline-none">
          {children}
        </div>
        <A11yMenu />
        {/* Vercel Web Analytics — אותו אירוח, בלי עוגייה ובלי סקריפט
            מדומיין זר. האירועים נשלחים דרך lib/squish-analytics.ts, שמסנן
            כל מה שאינו ברשימה לבנה. */}
        <Analytics />
      </body>
    </html>
  );
}
