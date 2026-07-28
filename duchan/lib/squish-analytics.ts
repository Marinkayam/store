import { track as vercelTrack } from "@vercel/analytics";

/**
 * אנליטיקס לסקוויש קלאב.
 *
 * **למה Vercel Web Analytics ולא ספק חדש:** האתר כבר מתארח בוורסל, אז
 * אין ספק נוסף, אין סקריפט מדומיין זר, ואין עוגייה. זה גם אומר שאין
 * מזהה משתמש קבוע — מה שמתאים בדיוק למוצר של ילדות.
 *
 * ═══ מה אף פעם לא יוצא מכאן ═══
 *
 * לא מספרי טלפון · לא טקסט שילדה כתבה (שם סקווישי, תיאור, הערה) · לא
 * כתובות מדיה · לא מזהי משתמש או פריט מלאים · לא כינויים · לא עיר.
 *
 * זה לא נשען על משמעת של מי שקורא: `clean()` מוחק כל מפתח שאינו ברשימה
 * הלבנה, וחותך כל מזהה לשמונה תווים ראשונים — מספיק כדי להצליב שני
 * אירועים באותו טרייד, לא מספיק כדי לזהות מישהי.
 */

export type SquishEvent =
  /* ── המשפך ── */
  | "squish_collection_created"
  | "squish_collection_activated"
  | "squish_invite_created"
  | "squish_friend_joined"
  | "squish_discover_viewed"
  | "squish_trade_started"
  | "squish_trade_offer_selected"
  | "squish_trade_sent"
  | "squish_trade_viewed"
  | "squish_trade_countered"
  | "squish_trade_approved"
  | "squish_trade_reserved"
  | "squish_whatsapp_opened"
  | "squish_trade_completed"
  /* ── יציאות ── */
  | "squish_trade_cancelled"
  | "squish_trade_reported"
  | "squish_item_reported"
  | "squish_user_blocked"
  | "squish_connection_removed"
  | "squish_profile_deleted"
  | "squish_feedback_given";

/** רק המפתחות האלה עוברים. כל השאר נזרק בשקט. */
const ALLOWED = new Set([
  "id", "step", "reason", "choice", "moment", "count", "items", "types", "role", "source",
]);

/** מזהה נחתך: מספיק להצליב אירועים, לא מספיק לזהות. */
const shorten = (v: string | number) =>
  typeof v === "string" && /^[0-9a-f-]{20,}$/i.test(v) ? v.slice(0, 8) : v;

function clean(props: Record<string, string | number>) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED.has(k)) continue;
    const val = shorten(v);
    // מחרוזת ארוכה היא כמעט תמיד טקסט חופשי, וזה בדיוק מה שאסור לשלוח
    if (typeof val === "string" && val.length > 24) continue;
    out[k] = val;
  }
  return out;
}

export function track(event: SquishEvent, props: Record<string, string | number> = {}) {
  const safe = clean(props);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[squish:event]", event, safe);
    return;
  }
  try {
    vercelTrack(event, safe);
  } catch {
    // אנליטיקס שנכשל לא שובר מסך של ילדה
  }
}
