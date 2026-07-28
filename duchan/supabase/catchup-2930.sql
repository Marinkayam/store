-- ═══════════════════════════════════════════════════════════════
--  דוכן — שתי המיגרציות האחרונות בלבד (0029 + 0030)
--
--  להדביק ב-Supabase → SQL Editor → Run.
--  קצר בהרבה מ-catchup.sql, ומיועד לדאטהבייס שכבר קיבל את כל השאר.
--
--  אם חסרות מיגרציות קודמות, הקובץ עוצר עם הודעה ברורה ולא מחיל
--  כלום — הכל בטרנזקציה אחת. במקרה כזה מריצים את catchup.sql המלא.
--
--  נוצר אוטומטית — אין לערוך ביד.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── בדיקת תנאי מקדים ──
do $$ begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'squish_trade_proposals'
  ) then
    raise exception
      'חסרות מיגרציות קודמות. צריך להריץ את supabase/catchup.sql המלא במקום הקובץ הזה.';
  end if;
end $$;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 0029_buyer_name.sql
-- ───────────────────────────────────────────────────────────────

-- 0029 — למי שייכת ההזמנה.
--
-- הבעיה שזה פותר: כרטיס ההזמנה היה אנונימי. המפתח היחיד שקישר בין
-- הדשבורד לשיחות בוואטסאפ היה מספר ההזמנה, והוא ישב בשורה האחרונה של
-- ההודעה. עם ארבעים הזמנות, "מי זו #7?" הפך לפתיחת צ'אט אחרי צ'אט.
--
-- שם פרטי בלבד, ובלי שם משפחה, בלי כתובת ובלי גיל — בדיוק כמו בכל
-- שאר המוצר. הוא לא מוחזר בקריאה הפומבית של החנות, ומוגן באותו RLS
-- כמו שאר שדות ההזמנה.

alter table orders add column if not exists buyer_name text;

comment on column orders.buyer_name is
  'שם פרטי של הקונה. מה שמאפשר לקשר בין ההזמנה לשיחה בוואטסאפ.';

/**
 * גרסה שביעית של place_order.
 *
 * p_buyer_name **בלי ברירת מחדל** בכוונה: כך קריאה עם שישה ארגומנטים
 * לא יכולה להתאים גם לחתימה הזו וגם לקודמת, ואין אי-בהירות בבחירת
 * הפונקציה. השרת מנסה מהחתימה החדשה לישנה, כדי שדאטהבייס שעוד לא
 * קיבל את המיגרציה ימשיך לקבל הזמנות.
 */
create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text,
  p_buyer_name text
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name)
    values (p_store, n, p_items, p_total, p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''));
  return n;
end $$;

