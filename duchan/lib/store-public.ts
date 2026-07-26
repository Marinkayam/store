import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase/admin";
import type { PublicStore, PublicProduct } from "./types";
import { bestSellerOf } from "./badges";

/** לחנות שלא הופעלה יש מסך משלה — היא בהכנה, לא סגורה. */
export type PublicStoreResult =
  | { state: "live"; store: PublicStore; products: PublicProduct[]; bestSellerId: string | null }
  | { state: "pending"; name: string; emoji: string }
  | { state: "closed" };

/**
 * הקריאה הפומבית היחידה של חנות. שרת בלבד, service role, שדות מפורשים —
 * contact_phone ו-parent_email לא יוצאים מכאן לעולם.
 */
export const getPublicStore = cache(async (slug: string): Promise<PublicStoreResult> => {
  const db = supabaseAdmin();

  const { data: store } = await db
    .from("stores")
    .select(
      "id, slug, display_name, emoji, tagline, theme, cover_key, cover_preset, avatar_key, status, activated_at, payout_bit, payout_paybox, payout_cash, payout_note"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!store) return { state: "closed" };

  // טיוטה — הלינק עוד לא נפתח לשיתוף. מסך אחר מ"סגורה".
  if (!store.activated_at) {
    return { state: "pending", name: store.display_name, emoji: store.emoji };
  }
  if (store.status !== "active") return { state: "closed" };

  const { data: products } = await db
    .from("products")
    .select("id, name, description, price, image_key, video_key, poster_key, track_stock, stock, sort_order, option_label, options, badge, created_at")
    .eq("store_id", store.id)
    .is("deleted_at", null)
    .or("is_visible.is.null,is_visible.eq.true") // null = מוצג (שורות ותיקות)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // "הכי נמכר" נגזר מהזמנות ששולמו בלבד — ראה ההסבר ב-lib/badges.ts
  const { data: sold } = await db
    .from("orders")
    .select("items")
    .eq("store_id", store.id)
    .in("status", ["paid", "delivered"]);

  const list = (products ?? []) as PublicProduct[];
  const bestSellerId = bestSellerOf(sold ?? [], list);

  const { id: _id, status: _status, activated_at: _act, ...pub } = store;
  return { state: "live", store: pub as PublicStore, products: list, bestSellerId };
});
