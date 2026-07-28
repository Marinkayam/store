-- 0029 — למי שייכת ההזמנה.
--
-- הבעיה שזה פותר: כרטיס ההזמנה היה אנונימי. המפתח היחיד שקישר בין
-- הדשבורד לשיחות בוואטסאפ היה מספר ההזמנה, והוא ישב בשורה האחרונה של
-- ההודעה. עם ארבעים הזמנות, "מי זו #7?" הפך לפתיחת צ'אט אחרי צ'אט.
--
-- שם פרטי בלבד, ובלי שם משפחה, בלי כתובת ובלי גיל — בדיוק כמו בכל
-- שאר המוצר. הוא לא מוחזר בקריאה הפומבית של החנות, ומוגן באותו RLS
-- כמו שאר שדות ההזמנה.

alter table orders add column if not exists buyer_name text;

comment on column orders.buyer_name is
  'שם פרטי של הקונה. מה שמאפשר לקשר בין ההזמנה לשיחה בוואטסאפ.';

/**
 * גרסה שביעית של place_order.
 *
 * p_buyer_name **בלי ברירת מחדל** בכוונה: כך קריאה עם שישה ארגומנטים
 * לא יכולה להתאים גם לחתימה הזו וגם לקודמת, ואין אי-בהירות בבחירת
 * הפונקציה. השרת מנסה מהחתימה החדשה לישנה, כדי שדאטהבייס שעוד לא
 * קיבל את המיגרציה ימשיך לקבל הזמנות.
 */
create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text,
  p_buyer_name text
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name)
    values (p_store, n, p_items, p_total, p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''));
  return n;
end $$;
