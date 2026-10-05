/**
 * "מי מסתכל על הדוכן" (0062) — מה שמשותף לדפדפן ולשרת.
 *
 * מקורות הגעה. וואטסאפ לא שולח "מאיפה הגעת" (אין referrer), ולכן כניסה
 * מוואטסאפ נראית בדיוק כמו מי שהקליד את הלינק. במקום לנחש, שני אלה הם
 * מקור אחד: "וואטסאפ או הקלידו את הלינק". אצל ילדים כמעט כל הכניסות
 * האלה הן מוואטסאפ.
 */
export const SOURCES = ["whatsapp_or_direct", "instagram", "tiktok", "facebook", "google", "stall", "other"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<Source, string> = {
  whatsapp_or_direct: "וואטסאפ או הקלידו את הלינק",
  instagram: "אינסטגרם",
  tiktok: "טיקטוק",
  facebook: "פייסבוק",
  google: "גוגל",
  stall: "מדוכן אחר",
  other: "אתר אחר",
};

export const isSource = (s: unknown): s is Source => typeof s === "string" && (SOURCES as readonly string[]).includes(s);

/** מזהה מקור מתוך מה שהדפדפן יודע. לא שולח את ה-referrer עצמו לשרת — רק את הקטגוריה. */
export function detectSource(ua: string, referrer: string, ownHost: string): Source {
  if (/Instagram/i.test(ua)) return "instagram";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "tiktok";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  if (!host) return "whatsapp_or_direct";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/.test(host)) return "facebook";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)whatsapp\.(com|net)$/.test(host)) return "whatsapp_or_direct";
  if (host === ownHost) return "stall";
  return "other";
}
