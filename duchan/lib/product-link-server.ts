import { supabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_NO } from "@/lib/product-link";

/** מספר מוצר (lib/product-link.ts) → כתובת הדוכן שפותחת את המוצר. מוצר שנמחק או מוסתר: הדוכן עצמו. */
export async function productTarget(slug: string, n: string): Promise<string> {
  const base = `/s/${slug}`;
  if (!PRODUCT_NO.test(n)) return base;
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("id").eq("slug", slug).maybeSingle();
  if (!store) return base;
  const { data } = await db
    .from("products")
    .select("id, deleted_at")
    .eq("store_id", store.id)
    .order("created_at")
    .order("id")
    .range(Number(n) - 1, Number(n) - 1);
  const p = data?.[0];
  return p && !p.deleted_at ? `${base}?p=${p.id}` : base;
}
