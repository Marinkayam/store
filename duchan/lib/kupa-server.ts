import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneOf } from "./team";
import { payoutTarget } from "./payouts";
import { computeKupa, weekIndex, type KupaStats } from "./kupa";
import { pickSample } from "./kupa-lessons";
import { decoFrom } from "./kupa-shop";

/**
 * טוען את כל מה שקופת הדוכן צריכה, בשרת, לדוכן אחד. משותף ל-GET /api/kupa
 * ולחנות (שצריכה את היתרה לפני שהיא מוכרת משהו).
 *
 * טבלאות שעוד לא קיימות במסד (0058, 0059) לא מפילות כלום: ממשיכים בלעדיהן.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadKupa(db: SupabaseClient, store: any) {
  const [
    { data: products },
    { data: orders },
    { data: views },
    { data: members },
    ownerPhone,
    solvedRes,
    { data: coupons },
    purchasesRes,
  ] = await Promise.all([
    db
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order"),
    db.from("orders").select("status, total, buyer_phone, created_at").eq("store_id", store.id),
    db.from("store_views").select("views").eq("store_id", store.id),
    db.from("store_members").select("phone").eq("store_id", store.id),
    phoneOf(db, store.owner_id),
    db.from("kupa_solved").select("riddle_id, solved_at").eq("store_id", store.id),
    db.from("coupons").select("created_at, deleted_at").eq("store_id", store.id),
    db.from("kupa_purchases").select("item_key, price, equipped").eq("store_id", store.id),
  ]);

  // הזמנה מהטלפון של הצוות עצמו לא נחשבת — אחרת אפשר "לקנות" מעצמך מטבעות.
  // הזמנה שהוסתרה מהרשימה כן נחשבת: היא קרתה, ומטבעות לא נעלמים בגלל סידור.
  const team = new Set([store.contact_phone, ownerPhone, ...(members ?? []).map((m) => m.phone)].filter(Boolean));
  const real = (orders ?? []).filter((o) => o.status !== "cancelled" && !(o.buyer_phone && team.has(o.buyer_phone)));
  const prods = products ?? [];
  const purchases = purchasesRes.error ? [] : purchasesRes.data ?? [];
  const solvedRows = solvedRes.error ? [] : solvedRes.data ?? [];

  // שבועות פעילים: שבוע שבו נפתח הדוכן, נוסף מוצר, הגיעה הזמנה, נוצר קופון או נפתרה חידה
  const weeks = new Set<number>();
  const mark = (t: string | null | undefined) => t && weeks.add(weekIndex(t));
  mark(store.created_at);
  prods.forEach((p) => mark(p.created_at));
  (orders ?? []).forEach((o) => mark(o.created_at));
  (coupons ?? []).forEach((c) => mark(c.created_at));
  solvedRows.forEach((r) => mark(r.solved_at));

  const stats: KupaStats = {
    products: prods.length,
    productsWithPhoto: prods.filter((p) => p.image_key || p.poster_key).length,
    payReady: !!payoutTarget(store) || !!store.payout_cash,
    about: !!store.tagline?.trim(),
    views: (views ?? []).reduce((s, v) => s + (v.views ?? 0), 0),
    orders: real.length,
    paid: real
      .filter((o) => o.status === "paid" || o.status === "delivered")
      .map((o) => ({ at: o.created_at, total: Number(o.total) || 0 })),
    quests: {
      video: prods.some((p) => p.video_key),
      describe: prods.filter((p) => (p.description ?? "").trim().length >= 10).length >= 3,
      category: prods.some((p) => (p.categories?.length ?? 0) > 0 || !!p.category),
      featured: prods.some((p) => p.featured),
      coupon: (coupons ?? []).some((c) => !c.deleted_at),
      promo: !!store.promo_on && !!(store.promo_text ?? "").trim(),
      mystery: prods.some((p) => p.is_mystery),
      drop: prods.some((p) => p.drop_at),
      ship: !!store.ships,
    },
    activeWeeks: weeks.size,
    spent: purchases.reduce((s, p) => s + (Number(p.price) || 0), 0),
  };

  return {
    kupa: computeKupa(stats),
    sample: pickSample(prods),
    // null = הטבלה עוד לא קיימת — הדפדפן נשען על מה שנשמר בטלפון
    solved: solvedRes.error ? null : solvedRows.map((r) => r.riddle_id as string),
    owned: purchases.map((p) => p.item_key as string),
    deco: decoFrom(purchases),
    shopReady: !purchasesRes.error,
  };
}
