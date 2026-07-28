-- 0027 — האוסף הוא המוצר, לא הפרופיל.
--
-- מה שהופך מדף לאוסף זה לא קאבר ואוואטר. זה שם לאוסף, סקווישי אהוב,
-- רשימת מבוקשים, ומה שיש בפנים לפי סוג. אלה הדברים שילדה מדברת עליהם
-- עם חברה.
--
-- מה שבמפורש *לא* כאן: נדירות מומצאת, אחוזי השלמה מול קטלוג שלא קיים,
-- ורצפים יומיים. תג או מספר שאי אפשר לגזור מהאוסף האמיתי לא נכנס.

/* ── שם לאוסף, וסקווישי אהוב ── */

alter table squish_items add column if not exists series text;
comment on column squish_items.series is
  'סדרה שהילדה הגדירה בעצמה, למשל "סדרת הממתקים". טקסט חופשי, לא קטלוג.';

create index if not exists squish_items_series_idx
  on squish_items (profile_id, series) where deleted_at is null and series is not null;

alter table squish_profiles
  add column if not exists favorite_item_id uuid references squish_items(id) on delete set null;
comment on column squish_profiles.favorite_item_id is
  'הסקווישי האהוב. אחד לאוסף, נעוץ בראש הגלריה.';

/**
 * האהוב חייב להיות פריט חי של אותה בעלים.
 *
 * on delete set null מטפל במחיקה קשה, אבל אצלנו מחיקה היא רכה
 * (deleted_at), ופריט יכול גם לעבור לדוכן או להיסחר. בכל אחד מהמצבים
 * האלה הסימון חייב להתנקות לבד — אחרת הגלריה נועצת בראש פריט שכבר לא
 * קיים.
 */
create or replace function squish_clear_stale_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null
     or new.trade_status in ('traded', 'moved_to_duchan') then
    update squish_profiles
       set favorite_item_id = null
     where favorite_item_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists squish_favorite_guard on squish_items;
create trigger squish_favorite_guard
  after update on squish_items
  for each row execute function squish_clear_stale_favorite();

/* ── רשימת המבוקשים של האוסף ── */

create table if not exists squish_wishlist (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references squish_profiles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  squishy_type squish_type,
  color        text,
  description  text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists squish_wishlist_profile_idx
  on squish_wishlist (profile_id, sort_order);

alter table squish_wishlist enable row level security;

drop policy if exists squish_own_wishlist on squish_wishlist;
create policy squish_own_wishlist on squish_wishlist
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- הרשימה נראית למי שרשאית לראות את האוסף — אותו כלל בדיוק
drop policy if exists squish_view_permitted_wishlist on squish_wishlist;
create policy squish_view_permitted_wishlist on squish_wishlist
  for select using (squish_can_view(auth.uid(), owner_user_id));

/* ── הרשאות ── */

do $$ begin
  grant all on squish_wishlist to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_wishlist to authenticated;
exception when undefined_object then null; end $$;
