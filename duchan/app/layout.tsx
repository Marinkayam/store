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
        {/* Heebo לכל האתר — כותרות ותצוגה במשקל 800/700, גוף בטקסט ב-400/500. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
