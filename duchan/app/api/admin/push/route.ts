import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyAdmins, vapidPublicKey } from "@/lib/admin-notify";

// התראות פוש לטלפון של המנהלת (0055).
// GET                                  — המפתח הציבורי, המכשירים, ו-15 ההתראות האחרונות
// POST { subscription, device }        — הדלקה במכשיר הזה
// POST { test: true }                  — התראת בדיקה לכל המכשירים
// DELETE { endpoint }                  — כיבוי במכשיר הזה (מסומן, לא נמחק)

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const db = supabaseAdmin();
  const [publicKey, { data: devices, error: devErr }, { data: recent }] = await Promise.all([
    vapidPublicKey(),
    db.from("admin_push_subscriptions")
      .select("endpoint, device, created_at, last_ok_at")
      .is("disabled_at", null)
      .order("created_at", { ascending: false }),
    db.from("admin_alerts")
      .select("kind, title, body, url, sent_to, created_at")
      .neq("kind", "test")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  return NextResponse.json({
    available: !!publicKey && !devErr,
    publicKey,
    devices: devices ?? [],
    recent: recent ?? [],
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: {
    test?: boolean;
    device?: string;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (body.test) {
    const r = await notifyAdmins({
      kind: "test",
      ref: String(Date.now()),
      title: "🔔 ההתראות עובדות!",
      body: "ככה ייראו התראות על דוכן חדש, תשלום שמחכה לאישור, או מישהי שלא מצליחה להיכנס.",
      url: "/admin",
    });
    return NextResponse.json({ ok: true, sent: r.sent });
  }

  const s = body.subscription;
  /* שרת פוש אמיתי תמיד ב-https. PUSH_TEST_ENDPOINTS=1 מתיר שרת דמה מקומי
     בבדיקות בלבד (http://localhost) — בפרודקשן המשתנה לא קיים. */
  const okEndpoint =
    /^https:\/\//.test(s?.endpoint ?? "") ||
    (process.env.PUSH_TEST_ENDPOINTS === "1" && /^http:\/\/localhost:\d+\//.test(s?.endpoint ?? ""));
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !okEndpoint) {
    return NextResponse.json({ error: "המנוי לא תקין" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("admin_push_subscriptions")
    .upsert(
      {
        endpoint: s.endpoint,
        p256dh: s.keys.p256dh,
        auth: s.keys.auth,
        admin: admin.email,
        device: (body.device ?? "").slice(0, 40) || null,
        disabled_at: null,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("[admin/push] subscribe:", error.message);
    return NextResponse.json({ error: `השמירה נכשלה: ${error.message}. אם הטבלה חסרה — להריץ את מיגרציה 0055.` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "חסר endpoint" }, { status: 400 });
  await supabaseAdmin()
    .from("admin_push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
