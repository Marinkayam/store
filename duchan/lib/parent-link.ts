import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * הלינק להורה: /parent/{slug}?t={token}.
 *
 * מרינה, 11.2026: "הבעיה שילדים נתקעים עליה זה העברה של הכסף בביט". הילד/ה
 * שולח/ת להורה לינק אחד, ובו כל ההסבר, איך משלמים בביט, וכפתור "שילמתי".
 *
 * הטוקן הוא HMAC של מזהה הדוכן — בלי עמודה חדשה ובלי מיגרציה. הסלאג לבדו
 * ציבורי (הוא הלינק לדוכן), אז בלי הטוקן כל מי שראה דוכן היה יכול לסמן
 * "שילמנו" בשמו. הסוד הוא מפתח השרת, שכבר קיים בכל סביבה.
 */
function secret(): string {
  return process.env.PARENT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function parentToken(storeId: string): string {
  return createHmac("sha256", secret()).update(`parent:${storeId}`).digest("base64url").slice(0, 16);
}

export function checkParentToken(storeId: string, token: string | null | undefined): boolean {
  if (!token || !secret()) return false;
  const want = Buffer.from(parentToken(storeId));
  const got = Buffer.from(String(token));
  return want.length === got.length && timingSafeEqual(want, got);
}

export const parentPath = (slug: string, storeId: string) => `/parent/${slug}?t=${parentToken(storeId)}`;
