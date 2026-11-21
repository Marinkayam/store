import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readFileSync } from "node:fs";
import World from "./world";
import type { LabStore } from "./data";
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

/**
 * סקירה פרטית: אם WORLD_LAB_DATA מצביע על קובץ JSON מקומי של חנויות, העולם
 * מציג אותן במקום החנויות הבדויות. הקובץ לא נמצא בריפו ולא אמור להיכנס אליו;
 * המשתנה מוגדר רק במחשב של מי שמריץ את הסקירה. בלי המשתנה: נתוני הדוגמה.
 */
function reviewStores(): LabStore[] | undefined {
  const path = process.env.WORLD_LAB_DATA;
  if (!path) return undefined;
  try {
    const list = JSON.parse(readFileSync(path, "utf8")) as LabStore[];
    return Array.isArray(list) && list.length ? list : undefined;
  } catch {
    return undefined;
  }
}

export default function WorldLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <World review={reviewStores()} />;
}
