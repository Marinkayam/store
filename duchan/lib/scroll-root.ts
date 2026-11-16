/**
 * אזור הגלילה של מסכי הניהול.
 *
 * מאז 11.2026 הדשבורד הוא "מעטפת אפליקציה": גובה המסך קבוע, התוכן נגלל
 * בתוך אזור משלו (data-scroll-root ב-app/dashboard/layout.tsx), והתפריט
 * התחתון יושב מתחתיו בזרימה רגילה. הדף עצמו לא נגלל, ולכן window.scrollY
 * תמיד 0 שם. מי שצריך לגלול או לדעת איפה הגלילה עומדת עובר דרך כאן, וזה
 * עובד גם בדפים שעדיין נגללים כרגיל (הדוכן הפומבי, דף הבית).
 */
export const scrollRoot = (): HTMLElement | null =>
  typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-scroll-root]");

/** כמה גללנו, בדף או באזור הגלילה של הדשבורד */
export function scrollTopNow(): number {
  return Math.max(window.scrollY, scrollRoot()?.scrollTop ?? 0);
}

export function scrollToTop(): void {
  scrollRoot()?.scrollTo(0, 0);
  window.scrollTo(0, 0);
}

export function scrollByY(dy: number): void {
  const r = scrollRoot();
  if (r) r.scrollBy(0, dy);
  else window.scrollBy(0, dy);
}
