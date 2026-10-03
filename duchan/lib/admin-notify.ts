import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "./supabase/admin";
import { notifyTelegram } from "./telegram";
import { SITE_URL, absolute } from "./site";

/**
 * התראות למנהלת — פוש לטלפון (ולטלגרם, אם הוגדר).
 *
 * "אני צריכה אצלי פוש מי שיצר חנות, או מחכה למשהו, או לא עובד."
 *
 * כללים:
 *   • לעולם לא זורק. התראה שנכשלה היא שורת לוג, לא תקלה בפעולה של ילדה.
 *   • בלי כפילויות: כל התראה נרשמת ב-admin_alerts לפי (kind, ref), ואותו
 *     אירוע לא נשלח פעמיים (ילדה תקועה לא מקפיצה עשר התראות).
 *   • נקרא מתוך after() בנתיבים — התשובה לילדה לא מחכה לשרתי הפוש.
 *
 * מפתחות VAPID: ממשתני הסביבה אם יש (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY),
 * אחרת נוצרים פעם אחת ונשמרים ב-app_secrets (0055) — כדי שהפוש יעבוד בלי
 * שמישהי תצטרך להיכנס לוורסל.
 */

export type AlertKind = "store_created" | "payment_claimed" | "login_stuck" | "sms_failed" | "test";

export type Alert = {
  kind: AlertKind;
  /** מזהה למניעת כפילות — אותו (kind, ref) נשלח פעם אחת בלבד */
  ref: string;
  title: string;
  body?: string;
  /** לאן לחיצה על ההתראה פותחת. ברירת מחדל: החמ"ל */
  url?: string;
};

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

async function vapidKeys(): Promise<Keys | null> {
  if (cached) return cached;
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return (cached = { publicKey: envPub, privateKey: envPriv });

  const db = supabaseAdmin();
  const read = async () => {
    const { data, error } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
    if (error) {
      console.error("[push] app_secrets unavailable:", error.message);
      return null;
    }
    const pub = data?.find((r) => r.key === "vapid_public")?.value;
    const priv = data?.find((r) => r.key === "vapid_private")?.value;
    return pub && priv ? { publicKey: pub, privateKey: priv } : undefined;
  };
  const existing = await read();
  if (existing === null) return null;
  if (existing) return (cached = existing);

  /* פעם ראשונה: יוצרים ושומרים. upsert עם ignoreDuplicates — אם שתי בקשות
     הגיעו יחד, הראשונה זוכה ושתיהן קוראות בסוף את אותו זוג. */
  const k = webpush.generateVAPIDKeys();
  await db.from("app_secrets").upsert(
    [
      { key: "vapid_public", value: k.publicKey },
      { key: "vapid_private", value: k.privateKey },
    ],
    { onConflict: "key", ignoreDuplicates: true }
  );
  const after = await read();
  return after ? (cached = after) : null;
}

/** המפתח הציבורי, לדפדפן שנרשם להתראות. null = הפוש לא זמין (טבלה חסרה). */
export async function vapidPublicKey(): Promise<string | null> {
  try {
    return (await vapidKeys())?.publicKey ?? null;
  } catch (e) {
    console.error("[push] vapid keys:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** שליחה לכל המכשירים הפעילים. מחזיר לכמה יצא. */
async function pushAll(a: Alert): Promise<number> {
  const keys = await vapidKeys();
  if (!keys) return 0;
  const db = supabaseAdmin();
  const { data: subs } = await db
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .is("disabled_at", null);
  if (!subs?.length) return 0;

  webpush.setVapidDetails(SITE_URL.startsWith("https://") ? SITE_URL : "https://duchan.app", keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ title: a.title, body: a.body ?? "", url: a.url ?? "/admin", tag: a.kind });

  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        /* web-push מצפין וחותם; השליחה עצמה ב-fetch. כך אותו קוד בדיוק
           עובד מול שרתי הפוש האמיתיים ומול שרת הדמה בבדיקות. */
        const r = webpush.generateRequestDetails(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 12 * 3600, urgency: "high" }
        );
        const res = await fetch(r.endpoint, {
          method: r.method,
          headers: r.headers as Record<string, string>,
          body: r.body as BodyInit,
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          ok++;
          await db.from("admin_push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
        } else if (res.status === 404 || res.status === 410) {
          // הדפדפן ביטל את המנוי (כיבו התראות, מחקו את האפליקציה)
          await db.from("admin_push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("id", s.id);
        } else {
          console.error("[push] send failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
        }
      } catch (e) {
        console.error("[push] send failed:", e instanceof Error ? e.message : e);
      }
    })
  );
  return ok;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * התראה למנהלת. מחזיר כמה מכשירים קיבלו, או duplicate כשהאירוע כבר נשלח.
 */
export async function notifyAdmins(a: Alert): Promise<{ sent: number; duplicate?: boolean }> {
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("admin_alerts").insert({
      kind: a.kind,
      ref: a.ref,
      title: a.title,
      body: a.body ?? null,
      url: a.url ?? "/admin",
    });
    if (error?.code === "23505") return { sent: 0, duplicate: true };
    if (error) console.error("[push] admin_alerts insert:", error.message); // טבלה חסרה? שולחים בכל זאת

    const [sent] = await Promise.all([
      pushAll(a),
      notifyTelegram(
        `${escapeHtml(a.title)}${a.body ? `\n${escapeHtml(a.body)}` : ""}\n${absolute(a.url ?? "/admin")}`
      ),
    ]);
    if (!error) await db.from("admin_alerts").update({ sent_to: sent }).eq("kind", a.kind).eq("ref", a.ref);
    return { sent };
  } catch (e) {
    console.error("[push] notify failed:", e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}
