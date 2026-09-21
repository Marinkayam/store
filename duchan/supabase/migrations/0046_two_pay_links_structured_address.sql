-- 0046 — שני לינקים לתשלום וכתובת מובנית (בקשת לקוחה דרך מרינה, 2026-09).
--
-- 1. לינק ביט ולינק פייבוקס נפרדים: "התשלום צריך להגיע לשני מספרי
--    טלפון שונים — אבא שלי ואח שלי". הקונה מקבלת את הלינק של האמצעי
--    שבחרה. payout_link הישן נשאר (append-only) והערך שבו נודד
--    לעמודה המתאימה לפי הסוג.
-- 2. כתובת משלוח מובנית: עיר, רחוב, בניין/בית פרטי, ולבניין גם קומה,
--    דירה וקוד כניסה. ship_address ממשיך לשאת את הנוסח המלא (לתצוגה
--    ולתאימות), והפירוק נשמר ב-ship_details.

alter table stores add column if not exists payout_bit_link text;
alter table stores add column if not exists payout_paybox_link text;

comment on column stores.payout_bit_link is
  'לינק ביט של החנות. יכול להוביל למספר אחר מלינק הפייבוקס.';
comment on column stores.payout_paybox_link is
  'לינק פייבוקס של החנות.';

update stores set payout_bit_link = payout_link
  where payout_bit_link is null and payout_link ~* 'bitpay\.co\.il';
update stores set payout_paybox_link = payout_link
  where payout_paybox_link is null
    and payout_link ~* '(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link)';

-- מוצר יכול לשבת בכמה קטגוריות ("נידו" וגם "נדיר"). category הישנה
-- (0045) נשארת ונודדת לתוך המערך; הקוד קורא את שתיהן.
alter table products add column if not exists categories text[];
update products set categories = array[category]
  where categories is null and category is not null;
comment on column products.categories is
  'הקטגוריות של המוצר, מתוך stores.categories. מחליף את category היחידה.';

alter table orders add column if not exists ship_details jsonb;
comment on column orders.ship_details is
  'הפירוק של הכתובת: {street, homeType: building|private, floor, apartment, entryCode}. נראה רק למוכרת.';

-- הטריגר בודק כל עמודה לפי הסוג שלה: לינק ביט חייב להיות bitpay,
-- לינק פייבוקס חייב להיות אחד ממארחי פייבוקס. הישן נשאר בבדיקה המשולבת.
create or replace function guard_payout_link()
returns trigger language plpgsql as $$
begin
  new.payout_link        := nullif(btrim(coalesce(new.payout_link, '')), '');
  new.payout_bit_link    := nullif(btrim(coalesce(new.payout_bit_link, '')), '');
  new.payout_paybox_link := nullif(btrim(coalesce(new.payout_paybox_link, '')), '');

  if new.payout_link is not null and new.payout_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link|bitpay\.co\.il)(/|$)'
  then
    raise exception 'payout link must be a bit or paybox https link';
  end if;

  if new.payout_bit_link is not null and new.payout_bit_link !~*
     '^https://([a-z0-9-]+\.)*bitpay\.co\.il(/|$)'
  then
    raise exception 'bit link must be a bitpay.co.il https link';
  end if;

  if new.payout_paybox_link is not null and new.payout_paybox_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link)(/|$)'
  then
    raise exception 'paybox link must be a paybox https link';
  end if;

  return new;
end $$;

/**
 * גרסה תשיעית של place_order — עם הפירוק המובנה של הכתובת.
 * כמו תמיד: בלי ברירות מחדל, השרת יורד חתימה-חתימה.
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
    values (p_store, n, p_items, p_total, p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''),
            nullif(btrim(p_ship_address), ''), nullif(btrim(p_ship_city), ''),
            nullif(btrim(p_pay_method), ''), p_wants_shipping, p_ship_details);
  return n;
end $$;

-- הלקח מ-0040: פונקציה חדשה נולדת עם execute ל-PUBLIC
revoke execute on function
  place_order(uuid, jsonb, int, text, text, text, text, text, text, text, boolean, jsonb)
  from public, anon, authenticated;
