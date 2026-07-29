-- 0037 — הפיילוט מסומן לפני שיש מה לסמן.
--
-- **הפער ש-0036 השאירה.** הילדה בנתה אוסף, ורק אחר כך המנהלת סימנה את
-- החשבון כפיילוט. בין שני הרגעים האלה השער היה פתוח לרווחה: היא כבר
-- מאומתת, ו-`squish_own_invites` מרשה להכניס קישור הזמנה עם
-- `inviter_user_id = auth.uid()` **בלי שיהיה לה פרופיל בכלל**. כלומר
-- החלון לא היה תיאורטי — הוא היה קישור הזמנה אמיתי, לפני שההורה שמע
-- על זה.
--
-- **התיקון.** קישור חד-פעמי שהמנהלת מייצרת מראש. הילדה פותחת אותו לפני
-- האונבורדינג, והטוקן נצמד לחשבון שלה **ברגע שהיא מאמתת טלפון** — לא
-- כשנוצר הפרופיל. מאותו רגע השער סגור, גם כשעוד אין שום שורה בסקוויש.
--
-- והפרופיל עצמו נוצר בפונקציה אחת עם הסימון, בטרנזקציה אחת. אין מצב
-- שבו יש פרופיל בלי pilot_user.

/* ══════════════ 1. הקישור החד-פעמי ══════════════ */

create table if not exists squish_pilot_tokens (
  token            text primary key,
  label            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  opened_at        timestamptz,
  claimed_at       timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete cascade,
  revoked_at       timestamptz
);

create index if not exists squish_pilot_tokens_claim_idx
  on squish_pilot_tokens (claimed_by_user_id) where claimed_by_user_id is not null;

alter table squish_pilot_tokens enable row level security;
-- אין policy: רק service_role. הטוקן הוא סוד, והוא לא עובר דרך הלקוח
-- בשום צורה חוץ מהכתובת שהילדה פותחת פעם אחת.

comment on table squish_pilot_tokens is
  'קישור פיילוט חד-פעמי. נצמד לחשבון באימות הטלפון, לא ביצירת הפרופיל.';

/* ══════════════ 2. הצמדה לחשבון ══════════════ */

/**
 * נקראת בשרת ברגע שהילדה אימתה טלפון, אם העוגייה נושאת טוקן.
 *
 * חד-פעמי באמת: טוקן שכבר נצמד לחשבון אחר לא ייצמד לשני. זה מה שמונע
 * העברת הקישור הלאה אחרי שהוא שימש.
 */
create or replace function squish_claim_pilot_token(p_token text, p_user uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ok boolean := false;
begin
  update squish_pilot_tokens
     set claimed_at = now(), claimed_by_user_id = p_user
   where token = p_token
     and revoked_at is null
     and expires_at > now()
     and (claimed_by_user_id is null or claimed_by_user_id = p_user)
  returning true into v_ok;

  /* אם כבר יש פרופיל — מסמנים אותו מיד. זה המקרה של ילדה שנכנסת
     שוב אחרי שכבר התחילה. */
  if v_ok then
    update squish_profiles
       set pilot_user = true,
           pilot_started_at = coalesce(pilot_started_at, now()),
           updated_at = now()
     where user_id = p_user;
  end if;

  return coalesce(v_ok, false);
end $$;

/* ══════════════ 3. השער, עכשיו גם בלי פרופיל ══════════════ */

/**
 * הרחבה של 0036: חשבון נחשב פיילוט גם כשהטוקן נצמד אליו ועוד אין
 * פרופיל. זה בדיוק החלון שהיה פתוח — מאומתת, בלי פרופיל, ועם רשות
 * להכניס קישור הזמנה.
 */
create or replace function squish_pilot_gate(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    /* אושר על ידי הורה — פתוח, בלי קשר לשאר */
    when exists (
      select 1 from squish_profiles
       where user_id = p_user and parent_approved_at is not null
    ) then 'ok'
    /* פרופיל שמסומן פיילוט ולא אושר */
    when exists (
      select 1 from squish_profiles
       where user_id = p_user and pilot_user
    ) then 'awaiting_parent'
    /* טוקן שנצמד לחשבון — גם כשעוד אין פרופיל בכלל */
    when exists (
      select 1 from squish_pilot_tokens
       where claimed_by_user_id = p_user and revoked_at is null
    ) then 'awaiting_parent'
    else 'ok'
  end;
$$;

comment on function squish_pilot_gate(uuid) is
  'awaiting_parent מרגע שהטוקן נצמד לחשבון — לא מרגע שנוצר הפרופיל.';

/* ══════════════ 4. יצירת פרופיל, אטומית עם הסימון ══════════════ */

/**
 * יוצרת את פרופיל האוסף. אם לחשבון צמוד טוקן פיילוט, `pilot_user`
 * נכתב **באותה שורה ובאותה טרנזקציה** — אין רגע שבו קיים פרופיל
 * שעדיין לא מסומן.
 *
 * מחזירה את המזהה, או null אם הקוד כבר תפוס (הקורא מנסה קוד אחר).
 */
create or replace function squish_create_profile(
  p_nickname   text,
  p_city       text,
  p_title      text,
  p_code       text,
  p_aware      boolean,
  p_aware_ver  text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_pilot boolean;
  v_id    uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  select exists (
    select 1 from squish_pilot_tokens
     where claimed_by_user_id = v_me and revoked_at is null
  ) into v_pilot;

  insert into squish_profiles (
    user_id, nickname, general_city, collection_title, collection_code,
    parent_awareness_at, parent_awareness_version,
    pilot_user, pilot_started_at
  ) values (
    v_me,
    coalesce(nullif(btrim(p_nickname), ''), 'אספנית'),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_title, '')), ''),
    p_code,
    case when p_aware then now() else null end,
    case when p_aware then p_aware_ver else null end,
    v_pilot,
    case when v_pilot then now() else null end
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    /* קוד גלריה תפוס, או שכבר יש פרופיל לחשבון הזה */
    return (select id from squish_profiles where user_id = v_me);
end $$;

/* ══════════════ 5. הרשאות ══════════════ */

do $$ begin
  grant execute on function squish_create_profile(text, text, text, text, boolean, text)
    to authenticated;
  grant execute on function squish_claim_pilot_token(text, uuid) to service_role;
  grant all on squish_pilot_tokens to service_role;
exception when undefined_object then null; end $$;
