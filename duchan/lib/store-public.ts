import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase/admin";
import type { PublicStore, PublicProduct } from "./types";
import { bestSellerOf, soldProductIds } from "./badges";

/**
 * חנות שלא הופעלה עדיין היא "תצוגה מקדימה" ולא "סגורה": הלינק עובד, החברות
 * רואות חנות אמיתית עם המוצרים, ורק ההזמנה חסומה. זו הנקודה שבה היא מתאהבת
 * — קודם רואים משהו חי, ורק אחר כך מבקשים מההורה לשלם.
 */
export type PublicStoreResult =
  | {
      state: "live" | "preview";
      store: PublicStore;
      products: PublicProduct[];
      bestSellerId: string | null;
      soldIds: string[];
    }
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
      "id, slug, display_name, emoji, tagline, theme, cover_key, cover_preset, avatar_key, status, activated_at, payout_bit, payout_paybox, payout_cash, payout_note, payout_link"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!store) return { state: "closed" };

  // חנות מושבתת מהחמ"ל סגורה בכל מצב — גם לפני פרסום
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
  const soldIds = soldProductIds(sold ?? [], list);

  const { id: _id, status: _status, activated_at: activatedAt, ...pub } = store;
  return {
    state: activatedAt ? "live" : "preview",
    store: pub as PublicStore,
    products: list,
    bestSellerId,
    soldIds,
  };
});
