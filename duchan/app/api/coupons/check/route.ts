import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sumPrices } from "@/lib/money";
import { applyDeals, parseDeal } from "@/lib/deals";
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
  const read = (cols: string) =>
    db.from("products").select(cols).eq("store_id", store.id).in("id", ids).is("deleted_at", null);
  // מבצעים (0064) — הקופון חל על הסכום *אחרי* המבצע, כמו בהזמנה עצמה
  let { data: products, error } = await read("id, price, deal");
  if (error) ({ data: products } = await read("id, price"));
  const byId = new Map(
    ((products ?? []) as unknown as { id: string; price: number; deal?: unknown }[]).map((p) => [p.id, p])
  );
  const known = body.items
    .map((i) => ({ i, p: byId.get(i.productId) }))
    .filter((x): x is { i: { productId: string; qty: number }; p: { id: string; price: number; deal?: unknown } } => !!x.p);
  const subtotal = sumPrices(
    applyDeals(
      known.map(({ i, p }) => ({
        productId: p.id,
        price: Number(p.price),
        qty: Math.max(0, Math.min(99, Math.floor(Number(i.qty)) || 0)),
        deal: parseDeal(p.deal),
      }))
    ).map((l) => l.line)
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
