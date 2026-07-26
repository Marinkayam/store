import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// גלריית אדמין: כל החנויות הפעילות + המוצרים שלהן.
// כרגע לעיני האדמין בלבד — התשתית לאזור "בנות ומה הן מוכרות" אם יוחלט לפתוח אותו.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const db = supabaseAdmin();
  const { data: stores } = await db
    .from("stores")
    .select("id, slug, display_name, emoji, tagline, theme, avatar_key, cover_key, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const { data: products } = await db
    .from("products")
    .select("store_id, name, price, image_key, poster_key, video_key, track_stock, stock")
    .is("deleted_at", null)
    .or("is_visible.is.null,is_visible.eq.true")
    .order("sort_order", { ascending: true });

  const byStore = new Map<string, unknown[]>();
  (products ?? []).forEach((p) => {
    const list = byStore.get(p.store_id) ?? [];
    if (list.length < 8) list.push(p);
    byStore.set(p.store_id, list);
  });

  return NextResponse.json({
    stores: (stores ?? []).map((s) => ({ ...s, products: byStore.get(s.id) ?? [] })),
  });
}
