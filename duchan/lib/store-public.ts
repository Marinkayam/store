import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase/admin";
import type { PublicStore, PublicProduct } from "./types";

/**
 * הקריאה הפומבית היחידה של חנות. שרת בלבד, service role, שדות מפורשים —
 * contact_phone ו-parent_email לא יוצאים מכאן לעולם.
 */
export const getPublicStore = cache(
  async (slug: string): Promise<{ store: PublicStore; products: PublicProduct[] } | null> => {
    const db = supabaseAdmin();

    const { data: store } = await db
      .from("stores")
      .select("id, slug, display_name, emoji, tagline, theme, cover_key, status")
      .eq("slug", slug)
      .maybeSingle();

    if (!store || store.status !== "active") return null;

    const { data: products } = await db
      .from("products")
      .select("id, name, description, price, image_key, video_key, poster_key, track_stock, stock, sort_order")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const { id: _id, status: _status, ...pub } = store;
    return { store: pub as PublicStore, products: (products ?? []) as PublicProduct[] };
  }
);
