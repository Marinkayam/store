// מכסות — הן שומרות על העלות. תקרות קשיחות מהיום הראשון.

export const QUOTAS = {
  // הוכפל מ-25 לבקשת מרינה (2026-08) — סרטונים מילאו חנויות פעילות.
  // האחסון ב-R2 זול וה-egress חינם, אז ההכפלה לא נוגעת במודל העלות.
  mediaBytesPerStore: 50 * 1024 * 1024, // 50MB
  storesPerParentEmail: 3,
  maxUploadBytes: 25 * 1024 * 1024,
} as const;
