import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { QUOTAS } from "@/lib/quotas";
import { normalizePhone } from "@/lib/phone";
import type { OrderItem } from "@/lib/types";

// POST /api/orders  { slug, items:[{productId, qty}], note?, buyerPhone? }
// המספר של הילדה לא יושב ב-HTML — הוא מוחזר מכאן, רק אחרי שההזמנה נוצרה.
// המלאי לא יורד כאן (הזמנות רפאים) — הוא יורד ב"שולם".

interface Body {
  slug?: string;
  items?: { productId: string; qty: number; option?: string }[];
  note?: string;
  buyerPhone?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { slug, items, note, buyerPhone } = body;
  if (!slug || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: store } = await db
    .from("stores")
    .select("id, display_name, contact_phone, status, activated_at")
    .eq("slug", slug)
    .maybeSingle();

  // חנות שלא הופעלה לא מקבלת הזמנות, גם אם מישהו הגיע ללינק
  if (!store || !store.activated_at || store.status !== "active") {
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
    .select("id, name, price, track_stock, stock, option_label, options")
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

    // הבחירה של הקונה מאומתת מול הרשימה ב-DB, כמו המחיר. אחרת אפשר לשלוח
    // כל טקסט והוא ייכנס להזמנה ולהודעת הוואטסאפ של הילדה.
    const choices = p.options ?? [];
    let option: string | undefined;
    if (choices.length > 0) {
      if (!item.option || !choices.includes(item.option)) {
        return NextResponse.json(
          { error: `צריך לבחור ${p.option_label || "אפשרות"} ל"${p.name}"` },
          { status: 400 }
        );
      }
      option = item.option;
    }

    // המזהה נשמר כדי שתגית "הכי נמכר" תוכל להיגזר מהזמנות אמיתיות.
    // השם לבדו נשבר ברגע שילדה משנה שם מוצר.
    snapshot.push({ id: p.id, name: p.name, qty, price: p.price, ...(option ? { option } : {}) });
    total += p.price * qty;
  }

  // מספור + כתיבה בטרנזקציה אחת — שתי קונות בו-זמניות מקבלות מספרים שונים
  const { data: orderNumber, error: orderErr } = await db.rpc("place_order", {
    p_store: store.id,
    p_items: snapshot,
    p_total: total,
    p_note: note?.slice(0, 200) || null,
    p_ip_hash: ipHash,
    p_buyer_phone: buyerPhone ? normalizePhone(buyerPhone) : null,
  });
  if (orderErr || typeof orderNumber !== "number") {
    return NextResponse.json({ error: "משהו השתבש, לנסות שוב" }, { status: 500 });
  }

  return NextResponse.json({
    orderNumber,
    phone: store.contact_phone,
    storeName: store.display_name,
    items: snapshot,
    total,
  });
}
