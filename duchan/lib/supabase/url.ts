/**
 * הכתובת של סופרבייס — מתוקנת אם הודבק בה משהו אחר.
 *
 * למה הקובץ הזה קיים בכלל: משתנה סביבה אחד שהודבק לא נכון בוורסל הפיל את
 * כל שליחת הסמסים, והשגיאה שהגיעה למסך ("משהו השתבש") לא רמזה על כך במילה.
 * הטעויות הסבירות כאן חוזרות על עצמן — סלאש בסוף, כתובת הדשבורד במקום
 * ה-Project URL, או סתם הדומיין של האתר — וכולן ניתנות לזיהוי ולתיקון בקוד.
 *
 * מקור האמת האחרון הוא המפתח עצמו: מפתחות סופרבייס הקלאסיים הם JWT שבתוכו
 * `ref` — מזהה הפרויקט. אם הכתובת שבורה אבל המפתח תקין, אפשר לבנות את
 * הכתובת הנכונה מהמפתח, וזה עדיף על אתר מת שמחכה שמישהו יתקן שדה בדשבורד.
 *
 * זו לא סיבה להשאיר את המשתנה שגוי — /api/sms-status אומר בדיוק מה מצבו —
 * אבל היא הסיבה שהאתר עובד בינתיים.
 */

/** מזהה פרויקט מתוך JWT של סופרבייס (anon או service role). */
function refFromKey(key?: string): string | null {
  const payload = (key ?? "").trim().split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    const ref = typeof json?.ref === "string" ? json.ref : null;
    return ref && /^[a-z0-9]{16,}$/i.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

/** אותו דבר בדפדפן, שבו אין Buffer. */
function refFromKeyBrowser(key?: string): string | null {
  const payload = (key ?? "").trim().split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const ref = typeof json?.ref === "string" ? json.ref : null;
    return ref && /^[a-z0-9]{16,}$/i.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

const decodeRef = typeof window === "undefined" ? refFromKey : refFromKeyBrowser;

/** האם זו כתובת שאפשר לדבר איתה */
function usable(url: string): boolean {
  return (
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) ||
    // הסטאק המקומי לבדיקות מצביע לשים ולא לסופרבייס
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)
  );
}

export interface ResolvedUrl {
  url: string;
  /** env = כפי שהוגדר · key = שוחזר מהמפתח · path = חולץ מכתובת דשבורד */
  source: "env" | "path" | "key" | "missing";
}

export function resolveSupabaseUrl(): ResolvedUrl {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");

  if (usable(raw)) return { url: raw, source: "env" };

  // הודבקה כתובת הדשבורד: supabase.com/dashboard/project/<ref>
  const inPath = raw.match(/\/project\/([a-z0-9]{16,})/i)?.[1];
  if (inPath) return { url: `https://${inPath}.supabase.co`, source: "path" };

  // נשארו המפתחות. service role קודם — הוא קיים רק בשרת ואינו נחשף.
  const ref =
    decodeRef(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    decodeRef(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (ref) return { url: `https://${ref}.supabase.co`, source: "key" };

  return { url: raw, source: "missing" };
}

let warned = false;

/** הכתובת לשימוש בפועל. */
export function supabaseUrl(): string {
  const { url, source } = resolveSupabaseUrl();
  if (source !== "env" && !warned && typeof window === "undefined") {
    warned = true;
    console.warn(
      `[supabase] NEXT_PUBLIC_SUPABASE_URL אינו תקין; משתמשים בכתובת שנגזרה (${source}). ` +
        `לתיקון: Project Settings → Data API → Project URL.`
    );
  }
  return url;
}
