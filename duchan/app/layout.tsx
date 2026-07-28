import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // בלי metadataBase, Next בונה תגיות OpenGraph עם נתיבים יחסיים
  // וואטסאפ לא יודע לפתור אותם — התצוגה המקדימה יוצאת בלי תמונה.
  metadataBase: new URL(SITE_URL),
  title: "דוכן",
  description: "דוכן קטן שפותחים לבד",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
        <link rel="manifest" href="/manifest.json" />
        {/* אייפון מתעלם מ-manifest ומ-SVG כשמוסיפים למסך הבית. בלי
            apple-touch-icon הוא שם צילום מסך מוקטן של הדף במקום אייקון,
            ובלי apple-mobile-web-app-capable הוא פותח בספארי עם הכתובת
            למעלה במקום כאפליקציה. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="דוכן" />
      </head>
      <body>
        {children}
        {/* Vercel Web Analytics — אותו אירוח, בלי עוגייה ובלי סקריפט
            מדומיין זר. האירועים נשלחים דרך lib/squish-analytics.ts, שמסנן
            כל מה שאינו ברשימה לבנה. */}
        <Analytics />
      </body>
    </html>
  );
}
