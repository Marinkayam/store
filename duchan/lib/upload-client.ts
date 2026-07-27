"use client";

// העלאה ל-R2 דרך presigned URL מ-/api/upload. השרת מאמת בעלות ומכסה.

/**
 * סוג הקובץ כפי שהשרת מצפה לראות אותו.
 *
 * שתי מלכודות אמיתיות מהטלפון:
 * 1. סרטון מגלריית אייפון הוא video/quicktime ולא video/mp4. המכל הוא
 *    QuickTime אבל הווידאו בפנים הוא H.264 — בדיוק מה ש-mp4 מכיל — ולכן
 *    הוא מנוגן בכל מקום. בלי ההמרה כאן, כל סרטון מהגלריה נדחה.
 * 2. MediaRecorder מחזיר לפעמים 'video/mp4;codecs=avc1.42E01E', והשוואה
 *    לרשימה סגורה נכשלת על הזנב.
 */
function normalizeType(raw: string): string {
  const base = (raw || "").split(";")[0].trim().toLowerCase();
  if (base === "video/quicktime" || base === "video/x-m4v" || base === "video/3gpp") return "video/mp4";
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

export async function uploadBlob(
  kind: "image" | "video" | "poster" | "cover" | "avatar",
  blob: Blob,
  storeId?: string
): Promise<{ key: string } | { error: string }> {
  const contentType = normalizeType(blob.type) || "application/octet-stream";
  // הכתובת נחתמת עם סוג הקובץ, ולכן ה-PUT חייב לשלוח בדיוק את אותו סוג.
  // עוטפים מחדש רק כשבאמת שינינו משהו.
  const body = contentType === blob.type ? blob : new Blob([blob], { type: contentType });

  let data: { url?: string; key?: string; error?: string };
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, contentType, bytes: body.size, storeId }),
    });
    data = await res.json();
    if (!res.ok) return { error: data.error ?? "ההעלאה נכשלה" };
  } catch {
    return { error: "אין חיבור לאינטרנט, לנסות שוב" };
  }
  if (!data.url || !data.key) return { error: "ההעלאה נכשלה, לנסות שוב" };

  // כישלון CORS לא מחזיר תשובה עם סטטוס — הוא *זורק*. בלי ה-try הזה ההבטחה
  // נדחית בשקט, הילדה לא רואה כלום, וזה נראה כאילו הכפתור לא עובד.
  try {
    const put = await fetch(data.url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!put.ok) return { error: `ההעלאה נכשלה (${put.status}), לנסות שוב` };
  } catch {
    return { error: "ההעלאה נחסמה. אם זה חוזר, זו הגדרת האחסון, תגידי למרינה." };
  }
  return { key: data.key };
}
