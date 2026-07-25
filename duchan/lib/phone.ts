// נרמול טלפון בשמירה, לא בשליחה. אמא תקליד 050-123-4567 — נמיר ל-972501234567.
// זו נקודת הכשל מספר 1 בפלואו הזה.

/** ממיר קלט חופשי למספר E.164 ישראלי ללא +, למשל 972501234567. מחזיר null אם לא תקין. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let d = digits;
  if (d.startsWith("972")) {
    d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
  } else if (d.startsWith("0")) {
    d = d.slice(1);
  }

  // מוביילים ישראליים: 5X-XXXXXXX (9 ספרות אחרי הסרת ה-0). קווי: 2/3/4/8/9 + 7 ספרות.
  if (!/^[2-9]\d{7,8}$/.test(d)) return null;
  if (d.startsWith("5") && d.length !== 9) return null;

  return "972" + d;
}

/** תצוגה ידידותית: 972501234567 → 050-123-4567 */
export function displayPhone(e164: string): string {
  if (!e164.startsWith("972")) return e164;
  const local = "0" + e164.slice(3);
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return local;
}
