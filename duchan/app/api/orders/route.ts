import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { QUOTAS } from "@/lib/quotas";
import type { OrderItem } from "@/lib/types";

// POST /api/orders  { slug, items:[{productId, qty}], note? }
// המספר של הילדה לא יושב ב-HTML — הוא מוחזר מכאן, רק אחרי שההזמנה נוצרה.
// המלאי לא יורד כאן (הזמנות רפאים) — הוא יורד ב"שולם".

interface Body {
  slug?: string;
  items?: { productId: string; qty: number }[];
  note?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { slug, items, note } = body;
  if (!slug || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: store } = await db
    .from("stores")
    .select("id, display_name, contact_phone, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!store || store.status !== "active") {
    return NextResponse.json({ error: "החנות סגורה כרגע" }, { status: 404 });
  }

  // 5 הזמנות מ-IP לחנות ליום
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(`duchan:${ip}`).digest("hex").slice(0, 32);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("ip_hash", ipHash)
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= QUOTAS.ordersPerIpPerStorePerDay) {
    return NextResponse.json({ error: "הגעת למגבלת ההזמנות להיום" }, { status: 429 });
  }

  // מאמתים מחירים ומלאי מול ה-DB. לעולם לא סומכים על הלקוח.
  const ids = items.map((i) => i.productId);
  const { data: products } = await db
    .from("products")
    .select("id, name, price, track_stock, stock")
    .eq("store_id", store.id)
    .in("id", ids)
    .is("deleted_at", null);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const snapshot: OrderItem[] = [];
  let total = 0;

  for (const item of items) {
    const qty = Math.floor(Number(item.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      return NextResponse.json({ error: "כמות לא תקינה" }, { status: 400 });
    }
    const p = byId.get(item.productId);
    if (!p) {
      return NextResponse.json({ error: "אחד המוצרים כבר לא בחנות" }, { status: 409 });
    }
    if (p.track_stock && p.stock < qty) {
      return NextResponse.json({ error: `נשארו רק ${p.stock} מ"${p.name}"` }, { status: 409 });
    }
    snapshot.push({ name: p.name, qty, price: p.price });
    total += p.price * qty;
  }

  // מספור + כתיבה בטרנזקציה אחת — שתי קונות בו-זמניות מקבלות מספרים שונים
  const { data: orderNumber, error: orderErr } = await db.rpc("place_order", {
    p_store: store.id,
    p_items: snapshot,
    p_total: total,
    p_note: note?.slice(0, 200) || null,
    p_ip_hash: ipHash,
  });
  if (orderErr || typeof orderNumber !== "number") {
    return NextResponse.json({ error: "משהו השתבש, נסי שוב" }, { status: 500 });
  }

  return NextResponse.json({
    orderNumber,
    phone: store.contact_phone,
    storeName: store.display_name,
    items: snapshot,
    total,
  });
}
