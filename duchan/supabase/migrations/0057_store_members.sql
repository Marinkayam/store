-- 0057 — דוכן משותף: ראש דוכן + שותפים.
--
-- ראש הדוכן נשאר stores.owner_id, כמו תמיד. כך כל מה שכבר בודק owner_id
-- (תשלום ההפעלה, אישור ההורים) נשאר של ראש הדוכן בלי לגעת בו.
-- השותפים יושבים בטבלה חדשה, ומקבלים גישה דרך policies *נוספות* — שום
-- policy קיימת לא נמחקת ולא משתנה.
--
-- מה שותף לא יכול, וזה נאכף כאן ולא רק במסך:
--   • לשנות את טלפון ההזמנות, פרטי ההורה, פרטי התשלום, הבעלות או ה-slug
--     (טריגר guard_store_member_update — רשימה *מותרת*, לא רשימה אסורה:
--     עמודה חדשה שתתווסף בעתיד מוגנת מעצמה)
--   • להזמין / להוציא שותפים או להעביר ראשות (רק דרך /api/team, בשרת)
--
-- הכל מוסיף בלבד (CLAUDE.md §9).

create table if not exists store_members (
  store_id          uuid not null references stores(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  phone             text not null,             -- E.164 בלי +, המספר שהוזמן ואומת בסמס
  parent_consent_at timestamptz,               -- "ההורים שלי יודעים ומאשרים" בהצטרפות
  joined_at         timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index if not exists store_members_user on store_members (user_id);

create table if not exists store_invites (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  phone        text not null,                  -- רק המספר הזה יכול להצטרף
  token        text not null unique,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid,
  cancelled_at timestamptz
);
-- הזמנה פתוחה אחת לכל מספר בכל דוכן
create unique index if not exists store_invites_open
  on store_invites (store_id, phone) where accepted_at is null and cancelled_at is null;

-- העברת ראשות: ראש הדוכן מבקש, השותף מאשר. עד האישור שום דבר לא משתנה.
alter table stores add column if not exists transfer_to uuid;
alter table stores add column if not exists transfer_requested_at timestamptz;

comment on table store_members is 'שותפים בדוכן. ראש הדוכן הוא stores.owner_id ולא שורה כאן.';
comment on table store_invites is 'הזמנות לשותפות. נכתבות ונקראות בשרת בלבד (/api/team).';

-- ── מי מנהל את הדוכן ──
-- security definer: נקרא מתוך policies, ולכן חייב לעקוף את ה-RLS של
-- store_members (אחרת policy שקוראת לעצמה = רקורסיה).
create or replace function is_store_member(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members m where m.store_id = p_store and m.user_id = auth.uid());
$$;

create or replace function can_manage_store(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stores s where s.id = p_store and s.owner_id = auth.uid())
      or exists (select 1 from store_members m where m.store_id = p_store and m.user_id = auth.uid());
$$;

-- ── RLS ──
alter table store_members enable row level security;
alter table store_invites enable row level security;

revoke all on store_members from public, anon, authenticated;
revoke all on store_invites from public, anon, authenticated;
grant select on store_members to authenticated;          -- רק קריאה; כתיבה רק בשרת
grant all on store_members to service_role;
grant all on store_invites to service_role;

drop policy if exists team_members_read on store_members;
create policy team_members_read on store_members
  for select using (can_manage_store(store_id));

-- policies נוספות לשותפים. ה-own_* הקיימות ממשיכות לעבוד לראש הדוכן.
drop policy if exists member_store_read on stores;
create policy member_store_read on stores
  for select using (is_store_member(id));
drop policy if exists member_store_update on stores;
create policy member_store_update on stores
  for update using (is_store_member(id)) with check (is_store_member(id));

drop policy if exists member_products on products;
create policy member_products on products
  for all using (is_store_member(store_id)) with check (is_store_member(store_id));

-- הזמנות: לראות ולעדכן סטטוס/הערה. לא ליצור ולא למחוק.
drop policy if exists member_orders_read on orders;
create policy member_orders_read on orders
  for select using (is_store_member(store_id));
drop policy if exists member_orders_update on orders;
create policy member_orders_update on orders
  for update using (is_store_member(store_id)) with check (is_store_member(store_id));

drop policy if exists member_coupons on coupons;
create policy member_coupons on coupons
  for all using (is_store_member(store_id)) with check (is_store_member(store_id));

-- ── מה שותף רשאי לשנות בדוכן ──
-- רשימה מותרת: עיצוב, תוכן, משלוח, מבצע, קטגוריות, ופתוח/הפסקה.
-- כל השאר (טלפון ההזמנות, הורה, תשלום, בעלות, slug, מכסות, העברת ראשות)
-- רק לראש הדוכן או לשרת.
create or replace function guard_store_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array[
    'display_name','emoji','tagline','theme','cover_key','cover_preset','avatar_key',
    'about','city','ships','shipping_note','shipping_price','order_intro','order_outro',
    'promo_on','promo_title','promo_text','categories','look','bg_pattern','bg_key',
    'category_layout','category_size','category_meta','featured_title','show_sold_out','status'
  ];
begin
  -- השרת (service role) — אין auth.uid()
  if auth.uid() is null then
    return new;
  end if;

  -- הבעלות וההעברה לא משתנות מהדפדפן לעולם — גם לא של ראש הדוכן.
  -- רק /api/team (שרת) מעביר ראשות.
  if new.owner_id is distinct from old.owner_id
     or new.transfer_to is distinct from old.transfer_to
     or new.transfer_requested_at is distinct from old.transfer_requested_at then
    raise exception 'not_allowed: ownership';
  end if;

  -- "חסום" נקבע רק מהחמ"ל. פתוח ↔ הפסקה — כן.
  if new.status is distinct from old.status
     and (old.status = 'blocked' or new.status = 'blocked') then
    raise exception 'not_allowed: blocked';
  end if;

  if old.owner_id = auth.uid() then
    return new;            -- ראש הדוכן
  end if;

  -- שותף: כל שינוי מחוץ לרשימה המותרת נדחה
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'not_allowed: partner';
  end if;
  return new;
end $$;

drop trigger if exists stores_guard_member on stores;
create trigger stores_guard_member
  before update on stores
  for each row execute function guard_store_member_update();

-- ── סימון "שולם" וביטול — גם לשותפים ──
-- אותן פונקציות (0001, 0003), רק שבדיקת הבעלות מקבלת גם שותף.
create or replace function mark_order_paid(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
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
    update products
       set stock = greatest(0, stock - (it->>'qty')::int)
     where store_id = o.store_id
       and name = it->>'name'
       and track_stock;
  end loop;
end $$;

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

  if not can_manage_store(o.store_id) then
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

-- ── העברת ראשות — אטומית, שרת בלבד ──
-- ראש הדוכן הישן הופך לשותף, החדש יוצא מטבלת השותפים ונהיה owner_id.
create or replace function team_accept_transfer(p_store uuid, p_user uuid, p_old_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select * into s from stores where id = p_store for update;
  if s is null or s.transfer_to is distinct from p_user then
    raise exception 'no_transfer';
  end if;
  if not exists (select 1 from store_members where store_id = p_store and user_id = p_user) then
    raise exception 'not_member';
  end if;

  delete from store_members where store_id = p_store and user_id = p_user;
  insert into store_members (store_id, user_id, phone, parent_consent_at)
    values (p_store, s.owner_id, p_old_phone, s.parent_consent_at)
    on conflict (store_id, user_id) do nothing;
  update stores
     set owner_id = p_user, transfer_to = null, transfer_requested_at = null
   where id = p_store;
end $$;

revoke execute on function team_accept_transfer(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function team_accept_transfer(uuid, uuid, text) to service_role;
grant  execute on function is_store_member(uuid) to authenticated, anon;
grant  execute on function can_manage_store(uuid) to authenticated, anon;

-- ── עד 2 שותפים — גם כששתי הצטרפויות קורות באותו רגע ──
-- /api/team בודק את זה, אבל הבדיקה שם והכתיבה הן שתי פעולות. כאן זה אטומי:
-- נועלים את שורת הדוכן ואז סופרים.
create or replace function guard_store_members_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from stores where id = new.store_id for update;
  if (select count(*) from store_members where store_id = new.store_id) >= 2 then
    raise exception 'team_full';
  end if;
  return new;
end $$;

drop trigger if exists store_members_cap on store_members;
create trigger store_members_cap
  before insert on store_members
  for each row execute function guard_store_members_cap();
