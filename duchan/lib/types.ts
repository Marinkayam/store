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
  activated_at: string | null; // null = טיוטה. הלינק לא פומבי עד ההפעלה.
  payment_claimed_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  payment_amount: number | null;
  // payout_* = איך הקונה משלמת לילדה. אין לזה קשר ל-payment_* שלמעלה,
  // שהן התשלום החד-פעמי לדוכן על הקמת החנות.
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  referred_by: string | null;
  referral_source: string | null;
  ref_clicks: number;
  ai_enabled: boolean | null;
  ai_credits: number | null;
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
  option_label: string | null; // "צבע" · "מידה" · null = אין אפשרויות
  options: string[] | null;
  badge: "rare" | "sale" | null; // תגית שהילדה בחרה. המחושבות נגזרות בקריאה.
  is_visible: boolean | null; // null = מוצג
  deleted_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id?: string; // מזהה המוצר. נוסף ב-0014 לחישוב "הכי נמכר"; חסר בהזמנות ותיקות.
  name: string;
  qty: number;
  price: number;
  option?: string; // הבחירה של הקונה: "ורוד". נשמר ב-snapshot ההזמנה.
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
  // שמות אמצעי תשלום בלבד — אין כאן מספר טלפון ואין פרטי חשבון
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
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
  option_label: string | null;
  options: string[] | null;
  badge: "rare" | "sale" | null;
  created_at: string; // דרוש לתגית "חדש"
}
