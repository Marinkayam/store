import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET — כל מה שהחמ"ל צריך בקריאה אחת: חנויות מועשרות + סיכומים כלליים.

interface StoreRow {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  avatar_key: string | null;
  status: string;
  contact_phone: string;
  parent_email: string | null;
  claim_token: string | null;
  media_bytes: number;
  ai_enabled: boolean | null;
  ai_credits: number | null;
  sms_unlimited?: boolean | null;
  created_at: string;
  activated_at: string | null;
  parent_consent_at: string | null;
  payment_claimed_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  payment_amount: number | null;
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  referred_by: string | null;
  referral_source: string | null;
  ref_clicks: number;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const db = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const STORE_COLUMNS_BASE =
    "id, slug, display_name, emoji, tagline, avatar_key, status, contact_phone, parent_email, claim_token, media_bytes, ai_enabled, ai_credits, created_at, activated_at, parent_consent_at, payment_claimed_at, payment_method, payment_ref, payment_amount, payout_bit, payout_paybox, payout_cash, payout_note, referred_by, referral_source, ref_clicks";
  const STORE_COLUMNS_FULL = `${STORE_COLUMNS_BASE}, sms_unlimited`;

  const readStores = (cols: string) => db.from("stores").select(cols).order("created_at", { ascending: false });

  // עמודה חדשה (sms_unlimited, מיגרציה 0022) שעוד לא בהכרח רצה בפרודקשן —
  // בלי הנפילה הזו, עמודה חסרה מפילה את כל השאילתה ורשימת החנויות נעלמת
  // כליל מהחמ"ל, לא רק השדה החדש.
  let storesQ = await readStores(STORE_COLUMNS_FULL);
  if (storesQ.error) {
    storesQ = await readStores(STORE_COLUMNS_BASE);
  }

  const [productsQ, ordersQ, viewsQ] = await Promise.all([
    db.from("products").select("store_id, deleted_at"),
    db.from("orders").select("store_id, status, total, created_at"),
    db.from("store_views").select("store_id, day, views"),
  ]);

  const stores = (storesQ.data ?? []) as unknown as StoreRow[];
  const products = productsQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const views = viewsQ.data ?? [];

  const agg = new Map<string, {
    products: number; deletedProducts: number;
    ordersNew: number; ordersPaid: number; ordersTotal: number; revenue: number;
    viewsTotal: number; views7d: number; lastOrderAt: string | null;
  }>();
  const a = (id: string) => {
    if (!agg.has(id)) agg.set(id, { products: 0, deletedProducts: 0, ordersNew: 0, ordersPaid: 0, ordersTotal: 0, revenue: 0, viewsTotal: 0, views7d: 0, lastOrderAt: null });
    return agg.get(id)!;
  };

  products.forEach((p) => (p.deleted_at ? a(p.store_id).deletedProducts++ : a(p.store_id).products++));
  orders.forEach((o) => {
    const s = a(o.store_id);
    s.ordersTotal++;
    if (o.status === "sent") s.ordersNew++;
    if (o.status === "paid" || o.status === "delivered") {
      s.ordersPaid++;
      s.revenue += o.total;
    }
    if (!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
  });
  views.forEach((v) => {
    const s = a(v.store_id);
    s.viewsTotal += v.views;
    if (v.day >= weekAgo) s.views7d += v.views;
  });

  // כמה חנויות הביאה כל חנות — כדי לראות את האשכולות (כיתה, שכבה, שכונה)
  const brought = new Map<string, number>();
  stores.forEach((s) => {
    if (s.referred_by) brought.set(s.referred_by, (brought.get(s.referred_by) ?? 0) + 1);
  });

  const enriched = stores.map((s) => ({ ...s, ...a(s.id), brought: brought.get(s.id) ?? 0 }));

  return NextResponse.json({
    totals: {
      stores: stores.length,
      activeStores: stores.filter((s) => s.status === "active").length,
      live: stores.filter((s) => s.activated_at).length,
      drafts: stores.filter((s) => !s.activated_at && !s.payment_claimed_at).length,
      pendingActivation: stores.filter((s) => !s.activated_at && s.payment_claimed_at).length,
      paidTotal: stores.reduce((sum, s) => sum + (s.payment_amount ?? 0), 0),
      referred: stores.filter((s) => s.referred_by).length,
      refClicks: stores.reduce((sum, s) => sum + (s.ref_clicks ?? 0), 0),
      products: products.filter((p) => !p.deleted_at).length,
      orders: orders.length,
      newOrders: orders.filter((o) => o.status === "sent").length,
      revenue: enriched.reduce((sum, s) => sum + s.revenue, 0),
      viewsTotal: views.reduce((sum, v) => sum + v.views, 0),
      views7d: views.filter((v) => v.day >= weekAgo).reduce((sum, v) => sum + v.views, 0),
    },
    stores: enriched,
  });
}
