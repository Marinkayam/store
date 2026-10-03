// הלינק הקצר לדוכן: duchan.app/qkubk במקום duchan.app/s/qkubk.
//
// בטיקטוק לינק לחיץ בביו מותר רק מגיל 18 (ו-1,000 עוקבים או חשבון עסקי),
// אז אצל הילדים הלינק נכתב על הסרטון והקונים מקלידים אותו. כל תו פחות עוזר.
// app/[code]/page.tsx מפנה את הכתובת הקצרה ל-/s/{slug}.
//
// slug הוא 5 תווים מ-lib/slug.ts (בלי i, l, o). שמות של עמודים ברמה העליונה
// באורך 5 שאפשר להרכיב מהאלפבית הזה — שם הלינק הקצר היה נבלע בעמוד; לדוכנים
// כאלה נשארים עם /s/.
export const SHORT_RESERVED = new Set(["terms", "enter"]);
export const SHORT_CODE = /^[a-hj-km-np-z2-9]{5}$/;

export function storePath(slug: string): string {
  return SHORT_CODE.test(slug) && !SHORT_RESERVED.has(slug) ? `/${slug}` : `/s/${slug}`;
}

/** "duchan.app/qkubk" — בלי https://, ככה כותבים אותו על סרטון */
export function shortStoreLink(host: string, slug: string): string {
  return `${host}${storePath(slug)}`;
}
