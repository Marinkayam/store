import "server-only";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * יומן כניסות — כל שלב בכניסה בסמס או בקישור נרשם כשורה (0063), והחמ"ל
 * מסדר אותן לציר זמן ולמשפט אחד.
 *
 * מרינה, 10.2026: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין
 * קשה לי לתת להם מענה כי אין לי פלואו רציף."
 *
 * **הרישום לעולם לא שובר כניסה.** מי שמנסה להיכנס לא צריכה לשלם על זה
 * שהיומן נפל: כל תקלה (טבלה שעוד לא קיימת בפרודקשן, רשת) נבלעת, ורק שורת
 * לוג אחת. בלי הטבלה הכניסה עובדת בדיוק כמו קודם — רק שהחמ"ל לא רואה ציר.
 */

export type LoginKind =
  // בקשת קוד
  | "phone_invalid"   // המספר שהוקלד לא תקין
  | "sms_off"         // שליחת הקודים לא מוגדרת
  | "resend_wait"     // ביקשה שוב לפני שעברה דקה
  | "day_limit"       // הגיעה למכסה היומית
  | "code_requested"  // נוצר קוד
  | "sms_sent"        // הספק קיבל והחזיר הצלחה
  | "sms_failed"      // הספק דחה (detail = הסיבה)
  | "help_clicked"    // לחצה "לא קיבלתי קוד"
  // הקלדת הקוד
  | "verify_format"   // לא שש ספרות
  | "verify_none"     // אין קוד פעיל למספר
  | "verify_expired"  // הקוד פג
  | "verify_wrong"    // קוד שגוי
  | "verify_locked"   // יותר מדי ניסיונות
  | "verify_ok"       // נכנסה
  | "session_failed"  // הקוד נכון אבל הסשן לא נפתח
  // קישור כניסה מהחמ"ל
  | "link_minted"
  | "link_used"
  | "link_failed";

/** תווית גסה של הדפדפן — בלי User-Agent גולמי. מספיק כדי לזהות דפדפן של אפליקציה. */
export function clientLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  // דפדפנים בתוך אפליקציות קודם: הם נושאים גם את שם הדפדפן הרגיל
  if (/WhatsApp/i.test(ua)) return "וואטסאפ";
  if (/Instagram/i.test(ua)) return "אינסטגרם";
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return "טיקטוק";
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return "פייסבוק";
  if (/SamsungBrowser/i.test(ua)) return "דפדפן סמסונג";
  if (/iPhone|iPad|iPod/i.test(ua)) return /CriOS/i.test(ua) ? "כרום באייפון" : "ספארי באייפון";
  if (/Android/i.test(ua)) return /Chrome/i.test(ua) ? "כרום באנדרואיד" : "אנדרואיד";
  if (/Macintosh|Windows|Linux|X11/i.test(ua)) return "מחשב";
  return "אחר";
}

/** דפדפנים שבתוך אפליקציות: ידועים בחסימת עוגיות ובאיבוד הסשן אחרי הקוד */
export const IN_APP_CLIENTS = ["וואטסאפ", "אינסטגרם", "טיקטוק", "פייסבוק"];

export function ipHashOf(req: Request): string | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? createHash("sha256").update(`duchan:${ip}`).digest("hex").slice(0, 32) : null;
}

type Ev = { phone: string; kind: LoginKind; detail?: string | null };

/**
 * רושמת שלב. לא זורקת, לא מחזירה כלום, ומחכים לה — בדיקות וחמ"ל צריכים
 * לראות את השורה מיד, והעלות היא כתיבה אחת.
 */
export async function logLoginEvent(req: Request, ev: Ev): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("login_events")
      .insert({
        phone: ev.phone,
        kind: ev.kind,
        detail: ev.detail ? String(ev.detail).slice(0, 160) : null,
        client: clientLabel(req.headers.get("user-agent")),
        ip_hash: ipHashOf(req),
      });
    if (error) console.error("[login-events] insert:", error.message, error.code ?? "");
  } catch (e) {
    console.error("[login-events] threw:", e instanceof Error ? e.message : e);
  }
}

/* ── לשון החמ"ל ── */

export const KIND_LABEL: Record<LoginKind, string> = {
  phone_invalid: "הקלידה מספר לא תקין",
  sms_off: "שליחת הקודים כבויה",
  resend_wait: "ביקשה קוד שוב לפני שעברה דקה",
  day_limit: "הגיעה למכסת הקודים היומית",
  code_requested: "ביקשה קוד",
  sms_sent: "הסמס נשלח לספק",
  sms_failed: "הספק דחה את הסמס",
  help_clicked: 'לחצה "לא קיבלתי קוד"',
  verify_format: "הקלידה קוד שאינו שש ספרות",
  verify_none: "הקלידה קוד, אבל אין קוד פעיל למספר",
  verify_expired: "הקלידה קוד שפג תוקפו",
  verify_wrong: "הקלידה קוד שגוי",
  verify_locked: "נחסמה אחרי יותר מדי קודים שגויים",
  verify_ok: "הקוד נכון, נכנסה",
  session_failed: "הקוד נכון, אבל הכניסה לא נפתחה",
  link_minted: "נוצר לה קישור כניסה",
  link_used: "נכנסה בקישור",
  link_failed: "הקישור לא עבד",
};

