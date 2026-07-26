import type { ThemeKey } from "./themes";

export type StoreStatus = "active" | "paused" | "blocked";
export type OrderStatus = "sent" | "paid" | "delivered" | "cancelled";

export interface Store {
  id: string;
  owner_id: string | null;
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  theme: ThemeKey;
  cover_key: string | null;
  avatar_key: string | null;
  contact_phone: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null; // האימייל של החשבון (משמש למכסת 3 חנויות לאימייל)
  status: StoreStatus;
  claim_token: string | null;
  media_bytes: number;
  created_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price: number;
  image_key: string | null;
  video_key: string | null;
  poster_key: string | null;
  track_stock: boolean;
  stock: number;
  sort_order: number;
  is_visible: boolean | null; // null = מוצג
  deleted_at: string | null;
  created_at: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  store_id: string;
  order_number: number;
  items: OrderItem[];
  total: number;
  buyer_note: string | null;
  owner_note: string | null;
  status: OrderStatus;
  created_at: string;
}

/** מה שדף החנות הפומבי מקבל. שדות מפורשים בלבד — בלי טלפונים ובלי פרטי הורה. */
export interface PublicStore {
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  theme: ThemeKey;
  cover_key: string | null;
  avatar_key: string | null;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_key: string | null;
  video_key: string | null;
  poster_key: string | null;
  track_stock: boolean;
  stock: number;
  sort_order: number;
}
