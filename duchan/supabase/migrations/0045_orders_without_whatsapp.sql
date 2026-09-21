-- 0045 — ההזמנה חיה במערכת, לא בוואטסאפ (בקשת מרינה 2026-09).
--
-- שלושה שינויים שהם מהלך אחד:
--   1. קטגוריות פר-חנות: בעלת החנות מגדירה רשימה משלה (נידו, מים,
--      קרח...) ומתייגת מוצרים. הקונות מסננות לפי זה בדף החנות.
--   2. פרטי הזמנה מלאים: טלפון של הקונה הפך חובה (נאכף בשרת, לא כאן —
--      העמודה נשארת nullable כי הזמנות ישנות קיימות בלעדיו), כתובת
--      ועיר למשלוח, ואמצעי התשלום שנבחר.
--   3. ההודעה בוואטסאפ הפכה מ"ההזמנה עצמה" לערוץ קשר גיבוי — הקונה
--      רואה מסך אישור עם מספר ההזמנה, והמוכרת רואה הכל בדשבורד.
--
-- הכתובת היא של *הקונה* ולצורך משלוח בלבד: היא מוצגת רק למוכרת
-- (RLS של orders), לא נכנסת לשום דף פומבי ולא להודעת הוואטסאפ.
-- הכלל "אין כתובת של מוכרת בשום מקום" נשאר בתוקף.

alter table stores   add column if not exists categories text[];
alter table products add column if not exists category text;

comment on column stores.categories is
  'קטגוריות שהמוכרת הגדירה לחנות שלה. הסדר הוא סדר התצוגה.';
comment on column products.category is
  'שם קטגוריה מתוך stores.categories. טקסט חופשי — קטגוריה שנמחקה לא שוברת מוצר.';

alter table orders add column if not exists ship_address text;
alter table orders add column if not exists ship_city    text;
alter table orders add column if not exists pay_method   text;
alter table orders add column if not exists wants_shipping boolean;

comment on column orders.ship_address is
  'כתובת למשלוח שהקונה מסרה. נראית רק למוכרת. null = מסירה אישית.';
comment on column orders.pay_method is
  'bit / paybox / cash — מה שהקונה בחרה בקופה.';

/**
 * גרסה שמינית של place_order — עם פרטי משלוח ותשלום.
 *
 * כמו ב-0029: בלי ברירות מחדל, כדי שהחתימה החדשה לא תתבלבל עם הישנה.
 * השרת מנסה מהחתימה החדשה לישנה, כך שדאטהבייס שעוד לא קיבל את
 * המיגרציה ממשיך לקבל הזמנות (בלי הפרטים החדשים).
 */
create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text,
  p_buyer_name text,
  p_ship_address text,
  p_ship_city text,
  p_pay_method text,
  p_wants_shipping boolean
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name,
                      ship_address, ship_city, pay_method, wants_shipping)
    values (p_store, n, p_items, p_total, p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''),
            nullif(btrim(p_ship_address), ''), nullif(btrim(p_ship_city), ''),
            nullif(btrim(p_pay_method), ''), p_wants_shipping);
  return n;
end $$;

-- פונקציה חדשה נולדת עם execute ל-PUBLIC כברירת מחדל (הלקח מ-0040):
-- ההזמנות עוברות רק דרך השרת, אז רק service_role מריץ אותה.
revoke execute on function
  place_order(uuid, jsonb, int, text, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
