import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lineTotal, sumPrices } from "@/lib/money";
import { couponLabel, couponProblem, discountFor, normalizeCode } from "@/lib/coupons";
import { findCoupon } from "@/lib/coupons-server";

// POST /api/coupons/check  { slug, code, items:[{productId, qty}] }
// הקונה לוחצת "החלה" ורואה מיד כמה יורד. הסכום מחושב כאן לפי המחירים
// בדאטהבייס, לא לפי מה שהדפדפן שלח. בהזמנה עצמה הכל נבדק שוב.

export async function POST(req: NextRequest) {
  let body: { slug?: string; code?: string; items?: { productId: string; qty: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const code = normalizeCode(body.code);
  if (!body.slug || !code || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "צריך להקליד קוד" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, status, activated_at")
    .eq("slug", body.slug)
    .maybeSingle();
  if (!store || !store.activated_at || store.status !== "active") {
    return NextResponse.json({ error: "הדוכן סגור כרגע" }, { status: 404 });
  }

  const ids = body.items.map((i) => i.productId);
  const { data: products } = await db
    .from("products")
    .select("id, price")
    .eq("store_id", store.id)
    .in("id", ids)
    .is("deleted_at", null);
  const price = new Map((products ?? []).map((p) => [p.id, Number(p.price)]));
  const subtotal = sumPrices(
    body.items.map((i) => {
      const qty = Math.max(0, Math.min(99, Math.floor(Number(i.qty)) || 0));
      return price.has(i.productId) ? lineTotal(price.get(i.productId)!, qty) : 0;
    })
  );

  const c = await findCoupon(db, store.id, code);
  if (!c) {
    return NextResponse.json({ error: "הקוד הזה לא קיים בדוכן. אפשר לבדוק את האיות" }, { status: 404 });
  }
  const problem = couponProblem(c, subtotal);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const discount = discountFor(c, subtotal);
  return NextResponse.json({
    code: c.code,
    label: couponLabel(c),
    subtotal,
    discount,
    total: sumPrices([subtotal, -discount]),
  });
}