/** חומרה לצבע בציר: טוב / רע / ניטרלי */
export const KIND_TONE: Record<LoginKind, "ok" | "bad" | "neutral"> = {
  phone_invalid: "bad", sms_off: "bad", resend_wait: "neutral", day_limit: "bad",
  code_requested: "neutral", sms_sent: "neutral", sms_failed: "bad", help_clicked: "bad",
  verify_format: "bad", verify_none: "bad", verify_expired: "bad", verify_wrong: "bad",
  verify_locked: "bad", verify_ok: "ok", session_failed: "bad",
  link_minted: "neutral", link_used: "ok", link_failed: "bad",
};

export type EventRow = { at: string; kind: LoginKind; detail: string | null; client: string | null };

export type Diagnosis = {
  /** משפט אחד: מה קרה */
  headline: string;
  /** למה זה כנראה קרה / מה לבדוק */
  hint: string;
  /** מה כדאי לעשות עכשיו */
  action: "link" | "wait" | "none";
  /** "ok" — נכנסה והכל תקין; "bad" — צריכה עזרה */
  state: "ok" | "bad";
};

const MIN = 60_000;

/**
 * מה קרה למספר הזה — מתוך האירועים שלו (חדש→ישן או להפך, אין חשיבות).
 *
 * הפרק הנוכחי הוא כל מה שאחרי הכניסה המוצלחת האחרונה. הכלל הראשון שמתאים
 * מנצח, ולכן הסדר כאן הוא הסדר של "מה הכי סביר שחוסם אותה":
 *   1. נכנסה ומיד ביקשה קוד שוב — הסשן לא נשמר
 *   2. הקוד נכון והכניסה נכשלה — תקלה אצלנו
 *   3. הסמס לא יצא — תקלה בספק
 *   4. יותר מדי קודים שגויים / קוד שפג
 *   5. מספר לא תקין / מכסה
 *   6. הסמס יצא ולא הוקלד שום קוד — כנראה לא הגיע
 */
