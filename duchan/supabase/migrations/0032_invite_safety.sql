-- 0032 — שלב א': סגירת חורי בטיחות בהזמנה ובהצטרפות.
--
-- המיגרציה הזו לא משנה שום הרשאת צפייה. היא סוגרת שלושה פערים שקיימים
-- כבר היום:
--
-- 1. **נחסמת יכלה לחזור.** squish_join עשה `on conflict do update set
--    status = 'active'` בלי לבדוק חסימה. מי שנחסמה ונכנסה שוב דרך אותו
--    קישור קיבלה קשר פעיל בחזרה — והופיעה שוב ב"החברות שלי" עם כינוי
--    וספירת פריטים. הצפייה עצמה נחסמה ב-squish_can_view, אבל היא לא
--    הייתה אמורה להופיע שם מלכתחילה.
-- 2. **מושהית יכלה להצטרף** ולהרחיב מעגל בזמן שהחשבון שלה מושהה.
-- 3. **קישור הזמנה היה דלת פתוחה לנצח** — בלי תוקף, בלי ביטול, ובלי
--    תקרת שימושים.
--
-- **קישורים קיימים לא מתים.** expires_at ו-max_uses נאכפים רק כשהם
-- מלאים, וקישור שכבר יושב בוואטסאפ של מישהי נשאר תקף. התוקף חל על מה
-- שנוצר מכאן והלאה.

/* ══════════════ 1. תוקף, ביטול ותקרה ══════════════ */

alter table squish_invites add column if not exists label      text;
alter table squish_invites add column if not exists expires_at timestamptz;
alter table squish_invites add column if not exists revoked_at timestamptz;
alter table squish_invites add column if not exists max_uses   int;
alter table squish_invites add column if not exists uses       int not null default 0;

comment on column squish_invites.label is
  'שם שהילדה נתנה לקישור, למשל "חוג ריקוד". מחליף קבוצות.';
comment on column squish_invites.expires_at is
  'ריק = ללא תוקף. קישורים שנוצרו לפני 0032 נשארים כך בכוונה.';
comment on column squish_invites.max_uses is
  'ריק = בלי תקרה, לקישורים ישנים. חדשים נוצרים עם 10.';

/* ברירות המחדל חלות רק על שורות חדשות — בדיוק מה שאנחנו רוצים. */
alter table squish_invites alter column expires_at set default (now() + interval '30 days');
alter table squish_invites alter column max_uses   set default 10;

create index if not exists squish_invites_live_idx
  on squish_invites (inviter_user_id, created_at desc)
  where revoked_at is null;

/* מחיקה רכה לקשר, כדי שמודרציה תוכל לראות שהיה קשר ונותק */
alter table squish_connections add column if not exists removed_at timestamptz;

/* ══════════════ 2. מצב ההזמנה, במקום אחד ══════════════ */

/**
 * למה פונקציה ולא שלושה תנאים מפוזרים: אותה תשובה בדיוק נחוצה גם
 * ב-squish_join, גם במסך ההצטרפות וגם במסך "שלי". שלושה עותקים של
 * אותו תנאי הם שלוש הזדמנויות להתפצל.
 */
create or replace function squish_invite_state(p_code text)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when i.id is null                                then 'not_found'
    when i.revoked_at is not null                    then 'revoked'
    when i.expires_at is not null
         and i.expires_at < now()                    then 'expired'
    when i.max_uses is not null
         and i.uses >= i.max_uses                    then 'exhausted'
    else 'ok'
  end
  from (select 1) one
  left join squish_invites i on i.code = p_code;
$$;

/** ביטול קישור — רק מי שיצרה אותו. */
create or replace function squish_revoke_invite(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  update squish_invites
     set revoked_at = coalesce(revoked_at, now())
   where code = p_code and inviter_user_id = v_me;
end $$;

/* ══════════════ 3. הצטרפות, עם כל השערים ══════════════ */

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
  v_state   text;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  v_state := squish_invite_state(p_code);
  if v_state = 'not_found' then raise exception 'invite not found'; end if;
  if v_state = 'revoked'   then raise exception 'invite revoked';   end if;
  if v_state = 'expired'   then raise exception 'invite expired';   end if;
  if v_state = 'exhausted' then raise exception 'invite exhausted'; end if;

  select i.inviter_user_id into v_inviter
    from squish_invites i where i.code = p_code;

  if v_inviter = v_me then
    raise exception 'cannot join your own circle';
  end if;

  /* חסימה גוברת על הכל — גם על קישור תקף.
     בלי הבדיקה הזו `on conflict do update` היה מחזיר לחיים קשר חסום. */
  if squish_is_blocked(v_me, v_inviter) then
    raise exception 'blocked';
  end if;

  if exists (select 1 from squish_profiles
              where user_id = v_me and suspended_at is not null) then
    raise exception 'account suspended';
  end if;

  /* חשבון מושהה לא מרחיב מעגל, וגם לא נחשף כמושהה למי שמנסה להצטרף */
  if exists (select 1 from squish_profiles
              where user_id = v_inviter and suspended_at is not null) then
    raise exception 'invite unavailable';
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
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_inviter, v_me, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  /* uses נספר רק על הצטרפות *חדשה*. מי שלוחצת פעמיים על אותו קישור לא
     שורפת שימוש, אחרת תקרה של עשרה נגמרת משבע חברות. */
  update squish_invites
     set joined_user_id = coalesce(joined_user_id, v_me),
         joined_at      = coalesce(joined_at, now()),
         uses           = uses + case when v_exists then 0 else 1 end
   where code = p_code;

  return query select v_inviter, v_nick, v_exists;
end $$;

/* ספירת לחיצות — רק על קישור חי. אין טעם לספור לחיצות על קישור מבוטל. */
create or replace function squish_invite_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update squish_invites set clicks = clicks + 1
   where code = p_code and revoked_at is null;
$$;

/* ══════════════ 4. group_only — הסרה ══════════════
   האפשרות הוצעה בהגדרות, אבל שום דבר לא יוצר קשר מסוג group_member,
   ולכן בחירה בה הסתירה את האוסף מכולן. אין מנגנון קבוצות ולא יהיה
   בשלב הזה, אז זו לא הגדרה עתידית — זה מסך שבור.

   ערך ה-enum *נשאר*: מחיקת ערך enum שוברת כל שורה שמצביעה עליו, וזה
   בדיוק סוג הדבר שאסור לעשות למיגרציה. רק הנתונים עוברים. */

update squish_profiles
   set collection_visibility = 'direct_friends', updated_at = now()
 where collection_visibility = 'group_only';

/* ══════════════ 5. הרשאות ══════════════ */

do $$ begin
  grant execute on function squish_invite_state(text)  to anon, authenticated, service_role;
  grant execute on function squish_revoke_invite(text) to authenticated;
exception when undefined_object then null; end $$;
