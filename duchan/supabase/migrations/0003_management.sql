-- פיצ'רי ניהול חנות. מיגרציה תוספתית בלבד: עמודות חדשות nullable, פונקציה חדשה.

-- הסתרת מוצר בלי מחיקה. null = מוצג (ברירת מחדל לשורות קיימות).
alter table products add column is_visible boolean default true;

-- הערה אישית של בעלת החנות על הזמנה ("לארוז בורוד")
alter table orders add column owner_note text;

-- ביטול הזמנה — אם המלאי כבר נוכה ("שולם"/"נמסר"), הוא חוזר. אטומי.
create or replace function cancel_order(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status = 'cancelled' then
    return;
  end if;

  -- security definer עוקף RLS — חובה לוודא שהקוראת היא בעלת החנות
  if not exists (
    select 1 from stores s where s.id = o.store_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if o.status in ('paid','delivered') then
    for it in select * from jsonb_array_elements(o.items) loop
      update products
         set stock = stock + (it->>'qty')::int
       where store_id = o.store_id
         and name = it->>'name'
         and track_stock;
    end loop;
  end if;

  update orders set status = 'cancelled' where id = p_order;
end $$;