insert into schema_migrations (name) values ('0029_buyer_name.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0030_squish_safety.sql
-- ───────────────────────────────────────────────────────────────

-- 0030 — סקוויש קלאב: בטיחות, ניהול, והגנה מפני שימוש לרעה.
--
-- עד כאן נבנתה היכולת לבצע טרייד. המיגרציה הזו לא מוסיפה יכולת חדשה —
-- היא הופכת את מה שקיים לבטוח מספיק בשביל ילדות אמיתיות.
--
-- ארבעה עקרונות:
--
-- 1. **חסימה גוברת על הכל.** מי שחסמה ומי שנחסמה לא רואות זו את זו
--    בשום מסך, ולא יכולות לפתוח, לאשר או להשלים טרייד. זה נאכף בתוך
--    squish_can_view ובתוך כל פונקציית טרייד, לא בסינון בממשק.
-- 2. **חשבון מושהה נעלם, לא נמחק.** הוא יוצא מכל המסכים של כולן,
--    והפעולות שלו נחסמות — אבל הדאטה נשמרת, כי השהיה היא החלטה של
--    מנהלת ואפשר לבטל אותה.
-- 3. **הגבלות קצב בפונקציה ולא בממשק.** ילדה שתפתח את הקונסולה לא
--    תעקוף אותן, וההודעה שהיא מקבלת בעברית ולא "429".
-- 4. **דיווח נשאר פרטי לנצח.** הצד המדווח עליו לא רואה אותו, לא את
--    התוכן ולא את העובדה שהוא קיים.

/* ══════════════════ 1. השהיית חשבון ══════════════════ */

alter table squish_profiles add column if not exists suspended_at     timestamptz;
alter table squish_profiles add column if not exists suspended_reason text;

comment on column squish_profiles.suspended_at is
  'חשבון מושהה יוצא מכל המסכים ולא יכול לפעול. הדאטה נשמרת.';

create index if not exists squish_profiles_suspended_idx
  on squish_profiles (suspended_at) where suspended_at is not null;

/* ══════════════════ 2. חסימה ══════════════════ */

create table if not exists squish_blocks (
  id               uuid primary key default gen_random_uuid(),
  blocker_user_id  uuid not null references auth.users(id) on delete cascade,
  blocked_user_id  uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists squish_blocks_blocked_idx on squish_blocks (blocked_user_id);

alter table squish_blocks enable row level security;

-- רואה ומנהלת רק את החסימות שלה. הנחסמת לא יודעת שהיא נחסמה.
drop policy if exists squish_own_blocks on squish_blocks;
create policy squish_own_blocks on squish_blocks
  for all using (blocker_user_id = auth.uid()) with check (blocker_user_id = auth.uid());

/** חסימה לכל כיוון מבטלת את הקשר. */
create or replace function squish_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squish_blocks
     where (blocker_user_id = p_a and blocked_user_id = p_b)
        or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$$;

/* ══════════════════ 3. הרשאת הצפייה, מחדש ══════════════════
   שלוש שכבות לפני כל השאר: חסימה, השהיה של הבעלים, והשהיה של הצופה.
   הן מקדימות את בדיקת המעגל בכוונה — אחרת מספיק היה להיות "חברה של
   חברה" כדי לעקוף חסימה. */

create or replace function squish_can_view(p_viewer uuid, p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_owner is null then false
    when p_viewer is not null and p_viewer <> p_owner
         and squish_is_blocked(p_viewer, p_owner) then false
    when exists (select 1 from squish_profiles s
                  where s.user_id = p_owner and s.suspended_at is not null) then false
    when p_viewer is not null
         and exists (select 1 from squish_profiles s
                      where s.user_id = p_viewer and s.suspended_at is not null) then false
    when p_viewer = p_owner then true
    else exists (
      select 1
      from squish_profiles pr
      where pr.user_id = p_owner
        and case pr.collection_visibility
          when 'private' then false
          when 'direct_friends' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'direct_friend'
          )
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

/* ══════════════════ 4. שליטה של המשתמשת ══════════════════ */

/**
 * חסימה: מבטלת את החיבור לשני הכיוונים, מבטלת טריידים פתוחים בין השתיים
 * ומשחררת את הפריטים ששמורים בהם. בלי זה, פריט של מי שנחסמה היה נשאר
 * נעול לנצח בטרייד שאי אפשר להשלים.
 */
create or replace function squish_block_user(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_prop record;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_other = v_me then raise exception 'cannot block yourself'; end if;

  insert into squish_blocks (blocker_user_id, blocked_user_id)
  values (v_me, p_other) on conflict do nothing;

  update squish_connections set status = 'blocked'
   where (user_id = v_me and connected_user_id = p_other)
      or (user_id = p_other and connected_user_id = v_me);

  -- כל טרייד חי בין השתיים נסגר, והשמירות חוזרות למצב שממנו הגיעו
  for v_prop in
    select id from squish_trade_proposals
     where status not in ('completed','declined','cancelled','reported')
       and ((sender_user_id = v_me and receiver_user_id = p_other)
         or (sender_user_id = p_other and receiver_user_id = v_me))
  loop
    update squish_items
       set trade_status = coalesce(
             pre_reserve_status,
             case when id = (select requested_item_id from squish_trade_proposals where id = v_prop.id)
                  then 'open_for_trade'::squish_trade_status
                  else 'keep'::squish_trade_status end),
           pre_reserve_status = null,
           reserved_by_proposal_id = null,
           updated_at = now()
     where reserved_by_proposal_id = v_prop.id;

    update squish_trade_proposals
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'blocked', updated_at = now()
     where id = v_prop.id;
  end loop;

  -- "מעניין אותי" הדדי נמחק: הוא רמז על פריטים שכבר לא אמורים להיראות
  delete from squish_interests i using squish_items it
   where i.item_id = it.id
     and ((i.user_id = v_me and it.owner_user_id = p_other)
       or (i.user_id = p_other and it.owner_user_id = v_me));
end $$;

create or replace function squish_unblock_user(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  delete from squish_blocks where blocker_user_id = v_me and blocked_user_id = p_other;
  -- החיבור *לא* חוזר לבד. אם הן רוצות להתחבר שוב, דרך קישור הזמנה.
end $$;

/** הסרת חברה מהמעגל — בלי חסימה, ולשני הכיוונים. */
create or replace function squish_remove_connection(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  delete from squish_connections
   where (user_id = v_me and connected_user_id = p_other)
      or (user_id = p_other and connected_user_id = v_me);
end $$;

/* ══════════════════ 5. דיווח על פריט ══════════════════ */

do $$ begin
  create type squish_report_state as enum ('open','reviewed','resolved');
exception when duplicate_object then null; end $$;

/* המדווחת יכולה למחוק את החשבון שלה, והדיווח חייב לשרוד בלעדיה: הוא
   רשומת מודרציה, לא רכוש פרטי שלה. בלי זה `on delete set null` שעל
   המפתח הזר סותר את ה-not null, והמחיקה נופלת. */
alter table squish_trade_reports alter column reported_by_user_id drop not null;

alter table squish_trade_reports add column if not exists state       squish_report_state not null default 'open';
alter table squish_trade_reports add column if not exists reviewed_at timestamptz;
alter table squish_trade_reports add column if not exists admin_note  text;

create table if not exists squish_item_reports (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references squish_items(id) on delete cascade,
  -- ניתן ל-null בכוונה: אחרי שהמדווחת מוחקת את החשבון, הדיווח נשאר
  -- למודרציה בלי הקשר אליה
  reporter_user_id  uuid references auth.users(id) on delete set null,
  reported_user_id  uuid not null references auth.users(id) on delete cascade,
  reason            text not null,
  details           text,
  state             squish_report_state not null default 'open',
  reviewed_at       timestamptz,
  admin_note        text,
  created_at        timestamptz not null default now()
);

create index if not exists squish_item_reports_state_idx on squish_item_reports (state, created_at desc);
create index if not exists squish_item_reports_user_idx  on squish_item_reports (reported_user_id);

alter table squish_item_reports enable row level security;

-- **רק המדווחת רואה את השורה שלה.** אין policy שנותן למדווח-עליו לראות
-- שדווח, ואין policy שנותן לו לראות את הסיבה.
drop policy if exists squish_item_report_mine on squish_item_reports;
create policy squish_item_report_mine on squish_item_reports
  for all using (reporter_user_id = auth.uid()) with check (reporter_user_id = auth.uid());

/* ══════════════════ 6. הגבלות קצב והתנהגות ══════════════════ */

/** כמה הצעות בשעה, וכמה הזמנות בשעה. מספרים נדיבים לילדה, צרים לספאם. */
create or replace function squish_rate_ok(p_user uuid, p_what text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_what
    when 'proposal' then (
      select count(*) from squish_trade_proposals
       where sender_user_id = p_user and created_at > now() - interval '1 hour'
    ) < 10
    when 'invite' then (
      select count(*) from squish_invites
       where inviter_user_id = p_user and created_at > now() - interval '1 hour'
    ) < 10
    else true
  end;
$$;

/* קישור הזמנה נוצר ב-insert ישיר מהדפדפן, ולכן ההגבלה חייבת לשבת
   בטריגר: בדיקה בממשק היא בקשה, לא כלל. */
create or replace function squish_invite_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from squish_profiles
     where user_id = new.inviter_user_id and suspended_at is not null
  ) then
    raise exception 'account suspended';
  end if;
  if not squish_rate_ok(new.inviter_user_id, 'invite') then
    raise exception 'too many invites';
  end if;
  return new;
end $$;

drop trigger if exists squish_invite_rate on squish_invites;
create trigger squish_invite_rate
  before insert on squish_invites
  for each row execute function squish_invite_guard();

/* ══════════════════ 7. שליחת הצעה, עם כל השכבות ══════════════════ */

create or replace function squish_send_proposal(p_requested uuid, p_offered uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_owner    uuid;
  v_prop     uuid;
  v_version  uuid;
  v_item     uuid;
  v_ctx      text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_offered is null or array_length(p_offered, 1) is null then
    raise exception 'offer at least one item';
  end if;
  if array_length(p_offered, 1) > 3 then raise exception 'at most three items'; end if;

  if exists (select 1 from squish_profiles where user_id = v_me and suspended_at is not null) then
    raise exception 'account suspended';
  end if;

  select owner_user_id into v_owner from squish_items
   where id = p_requested and deleted_at is null and trade_status = 'open_for_trade';
  if v_owner is null then raise exception 'item not open for trade'; end if;
  if v_owner = v_me then raise exception 'cannot trade with yourself'; end if;

  if squish_is_blocked(v_me, v_owner) then raise exception 'blocked'; end if;
  if exists (select 1 from squish_profiles where user_id = v_owner and suspended_at is not null) then
    raise exception 'item not open for trade';
  end if;

  -- ההרשאה החברתית היא אותה הרשאה של הצפייה. אין דרך אחרת להגיע לפריט.
  if not squish_can_view(v_me, v_owner) then raise exception 'not in circle'; end if;

  -- שלושה פריטים פעילים לפחות, אחרת אין ממה להציע
  if squish_item_count(v_me) < 3 then raise exception 'need three items'; end if;

  if not squish_rate_ok(v_me, 'proposal') then raise exception 'too many proposals'; end if;

  -- הצעה פעילה אחת לכל פריט מבוקש בין אותן שתיים. שתי הצעות מקבילות על
  -- אותו סקווישי הן רק בלבול, ומי שמקבלת לא יודעת על מה היא עונה.
  if exists (
    select 1 from squish_trade_proposals
     where sender_user_id = v_me and receiver_user_id = v_owner
       and requested_item_id = p_requested
       and status not in ('completed','declined','cancelled','reported')
  ) then
    raise exception 'duplicate proposal';
  end if;

  -- אחרי "לא הפעם" מחכים. הצעה חוזרת מיד היא נדנוד, לא משא ומתן.
  if exists (
    select 1 from squish_trade_proposals
     where sender_user_id = v_me and receiver_user_id = v_owner
       and requested_item_id = p_requested
       and status = 'declined'
       and updated_at > now() - interval '24 hours'
  ) then
    raise exception 'recently declined';
  end if;

  select case
    when exists (select 1 from squish_connections c
                  where c.user_id = v_me and c.connected_user_id = v_owner
                    and c.status = 'active' and c.connection_type = 'direct_friend')
    then 'חברה שלך'
    else 'חברה של חברה'
  end into v_ctx;

  insert into squish_trade_proposals (sender_user_id, receiver_user_id, requested_item_id, status, connection_context)
  values (v_me, v_owner, p_requested, 'sent', v_ctx)
  returning id into v_prop;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (v_prop, v_me, 1, p_requested)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, p_requested, v_owner, 'requested');

  foreach v_item in array p_offered loop
    if not exists (
      select 1 from squish_items
       where id = v_item and owner_user_id = v_me and deleted_at is null
         and duchan_product_id is null
         and trade_status not in ('reserved','traded','moved_to_duchan')
    ) then
      raise exception 'offered item unavailable';
    end if;
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_me, 'offered');
  end loop;

  -- השולחת מאשרת את הגרסה שהיא עצמה יצרה
  update squish_trade_proposals
     set current_version_id = v_version,
         accepted_by_sender_at = now(),
         updated_at = now()
   where id = v_prop;

  return v_prop;
end $$;

/* ══════════════════ 8. חסימה והשהיה עוצרות גם באמצע ══════════════════
   שתיים יכולות להיות באמצע טרייד כשאחת נחסמת או מושהית. במקום לשכפל
   את הבדיקה לתוך כל פונקציה — ולשכוח אותה בפונקציה הבאה שתיכתב — היא
   יושבת בטריגר על הטבלה עצמה.

   מצבים סופיים תמיד עוברים: הם הדרך *החוצה* מטרייד תקוע, ולחסום אותם
   היה כולא את שני הצדדים בפנים. */

create or replace function squish_trade_progress_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled','declined','reported','completed') then
    return new;
  end if;

  if (new.status is distinct from old.status)
     or (new.accepted_by_sender_at   is distinct from old.accepted_by_sender_at)
     or (new.accepted_by_receiver_at is distinct from old.accepted_by_receiver_at)
     or (new.current_version_id      is distinct from old.current_version_id)
     or (new.reserved_at             is distinct from old.reserved_at)
  then
    if squish_is_blocked(new.sender_user_id, new.receiver_user_id) then
      raise exception 'blocked';
    end if;
    if exists (
      select 1 from squish_profiles
       where user_id in (new.sender_user_id, new.receiver_user_id)
         and suspended_at is not null
    ) then
      raise exception 'account suspended';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists squish_trade_progress on squish_trade_proposals;
create trigger squish_trade_progress
  before update on squish_trade_proposals
  for each row execute function squish_trade_progress_guard();

/* ══════════════════ 9. פעולות מנהלת ══════════════════ */

create table if not exists squish_admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_label  text not null,
  action       text not null,
  target_user  uuid references auth.users(id) on delete set null,
  target_id    uuid,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists squish_admin_actions_idx on squish_admin_actions (created_at desc);

alter table squish_admin_actions enable row level security;
-- אין policy: רק service_role (שעוקף RLS) נוגע בטבלה הזו.

/** השהיה ושחזור. p_admin הוא תווית לתיעוד, לא הרשאה — ההרשאה היא
    בעצם היכולת לקרוא לפונקציה, שניתנת ל-service_role בלבד. */
create or replace function squish_admin_suspend(p_user uuid, p_reason text, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update squish_profiles
     set suspended_at = now(), suspended_reason = p_reason, updated_at = now()
   where user_id = p_user;
  insert into squish_admin_actions (admin_label, action, target_user, note)
  values (coalesce(p_admin, 'admin'), 'suspend', p_user, p_reason);
end $$;

create or replace function squish_admin_restore(p_user uuid, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update squish_profiles
     set suspended_at = null, suspended_reason = null, updated_at = now()
   where user_id = p_user;
  insert into squish_admin_actions (admin_label, action, target_user)
  values (coalesce(p_admin, 'admin'), 'restore', p_user);
end $$;

/**
 * ביטול טרייד על ידי מנהלת, ושחרור השמירות.
 *
 * משתמש באותו pre_reserve_status כמו ביטול רגיל: פריט חוזר בדיוק למצב
 * שממנו הגיע. מנהלת שמשחררת טרייד תקוע לא אמורה להפוך פריט פרטי לפתוח
 * לטרייד בטעות.
 */
create or replace function squish_admin_cancel_trade(p_proposal uuid, p_note text, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;

  update squish_items
     set trade_status = coalesce(
           pre_reserve_status,
           case when id = v_prop.requested_item_id
                then 'open_for_trade'::squish_trade_status
                else 'keep'::squish_trade_status end),
         pre_reserve_status = null,
         reserved_by_proposal_id = null,
         updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = 'admin', updated_at = now()
   where id = p_proposal;

  insert into squish_admin_actions (admin_label, action, target_id, note)
  values (coalesce(p_admin, 'admin'), 'cancel_trade', p_proposal, p_note);
end $$;

/* ══════════════════ 10. מחיקת אוסף וחשבון ══════════════════
   מחיקה אמיתית של הדאטה של הילדה, אבל *לא* של דיווחים שאחרות הגישו
   עליה: דיווח הוא רשומה של מי שדיווחה, ומחיקה עצמית לא אמורה לנקות
   היסטוריית מודרציה. במקום זה השורה נשמרת בלי קשר לחשבון שנמחק. */

create or replace function squish_delete_profile()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_prop record;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  -- כל טרייד חי נסגר קודם, אחרת פריטים של אחרות נשארים נעולים
  for v_prop in
    select id, requested_item_id from squish_trade_proposals
     where status not in ('completed','declined','cancelled','reported')
       and (sender_user_id = v_me or receiver_user_id = v_me)
  loop
    update squish_items
       set trade_status = coalesce(
             pre_reserve_status,
             case when id = v_prop.requested_item_id
                  then 'open_for_trade'::squish_trade_status
                  else 'keep'::squish_trade_status end),
           pre_reserve_status = null,
           reserved_by_proposal_id = null,
           updated_at = now()
     where reserved_by_proposal_id = v_prop.id;

    update squish_trade_proposals
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'account_deleted', updated_at = now()
     where id = v_prop.id;
  end loop;

  delete from squish_interests where user_id = v_me;
  delete from squish_interests i using squish_items it
   where i.item_id = it.id and it.owner_user_id = v_me;
  delete from squish_wishlist where owner_user_id = v_me;
  delete from squish_blocks where blocker_user_id = v_me or blocked_user_id = v_me;
  delete from squish_connections where user_id = v_me or connected_user_id = v_me;
  delete from squish_invites where inviter_user_id = v_me;

  -- דיווחים *שהיא* הגישה מאבדים את הקשר אליה, ונשארים למודרציה
  update squish_item_reports  set reporter_user_id = null where reporter_user_id = v_me;
  update squish_trade_reports set reported_by_user_id = null where reported_by_user_id = v_me;

  delete from squish_items where owner_user_id = v_me;
  delete from squish_profiles where user_id = v_me;
  -- חשבון ה-auth עצמו נשאר: הוא משותף עם דוכן.
end $$;

/* ══════════════════ 11. משוב מהפיילוט ══════════════════ */

create table if not exists squish_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  moment      text not null,
  choice      text not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, moment)
);

alter table squish_feedback enable row level security;

drop policy if exists squish_own_feedback on squish_feedback;
create policy squish_own_feedback on squish_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/* ══════════════════ 12. אישור הורה חד-פעמי (מאחורי דגל) ══════════════════
   לא בקרת הורים ולא דשבורד. רק הוכחה שההורה קיבל את המידע ואישר, עם
   גרסת הנוסח שהוצג לו — כדי שאם הנוסח ישתנה, יהיה ברור על מה חתמו. */

create table if not exists squish_parent_approvals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  token          text unique not null,
  parent_phone   text not null,
  copy_version   text not null,
  sent_at        timestamptz not null default now(),
  decided_at     timestamptz,
  approved       boolean,
  created_at     timestamptz not null default now()
);

create index if not exists squish_parent_approvals_user_idx on squish_parent_approvals (user_id, created_at desc);

alter table squish_parent_approvals enable row level security;

-- הילדה רואה שנשלח ומה הוחלט, ולא יכולה להחליט בשם ההורה:
-- ההחלטה נכתבת בשרת דרך הטוקן, לא מהדפדפן שלה.
drop policy if exists squish_own_parent_approval on squish_parent_approvals;
create policy squish_own_parent_approval on squish_parent_approvals
  for select using (user_id = auth.uid());

/* ══════════════════ 13. הרשאות ══════════════════ */

do $$ begin
  grant all on squish_blocks, squish_item_reports, squish_feedback,
                squish_parent_approvals, squish_admin_actions to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_blocks to authenticated;
  grant select, insert on squish_item_reports to authenticated;
  grant select, insert, update on squish_feedback to authenticated;
  grant select on squish_parent_approvals to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_is_blocked(uuid, uuid)        to authenticated, service_role;
  grant execute on function squish_block_user(uuid)              to authenticated;
  grant execute on function squish_unblock_user(uuid)            to authenticated;
  grant execute on function squish_remove_connection(uuid)       to authenticated;
  grant execute on function squish_delete_profile()              to authenticated;
  grant execute on function squish_rate_ok(uuid, text)           to authenticated, service_role;
exception when undefined_object then null; end $$;

-- פעולות מנהלת: service_role בלבד. הן לא נגישות למשתמשת מחוברת.
do $$ begin
  revoke execute on function squish_admin_suspend(uuid, text, text)     from authenticated, anon;
  revoke execute on function squish_admin_restore(uuid, text)           from authenticated, anon;
  revoke execute on function squish_admin_cancel_trade(uuid, text, text) from authenticated, anon;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_admin_suspend(uuid, text, text)      to service_role;
  grant execute on function squish_admin_restore(uuid, text)            to service_role;
  grant execute on function squish_admin_cancel_trade(uuid, text, text) to service_role;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0030_squish_safety.sql') on conflict do nothing;

commit;

-- אחרי ההרצה, בהרצה נפרדת:
-- notify pgrst, 'reload schema';
