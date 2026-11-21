-- 0071 — שמירה מוגבלת בזמן של פרטי קונים.
--
-- עד עכשיו הזמנה נשמרה לנצח עם השם, הטלפון, ההערות והכתובת של הקונה
-- (שגם היא, לרוב, ילדה). הקרון היומי מחק קודי SMS ויומני כניסה, אבל לא נגע
-- בהזמנות.
--
-- העיקרון: מפרידים בין *היסטוריית ההזמנות* של הדוכן (מה נמכר, כמה, מתי,
-- באיזה סכום — נשאר לתמיד, לא מזהה אף אחד) לבין *המידע האישי של הקונה*
-- (שם, טלפון, הערות, כתובת — נמחק אחרי זמן קצוב).
--
-- המדיניות (ברירות מחדל של purge_buyer_data; טעונה אישור משפטי):
--   • כתובת למשלוח — 30 יום אחרי שההזמנה נסגרה.
--   • שם, טלפון, הערות ומזהה רשת — 90 יום אחרי שההזמנה נסגרה.
--   • הזמנה שנשארה פתוחה (נשלחה / שולמה) — 180 יום אחרי שנוצרה.
--   • חריג: הזמנה עם retention_hold_reason (מחלוקת פתוחה, חובת שמירה
--     חוקית) לא נוגעים בה. רק החמ"ל מסמן ומסיר.
--
-- "נסגרה" = נמסרה או בוטלה (closed_at, נקבע בטריגר), או שבעלת הדוכן
-- הורידה אותה מהרשימה (deleted_at). להזמנות שנסגרו לפני המיגרציה הזו אין
-- closed_at, ולכן נספר מיום היצירה — הגבול התחתון היחיד שידוע.
--
-- **שום דבר לא נמחק מעצם הרצת המיגרציה.** purge_buyer_data רצה כברירת
-- מחדל "על יבש": סופרת מה היה נמחק ולא משנה דבר. מחיקה בפועל רק כש-
-- app_settings.order_retention_enforce = '1', וזה נקבע ידנית, אחרי אישור.
--
-- תוספתית בלבד ובטוחה להרצה חוזרת.

/* ── עמודות ── */

alter table orders add column if not exists closed_at             timestamptz;
alter table orders add column if not exists address_purged_at     timestamptz;
alter table orders add column if not exists pii_purged_at         timestamptz;
alter table orders add column if not exists retention_hold_reason text;
alter table orders add column if not exists retention_hold_at     timestamptz;

comment on column orders.closed_at             is 'מתי ההזמנה נסגרה (נמסרה / בוטלה). נקבע בטריגר. ממנו נספרת השמירה.';
comment on column orders.address_purged_at     is 'מתי נמחקה הכתובת למשלוח.';
comment on column orders.pii_purged_at         is 'מתי נמחקו פרטי הקונה (שם, טלפון, הערות). ההזמנה עצמה נשארת.';
comment on column orders.retention_hold_reason is 'חריג שמירה: מחלוקת פתוחה או חובה חוקית. כל עוד יש ערך, לא מוחקים. רק מהחמ"ל.';

create index if not exists orders_retention_idx on orders (closed_at) where pii_purged_at is null;

/* ── הגדרות מערכת ──
   מתג ההפעלה של המחיקה, והתוצאה של ההרצה האחרונה. של השרת בלבד. */

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
grant all on app_settings to service_role;

comment on table app_settings is 'הגדרות הפעלה של השרת (לא סודות). service role בלבד.';

/* ── closed_at ──
   נקבע כשההזמנה עוברת ל"נמסרה" או "בוטלה", ומתאפס אם היא נפתחת מחדש.
   מעבר בין שני מצבי סגירה לא מזיז את השעון. */

create or replace function orders_track_closed() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('delivered', 'cancelled') and new.closed_at is null then
      new.closed_at := now();
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('delivered', 'cancelled') then
      if old.status not in ('delivered', 'cancelled') or new.closed_at is null then
        new.closed_at := now();
      end if;
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end $$;

/* ── מה שהדפדפן לא כותב ──
   בעלת דוכן מעדכנת הזמנות ישירות (סטטוס, הערה, שם הקונה). את שדות
   השמירה היא לא קובעת: אחרת אפשר היה לסמן "חריג" ולשמור פרטים לתמיד,
   או לבטל סימון מחיקה. ואחרי שפרטי הקונה נמחקו, אי אפשר להקליד אותם שוב. */

create or replace function guard_order_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  new.closed_at             := old.closed_at;   -- orders_track_closed קובע, מיד אחרי
  new.address_purged_at     := old.address_purged_at;
  new.pii_purged_at         := old.pii_purged_at;
  new.retention_hold_reason := old.retention_hold_reason;
  new.retention_hold_at     := old.retention_hold_at;
  if old.pii_purged_at is not null then
    new.buyer_name   := null;
    new.buyer_phone  := null;
    new.buyer_note   := null;
    new.owner_note   := null;
    new.ship_address := null;
    new.ship_details := null;
  elsif old.address_purged_at is not null then
    new.ship_address := null;
    new.ship_details := null;
  end if;
  return new;
end $$;

-- הסדר חשוב, והוא לפי שם הטריגר: קודם השמירה (a), אחר כך השעון (b)
drop trigger if exists orders_a_guard_client on orders;
create trigger orders_a_guard_client
  before update on orders
  for each row execute function guard_order_client_write();

