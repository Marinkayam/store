-- בדיקות קצה-לקצה של שכבת ה-DB. כל כישלון מפיל את הסקריפט (ON_ERROR_STOP).
\set ON_ERROR_STOP on

-- שתי משתמשות, שתי חנויות
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'tamar@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'noa@test.com');

insert into stores (id, owner_id, slug, display_name, contact_phone, parent_email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'tamar', 'החנות של תמר', '972501111111', 'tamar@test.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'noaaa', 'החנות של נועה', '972502222222', 'noa@test.com');

insert into products (id, store_id, name, price, track_stock, stock) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'סקוויש חד-קרן', 15, true, 4),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'סקוויש דונאט', 12, false, 0);

-- ── 1. מספור אטומי פר חנות ──
do $$
declare n1 int; n2 int; n_other int;
begin
  n1 := next_order_number('aaaaaaaa-0000-0000-0000-000000000001');
  if n1 <> 1 then raise exception 'FAIL numbering: expected 1 got %', n1; end if;
  insert into orders (store_id, order_number, items, total)
    values ('aaaaaaaa-0000-0000-0000-000000000001', n1, '[{"name":"סקוויש חד-קרן","qty":2,"price":15}]', 30);
  n2 := next_order_number('aaaaaaaa-0000-0000-0000-000000000001');
  if n2 <> 2 then raise exception 'FAIL numbering: expected 2 got %', n2; end if;
  n_other := next_order_number('aaaaaaaa-0000-0000-0000-000000000002');
  if n_other <> 1 then raise exception 'FAIL per-store isolation: expected 1 got %', n_other; end if;
  raise notice 'PASS: order numbering per store';
end $$;

-- ── 2. unique(store_id, order_number) ──
do $$
begin
  begin
    insert into orders (store_id, order_number, items, total)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 1, '[]', 0);
    raise exception 'FAIL: duplicate order_number accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate order number rejected';
  end;
end $$;

-- ── 3. שולם: ניכוי מלאי + בדיקת בעלות ──
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false); -- נועה, לא הבעלים
do $$
declare oid uuid;
begin
  select id into oid from orders where store_id = 'aaaaaaaa-0000-0000-0000-000000000001' and order_number = 1;
  begin
    perform mark_order_paid(oid);
    raise exception 'FAIL: non-owner marked order paid';
  exception when others then
    if sqlerrm like '%not allowed%' then raise notice 'PASS: non-owner blocked from mark_order_paid';
    else raise; end if;
  end;
end $$;

select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false); -- תמר, הבעלים
do $$
declare oid uuid; st int; ostatus order_status;
begin
  select id into oid from orders where store_id = 'aaaaaaaa-0000-0000-0000-000000000001' and order_number = 1;
  perform mark_order_paid(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  select status into ostatus from orders where id = oid;
  if ostatus <> 'paid' then raise exception 'FAIL: status not paid'; end if;
  if st <> 2 then raise exception 'FAIL: stock expected 2 got %', st; end if;
  -- קריאה שנייה = no-op, בלי ניכוי כפול
  perform mark_order_paid(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if st <> 2 then raise exception 'FAIL: double deduction! stock %', st; end if;
  raise notice 'PASS: paid deducts stock once, owner-only';
end $$;

-- ── 4. ביטול הזמנה ששולמה מחזיר מלאי ──
do $$
declare oid uuid; st int; ostatus order_status;
begin
  select id into oid from orders where store_id = 'aaaaaaaa-0000-0000-0000-000000000001' and order_number = 1;
  perform cancel_order(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  select status into ostatus from orders where id = oid;
  if ostatus <> 'cancelled' then raise exception 'FAIL: status not cancelled'; end if;
  if st <> 4 then raise exception 'FAIL: restock expected 4 got %', st; end if;
  -- ביטול חוזר = no-op
  perform cancel_order(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if st <> 4 then raise exception 'FAIL: double restock! stock %', st; end if;
  raise notice 'PASS: cancel restores stock once';
end $$;

-- ── 5. ביטול הזמנה שלא שולמה — בלי לגעת במלאי ──
do $$
declare oid uuid; st int;
begin
  insert into orders (store_id, order_number, items, total)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 3, '[{"name":"סקוויש חד-קרן","qty":1,"price":15}]', 15)
    returning id into oid;
  perform cancel_order(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if st <> 4 then raise exception 'FAIL: cancel of sent order touched stock: %', st; end if;
  raise notice 'PASS: cancelling unpaid order leaves stock alone';
end $$;

-- ── 6. מלאי לא יורד מתחת לאפס ──
do $$
declare oid uuid; st int;
begin
  update products set stock = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  insert into orders (store_id, order_number, items, total)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 4, '[{"name":"סקוויש חד-קרן","qty":5,"price":15}]', 75)
    returning id into oid;
  perform mark_order_paid(oid);
  select stock into st from products where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if st <> 0 then raise exception 'FAIL: stock went below zero path: %', st; end if;
  raise notice 'PASS: stock floors at zero';
end $$;

-- ── 7. RLS: משתמשת רואה רק את החנות שלה ──
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login;
  end if;
end $$;
grant usage on schema public, auth to app_user;
grant select, insert, update on all tables in schema public to app_user;
grant execute on all functions in schema public to app_user;

set role app_user;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$
declare c int;
begin
  select count(*) into c from stores;
  if c <> 1 then raise exception 'FAIL RLS: tamar sees % stores', c; end if;
  select count(*) into c from stores where slug = 'noaaa';
  if c <> 0 then raise exception 'FAIL RLS: tamar sees noa store'; end if;
  select count(*) into c from products;
  if c <> 2 then raise exception 'FAIL RLS: tamar sees % products', c; end if;
  raise notice 'PASS: RLS isolates stores, products';
end $$;

-- אנונימית (בלי uid) לא רואה כלום
select set_config('app.uid', '', false);
do $$
declare c int;
begin
  select count(*) into c from stores;
  if c <> 0 then raise exception 'FAIL RLS: anon sees % stores', c; end if;
  select count(*) into c from orders;
  if c <> 0 then raise exception 'FAIL RLS: anon sees % orders', c; end if;
  raise notice 'PASS: anonymous sees nothing (public page goes through service role only)';
end $$;
reset role;

select 'ALL DB TESTS PASSED' as result;

-- ── 8. place_order: מספור + כתיבה אטומית ──
do $$
declare n1 int; n2 int;
begin
  n1 := place_order('aaaaaaaa-0000-0000-0000-000000000002',
        '[{"name":"משהו","qty":1,"price":10}]'::jsonb, 10, 'הערה', 'iphash1');
  n2 := place_order('aaaaaaaa-0000-0000-0000-000000000002',
        '[{"name":"משהו","qty":2,"price":10}]'::jsonb, 20, null, 'iphash1');
  if n1 <> 1 or n2 <> 2 then raise exception 'FAIL place_order: got %, %', n1, n2; end if;
  if (select count(*) from orders where store_id='aaaaaaaa-0000-0000-0000-000000000002') <> 2 then
    raise exception 'FAIL place_order: rows missing';
  end if;
  raise notice 'PASS: place_order numbers and inserts atomically';
end $$;

select 'ALL DB TESTS PASSED (v2)' as result;
