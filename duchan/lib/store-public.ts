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
      /** יש בדוכן קופון חי — רק אז הקופה מציגה "יש לך קוד קופון?" */
      hasCoupons: boolean;
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
const STORE_PREV = `${STORE_BASE}, cover_preset, payout_bit, payout_paybox, payout_cash, payout_note, payout_link, payout_bit_link, payout_paybox_link, payout_bit_phone, payout_paybox_phone, payout_whatsapp, about, city, ships, shipping_note, shipping_price, order_intro, order_outro, promo_on, promo_title, promo_text, categories`;
/* מה שנוסף אחרון יושב בשכבה משלו: אם המיגרציה שלו עוד לא רצה, נופלים
   ל-PREV ולא עד ל-BASE — אחרת עמודה חדשה אחת מעלימה את הקטגוריות,
   הלינקים לתשלום וכל השאר (וזה בדיוק מה שקרה עם 0047). */
const STORE_LOOKS = `${STORE_PREV}, look, bg_pattern, bg_key`;
const STORE_CATS = `${STORE_LOOKS}, category_layout, category_size, category_meta`;
const STORE_FULL = `${STORE_CATS}, featured_title, show_sold_out`;

const PRODUCT_BASE =
  "id, name, description, price, image_key, video_key, poster_key, track_stock, stock, sort_order, created_at";
const PRODUCT_PREV = `${PRODUCT_BASE}, option_label, options, badge, category, categories`;
const PRODUCT_FEAT = `${PRODUCT_PREV}, featured`;
const PRODUCT_FULL = `${PRODUCT_FEAT}, drop_at, is_mystery`; // דרופ ושקית הפתעה (0056)

export const getPublicStore = cache(async (slug: string): Promise<PublicStoreResult> => {
  const db = supabaseAdmin();

  const readStore = (cols: string) =>
    db.from("stores").select(cols).eq("slug", slug).maybeSingle();

  // מהמלא לבסיס, שכבה אחרי שכבה: עמודה שעוד לא קיימת מורידה רק את מה
  // שנוסף אחריה, לא את כל מה שנוסף מאז ומעולם
  let store: unknown = null;
  for (const cols of [STORE_FULL, STORE_CATS, STORE_LOOKS, STORE_PREV, STORE_BASE]) {
    const { data, error } = await readStore(cols);
    if (!error) {
      store = data;
      break;
    }
    // רואים את זה בלוגים של השרת, ובינתיים החנות ממשיכה לעבוד
    console.error("[store] select failed, falling back:", error.message);
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

  // כמו החנות: שכבה-שכבה, כדי שעמודה חדשה שחסרה לא תמחק אפשרויות וקטגוריות
  let products: unknown[] | null = null;
  for (const cols of [PRODUCT_FULL, PRODUCT_FEAT, PRODUCT_PREV, PRODUCT_BASE]) {
    const { data, error: prodErr } = await readProducts(cols);
    if (!prodErr) {
      products = data;
      break;
    }
    console.error("[store] product select failed, falling back:", prodErr.message);
  }

  // "הכי נמכר" נגזר מהזמנות ששולמו בלבד — ראה ההסבר ב-lib/badges.ts
  const { data: sold } = await db
    .from("orders")
    .select("items")
    .eq("store_id", row.id)
    .in("status", ["paid", "delivered"]);

  // רק אם יש: שדה קופון בדוכן בלי קופונים שולח קונות לחפש קוד שלא קיים.
  // הקודים עצמם לא יוצאים מכאן — רק כן/לא.
  const { data: liveCoupon, error: couponErr } = await db
    .from("coupons")
    .select("id")
    .eq("store_id", row.id)
    .eq("active", true)
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  const hasCoupons = !couponErr && (liveCoupon?.length ?? 0) > 0;

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
    payout_bit_link: null,
    payout_paybox_link: null,
    payout_bit_phone: null,
    payout_paybox_phone: null,
    payout_whatsapp: false,
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
    categories: null,
    look: null,
    bg_pattern: null,
    bg_key: null,
    category_layout: null,
    category_size: null,
    category_meta: null,
    featured_title: null,
    show_sold_out: null,
    ...rest,
  } as unknown as PublicStore;

  return {
    state: activatedAt ? "live" : "preview",
    store: pub,
    products: list,
    bestSellerId,
    soldIds,
    hasCoupons,
  };
});
