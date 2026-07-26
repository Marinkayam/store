import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET ?id= — תיק חנות מלא: כל המוצרים (כולל מחוקים — כלום לא נמחק באמת),
// הזמנות אחרונות, כניסות לפי יום.
// PATCH { productId, action: 'restore' } — שחזור מוצר ע"י המנהלת, בלי מגבלת 30 יום.

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

  const db = supabaseAdmin();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [store, products, orders, views] = await Promise.all([
    db.from("stores").select("*").eq("id", id).maybeSingle(),
    db.from("products").select("*").eq("store_id", id).order("created_at", { ascending: true }),
    db.from("orders").select("*").eq("store_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("store_views").select("day, views").eq("store_id", id).gte("day", twoWeeksAgo).order("day"),
  ]);

  if (!store.data) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({
    store: store.data,
    products: products.data ?? [],
    orders: orders.data ?? [],
    views: views.data ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { productId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.productId || body.action !== "restore") {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const db = supabaseAdmin();
  await db.from("products").update({ deleted_at: null }).eq("id", body.productId);
  return NextResponse.json({ ok: true });
}
