/* ── עריכת הזמנה וסיבת ביטול ──
   מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיפים 2–3).

   מה ראינו בנתונים (26.11.2026): כמעט חצי מההזמנות בוטלו. הביטול תמיד ידני,
   של בעלי הדוכן. הזמנה שבוטלה גדולה בערך פי שניים מהזמנה ששולמה, ובכ-15%
   מהמקרים אותו קונה הזמין שוב תוך כמה שעות. כלומר: הרבה "ביטולים" הם בעצם
   תיקון של הזמנה (להוריד מוצר, להקטין כמות), שאפשר היה לעשות בלי לבטל.

   1. orders.edit_order_items: מורידים כמות או מוצר מהזמנה חדשה (sent), בלי
      לבטל ולהזמין מחדש. רק הקטנה, לא הגדלה (הגדלה צריכה בדיקת מלאי ומחיר,
      והקונה יכול פשוט להזמין עוד). שורה עם מבצע (1+1, כמות במחיר) יורדת רק
      בשלמותה, כי חלק ממבצע כבר לא אותו מחיר. קופון מחושב מחדש על הסכום החדש.
   2. orders.cancel_reason: סיבה בלחיצה אחת כשמבטלים, כדי שנדע מה לתקן.
   3. orders.edited_at: מתי ההזמנה נערכה (מוצג בכרטיס).

   מיגרציה שרק מוסיפה: שתי עמודות nullable ופונקציה אחת. */

alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists edited_at timestamptz;

comment on column orders.cancel_reason is 'למה בוטלה: changed | unpaid | sold_out | not_real | other. נבחר בלחיצה אחת בביטול.';
comment on column orders.edited_at is 'מתי בעלי הדוכן הורידו כמות או מוצר מההזמנה (edit_order_items).';

do $$ begin
  alter table orders add constraint orders_cancel_reason_check
    check (cancel_reason is null or cancel_reason in ('changed', 'unpaid', 'sold_out', 'not_real', 'other'));
exception when duplicate_object then null; end $$;

/* p_qty: מערך כמויות חדשות לפי סדר השורות בהזמנה, למשל [2, 0, 1].
   0 = להוריד את השורה. אי אפשר להגדיל, ואי אפשר להשאיר הזמנה ריקה. */
create or replace function edit_order_items(p_order uuid, p_qty jsonb)
returns orders
language plpgsql security definer set search_path = public as $function$
declare
  o orders;
  it jsonb;
  i int := 0;
  n int;
  old_q int;
  new_q int;
  out_items jsonb := '[]'::jsonb;
  line numeric;
  sub numeric := 0;
  c record;
  disc numeric := 0;
  changed boolean := false;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then
    raise exception 'order not found';
  end if;
  if not can_manage_store(o.store_id) then
    raise exception 'not allowed';
  end if;
  if o.status <> 'sent' then
    raise exception 'only new orders can be edited';
  end if;
  n := jsonb_array_length(o.items);
  if jsonb_typeof(p_qty) <> 'array' or jsonb_array_length(p_qty) <> n then
    raise exception 'bad quantities';
  end if;

  for it in select value from jsonb_array_elements(o.items) loop
    old_q := (it->>'qty')::int;
    new_q := (p_qty->>i)::int;
    i := i + 1;
    if new_q is null or new_q < 0 or new_q > old_q then
      raise exception 'quantity can only go down';
    end if;
    if new_q <> old_q then
      changed := true;
    end if;
    -- מבצע יורד רק בשלמותו
    if it ? 'deal' and new_q not in (0, old_q) then
      raise exception 'deal line can only be removed whole';
    end if;
    continue when new_q = 0;

    if new_q = old_q then
      line := coalesce((it->>'line')::numeric, (it->>'price')::numeric * old_q);
      out_items := out_items || jsonb_build_array(it);
    else
      line := (it->>'price')::numeric * new_q;
      out_items := out_items || jsonb_build_array(
        (it - 'line') || jsonb_build_object('qty', new_q)
      );
    end if;
    sub := sub + line;
  end loop;

  if not changed then
    return o;
  end if;
  if jsonb_array_length(out_items) = 0 then
    raise exception 'order would be empty';
  end if;

  -- קופון: מחושב מחדש על הסכום החדש, באותו חישוב של הקופה (lib/coupons.ts)
  if o.coupon_code is not null then
    select kind, value into c from coupons
     where store_id = o.store_id and upper(code) = upper(o.coupon_code)
     order by deleted_at nulls first limit 1;
    if c.kind = 'percent' then
      disc := round(sub * least(100, c.value) / 100, 2);
    elsif c.kind = 'amount' then
      disc := c.value;
    else
      -- הקופון כבר לא קיים: ההנחה יורדת באותו יחס כמו הסכום
      disc := case when coalesce(o.subtotal, 0) > 0
                   then round(coalesce(o.discount, 0) * sub / o.subtotal, 2) else 0 end;
    end if;
    disc := greatest(0, least(sub, disc));
  end if;

  update orders
     set items = out_items,
         subtotal = case when o.coupon_code is not null then sub else subtotal end,
         discount = case when o.coupon_code is not null then disc else discount end,
         total = sub - disc,
         edited_at = now()
   where id = p_order
   returning * into o;
  return o;
end $function$;

revoke all on function edit_order_items(uuid, jsonb) from public, anon;
grant execute on function edit_order_items(uuid, jsonb) to authenticated;