export function diagnose(rows: EventRow[], now = Date.now()): Diagnosis {
  const evs = [...rows].sort((a, b) => a.at.localeCompare(b.at));
  if (!evs.length) {
    return { headline: "אין עדיין שום ניסיון כניסה למספר הזה", hint: "אם היא אומרת שניסתה, כנראה הקלידה מספר אחר — לחפש גם בלי הספרה הראשונה.", action: "none", state: "ok" };
  }

  const isOk = (e: EventRow) => e.kind === "verify_ok" || e.kind === "link_used";
  let lastOkIdx = -1;
  evs.forEach((e, i) => { if (isOk(e)) lastOkIdx = i; });
  const after = lastOkIdx >= 0 ? evs.slice(lastOkIdx + 1) : evs;
  const okAt = lastOkIdx >= 0 ? new Date(evs[lastOkIdx].at).getTime() : 0;

  const inApp = evs.map((e) => e.client).find((c) => c && IN_APP_CLIENTS.includes(c));
  const appHint = inApp ? ` היא ניסתה מתוך הדפדפן של ${inApp} — לבקש ממנה לפתוח את הכתובת ב-Safari או ב-Chrome.` : "";

  const has = (k: LoginKind) => after.filter((e) => e.kind === k);
  const requests = has("code_requested");

  // 1. נכנסה, ואז שוב מבקשת קוד תוך חצי שעה: הכניסה "הצליחה" ולא נשמרה
  if (lastOkIdx >= 0 && requests.length && new Date(requests[0].at).getTime() - okAt < 30 * MIN) {
    return {
      headline: "הקוד היה נכון, אבל היא חזרה למסך הכניסה ובקשה קוד שוב",
      hint: `הכניסה נרשמה אצלנו והסשן לא נשמר אצלה — בדרך כלל דפדפן שחוסם עוגיות.${appHint || " לבקש ממנה לנסות בדפדפן רגיל (Safari / Chrome), לא מתוך אפליקציה."}`,
      action: "link", state: "bad",
    };
  }
  if (lastOkIdx >= 0 && !after.length) {
    return { headline: "נכנסה בהצלחה", hint: "אין מה לעשות.", action: "none", state: "ok" };
  }

  // 2. קוד נכון, כניסה שנכשלה
  const sf = has("session_failed");
  if (sf.length) {
    return {
      headline: "היא הקלידה קוד נכון, אבל הכניסה נכשלה אצלנו",
      hint: `תקלה בצד שלנו (${sf[sf.length - 1].detail ?? "פתיחת סשן"}). הקוד לא נשרף, אפשר לנסות שוב — ובינתיים קישור כניסה פותר את זה.`,
      action: "link", state: "bad",
    };
  }

  // 3. הסמס לא יצא
  const failedSends = has("sms_failed");
  if (failedSends.length) {
    const why = failedSends[failedSends.length - 1].detail ?? "סיבה לא ידועה";
    const stillSent = after.some((e) => e.kind === "sms_sent" && e.at > failedSends[failedSends.length - 1].at);
    if (!stillSent) {
      return {
        headline: `הסמס לא יצא: ${why}`,
        hint: "הבעיה אצל הספק, לא אצלה. אם זה קורה לכמה מספרים ביחד — לבדוק יתרה וחיבור של sms4free. בינתיים קישור כניסה.",
        action: "link", state: "bad",
      };
    }
  }

  // 4. קודים שגויים, פג תוקף
  if (has("verify_locked").length) {
    return {
      headline: "היא הקלידה קוד שגוי כמה פעמים ונחסמה",
      hint: "כנראה קוד ישן — כשמבקשים שוב, הקוד הקודם עדיין תקף 10 דקות. לבקש ממנה לחכות לסמס האחרון ולהקליד אותו, או לשלוח קישור.",
      action: "link", state: "bad",
    };
  }
  const wrong = has("verify_wrong");
  if (wrong.length) {
    return {
      headline: `היא הקלידה קוד שגוי ${wrong.length === 1 ? "פעם אחת" : `${wrong.length} פעמים`}`,
      hint: "קוד שגוי = הסמס הגיע אליה, אבל מה שהוקלד לא תואם. לבדוק שהיא מקלידה את הקוד מהסמס האחרון (לא ממקום אחר) — או לשלוח קישור.",
      action: "link", state: "bad",
    };
  }
  if (has("verify_expired").length) {
    return {
      headline: "הקוד פג לפני שהיא הקלידה אותו",
      hint: "הקוד תקף 10 דקות. הסמס כנראה הגיע באיחור. לבקש ממנה לבקש קוד חדש ולהקליד מיד, או לשלוח קישור.",
      action: "link", state: "bad",
    };
  }
  if (has("verify_none").length) {
    return {
      headline: "היא הקלידה קוד, אבל לא היה קוד פעיל למספר שלה",
      hint: "אולי הקלידה את הקוד תחת מספר אחר ממה שביקשה אליו, או שהקוד כבר נוצל. לבדוק שהמספר זהה בשני המסכים.",
      action: "link", state: "bad",
    };
  }

  // 5. מספר לא תקין / מכסה
  if (has("day_limit").length) {
    return {
      headline: "היא הגיעה למכסת הקודים היומית",
      hint: "בדרך כלל כי הסמס לא מגיע אליה והיא ממשיכה לנסות. לשלוח קישור כניסה ולבדוק למה הסמס לא מגיע.",
      action: "link", state: "bad",
    };
  }
  if (has("phone_invalid").length && !requests.length) {
    const typed = has("phone_invalid").map((e) => e.detail).filter(Boolean);
    const landline = typed.some((t) => /^(0|972)[2-4789]/.test(t ?? ""));
    return {
      headline: `היא הקלידה מספר לא תקין${typed.length ? `: ${typed[typed.length - 1]}` : ""}`,
      hint: landline
        ? "זה נראה כמו טלפון קווי — סמס לא מגיע אליו. צריך מספר נייד שמתחיל ב-05 (המספר שאליו יגיעו גם ההזמנות בוואטסאפ)."
        : "מספר נייד ישראלי הוא 10 ספרות שמתחילות ב-05 (גם +972 ורווחים בסדר). ספרה חסרה או מספר זר נדחים. לבקש ממנה את המספר ולחפש אותו כאן.",
      action: "none", state: "bad",
    };
  }
  if (has("resend_wait").length && requests.length === 1) {
    return {
      headline: "היא לחצה שוב לפני שעברה דקה",
      hint: "בדרך כלל זה אומר שהסמס מתעכב. לחכות עוד דקה — ואם לא הגיע, לשלוח קישור.",
      action: "wait", state: "bad",
    };
  }

  // 6. הסמס יצא ולא הוקלד שום קוד
  if (requests.length) {
    const last = new Date(requests[requests.length - 1].at).getTime();
    const waiting = now - last < 3 * MIN;
    const help = has("help_clicked").length > 0;
    if (waiting && !help) {
      return { headline: "ביקשה קוד לפני רגע", hint: "עוד לא עברו 3 דקות. לתת לסמס להגיע.", action: "wait", state: "bad" };
    }
    return {
      headline: `הסמס יצא (${requests.length === 1 ? "בקשה אחת" : `${requests.length} בקשות`}), ולא הוקלד שום קוד${help ? ' — ולחצה "לא קיבלתי קוד"' : ""}`,
      hint: `כנראה הסמס לא הגיע: בקרת הורים או סינון של חברת הסלולר, או מספר שגוי אצלה.${appHint} קישור כניסה עוקף את הסמס.`,
      action: "link", state: "bad",
    };
  }

  return { headline: "יש ניסיונות, אבל בלי דפוס ברור", hint: "לעבור על הציר למטה.", action: "none", state: "bad" };
}
