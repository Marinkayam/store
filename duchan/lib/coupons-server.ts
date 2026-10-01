import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCode, otherLayout, type Coupon } from "./coupons";

/**
 * מוצא קופון של חנות לפי מה שהקונה הקלידה. קודם הקוד כמו שהוא, ואם אין —
 * אותו קוד בפריסת המקלדת השנייה ("דשךק10" → SALE10). המדויק תמיד מנצח.
 */
export async function findCoupon(
  db: SupabaseClient,
  storeId: string,
  raw: string | null | undefined
): Promise<Coupon | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const alt = otherLayout(code);
  const { data } = await db
    .from("coupons")
    .select("*")
    .eq("store_id", storeId)
    .in("code", alt ? [code, alt] : [code])
    .is("deleted_at", null);
  const rows = (data ?? []) as Coupon[];
  return rows.find((c) => c.code === code) ?? rows[0] ?? null;
}
