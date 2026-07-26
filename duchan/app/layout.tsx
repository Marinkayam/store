import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // בלי metadataBase, Next בונה תגיות OpenGraph עם נתיבים יחסיים
  // וואטסאפ לא יודע לפתור אותם — התצוגה המקדימה יוצאת בלי תמונה.
  metadataBase: new URL(SITE_URL),
  title: "דוכן",
  description: "חנות קטנה שאת מקימה בעצמך",
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
        {/*
          Fraunces לכותרות ו-Inter לטקסט רץ, לפי הדיזיין סיסטם. שתיהן בלי
          תמיכה בעברית, ולכן Heebo נשארת אחריהן בשרשרת ה-fallback ומטפלת
          בפועל בכל הטקסט העברי — Fraunces נותנת את האופי ללטיניות ולמספרים.
          שאר הפונטים נשארים כי ערכות חנות שמורות מצביעות אליהן.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&family=Heebo:wght@300;400;500;600;700;800&family=Varela+Round&family=Secular+One&family=Rubik:wght@400;500;700&family=Assistant:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
