-- 0049 — מחירים עם אגורות (10.90).
--
-- עד עכשיו המחיר היה int — "שקלים שלמים, אין אגורות". מוכרות ביקשו 10.90,
-- 4.50 וכו'. מרחיבים את הטיפוס ל-numeric(10,2): כל ערך int קיים נכנס בדיוק
-- (15 → 15.00), ואין שינוי שם או מחיקה. PostgREST מחזיר numeric כמספר JSON,
-- כך שקוד ישן שקורא את העמודה ממשיך לעבוד.
--
-- ⚠ להריץ לפני שהקוד עולה: השרת החדש שולח p_total עשרוני, ופונקציה עם
-- p_total int תדחה אותו.

alter table products alter column price type numeric(10,2);
alter table orders   alter column total type numeric(10,2);
alter table stores   alter column shipping_price type numeric(10,2);

comment on column products.price is 'מחיר בשקלים, עד שתי ספרות אחרי הנקודה (10.90).';
comment on column stores.shipping_price is 'מחיר משלוח בשקלים, עד שתי ספרות אחרי הנקודה. null = לא צוין.';

-- place_order v9 עם p_total עשרוני. אותם שמות פרמטרים בדיוק — PostgREST
-- בוחר פונקציה לפי שמות, ושתי גרסאות עם אותם שמות היו הופכות כל הזמנה
-- ל"לא ניתן לבחור מועמד". לכן מחליפים ולא מוסיפים.
drop function if exists
  place_order(uuid, jsonb, int, text, text, text, text, text, text, text, boolean, jsonb);

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total numeric,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text,
  p_buyer_name text,
  p_ship_address text,
  p_ship_city text,
  p_pay_method text,
  p_wants_shipping boolean,
  p_ship_details jsonb
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name,
                      ship_address, ship_city, pay_method, wants_shipping, ship_details)
    values (p_store, n, p_items, round(p_total, 2), p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''),
            nullif(btrim(p_ship_address), ''), nullif(btrim(p_ship_city), ''),
            nullif(btrim(p_pay_method), ''), p_wants_shipping, p_ship_details);
  return n;
end $$;

-- הלקח מ-0040: פונקציה חדשה נולדת עם execute ל-PUBLIC
revoke execute on function
  place_order(uuid, jsonb, numeric, text, text, text, text, text, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function
  place_order(uuid, jsonb, numeric, text, text, text, text, text, text, text, boolean, jsonb)
  to service_role;

notify pgrst, 'reload schema';
