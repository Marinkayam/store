-- 0054 — קופונים.
--
-- קוד קופון שייך לחנות אחת. המוכרת יוצרת אותו בדשבורד, המנהלת יכולה
-- ליצור ולנהל לכל חנות מהחמ"ל, והקונה מקלידה אותו בהזמנה.
--
-- kind      — percent (אחוז מהסכום) או amount (סכום קבוע בשקלים).
-- min_total — סכום מינימלי של המוצרים כדי שהקופון יחול. null = בלי.
-- max_uses  — כמה הזמנות יכולות להשתמש בו. null = בלי הגבלה.
-- used_count עולה בתוך place_order, באותה טרנזקציה של ההזמנה: שתי קונות
--            על השימוש האחרון — רק אחת מקבלת אותו.
-- deleted_at — מחיקה רכה, כמו בכל מקום. קוד שנמחק אפשר ליצור שוב.

create table if not exists coupons (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9א-ת_-]{3,20}$'),
  kind        text not null check (kind in ('percent', 'amount')),
  value       numeric(10,2) not null check (value > 0),
  min_total   numeric(10,2) check (min_total is null or min_total >= 0),
  max_uses    int check (max_uses is null or max_uses > 0),
  used_count  int not null default 0 check (used_count >= 0),
  expires_at  timestamptz,
  active      boolean not null default true,
  created_by  text not null default 'store' check (created_by in ('store', 'admin')),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint coupons_percent_max check (kind <> 'percent' or value <= 100)
);

create unique index if not exists coupons_store_code_live
  on coupons (store_id, code) where deleted_at is null;
create index if not exists coupons_store on coupons (store_id) where deleted_at is null;

alter table coupons enable row level security;

drop policy if exists own_coupons on coupons;
create policy own_coupons on coupons
  for all using (store_id in (select id from stores where owner_id = auth.uid()))
  with check   (store_id in (select id from stores where owner_id = auth.uid()));

-- המוכרת קובעת קוד, סוג, ערך ותנאים — לא את מונה השימושים ולא "מי יצר".
-- הרשאה ברמת עמודות: ב-Postgres revoke של עמודה אחרי grant על כל הטבלה
-- לא חוסם כלום, ולכן קודם מורידים הכל (גם את ברירת המחדל של Supabase).
revoke all on coupons from public, anon, authenticated;
grant select on coupons to authenticated;
grant insert (store_id, code, kind, value, min_total, max_uses, expires_at, active)
  on coupons to authenticated;
grant update (code, kind, value, min_total, max_uses, expires_at, active, deleted_at)
  on coupons to authenticated;
grant all on coupons to service_role;

comment on table coupons is 'קודי קופון לחנות. נבדקים בשרת בלבד; הקונה לא קוראת את הטבלה.';

-- ── ההזמנה זוכרת את הקופון ──
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount    numeric(10,2);
alter table orders add column if not exists subtotal    numeric(10,2);

comment on column orders.coupon_code is 'הקוד שהוחל, כפי שהיה ברגע ההזמנה.';
comment on column orders.discount is 'ההנחה בשקלים. total = subtotal - discount.';
comment on column orders.subtotal is 'סכום המוצרים לפני הנחה. null בהזמנות בלי קופון.';

-- ── place_order v10 ──
-- כמו v9, ועוד קופון. השרת כבר בדק תוקף ומינימום וחישב את ההנחה; כאן
-- רק "תופסים" שימוש, אטומית. אם הקופון נגמר ברגע האחרון — exception,
-- וההזמנה לא נוצרת (השרת מחזיר לקונה הודעה ברורה).
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
  p_ship_details jsonb,
  p_coupon_id uuid,
  p_coupon_code text,
  p_discount numeric,
  p_subtotal numeric
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));

  if p_coupon_id is not null then
    update coupons
       set used_count = used_count + 1
     where id = p_coupon_id
       and store_id = p_store
       and active
       and deleted_at is null
       and (max_uses is null or used_count < max_uses)
       and (expires_at is null or expires_at > now());
    if not found then
      raise exception 'coupon_unavailable';
    end if;
  end if;

  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name,
                      ship_address, ship_city, pay_method, wants_shipping, ship_details,
                      coupon_code, discount, subtotal)
    values (p_store, n, p_items, round(p_total, 2), p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''),
            nullif(btrim(p_ship_address), ''), nullif(btrim(p_ship_city), ''),
            nullif(btrim(p_pay_method), ''), p_wants_shipping, p_ship_details,
            case when p_coupon_id is not null then p_coupon_code end,
            case when p_coupon_id is not null then round(p_discount, 2) end,
            case when p_coupon_id is not null then round(p_subtotal, 2) end);
  return n;
end $$;

-- הלקח מ-0040/0051: פונקציה חדשה נולדת עם execute ל-PUBLIC
revoke execute on function
  place_order(uuid, jsonb, numeric, text, text, text, text, text, text, text, boolean, jsonb, uuid, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function
  place_order(uuid, jsonb, numeric, text, text, text, text, text, text, text, boolean, jsonb, uuid, text, numeric, numeric)
  to service_role;

notify pgrst, 'reload schema';
