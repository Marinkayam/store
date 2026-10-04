import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapidPublicKey, pushTo } from "@/lib/admin-notify";
import { canManage } from "@/lib/team";

// התראות הזמנה לטלפון של הדוכן (0061). רק ראש הדוכן או השותף/ה.
// GET    ?storeId=…                          — המפתח הציבורי, והמכשירים שלי שרשומים לדוכן הזה
// POST   { storeId, subscription, device }   — הדלקה במכשיר הזה
// POST   { storeId, test: true, endpoint }   — התראת בדיקה למכשיר הזה בלבד
// DELETE { storeId, endpoint }               — כיבוי במכשיר הזה (מסומן, לא נמחק)

async function who(storeId: string | null | undefined) {
  if (!storeId) return { error: NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 }) };
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "לא מחוברים. צריך להיכנס שוב" }, { status: 401 }) };
  const db = supabaseAdmin();
  if (!(await canManage(db, storeId, user.id))) {
    return { error: NextResponse.json({ error: "אין גישה לדוכן הזה" }, { status: 403 }) };
  }
  return { user, db, storeId };
}

const validEndpoint = (e: string | undefined) =>
  /^https:\/\//.test(e ?? "") ||
  // שרת דמה מקומי — בבדיקות בלבד. בפרודקשן המשתנה לא קיים.
  (process.env.PUSH_TEST_ENDPOINTS === "1" && /^http:\/\/localhost:\d+\//.test(e ?? ""));

export async function GET(req: NextRequest) {
  const w = await who(req.nextUrl.searchParams.get("storeId"));
  if ("error" in w) return w.error;
  const [publicKey, { data, error }] = await Promise.all([
    vapidPublicKey(),
    w.db
      .from("store_push_subscriptions")
      .select("endpoint")
      .eq("store_id", w.storeId)
      .eq("user_id", w.user.id)
      .is("disabled_at", null),
  ]);
  return NextResponse.json({
    available: !!publicKey && !error,
    publicKey,
    endpoints: (data ?? []).map((d) => d.endpoint),
  });
}

export async function POST(req: NextRequest) {
  let body: {
    storeId?: string;
    test?: boolean;
    endpoint?: string;
    device?: string;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const w = await who(body.storeId);
  if ("error" in w) return w.error;

  if (body.test) {
    const { data: subs } = await w.db
      .from("store_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("store_id", w.storeId)
      .eq("user_id", w.user.id)
      .eq("endpoint", body.endpoint ?? "")
      .is("disabled_at", null);
    const sent = await pushTo("store_push_subscriptions", subs ?? [], {
      title: "ככה תיראה הזמנה חדשה!",
      body: "ההתראות עובדות. כשמישהו יזמין מהדוכן, זה יקפוץ כאן.",
      url: "/dashboard",
      tag: "test",
    });
    return NextResponse.json({ ok: true, sent });
  }

  const s = body.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !validEndpoint(s.endpoint)) {
    return NextResponse.json({ error: "המנוי לא תקין" }, { status: 400 });
  }
  const { error } = await w.db.from("store_push_subscriptions").upsert(
    {
      store_id: w.storeId,
      user_id: w.user.id,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      device: (body.device ?? "").slice(0, 40) || null,
      disabled_at: null,
    },
    { onConflict: "store_id,endpoint" }
  );
  if (error) {
    console.error("[push] store subscribe:", error.message);
    return NextResponse.json({ error: "לא הצלחנו להדליק התראות. לנסות שוב בעוד רגע" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { storeId, endpoint } = (await req.json().catch(() => ({}))) as { storeId?: string; endpoint?: string };
  const w = await who(storeId);
  if ("error" in w) return w.error;
  if (!endpoint) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  await w.db
    .from("store_push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("store_id", w.storeId)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
