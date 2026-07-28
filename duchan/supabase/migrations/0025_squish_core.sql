-- 0025 — Squish Club, הליבה.
--
-- מועדון טרייד פרטי לאספניות סקווישים, שרץ על אותו חשבון, אותו אימות
-- ואותה תשתית מדיה כמו דוכן. אין כאן טבלת משתמשים חדשה: הכל תלוי
-- ב-auth.users הקיים, בדיוק כמו stores.
--
-- שלושה כללי בטיחות שמעוגנים כאן ולא רק בממשק:
-- 1. קוד האוסף אקראי ולא ניתן לניחוש, בדיוק כמו slug של חנות.
-- 2. אין עמודת כתובת, בית ספר, כיתה, שם מלא או גיל מדויק. עיר כללית בלבד.
-- 3. ברירת המחדל לצפייה היא direct_friends. קישור לבדו לא חושף אוסף.

/* ── טיפוסים ── */

do $$ begin
  create type squish_type as enum (
    'needoh','water','sand','ice','bubble_blowing','eye_popping','taba','clay','foam','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_size as enum ('small','medium','large','huge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_condition as enum ('new','like_new','good','used','flawed');
exception when duplicate_object then null; end $$;

-- keep / open_for_trade / maybe_trade הן בחירה של הבעלים.
-- reserved / traded / moved_to_duchan נקבעות על ידי המערכת.
do $$ begin
  create type squish_trade_status as enum (
    'keep','open_for_trade','maybe_trade','reserved','traded','moved_to_duchan'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_visibility as enum ('private','direct_friends','extended_circle','group_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_connection_type as enum ('direct_friend','friend_of_friend','group_member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_connection_status as enum ('pending','active','blocked');
exception when duplicate_object then null; end $$;

/* ── פרופיל האוסף ── */

create table if not exists squish_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  nickname                    text not null,
  general_city                text,
  collection_title            text,
  collection_code             text unique not null,
  collection_visibility       squish_visibility not null default 'direct_friends',
  theme                       text not null default 'cloud',
  cover_preset                text,
  parent_awareness_at         timestamptz,
  parent_awareness_version    text,
  media_bytes                 bigint not null default 0,
  completed_trades            int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (user_id)
);

comment on column squish_profiles.collection_code is 'קוד אקראי לקישור. לא שם ולא כינוי.';
comment on column squish_profiles.general_city   is 'עיר כללית בלבד. לעולם לא כתובת, בית ספר או כיתה.';

/* ── פריטי האוסף ── */

create table if not exists squish_items (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  profile_id          uuid not null references squish_profiles(id) on delete cascade,
  name                text not null,
  squishy_type        squish_type not null default 'other',
  custom_type         text,
  size                squish_size not null default 'medium',
  condition           squish_condition not null default 'good',
  condition_note      text,
  trade_status        squish_trade_status not null default 'keep',
  wanted_description  text,
  wanted_types        text[],
  wanted_colors       text[],
  image_key           text,
  video_key           text,
  poster_key          text,
  sort_order          int not null default 0,
  duchan_product_id   uuid references products(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists squish_items_profile_idx
  on squish_items (profile_id, sort_order) where deleted_at is null;
create index if not exists squish_items_owner_idx
  on squish_items (owner_user_id) where deleted_at is null;

/* ── מעגל החברות ── */

create table if not exists squish_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  connected_user_id   uuid not null references auth.users(id) on delete cascade,
  connection_type     squish_connection_type not null default 'direct_friend',
  invited_by_user_id  uuid references auth.users(id) on delete set null,
  status              squish_connection_status not null default 'active',
  created_at          timestamptz not null default now(),
  unique (user_id, connected_user_id),
  check (user_id <> connected_user_id)
);

create index if not exists squish_connections_user_idx on squish_connections (user_id, status);

create table if not exists squish_invites (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  inviter_user_id   uuid not null references auth.users(id) on delete cascade,
  clicks            int not null default 0,
  joined_user_id    uuid references auth.users(id) on delete set null,
  joined_at         timestamptz,
  activated_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists squish_invites_inviter_idx on squish_invites (inviter_user_id);

/* ── מי רשאית לראות אוסף של מי ──
   הפונקציה היא מקור האמת היחיד להרשאת צפייה, והיא נקראת גם מה-RLS וגם
   מהשרת. לעולם לא סומכים על ערך שהגיע מהלקוח. */

create or replace function squish_can_view(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_owner is null then false
    when p_viewer = p_owner then true
    else exists (
      select 1
      from squish_profiles pr
      where pr.user_id = p_owner
        and case pr.collection_visibility
          when 'private' then false
          -- חברה ישירה
          when 'direct_friends' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'direct_friend'
          )
          -- חברה ישירה, או חברה של חברה
          when 'extended_circle' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner and c.status = 'active'
          ) or exists (
            select 1
            from squish_connections a
            join squish_connections b on b.user_id = a.connected_user_id
            where a.user_id = p_viewer and a.status = 'active'
              and b.connected_user_id = p_owner and b.status = 'active'
          )
          -- קבוצות נבנות בשלב מאוחר יותר; עד אז רק חברות ישירות
          when 'group_only' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'group_member'
          )
          else false
        end
    )
  end;
$$;

/* ── RLS ── */

alter table squish_profiles    enable row level security;
alter table squish_items       enable row level security;
alter table squish_connections enable row level security;
alter table squish_invites     enable row level security;

drop policy if exists squish_own_profile on squish_profiles;
create policy squish_own_profile on squish_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- צפייה באוסף של אחרת נעשית דרך הפונקציה, ולא דרך ערך שהלקוח שולח
drop policy if exists squish_view_permitted_profile on squish_profiles;
create policy squish_view_permitted_profile on squish_profiles
  for select using (squish_can_view(auth.uid(), user_id));

drop policy if exists squish_own_items on squish_items;
create policy squish_own_items on squish_items
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists squish_view_permitted_items on squish_items;
create policy squish_view_permitted_items on squish_items
  for select using (deleted_at is null and squish_can_view(auth.uid(), owner_user_id));

drop policy if exists squish_own_connections on squish_connections;
create policy squish_own_connections on squish_connections
  for all using (user_id = auth.uid() or connected_user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists squish_own_invites on squish_invites;
create policy squish_own_invites on squish_invites
  for all using (inviter_user_id = auth.uid()) with check (inviter_user_id = auth.uid());

/* ── "לפחות שלושה פריטים" נאכף בשרת, לא רק במסך ── */

create or replace function squish_item_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from squish_items
   where owner_user_id = p_user and deleted_at is null
     and trade_status <> 'moved_to_duchan';
$$;

/* ── הרשאות ──
   לא מסתמכים על default privileges: טבלה חדשה בלי grant מחזירה
   "permission denied" ל-PostgREST, וזה נראה מבחוץ כמו RLS שחוסם. */

do $$ begin
  grant all on squish_profiles, squish_items, squish_connections, squish_invites to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete
    on squish_profiles, squish_items, squish_connections, squish_invites to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_can_view(uuid, uuid) to authenticated, anon, service_role;
  grant execute on function squish_item_count(uuid) to authenticated, service_role;
exception when undefined_object then null; end $$;