drop trigger if exists orders_b_track_closed on orders;
create trigger orders_b_track_closed
  before insert or update on orders
  for each row execute function orders_track_closed();

/* ── הניקוי ──
   p_enforce = false (ברירת המחדל): רק סופר. true: מוחק את המידע האישי
   ומשאיר את ההזמנה. מחזיר את אותו דוח בשני המצבים, כדי שאפשר יהיה
   להשוות "מה היה נמחק" ל"מה נמחק". */

create or replace function purge_buyer_data(
  p_enforce      boolean default false,
  p_pii_days     integer default 90,
  p_address_days integer default 30,
  p_stale_days   integer default 180
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_now     timestamptz := now();
  v_report  jsonb;
  v_addr    integer := 0;
  v_pii     integer := 0;
begin
  if p_pii_days < 1 or p_address_days < 1 or p_stale_days < 1 then
    raise exception 'retention: days must be positive';
  end if;

  with o as (
    select id, status, deleted_at, created_at, retention_hold_reason,
           address_purged_at, pii_purged_at,
           (ship_address is not null or ship_details is not null) as has_address,
           (buyer_name is not null)  as has_name,
           (buyer_phone is not null) as has_phone,
           (buyer_note is not null or owner_note is not null) as has_notes,
           -- מתי נסגרה: closed_at; אם הורדה מהרשימה — אז; הזמנה שנסגרה לפני
           -- 0071 — מיום היצירה; פתוחה — null
           case
             when closed_at is not null  then closed_at
             when deleted_at is not null then deleted_at
             when status in ('delivered', 'cancelled') then created_at
           end as closed_eff
      from orders
  ), due as (
    select o.*,
           (retention_hold_reason is null and pii_purged_at is null and (
              (closed_eff is not null and closed_eff < v_now - make_interval(days => p_pii_days))
              or (closed_eff is null and created_at < v_now - make_interval(days => p_stale_days))
           )) as pii_due,
           (retention_hold_reason is null and address_purged_at is null and has_address
              and closed_eff is not null and closed_eff < v_now - make_interval(days => p_address_days)
           ) as address_due
      from o
  )
  select jsonb_build_object(
    'enforced', p_enforce,
    'as_of', v_now,
    'days', jsonb_build_object('pii', p_pii_days, 'address', p_address_days, 'stale_open', p_stale_days),
    'orders_total', count(*),
    'on_hold', count(*) filter (where retention_hold_reason is not null),
    'already_purged', count(*) filter (where pii_purged_at is not null),
    'pii', jsonb_build_object(
      'orders', count(*) filter (where pii_due),
      'of_which_stale_open', count(*) filter (where pii_due and closed_eff is null),
      'with_name', count(*) filter (where pii_due and has_name),
      'with_phone', count(*) filter (where pii_due and has_phone),
      'with_notes', count(*) filter (where pii_due and has_notes),
      'with_address', count(*) filter (where pii_due and has_address)
    ),
    'address', jsonb_build_object(
      'orders', count(*) filter (where address_due and not pii_due)
    ),
    'open_older_than_30_days', count(*) filter (where closed_eff is null and created_at < v_now - interval '30 days')
  ) into v_report from due;

  if not p_enforce then
    return v_report;
  end if;

  -- קודם הכתובות (30 יום), אחר כך כל פרטי הקונה (90 / 180 יום)
  update orders o
     set ship_address = null,
         ship_details = null,
         address_purged_at = v_now
   where o.retention_hold_reason is null
     and o.address_purged_at is null
     and (o.ship_address is not null or o.ship_details is not null)
     and coalesce(o.closed_at, o.deleted_at,
                  case when o.status in ('delivered', 'cancelled') then o.created_at end)
           < v_now - make_interval(days => p_address_days);
  get diagnostics v_addr = row_count;

  update orders o
     set buyer_name   = null,
         buyer_phone  = null,
         buyer_note   = null,
         owner_note   = null,
         ip_hash      = null,
         ship_address = null,
         ship_details = null,
         address_purged_at = coalesce(o.address_purged_at, v_now),
         pii_purged_at     = v_now
   where o.retention_hold_reason is null
     and o.pii_purged_at is null
     and (
       coalesce(o.closed_at, o.deleted_at,
                case when o.status in ('delivered', 'cancelled') then o.created_at end)
         < v_now - make_interval(days => p_pii_days)
       or (
         o.closed_at is null and o.deleted_at is null
         and o.status not in ('delivered', 'cancelled')
         and o.created_at < v_now - make_interval(days => p_stale_days)
       )
     );
  get diagnostics v_pii = row_count;

  return v_report || jsonb_build_object('done', jsonb_build_object('address_rows', v_addr, 'pii_rows', v_pii));
end $$;

-- של השרת בלבד. בלי זה כל דפדפן היה יכול להריץ מחיקה דרך ה-API.
revoke all on function purge_buyer_data(boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function purge_buyer_data(boolean, integer, integer, integer) to service_role;
-- פונקציות טריגר לא נקראות ישירות; אין סיבה שיופיעו ב-API
revoke all on function orders_track_closed() from public, anon, authenticated;
revoke all on function guard_order_client_write() from public, anon, authenticated;
