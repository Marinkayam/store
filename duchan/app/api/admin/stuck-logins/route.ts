import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/admin/stuck-logins — מי ביקשה קוד כמה פעמים ולא הצליחה להיכנס.
//
// סמס שלא מגיע (בקרת הורים, סינון ספאם) לא משאיר שום סימן אצל הילדה
// חוץ מתסכול. אצלנו הוא כן משאיר: כמה בקשות קוד ברצף, בלי אף כניסה.
// הרשימה הזו מראה אותן למנהלת, כדי לשלוח קישור כניסה בוואטסאפ במקום
// לחכות שיתלוננו (רובן לא יתלוננו — הן פשוט יוותרו).
//
// "תקועה": לפחות MIN_REQUESTS בקשות קוד מאז הכניסה המוצלחת האחרונה
// שלה (בקוד או בקישור), ב-WINDOW_HOURS האחרונות.

const WINDOW_HOURS = 72;
const MIN_REQUESTS = 2;

type Otp = { phone: string; created_at: string; consumed_at: string | null; attempts: number; help_requested_at: string | null };
type Link = { phone: string; created_at: string; used_at: string | null; expires_at: string };

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const db = supabaseAdmin();
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();

  const { data: otps, error } = await db
    .from("phone_otps")
    .select("phone, created_at, consumed_at, attempts, help_requested_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[admin/stuck-logins] otps:", error.message);
    return NextResponse.json({ error: "לא הצלחנו לטעון", stuck: [] }, { status: 500 });
  }

  const byPhone = new Map<string, Otp[]>();
  for (const o of (otps ?? []) as Otp[]) {
    const list = byPhone.get(o.phone) ?? [];
    list.push(o);
    byPhone.set(o.phone, list);
  }
  const phones = [...byPhone.keys()];
  if (!phones.length) return NextResponse.json({ stuck: [] });

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
  const stuck = [];
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
    // קישור שכבר נשלח אחרי שנתקעה, ועוד לא נוצל
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
      store: null as null | { name: string; emoji: string },
    });
  }
  if (!stuck.length) return NextResponse.json({ stuck: [] });

  // שם הדוכן, אם יש — כדי לדעת למי כותבים
  const { data: stores } = await db
    .from("stores")
    .select("contact_phone, display_name, emoji, created_at")
    .in("contact_phone", stuck.map((s) => s.phone))
    .order("created_at", { ascending: true });
  for (const s of stuck) {
    const st = (stores ?? []).find((x) => x.contact_phone === s.phone);
    if (st) s.store = { name: st.display_name, emoji: st.emoji };
  }

  // מי שלחצו "לא קיבלתי קוד" ראשונים, ואחריהם לפי הזמן
  stuck.sort((a, b) => Number(!!b.helpAt) - Number(!!a.helpAt) || b.lastAt.localeCompare(a.lastAt));
  return NextResponse.json({ stuck });
}
