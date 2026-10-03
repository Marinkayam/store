import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage, phoneOf } from "@/lib/team";
import { payoutTarget } from "@/lib/payouts";
import { computeKupa, type KupaStats } from "@/lib/kupa";
import { pickSample } from "@/lib/kupa-lessons";

// GET /api/kupa?storeId= — קופת הדוכן (lib/kupa.ts), לראש הדוכן ולשותף/ה.
//
// מחושב כאן ולא בדפדפן: הכניסות (store_views) נקראות רק בשרת, וכך גם
// אי אפשר "להוסיף" מטבעות מהקונסול. הקופה שייכת לדוכן ולא לאדם —
// בדוכן משותף שני השותפים רואים אותה מספר.

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId") ?? "";
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "צריך להתחבר" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("*").eq("id", storeId).maybeSingle();
  if (!store || !(await canManage(db, store.id, user.id))) {
    return NextResponse.json({ error: "אין לך גישה לדוכן הזה" }, { status: 403 });
  }

  const [{ data: products }, { data: orders }, { data: views }, { data: members }, ownerPhone] = await Promise.all([
    db.from("products").select("name, price, image_key, poster_key").eq("store_id", store.id).is("deleted_at", null).order("sort_order"),
    db.from("orders").select("status, total, buyer_phone, created_at").eq("store_id", store.id),
    db.from("store_views").select("views").eq("store_id", store.id),
    db.from("store_members").select("phone").eq("store_id", store.id),
    phoneOf(db, store.owner_id),
  ]);

  // הזמנה מהטלפון של הצוות עצמו לא נחשבת — אחרת אפשר "לקנות" מעצמך מטבעות.
  // הזמנה שהוסתרה מהרשימה כן נחשבת: היא קרתה, ומטבעות לא נעלמים בגלל סידור.
  const team = new Set([store.contact_phone, ownerPhone, ...(members ?? []).map((m) => m.phone)].filter(Boolean));
  const real = (orders ?? []).filter(
    (o) => o.status !== "cancelled" && !(o.buyer_phone && team.has(o.buyer_phone))
  );

  const stats: KupaStats = {
    products: products?.length ?? 0,
    productsWithPhoto: (products ?? []).filter((p) => p.image_key || p.poster_key).length,
    payReady: !!payoutTarget(store) || !!store.payout_cash,
    about: !!store.tagline?.trim(),
    views: (views ?? []).reduce((s, v) => s + (v.views ?? 0), 0),
    orders: real.length,
    paid: real
      .filter((o) => o.status === "paid" || o.status === "delivered")
      .map((o) => ({ at: o.created_at, total: Number(o.total) || 0 })),
  };

  // מוצר אחד לחידות החשבון ("‘צמיד קשת’ עולה ₪12…") — שם ומחיר, שגם ככה פומביים
  return NextResponse.json({
    ...computeKupa(stats),
    slug: store.slug,
    name: store.display_name,
    sample: pickSample(products ?? []),
  });
}
