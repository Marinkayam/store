import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";
import { loadKupa } from "@/lib/kupa-server";
import { shopItem } from "@/lib/kupa-shop";

// POST /api/kupa/shop — חנות הקישוטים (0059 kupa_purchases).
//
//   { storeId, action: "buy",   item }  — קונה, אם יש מספיק מטבעות
//   { storeId, action: "equip", item }  — צבע סוכך שכבר נקנה ("lavender" = הרגיל)
//
// היתרה מחושבת כאן מחדש מהנתונים בכל קנייה — לא סומכים על מה שהדפדפן
// חושב שיש. המחיר נשמר בשורה, ככה ששינוי מחיר עתידי לא משנה בדיעבד.

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return err("צריך להתחבר", 401);
  let body: { storeId?: string; action?: string; item?: string };
  try {
    body = await req.json();
  } catch {
    return err("בקשה לא תקינה", 400);
  }
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("*").eq("id", body.storeId ?? "").maybeSingle();
  if (!store || !(await canManage(db, store.id, user.id))) return err("אין לך גישה לדוכן הזה", 403);

  const state = async () => {
    const k = await loadKupa(db, store);
    return NextResponse.json({ balance: k.kupa.balance, owned: k.owned, deco: k.deco });
  };

  if (body.action === "equip") {
    const color = body.item === "lavender" ? null : shopItem(body.item ?? "");
    if (body.item !== "lavender" && !color?.awning) return err("אין צבע כזה", 400);
    const before = await loadKupa(db, store);
    if (color && !before.owned.includes(color.key)) return err("קודם קונים את הצבע הזה", 400);
    // כל צבעי הסוכך כבויים, ואז הנבחר דולק
    const awnings = before.owned.filter((k) => shopItem(k)?.awning);
    if (awnings.length) await db.from("kupa_purchases").update({ equipped: false }).eq("store_id", store.id).in("item_key", awnings);
    if (color) await db.from("kupa_purchases").update({ equipped: true }).eq("store_id", store.id).eq("item_key", color.key);
    return state();
  }

  if (body.action !== "buy") return err("פעולה לא מוכרת", 400);
  const item = shopItem(body.item ?? "");
  if (!item) return err("אין קישוט כזה", 400);
  const k = await loadKupa(db, store);
  if (!k.shopReady) return err("החנות עוד לא מוכנה, לנסות שוב מאוחר יותר", 503);
  if (k.owned.includes(item.key)) return err("זה כבר שלך", 409);
  if (k.kupa.balance < item.price) return err(`חסרים עוד ${item.price - k.kupa.balance} מטבעות`, 400);
  if (item.awning) {
    const awnings = k.owned.filter((x) => shopItem(x)?.awning);
    if (awnings.length) await db.from("kupa_purchases").update({ equipped: false }).eq("store_id", store.id).in("item_key", awnings);
  }
  const { error } = await db
    .from("kupa_purchases")
    .insert({ store_id: store.id, item_key: item.key, price: item.price, equipped: true, bought_by: user.id });
  if (error) return err(error.code === "23505" ? "זה כבר שלך" : "הקנייה לא הצליחה, לנסות שוב", error.code === "23505" ? 409 : 500);
  // קונפטי לקונים נראה בדוכן עצמו — לרענן את הדף השמור, שלא יחכו דקה
  if (item.key === "confetti") revalidatePath(`/s/${store.slug}`);
  return state();
}
