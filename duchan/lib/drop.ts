/**
 * דרופ (0056): מוצר שנפתח להזמנה בזמן קבוע.
 *
 * מקור האמת הוא השרת — /api/orders דוחה מוצר שעוד לא נפתח. בדפדפן זה רק
 * תצוגה: ספירה לאחור, וכפתור שנפתח לבד כשהזמן מגיע. שעון הטלפון יכול
 * לטעות בכמה דקות, ולכן הדף מתקן את עצמו לפי שעון השרת (/api/time).
 */
export const DROP_TZ = "Asia/Jerusalem";
/** כמה רחוק אפשר לקבוע דרופ. מעבר לזה זה כבר לא "דרופ" אלא מוצר שמחכה. */
export const DROP_MAX_DAYS = 60;

export function dropTime(dropAt: string | null | undefined): number | null {
  if (!dropAt) return null;
  const t = Date.parse(dropAt);
  return Number.isFinite(t) ? t : null;
}

/** עוד לא נפתח, ביחס לרגע now (מילישניות) */
export function isUpcoming(dropAt: string | null | undefined, now: number): boolean {
  const t = dropTime(dropAt);
  return t !== null && t > now;
}

/** "02:14:33", ומעל יממה "3 ימים ו-04:10:00" */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const clock = `${hh}:${mm}:${ss}`;
  if (d === 0) return clock;
  return `${d === 1 ? "יום" : d === 2 ? "יומיים" : `${d} ימים`} ו-${clock}`;
}

/** "יום חמישי 18:00" — תמיד בשעון ישראל, גם אם הטלפון מכוון אחרת */
export function dropWhen(dropAt: string): string {
  const d = new Date(dropAt);
  const day = d.toLocaleDateString("he-IL", { weekday: "long", timeZone: DROP_TZ });
  const date = d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: DROP_TZ });
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DROP_TZ });
  return `${day} ${date} ב-${time}`;
}

/* ── שדה הזמן בעורך: תמיד שעון ישראל ──
   datetime-local הוא "שעה על הקיר" בלי אזור זמן. אם מפרשים אותו לפי
   הטלפון, טלפון שמכוון לאזור אחר קובע דרופ בשעה אחרת ממה שנכתב. לכן
   "18:00" בשדה = 18:00 בישראל, תמיד, וגם הדוכן מציג שעון ישראל. */

/** כמה דקות ישראל לפני UTC ברגע t (180 בקיץ, 120 בחורף) */
function israelOffsetMs(t: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DROP_TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** "2026-10-08T18:00" (שעון ישראל) → ISO. null אם לא תקין. */
export function israelInputToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - israelOffsetMs(guess);
  // ליד מעבר שעון קיץ/חורף ההפרש משתנה — מתקנים לפי ההפרש ברגע עצמו
  const o2 = israelOffsetMs(t);
  t = guess - o2;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** ISO → מה ששדה datetime-local מצפה לו, בשעון ישראל */
export function toLocalInput(iso: string | null | undefined): string {
  const t = dropTime(iso);
  if (t === null) return "";
  const d = new Date(t + israelOffsetMs(t));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** ברירת המחדל לדרופ חדש: מחר ב-18:00 בישראל */
export function defaultDropInput(now = Date.now()): string {
  const today = toLocalInput(new Date(now).toISOString()).slice(0, 10);
  const [y, mo, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tomorrow.getUTCFullYear()}-${p(tomorrow.getUTCMonth() + 1)}-${p(tomorrow.getUTCDate())}T18:00`;
}

/** בדיקת הזמן שנבחר בעורך. מחזיר הודעה, או null אם תקין. */
export function dropProblem(localInput: string, now = Date.now()): string | null {
  if (!localInput) return "צריך לבחור מתי הדרופ נפתח";
  const iso = israelInputToIso(localInput);
  if (!iso) return "התאריך לא תקין";
  const t = Date.parse(iso);
  if (t <= now + 60_000) return "הזמן הזה כבר עבר. בוחרים זמן בעתיד";
  if (t > now + DROP_MAX_DAYS * 86400_000) return `דרופ אפשר לקבוע עד ${DROP_MAX_DAYS} יום קדימה`;
  return null;
}
