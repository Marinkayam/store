-- מספר טלפון של הקונה, אופציונלי, כדי שהמוכרת תוכל לפתוח וואטסאפ ישירות
-- אליה אם יש שאלה על ההזמנה. הקונה בוחרת אם להשאיר אותו — לא חובה בטופס.
-- לעולם לא נחשף בקריאה הפומבית של החנות; מוגן באותו RLS כמו שאר ה-order.

alter table orders add column if not exists buyer_phone text;

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text default null
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status, ip_hash, buyer_phone)
    values (p_store, n, p_items, p_total, p_note, 'sent', p_ip_hash, p_buyer_phone);
  return n;
end $$;
