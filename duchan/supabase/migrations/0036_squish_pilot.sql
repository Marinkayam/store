-- 0036 — חשבון פיילוט מלווה, ושער אישור הורה שבאמת עוצר.
--
-- **הרקע.** ילדה בת 8 מקבלת את הטלפון לחצי שעה, בליווי, כדי לראות איפה
-- היא נתקעת. היא מתחת לטווח שהמוצר נבנה לו (9–14), וזו בדיוק הסיבה
-- לבדוק — אבל זה גם אומר שהסשן הראשון צריך להיות סגור יותר מהרגיל.
--
-- **מה שהיה חסר.** אישור ההורה קיים מאז 0030: טבלה, טוקן, סמס, ומסך
-- שבו ההורה מחליט. אבל שום דבר לא *נעצר* בגללו. הצ'קבוקס באונבורדינג
-- ("ההורים שלי יודעים") הוא הצהרה של הילדה על עצמה — הוכחה שהיא קראה
-- משפט, לא שההורה ראה משהו.
--
-- מכאן: חשבון שמסומן `pilot_user` לא מזמין, לא מציע טרייד, לא מאשר
-- טרייד, ולא מגיע לוואטסאפ — עד ש-`parent_approved_at` מלא.
--
-- **מה *לא* משתנה לאף אחת אחרת.** `pilot_user` הוא false כברירת מחדל,
-- וכל השערים כאן נפתחים מיד כשהוא false. חשבון קיים לא מרגיש כלום.

/* ══════════════ 1. סימוני הפיילוט ══════════════ */

alter table squish_profiles add column if not exists pilot_user          boolean not null default false;
alter table squish_profiles add column if not exists pilot_started_at    timestamptz;
alter table squish_profiles add column if not exists parent_approved_at  timestamptz;

comment on column squish_profiles.pilot_user is
  'חשבון בדיקה מלווה. לא נראה לילדה בשום מסך — סימון למנהלת בלבד.';
comment on column squish_profiles.parent_approved_at is
  'אישור הורה *אמיתי*, דרך טוקן בסמס. שונה מ-parent_awareness_at, שהוא הצהרה של הילדה.';

create index if not exists squish_profiles_pilot_idx
  on squish_profiles (pilot_started_at desc) where pilot_user;

/* ══════════════ 2. יומן כשלי כתיבה ══════════════
   המנהלת צריכה לדעת אם הילדה ניסתה לשמור סקווישי וזה נכשל — זה בדיוק
   מה שנעלם קודם ב-console.error. בלי טקסט חופשי, בלי מפתחות מדיה,
   בלי טלפון: רק מה נכשל, קוד השגיאה, ומזהה מתאם ללוג. */

create table if not exists squish_write_failures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  op          text not null,
  code        text,
  expects     text,
  cid         text,
  created_at  timestamptz not null default now()
);

create index if not exists squish_write_failures_user_idx
  on squish_write_failures (user_id, created_at desc);

alter table squish_write_failures enable row level security;
-- אין policy: רק service_role נוגע. הילדה לא צריכה לראות את זה,
-- והמנהלת רואה דרך השרת.

/* ══════════════ 3. השער ══════════════ */

/**
 * 'ok' או 'awaiting_parent'.
 *
 * פונקציה אחת שכל נקודות האכיפה שואלות, כדי ששלוש מהן לא יתפצלו
 * ביום שבו מישהו יוסיף רביעית.
 */
