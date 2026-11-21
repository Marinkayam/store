import data from "./localities-data.json";

/**
 * יישובים בישראל — מקור אמת יחיד לעיר של דוכן (מיגרציה 0070).
 *
 * המזהה הוא סמל היישוב של הלמ"ס: מספר יציב שלא משתנה כשהשם משתנה.
 * "עיר" הייתה פעם טקסט חופשי שהוצג בדוכן הציבורי, והצטברו בו כתיבים
 * שונים לאותו מקום, וגם מספר טלפון וקישור שהוקלדו בטעות. עכשיו בוחרים
 * מהרשימה, ובדוכן הציבורי מוצג רק שם שיש לו מזהה.
 *
 * הרשימה עצמה: lib/localities-data.json, זהה לטבלה localities במסד
 * (הבדיקה e2e-city משווה ביניהן). מקור: data.gov.il, "רשימת יישובים".
 */
export type Locality = { id: number; name: string };

const LIST: Locality[] = (data as [number, string][]).map(([id, name]) => ({ id, name }));
const BY_ID = new Map(LIST.map((l) => [l.id, l.name]));

/**
 * מפתח להשוואה: בלי תווי כיווניות נסתרים, בלי מקפים וגרשיים, רווח אחד,
 * ו"קריית" ו"קרית" כאותו דבר. משמש לחיפוש ולזיהוי של טקסט ישן, אף פעם
 * לא לתצוגה.
 */
export function placeKey(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[-־–—_/.,]/g, " ")
    .replace(/["'׳״`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/קריית/g, "קרית");
}

/* שני יישובים עם אותו מפתח (לא קורה היום) — לא מזהים אף אחד מהם */
const BY_KEY = new Map<string, number | null>();
const KEYED = LIST.map((l) => ({ ...l, key: placeKey(l.name) }));
for (const l of KEYED) BY_KEY.set(l.key, BY_KEY.has(l.key) ? null : l.id);

export const isLocalityId = (id: unknown): id is number => typeof id === "number" && BY_ID.has(id);

export function localityName(id: number | null | undefined): string | null {
  return id == null ? null : BY_ID.get(id) ?? null;
}

/**
 * זיהוי ודאי של טקסט חופשי: רק התאמה מלאה לשם רשמי (אחרי ניקוי).
 * "נשר" מזוהה. "נשר חיפה", מספר טלפון או קישור — לא.
 */
export function matchLocality(text: string | null | undefined): number | null {
  if (!text) return null;
  const key = placeKey(text);
  return key ? BY_KEY.get(key) ?? null : null;
}

/**
 * מה מוצג כעיר בדוכן הציבורי. קודם המזהה; ואם עוד אין (דוכן ישן שלא
 * מופה, או מיגרציה שעוד לא רצה) — הטקסט הישן, רק אם הוא שם של יישוב.
 * כל דבר אחר לא מוצג.
 */
export function publicCityName(cityId: number | null | undefined, legacyText: string | null | undefined): string | null {
  return localityName(cityId) ?? localityName(matchLocality(legacyText));
}

/** חיפוש לבוחר העיר: שמות שמתחילים בטקסט קודם, אחר כך שמות שמכילים אותו */
export function searchLocalities(query: string, limit = 8): Locality[] {
  const q = placeKey(query);
  if (!q) return [];
  const starts: Locality[] = [];
  const contains: Locality[] = [];
  for (const l of KEYED) {
    const at = l.key.indexOf(q);
    if (at === 0) starts.push(l);
    else if (at > 0) contains.push(l);
  }
  // שם קצר קודם: "נשר" לפני "נשר…", "חיפה" לפני "טירת כרמל"
  const byLen = (a: Locality, b: Locality) => a.name.length - b.name.length || a.name.localeCompare(b.name, "he");
  return [...starts.sort(byLen), ...contains.sort(byLen)].slice(0, limit).map(({ id, name }) => ({ id, name }));
}
