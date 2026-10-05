import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSource } from "@/lib/stats";

// POST /api/track — מונים של הדוכן. beacon מהדפדפן.
//
//   { slug }                                        — כניסה (הצורה הישנה; נשארת לתאימות)
//   { slug, ev: "visit", src, visitor, fresh, sid } — כניסה, פעם אחת ללשונית
//   { slug, ev: "product", product, src, first }    — פתחו מוצר (פעם אחת למוצר בביקור; first = הראשון בביקור)
//   { slug, ev: "cart", product, src, first }       — הוסיפו לסל (פעם אחת למוצר בביקור)
//   { slug, ev: "ping", sid }                       — "עדיין כאן", כל 30 שניות כשהדף גלוי
//
// שום דבר כאן לא מזהה אדם (0062): visitor/fresh הם כן/לא שהדפדפן מחליט לבד,
// ו-sid הוא מספר אקראי שנוצר מחדש בכל לשונית. בעלי הדוכן לא נספרים — הדף
// לא שולח כלום כשהם מחוברים.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID = /^[a-z0-9]{8,40}$/i;

export async function POST(req: NextRequest) {
  let body: { slug?: string; ev?: string; src?: string; visitor?: boolean; fresh?: boolean; sid?: string; product?: string; first?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.slug || typeof body.slug !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  const ev = body.ev ?? "visit";
  if (!["visit", "product", "cart", "ping"].includes(ev)) return NextResponse.json({ ok: false }, { status: 400 });

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id")
    .eq("slug", body.slug)
    .eq("status", "active")
    .maybeSingle();
  if (!store) return NextResponse.json({ ok: true });

  const src = isSource(body.src) ? body.src : "whatsapp_or_direct";
  const sid = typeof body.sid === "string" && SID.test(body.sid) ? body.sid : null;
  const product = typeof body.product === "string" && UUID.test(body.product) ? body.product : null;

  const seen = () =>
    sid
      ? db.from("store_presence").upsert({ store_id: store.id, sid, seen_at: new Date().toISOString() }, { onConflict: "store_id,sid" })
      : Promise.resolve();

  /* כל כתיבה כאן היא "best effort": טבלה שעוד לא קיימת (מיגרציה שלא רצה)
     לא שוברת את הדוכן לקונה — רק לא נספר. */
  const tasks: PromiseLike<unknown>[] = [];
  if (ev === "visit") {
    tasks.push(db.rpc("bump_store_view", { p_store: store.id })); // הסה"כ הוותיק — מטבעות הקופה נשענים עליו
    tasks.push(db.rpc("bump_store_stat", { p_store: store.id, p_kind: "visit", p_source: src, p_visitor: !!body.visitor, p_new: !!body.fresh }));
    tasks.push(seen());
  } else if (ev === "product" || ev === "cart") {
    tasks.push(db.rpc("bump_store_stat", { p_store: store.id, p_kind: ev, p_source: src, p_product: product, p_first: body.first !== false }));
  } else {
    tasks.push(seen());
  }
  const results = await Promise.all(tasks.map((t) => Promise.resolve(t).catch((e) => ({ error: e }))));
  for (const r of results as { error?: { message?: string } | null }[]) {
    if (r?.error) console.error("[track]", ev, r.error.message ?? r.error);
  }
  return NextResponse.json({ ok: true });
}
