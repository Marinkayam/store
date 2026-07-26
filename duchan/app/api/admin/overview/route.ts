import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET — כל מה שהחמ"ל צריך בקריאה אחת: חנויות מועשרות + סיכומים כלליים.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const db = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [storesQ, productsQ, ordersQ, viewsQ] = await Promise.all([
    db.from("stores")
      .select("id, slug, display_name, emoji, tagline, avatar_key, status, contact_phone, parent_email, claim_token, media_bytes, created_at")
      .order("created_at", { ascending: false }),
    db.from("products").select("store_id, deleted_at"),
    db.from("orders").select("store_id, status, total, created_at"),
    db.from("store_views").select("store_id, day, views"),
  ]);

  const stores = storesQ.data ?? [];
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

  const enriched = stores.map((s) => ({ ...s, ...a(s.id) }));

  return NextResponse.json({
    totals: {
      stores: stores.length,
      activeStores: stores.filter((s) => s.status === "active").length,
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
