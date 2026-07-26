"use client";

// העלאה ל-R2 דרך presigned URL מ-/api/upload. השרת מאמת בעלות ומכסה.

export async function uploadBlob(
  kind: "image" | "video" | "poster" | "cover" | "avatar",
  blob: Blob,
  storeId?: string
): Promise<{ key: string } | { error: string }> {
  const contentType = blob.type || "application/octet-stream";

  let data: { url?: string; key?: string; error?: string };
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, contentType, bytes: blob.size, storeId }),
    });
    data = await res.json();
    if (!res.ok) return { error: data.error ?? "ההעלאה נכשלה" };
  } catch {
    return { error: "אין חיבור לאינטרנט — נסי שוב" };
  }
  if (!data.url || !data.key) return { error: "ההעלאה נכשלה — נסי שוב" };

  // כישלון CORS לא מחזיר תשובה עם סטטוס — הוא *זורק*. בלי ה-try הזה ההבטחה
  // נדחית בשקט, הילדה לא רואה כלום, וזה נראה כאילו הכפתור לא עובד.
  try {
    const put = await fetch(data.url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!put.ok) return { error: `ההעלאה נכשלה (${put.status}) — נסי שוב` };
  } catch {
    return { error: "ההעלאה נחסמה. אם זה חוזר — זו הגדרת האחסון, תגידי למרינה." };
  }
  return { key: data.key };
}
