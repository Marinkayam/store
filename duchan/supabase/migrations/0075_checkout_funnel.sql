/* ── איפה קונים עוזבים, ומי רצה מוצר שאזל ──
   מרינה, 11.2026: "תתחיל הכל" (סבב רעיונות 3, סעיפים 1–2).

   בנתונים (30 יום): 1,010 ביקורים עם משהו בסל, ו-355 הזמנות. לא ידענו איפה
   בדרך הקונים עוזבים. עכשיו נספר כל שלב, פעם אחת לביקור, כמו carts:
     checkouts — פתחו את הסל (מסך ההזמנה)
     blocked   — לחצו "לשלוח" וחסר משהו בטופס (שם, טלפון, כתובת)
     submits   — לחצו "לשלוח" עם טופס מלא
     failed    — השרת לא קיבל את ההזמנה (שגיאה, קופון, מלאי)
   ההזמנות עצמן נספרות מ-orders.

   product_stats.wanted — ניסו לקנות מוצר שאזל (לחיצה על מוצר שאזל). בעלי
   הדוכן רואים "3 אנשים רצו את X", בלי שום פרט של מי.

   מיגרציה שרק מוסיפה: עמודות nullable עם ברירת מחדל 0, והחלפת גוף הפונקציה
   באותה חתימה (סוגים חדשים בלבד; הישנים מתנהגים בדיוק כמו קודם). */

alter table store_stats add column if not exists checkouts int default 0;
alter table store_stats add column if not exists blocked   int default 0;
alter table store_stats add column if not exists submits   int default 0;
alter table store_stats add column if not exists failed    int default 0;
alter table product_stats add column if not exists wanted  int default 0;

create or replace function bump_store_stat(
  p_store uuid, p_kind text, p_source text,
  p_visitor boolean default false, p_new boolean default false,
  p_product uuid default null, p_first boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare
  local timestamp := now() at time zone 'Asia/Jerusalem';
  d date := local::date;
  h smallint := extract(hour from local)::smallint;
  src text := coalesce(nullif(p_source, ''), 'whatsapp_or_direct');
begin
  if p_kind = 'want' then
    if p_product is not null then
      insert into product_stats (store_id, product_id, day, wanted)
      select p_store, p.id, d, 1 from products p where p.id = p_product and p.store_id = p_store
      on conflict (store_id, product_id, day) do update set
        wanted = coalesce(product_stats.wanted, 0) + 1;
    end if;
    return;
  end if;

  insert into store_stats (store_id, day, hour, source, visits, visitors, new_visitors, product_opens, carts,
                           checkouts, blocked, submits, failed)
  values (
    p_store, d, h, src,
    (p_kind = 'visit')::int,
    (p_kind = 'visit' and p_visitor)::int,
    (p_kind = 'visit' and p_new)::int,
    (p_kind = 'product' and p_first)::int,
    (p_kind = 'cart' and p_first)::int,
    (p_kind = 'checkout')::int,
    (p_kind = 'blocked')::int,
    (p_kind = 'submit')::int,
    (p_kind = 'fail')::int
  )
  on conflict (store_id, day, hour, source) do update set
    visits        = store_stats.visits        + excluded.visits,
    visitors      = store_stats.visitors      + excluded.visitors,
    new_visitors  = store_stats.new_visitors  + excluded.new_visitors,
    product_opens = store_stats.product_opens + excluded.product_opens,
    carts         = store_stats.carts         + excluded.carts,
    checkouts     = coalesce(store_stats.checkouts, 0) + excluded.checkouts,
    blocked       = coalesce(store_stats.blocked, 0)   + excluded.blocked,
    submits       = coalesce(store_stats.submits, 0)   + excluded.submits,
    failed        = coalesce(store_stats.failed, 0)    + excluded.failed;

  if p_product is not null and p_kind in ('product', 'cart') then
    insert into product_stats (store_id, product_id, day, opens, carts)
    select p_store, p.id, d, (p_kind = 'product')::int, (p_kind = 'cart')::int
      from products p where p.id = p_product and p.store_id = p_store
    on conflict (store_id, product_id, day) do update set
      opens = product_stats.opens + excluded.opens,
      carts = product_stats.carts + excluded.carts;
  end if;
end $$;
revoke all on function bump_store_stat(uuid, text, text, boolean, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function bump_store_stat(uuid, text, text, boolean, boolean, uuid, boolean) to service_role;
