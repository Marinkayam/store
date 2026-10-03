import { NextRequest, NextResponse, after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAX_PARTNERS, maskPhone, phoneOf } from "@/lib/team";
import { notifyAdmins } from "@/lib/admin-notify";

/**
 * הצטרפות לדוכן משותף (0057).
 *
 * GET  ?token=  — מה רואים בעמוד ההזמנה (שם הדוכן, האייקון, למי ההזמנה)
 * POST { token, consent } — הצטרפות. רק מי שנכנס/ה בסמס עם *המספר שהוזמן*.
 *
 * לינק שהועבר הלאה לא מכניס אף אחד: צריך את הסמס של המספר הנכון.
 */
const err = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

async function loadInvite(token: string) {
  if (!/^[a-z0-9]{10,64}$/.test(token)) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from("store_invites")
    .select("id, store_id, phone, expires_at, accepted_at, accepted_by, cancelled_at, stores(display_name, emoji, slug, status)")
    .eq("token", token)
    .maybeSingle();
  return data as null | {
    id: string; store_id: string; phone: string; expires_at: string;
    accepted_at: string | null; accepted_by: string | null; cancelled_at: string | null;
    stores: { display_name: string; emoji: string; slug: string; status: string } | null;
  };
}

function state(inv: NonNullable<Awaited<ReturnType<typeof loadInvite>>>) {
  if (inv.cancelled_at) return "cancelled";
  if (inv.accepted_at) return "accepted";
  if (new Date(inv.expires_at) <= new Date()) return "expired";
  return "open";
}

export async function GET(req: NextRequest) {
  const inv = await loadInvite(req.nextUrl.searchParams.get("token") ?? "");
  if (!inv || !inv.stores) return err("ההזמנה לא קיימת", 404);
  return NextResponse.json({
    state: state(inv),
    store: { name: inv.stores.display_name, emoji: inv.stores.emoji },
    phone: maskPhone(inv.phone),
  });
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return err("צריך להיכנס קודם", 401);
  let body: { token?: string; consent?: boolean };
  try {
    body = await req.json();
  } catch {
    return err("בקשה לא תקינה", 400);
  }
  const inv = await loadInvite(body.token ?? "");
  if (!inv || !inv.stores) return err("ההזמנה לא קיימת", 404);
  const db = supabaseAdmin();

  // כבר הצטרפתי (לחיצה כפולה, רענון) — זה בסדר
  if (inv.accepted_at && inv.accepted_by === user.id) return NextResponse.json({ ok: true, storeId: inv.store_id });
  const st = state(inv);
  if (st === "cancelled") return err("ההזמנה בוטלה. אפשר לבקש מראש הדוכן הזמנה חדשה", 410);
  if (st === "accepted") return err("ההזמנה כבר נוצלה", 410);
  if (st === "expired") return err("פג התוקף של ההזמנה. אפשר לבקש מראש הדוכן הזמנה חדשה", 410);
  if (inv.stores.status === "blocked") return err("הדוכן מושבת כרגע", 403);

  const myPhone = await phoneOf(db, user.id);
  if (!myPhone || myPhone !== inv.phone) {
    return err(`ההזמנה נשלחה למספר ${maskPhone(inv.phone)}. צריך להיכנס עם המספר הזה`, 403, { wrongPhone: true });
  }
  if (!body.consent) return err("צריך לסמן שההורים יודעים ומאשרים", 400, { field: "consent" });

  const { data: store } = await db.from("stores").select("owner_id").eq("id", inv.store_id).maybeSingle();
  if (store?.owner_id === user.id) return err("זה כבר הדוכן שלך 🙂", 409);

  const { data: existing } = await db
    .from("store_members")
    .select("user_id")
    .eq("store_id", inv.store_id);
  const already = (existing ?? []).some((m) => m.user_id === user.id);
  if (!already) {
    if ((existing ?? []).length >= MAX_PARTNERS) return err("הצוות כבר מלא", 409);
    const { error } = await db.from("store_members").insert({
      store_id: inv.store_id, user_id: user.id, phone: myPhone, parent_consent_at: new Date().toISOString(),
    });
    if (error) return err("לא הצלחנו לצרף, לנסות שוב", 500);
  }
  await db
    .from("store_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", inv.id)
    .is("accepted_at", null);

  const name = inv.stores.display_name;
  after(() =>
    notifyAdmins({
      kind: "partner_joined",
      ref: `${inv.store_id}:${user.id}`,
      title: "🤝 שותף/ה הצטרפו לדוכן",
      body: name,
      url: "/admin",
    }).catch(() => {})
  );
  return NextResponse.json({ ok: true, storeId: inv.store_id });
}
