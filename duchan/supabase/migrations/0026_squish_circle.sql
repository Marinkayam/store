-- 0026 — סקוויש קלאב: פרופיל בסגנון דוכן, מעגל חברות אמיתי, ו"מעניין אותי".
--
-- שלושה דברים:
-- 1. לפרופיל האוסף יש עכשיו קאבר, תמונת פרופיל, כותרת ותיאור — בדיוק
--    כמו לדוכן. אותם טוקנים, אותה הרגשה.
-- 2. הצטרפות דרך קישור הזמנה יוצרת חיבור *דו-כיווני*. זה חייב לרוץ
--    בפונקציה עם הרשאות: המצטרפת לא יכולה לכתוב שורה שבה user_id הוא
--    המזמינה, וזה נכון — אחרת כל אחת הייתה יכולה להוסיף את עצמה למעגל
--    של מישהי אחרת.
-- 3. "מעניין אותי" נשמר כשורה, ולא כהודעה. הבעלים רואה כמה התעניינו,
--    וזה הבסיס ל"התאמות" בשלב הבא.

/* ── פרופיל בסגנון דוכן ── */

alter table squish_profiles add column if not exists emoji      text not null default '🧸';
alter table squish_profiles add column if not exists avatar_key text;
alter table squish_profiles add column if not exists cover_key  text;
alter table squish_profiles add column if not exists about      text;

comment on column squish_profiles.about is 'כמה מילים על האוסף. מוצג מתחת לכותרת.';

/* ── "מעניין אותי" ── */

create table if not exists squish_interests (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references squish_items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (item_id, user_id)
);

create index if not exists squish_interests_item_idx on squish_interests (item_id);
create index if not exists squish_interests_user_idx on squish_interests (user_id, created_at desc);

alter table squish_interests enable row level security;

-- המתעניינת רואה ומוחקת את השורות שלה; הבעלים רואה מי התעניין בפריט שלו
drop policy if exists squish_own_interests on squish_interests;
create policy squish_own_interests on squish_interests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists squish_owner_sees_interests on squish_interests;
create policy squish_owner_sees_interests on squish_interests
  for select using (
    exists (select 1 from squish_items i
             where i.id = item_id and i.owner_user_id = auth.uid())
  );

/* ── הצטרפות למעגל דרך קישור הזמנה ──
   security definer בכוונה: החיבור ההופכי נכתב בשם המזמינה, ואי אפשר
   לתת ללקוח את ההרשאה הזו. הפונקציה מאמתת את הקוד, ולא סומכת על שום
   ערך שהגיע מהדפדפן חוץ מהקוד עצמו. */

create or replace function squish_join(p_code text)
returns table (inviter_user_id uuid, nickname text, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_me      uuid := auth.uid();
  v_nick    text;
  v_exists  boolean;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select i.inviter_user_id into v_inviter
    from squish_invites i where i.code = p_code;

  if v_inviter is null then
    raise exception 'invite not found';
  end if;
  if v_inviter = v_me then
    raise exception 'cannot join your own circle';
  end if;

  select p.nickname into v_nick from squish_profiles p where p.user_id = v_inviter;

  select exists (
    select 1 from squish_connections c
    where c.user_id = v_me and c.connected_user_id = v_inviter and c.status = 'active'
  ) into v_exists;

  -- חיבור דו-כיווני: שתיהן רואות אחת את השנייה
  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_me, v_inviter, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend';

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_inviter, v_me, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend';

  update squish_invites
     set joined_user_id = coalesce(joined_user_id, v_me),
         joined_at = coalesce(joined_at, now())
   where code = p_code;

  return query select v_inviter, v_nick, v_exists;
end $$;

/* הפניה נחשבת מוצלחת רק כשיש אוסף אמיתי: הצטרפה, שלושה פריטים,
   ולפחות אחד פתוח לטרייד. לחיצה על קישור לבדה לא נחשבת. */
create or replace function squish_mark_activated()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  if squish_item_count(v_me) < 3 then return; end if;
  if not exists (
    select 1 from squish_items
     where owner_user_id = v_me and deleted_at is null and trade_status = 'open_for_trade'
  ) then return; end if;

  update squish_invites
     set activated_at = coalesce(activated_at, now())
   where joined_user_id = v_me;
end $$;

/* ספירת לחיצות על קישור הזמנה. נקראת מהשרת, בלי אימות. */
create or replace function squish_invite_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update squish_invites set clicks = clicks + 1 where code = p_code;
$$;

/* ── הרשאות ── */

do $$ begin
  grant all on squish_interests to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_interests to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_join(text) to authenticated;
  grant execute on function squish_mark_activated() to authenticated;
  grant execute on function squish_invite_click(text) to anon, authenticated, service_role;
exception when undefined_object then null; end $$;
