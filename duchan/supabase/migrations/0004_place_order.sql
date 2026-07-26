-- יצירת הזמנה אטומית: מספור + כתיבה בטרנזקציה אחת.
-- שני צעדים נפרדים (rpc ואז insert) הם שתי טרנזקציות — הנעילה משתחררת
-- ביניהן ושתי קונות בו-זמניות היו יכולות לקבל אותו מספר.

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status, ip_hash)
    values (p_store, n, p_items, p_total, p_note, 'sent', p_ip_hash);
  return n;
end $$;

-- SECURITY INVOKER בכוונה: הקריאה מגיעה מהשרת עם service role אחרי אימות
-- מחירים ומלאי. קליינט מחובר שינסה לקרוא ישירות ייחסם ע"י RLS על orders.