create or replace function squish_pilot_gate(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (
      select 1 from squish_profiles
       where user_id = p_user and pilot_user and parent_approved_at is null
    ) then 'ok'
    else 'awaiting_parent'
  end;
$$;

comment on function squish_pilot_gate(uuid) is
  'חשבון פיילוט בלי אישור הורה = awaiting_parent. לכל השאר תמיד ok.';

/* ══════════════ 4. אכיפה ══════════════ */

/* קישורי הזמנה — הטריגר הקיים, עם תנאי נוסף */
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
  if squish_pilot_gate(new.inviter_user_id) <> 'ok' then
    raise exception 'awaiting parent approval';
  end if;
  if not squish_rate_ok(new.inviter_user_id, 'invite') then
    raise exception 'too many invites';
  end if;
  return new;
end $$;

/* הצטרפות למעגל — הצד השני של אותו מטבע.
   לחסום יצירת קישור ולא לחסום *הצטרפות* היה משאיר את הפער הגדול: די
   שמישהי תשלח לילדה קישור, והיא נכנסת למעגל ורואה אוסף שלם של מישהי
   אחרת — לפני שההורה שלה בכלל ידע שהיא שם. */
create or replace function squish_join(p_code text)
returns table (inviter_user_id uuid, nickname text, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_inviter uuid;
  v_me      uuid := auth.uid();
  v_nick    text;
  v_exists  boolean;
  v_state   text;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  v_state := squish_invite_state(p_code);
  if v_state = 'not_found' then raise exception 'invite not found'; end if;
  if v_state = 'revoked'   then raise exception 'invite revoked';   end if;
  if v_state = 'expired'   then raise exception 'invite expired';   end if;
  if v_state = 'exhausted' then raise exception 'invite exhausted'; end if;

  select i.inviter_user_id into v_inviter from squish_invites i where i.code = p_code;
  if v_inviter = v_me then raise exception 'cannot join your own circle'; end if;
  if squish_is_blocked(v_me, v_inviter) then raise exception 'blocked'; end if;

  if exists (select 1 from squish_profiles
              where user_id = v_me and suspended_at is not null) then
    raise exception 'account suspended';
  end if;
  if exists (select 1 from squish_profiles
              where user_id = v_inviter and suspended_at is not null) then
    raise exception 'invite unavailable';
  end if;

  /* חשבון פיילוט לא נכנס למעגל של אף אחת לפני אישור הורה */
  if squish_pilot_gate(v_me) <> 'ok' then
    raise exception 'awaiting parent approval';
  end if;

  select p.nickname into v_nick from squish_profiles p where p.user_id = v_inviter;
  select exists (
    select 1 from squish_connections c
    where c.user_id = v_me and c.connected_user_id = v_inviter and c.status = 'active'
  ) into v_exists;

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_me, v_inviter, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_inviter, v_me, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  update squish_invites
     set joined_user_id = coalesce(joined_user_id, v_me),
         joined_at      = coalesce(joined_at, now()),
         uses           = uses + case when v_exists then 0 else 1 end
   where code = p_code;

  return query select v_inviter, v_nick, v_exists;
end $$;

/* הצעת טרייד — נבדק על שני הצדדים. ילדה שממתינה לאישור לא מציעה,
   וגם לא מקבלת הצעה: קבלה היא כניסה לאותו מפגש. */
create or replace function squish_trade_pilot_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if squish_pilot_gate(new.sender_user_id) <> 'ok'
       or squish_pilot_gate(new.receiver_user_id) <> 'ok' then
      raise exception 'awaiting parent approval';
    end if;
    return new;
  end if;

  /* מצבים סופיים תמיד עוברים — אותו עיקרון כמו בהשהיה: אסור לכלוא
     שתי ילדות בטרייד תקוע. */
  if new.status in ('cancelled','declined','reported','completed') then
    return new;
  end if;
  if (new.status is distinct from old.status)
     or (new.accepted_by_sender_at   is distinct from old.accepted_by_sender_at)
     or (new.accepted_by_receiver_at is distinct from old.accepted_by_receiver_at)
     or (new.reserved_at             is distinct from old.reserved_at)
  then
    if squish_pilot_gate(new.sender_user_id) <> 'ok'
       or squish_pilot_gate(new.receiver_user_id) <> 'ok' then
      raise exception 'awaiting parent approval';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists squish_trade_pilot on squish_trade_proposals;
create trigger squish_trade_pilot
  before insert or update on squish_trade_proposals
  for each row execute function squish_trade_pilot_guard();

/* ══════════════ 5. פתיחת פיילוט ואיפוסו ══════════════ */

/** מסמנת חשבון כפיילוט. נקראת מהחמ"ל בלבד. */
create or replace function squish_pilot_start(p_user uuid, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update squish_profiles
     set pilot_user = true,
         pilot_started_at = coalesce(pilot_started_at, now()),
         updated_at = now()
   where user_id = p_user;
  insert into squish_admin_actions (admin_label, action, target_user)
  values (coalesce(p_admin, 'admin'), 'pilot_start', p_user);
end $$;

/**
 * מוחקת את כל מה שהילדה יצרה בסקוויש קלאב, ומשאירה את חשבון ההתחברות
 * ואת כל מה ששייך לדוכן — חנויות, מוצרים והזמנות — שלם לגמרי.
 *
 * זו הסיבה שהיא לא `delete from auth.users`: מחיקת חשבון גוררת מחיקת
 * חנויות בקסקייד, וילדה שסיימה פיילוט של סקוויש לא אמורה לאבד דוכן.
 */
create or replace function squish_pilot_reset(p_user uuid, p_admin text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_items int;
  v_stores int;
  v_orders int;
begin
  select count(*) into v_items from squish_items where owner_user_id = p_user;
  select count(*) into v_stores from stores where owner_id = p_user;
  select count(*) into v_orders from orders o join stores s on s.id = o.store_id
   where s.owner_id = p_user;

  delete from squish_trade_version_items vi
   using squish_trade_versions v, squish_trade_proposals pr
   where vi.version_id = v.id and v.proposal_id = pr.id
     and (pr.sender_user_id = p_user or pr.receiver_user_id = p_user);
  delete from squish_trade_versions v using squish_trade_proposals pr
   where v.proposal_id = pr.id
     and (pr.sender_user_id = p_user or pr.receiver_user_id = p_user);
  delete from squish_trade_reports where reported_by_user_id = p_user or reported_user_id = p_user;
  delete from squish_trade_proposals where sender_user_id = p_user or receiver_user_id = p_user;
  delete from squish_item_reports where reporter_user_id = p_user or reported_user_id = p_user;
  delete from squish_interests where user_id = p_user;
  delete from squish_interests i using squish_items it
   where i.item_id = it.id and it.owner_user_id = p_user;
  delete from squish_wishlist where owner_user_id = p_user;
  delete from squish_blocks where blocker_user_id = p_user or blocked_user_id = p_user;
  delete from squish_connections where user_id = p_user or connected_user_id = p_user;
  delete from squish_invites where inviter_user_id = p_user;
  delete from squish_feedback where user_id = p_user;
  delete from squish_parent_approvals where user_id = p_user;
  delete from squish_write_failures where user_id = p_user;
  update squish_profiles set favorite_item_id = null where user_id = p_user;
  delete from squish_items where owner_user_id = p_user;
  delete from squish_profiles where user_id = p_user;

  insert into squish_admin_actions (admin_label, action, target_user, note)
  values (coalesce(p_admin, 'admin'), 'pilot_reset', p_user,
          format('%s items removed', v_items));

  /* מחזירה את מה שנשאר, כדי שאפשר יהיה להוכיח שדוכן לא נפגע */
  return json_build_object(
    'items_removed', v_items,
    'stores_intact', v_stores,
    'orders_intact', v_orders
  );
end $$;

/* ══════════════ 6. הרשאות ══════════════ */

do $$ begin
  grant execute on function squish_pilot_gate(uuid) to anon, authenticated, service_role;
  grant execute on function squish_pilot_start(uuid, text) to service_role;
  grant execute on function squish_pilot_reset(uuid, text) to service_role;
  grant all on squish_write_failures to service_role;
exception when undefined_object then null; end $$;
