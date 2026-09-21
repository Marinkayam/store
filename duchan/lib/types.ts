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
  cover_preset: string | null; // קאבר מוכן. cover_key גובר עליו.
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
  // הצהרת הילדה שההורים יודעים ומאשרים. תנאי להצהרת תשלום (מיגרציה 0016).
  parent_consent_at: string | null;
  // payout_* = איך הקונה משלמת לילדה. אין לזה קשר ל-payment_* שלמעלה,
  // שהן התשלום החד-פעמי לדוכן על הקמת החנות.
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  payout_link: string | null; // לינק ביט/פייבוקס. נאכף בטריגר (מיגרציה 0018).
  // מה שהחנות מספרת על עצמה, ואיך ההזמנה מגיעה אליה (מיגרציה 0019)
  about: string | null;
  city: string | null;
  // גיל, לא תאריך לידה — פחות מזהה. לעולם לא בקריאה הפומבית (מיגרציה 0021)
  age: number | null;
  ships: boolean;
  shipping_note: string | null;
  shipping_price: number | null;
  order_intro: string | null;
  order_outro: string | null;
  promo_on: boolean;
  promo_title: string | null;
  promo_text: string | null;
  referred_by: string | null;
  referral_source: string | null;
  ref_clicks: number;
  ai_enabled: boolean | null;
  ai_credits: number | null;
  media_bytes: number;
  /** קטגוריות שהמוכרת הגדירה לחנות. null = עוד לא הוגדרו. */
  categories?: string[] | null;
  /** לינקים נפרדים לביט ולפייבוקס (0046) — יכולים להוביל לשני מספרים */
  payout_bit_link?: string | null;
  payout_paybox_link?: string | null;
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
  category: string | null; // הישנה (0045) — נשמרת לתאימות
  categories?: string[] | null; // מוצר יכול לשבת בכמה קטגוריות (0046)
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
  buyer_phone: string | null; // חובה מאז 2026-09; null רק בהזמנות ותיקות
  buyer_name: string | null;  // שם פרטי. מה שמקשר בין ההזמנה לשיחה בוואטסאפ
  ship_address: string | null; // הנוסח המלא של הכתובת. נראה רק למוכרת.
  ship_city: string | null;
  /** הפירוק: street, homeType (building|private), floor, apartment, entryCode */
  ship_details?: {
    street?: string;
    homeType?: "building" | "private";
    floor?: string;
    apartment?: string;
    entryCode?: string;
  } | null;
  pay_method: string | null;   // bit / paybox / cash
  wants_shipping: boolean | null;
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
  cover_preset: string | null;
  avatar_key: string | null;
  // שמות אמצעי תשלום בלבד — אין כאן מספר טלפון ואין פרטי חשבון
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  payout_link: string | null;
  payout_bit_link?: string | null;
  payout_paybox_link?: string | null;
  about: string | null;
  city: string | null;
  ships: boolean;
  shipping_note: string | null;
  shipping_price: number | null;
  // נוסחי הפתיחה והסיום של הודעת ההזמנה שמגיעה אליה בוואטסאפ
  order_intro: string | null;
  order_outro: string | null;
  promo_on: boolean;
  promo_title: string | null;
  promo_text: string | null;
  /** קטגוריות שהמוכרת הגדירה. הסדר הוא סדר הצ'יפים בדף. */
  categories: string[] | null;
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
  category: string | null;
  categories?: string[] | null;
  badge: "rare" | "sale" | null;
  created_at: string; // דרוש לתגית "חדש"
}
