import "server-only";
import type { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * מי "תקועה" לפי phone_otps: לפחות MIN_REQUESTS בקשות קוד מאז הכניסה
 * המוצלחת האחרונה שלה (בקוד או בקישור), ב-WINDOW_HOURS האחרונות — או בקשה
 * אחת עם "לא קיבלתי קוד".
 *
 * מקור אחד לשני המקומות: /api/admin/stuck-logins, ו"צריכות עזרה" בטאב
 * הכניסות (/api/admin/login-flow), שמאחד את זה עם יומן הכניסות (0063).
 * קודם החמ"ל הראה שתי רשימות שונות של אותן ילדות.
 */

export const STUCK_WINDOW_HOURS = 72;
const MIN_REQUESTS = 2;

type Db = ReturnType<typeof supabaseAdmin>;
type Otp = { phone: string; created_at: string; consumed_at: string | null; attempts: number; help_requested_at: string | null };
type Link = { phone: string; created_at: string; used_at: string | null; expires_at: string };

export type Stuck = {
  phone: string;
  requests: number;
  wrongCodes: number;
  firstAt: string;
  lastAt: string;
  /** קישור שכבר נשלח אחרי שנתקעה, ועוד לא נוצל */
  linkSentAt: string | null;
  /** מתי לחצו "לא קיבלתי קוד" */
  helpAt: string | null;
};

export async function findStuck(db: Db): Promise<Stuck[] | null> {
  const since = new Date(Date.now() - STUCK_WINDOW_HOURS * 3600_000).toISOString();
  const { data: otps, error } = await db
    .from("phone_otps")
    .select("phone, created_at, consumed_at, attempts, help_requested_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[stuck-logins] otps:", error.message);
    return null;
  }

  const byPhone = new Map<string, Otp[]>();
  for (const o of (otps ?? []) as Otp[]) {
    const list = byPhone.get(o.phone) ?? [];
    list.push(o);
    byPhone.set(o.phone, list);
  }
  const phones = [...byPhone.keys()];
  if (!phones.length) return [];

  // קישורי כניסה ששלחנו — כניסה בקישור היא גם כניסה מוצלחת
  const { data: links } = await db
    .from("login_links")
    .select("phone, created_at, used_at, expires_at")
    .in("phone", phones)
    .gte("created_at", since);
  const linksBy = new Map<string, Link[]>();
  for (const l of (links ?? []) as Link[]) {
    const list = linksBy.get(l.phone) ?? [];
    list.push(l);
    linksBy.set(l.phone, list);
  }

  const now = Date.now();
  const stuck: Stuck[] = [];
  for (const [phone, rows] of byPhone) {
    const ls = linksBy.get(phone) ?? [];
    const lastIn = Math.max(
      0,
      ...rows.filter((r) => r.consumed_at).map((r) => new Date(r.consumed_at!).getTime()),
      ...ls.filter((l) => l.used_at).map((l) => new Date(l.used_at!).getTime())
    );
    const pending = rows.filter((r) => !r.consumed_at && new Date(r.created_at).getTime() > lastIn);
    // "לא קיבלתי קוד" — מספיקה בקשה אחת, הם כבר אמרו שהם תקועים
    const helpAt = pending.find((r) => r.help_requested_at)?.help_requested_at ?? null;
    if (pending.length < MIN_REQUESTS && !helpAt) continue;

    const firstPending = new Date(pending[pending.length - 1].created_at).getTime();
    const openLink = ls.find(
      (l) => !l.used_at && new Date(l.created_at).getTime() >= firstPending && new Date(l.expires_at).getTime() > now
    );
    stuck.push({
      phone,
      requests: pending.length,
      wrongCodes: pending.reduce((n, r) => n + (r.attempts ?? 0), 0),
      firstAt: pending[pending.length - 1].created_at,
      lastAt: pending[0].created_at,
      linkSentAt: openLink?.created_at ?? null,
      helpAt,
    });
  }
  return stuck;
}

/** שם הדוכן לפי מספר — כדי לדעת למי כותבים */
export async function storesByPhone(db: Db, phones: string[]) {
  const real = phones.filter((p) => /^972\d{9}$/.test(p));
  if (!real.length) return new Map<string, { name: string; emoji: string }>();
  const { data } = await db
    .from("stores")
    .select("contact_phone, display_name, emoji, created_at")
    .in("contact_phone", real)
    .order("created_at", { ascending: true });
  const m = new Map<string, { name: string; emoji: string }>();
  for (const s of data ?? []) if (!m.has(s.contact_phone)) m.set(s.contact_phone, { name: s.display_name, emoji: s.emoji });
  return m;
}
