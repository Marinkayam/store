import type { Metadata } from "next";
import { notFound } from "next/navigation";
import World from "./world";
import "./world.css";

/**
 * עולם דוכן — דף ניסוי.
 *
 * אב־טיפוס חזותי בלבד: נתוני דוגמה שכתובים בקוד (data.ts), בלי קריאה למסד,
 * בלי כניסה לחשבון, ובלי שום קשר לחנויות האמיתיות.
 *
 * הדף לא קיים באתר החי. ב-Vercel, VERCEL_ENV הוא "production" רק בדיפלוי של
 * האתר עצמו, ושם הדף מחזיר 404. הוא נפתח רק בסביבת תצוגה (preview) ובמחשב
 * של מי שמפתח. גם אם הענף הזה יתמזג בטעות, הדף לא ייחשף.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "עולם דוכן · ניסוי",
  robots: { index: false, follow: false },
};

export default function WorldLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <World />;
}
