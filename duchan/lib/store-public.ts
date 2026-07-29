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
/**
 * העמודות שהדף הפומבי קורא, בשתי רמות.
 *
 * הקוד עולה לאוויר לפני שהמיגרציה רצה על הדאטהבייס — זה הסדר הרגיל של
 * דיפלוי, לא תקלה. אבל PostgREST מחזיר שגיאה על עמודה שאינה קיימת, ושגיאה
 * כזו הפילה את *כל* דפי החנויות ל"החנות סגורה": שדה חדש אחד השבית את
 * המוצר כולו עבור כל הקונות.
 *
 * לכן יש BASE — העמודות שקיימות מאז ומתמיד — ו-EXTRA, מה שנוסף לאחרונה.
 * מנסים את המלא, ואם הוא נופל חוזרים לבסיס. חנות בלי לינק תשלום עדיפה
 * פי אלף על חנות סגורה.
 */
const STORE_BASE =
  "id, slug, display_name, emoji, tagline, theme, cover_key, avatar_key, status, activated_at";
const STORE_FULL = `${STORE_BASE}, cover_preset, payout_bit, payout_paybox, payout_cash, payout_note, payout_link, about, city, ships, shipping_note, shipping_price, order_intro, order_outro, promo_on, promo_title, promo_text`;

const PRODUCT_BASE =
  "id, name, description, price, image_key, video_key, poster_key, track_stock, stock, sort_order, created_at";
const PRODUCT_FULL = `${PRODUCT_BASE}, option_label, options, badge`;

export const getPublicStore = cache(async (slug: string): Promise<PublicStoreResult> => {
  const db = supabaseAdmin();

  const readStore = (cols: string) =>
    db.from("stores").select(cols).eq("slug", slug).maybeSingle();

  let { data: store, error } = await readStore(STORE_FULL);
  if (error) {
    // רואים את זה בלוגים של השרת, ובינתיים החנות ממשיכה לעבוד
    console.error("[store] full select failed, falling back:", error.message);
    ({ data: store } = await readStore(STORE_BASE));
  }

  if (!store) return { state: "closed" };
  const row = store as unknown as Record<string, unknown> & {
    id: string;
    status: string;
    activated_at: string | null;
  };

  // חנות מושבתת מהחמ"ל סגורה בכל מצב — גם לפני פרסום
  if (row.status !== "active") return { state: "closed" };

  const readProducts = (cols: string) =>
    db
      .from("products")
      .select(cols)
      .eq("store_id", row.id)
      .is("deleted_at", null)
      .or("is_visible.is.null,is_visible.eq.true") // null = מוצג (שורות ותיקות)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

  let { data: products, error: prodErr } = await readProducts(PRODUCT_FULL);
  if (prodErr) {
    console.error("[store] full product select failed, falling back:", prodErr.message);
    ({ data: products } = await readProducts(PRODUCT_BASE));
  }

  // "הכי נמכר" נגזר מהזמנות ששולמו בלבד — ראה ההסבר ב-lib/badges.ts
  const { data: sold } = await db
    .from("orders")
    .select("items")
    .eq("store_id", row.id)
    .in("status", ["paid", "delivered"]);

  const list = (products ?? []) as unknown as PublicProduct[];
  const bestSellerId = bestSellerOf(sold ?? [], list);
  const soldIds = soldProductIds(sold ?? [], list);

  const { id: _id, status: _status, activated_at: activatedAt, ...rest } = row;
  // ברירות מחדל לשדות שאולי לא חזרו: הדף חייב לעבוד גם בלעדיהם
  const pub = {
    cover_preset: null,
    payout_bit: false,
    payout_paybox: false,
    payout_cash: false,
    payout_note: null,
    payout_link: null,
    about: null,
    city: null,
    ships: false,
    shipping_note: null,
    shipping_price: null,
    order_intro: null,
    order_outro: null,
    promo_on: false,
    promo_title: null,
    promo_text: null,
    ...rest,
  } as unknown as PublicStore;

  return {
    state: activatedAt ? "live" : "preview",
    store: pub,
    products: list,
    bestSellerId,
    soldIds,
  };
});
