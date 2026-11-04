-- 0065 — מלאי לכל אפשרות (צבע / מידה).
--
-- products.option_stock = {"ורוד": 3, "כחול": 0}. null = בלי מלאי לפי אפשרות
-- (כמו קודם: מלאי אחד למוצר). כשיש option_stock, products.stock הוא הסכום
-- שלו — העורך שומר את שניהם, ו"שולם"/"ביטול" מעדכנים את שניהם.
--
-- ובאותה הזדמנות: "שולם" ו"ביטול" מוצאים את המוצר לפי המזהה שבהזמנה
-- (items[].id, מאז 0014) ולא לפי השם. שני מוצרים באותו שם, או מוצר ששמו
-- שונה אחרי ההזמנה, ירדו מהמלאי הלא נכון / לא ירדו בכלל. הזמנות ותיקות
-- בלי מזהה — עדיין לפי שם.
--
-- רק מוסיפים, ו-nullable (CLAUDE.md §9). הפונקציות מוחלפות באותה חתימה.
alter table products add column if not exists option_stock jsonb;

comment on column products.option_stock is
  'מלאי לכל אפשרות: {"ורוד": 3}. null = מלאי אחד למוצר (stock). כשיש — stock הוא הסכום.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_option_stock_shape') then
    alter table products add constraint products_option_stock_shape check (
      option_stock is null or (
        jsonb_typeof(option_stock) = 'object'
        and not jsonb_path_exists(option_stock, '$.* ? (@.type() != "number" || @ < 0 || @ > 100000 || @ != @.floor())')
      )
    );
  end if;
end $$;

create or replace function mark_order_paid(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
  q int;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status <> 'sent' then
    return;
  end if;

  -- security definer עוקף RLS — חובה לוודא שהקורא/ת מנהל/ת את הדוכן
  if not can_manage_store(o.store_id) then
    raise exception 'not allowed';
  end if;

  update orders set status = 'paid' where id = p_order;

  for it in select * from jsonb_array_elements(o.items) loop
    q := (it->>'qty')::int;
    update products
       set stock = greatest(0, stock - q),
           option_stock = case
             when option_stock is not null and it ? 'option' and option_stock ? (it->>'option')
               then jsonb_set(option_stock, array[it->>'option'],
                              to_jsonb(greatest(0, (option_stock->>(it->>'option'))::int - q)))
             else option_stock
           end
     where store_id = o.store_id
       and track_stock
       and (case when it ? 'id' then id::text = it->>'id' else name = it->>'name' end);
  end loop;
end $$;

create or replace function cancel_order(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
  q int;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status = 'cancelled' then
    return;
  end if;

  if not can_manage_store(o.store_id) then
    raise exception 'not allowed';
  end if;

  if o.status in ('paid','delivered') then
    for it in select * from jsonb_array_elements(o.items) loop
      q := (it->>'qty')::int;
      update products
         set stock = stock + q,
             option_stock = case
               when option_stock is not null and it ? 'option' and option_stock ? (it->>'option')
                 then jsonb_set(option_stock, array[it->>'option'],
                                to_jsonb((option_stock->>(it->>'option'))::int + q))
               else option_stock
             end
       where store_id = o.store_id
         and track_stock
         and (case when it ? 'id' then id::text = it->>'id' else name = it->>'name' end);
    end loop;
  end if;

  update orders set status = 'cancelled' where id = p_order;
end $$;
