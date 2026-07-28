-- ═══════════════════════════════════════════════════════════════
--  דוכן — רק מה שההזמנות צריכות
--
--  להדביק ב-Supabase → SQL Editor → Run.
--
--  זה התיקון ללקוחות שלא רואות מי הזמינה: שם הקונה, מספר הקונה,
--  והיכולת להוריד הזמנה מהרשימה. **לא כולל את סקוויש קלאב** — הוא
--  עוד לא הושק, והוא יכול לחכות ל-catchup.sql המלא מהמחשב.
--
--  בטוח להרצה חוזרת, והכל בטרנזקציה אחת.
-- ═══════════════════════════════════════════════════════════════

begin;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 0020_buyer_phone.sql
-- ───────────────────────────────────────────────────────────────

-- מספר טלפון של הקונה, אופציונלי, כדי שהמוכרת תוכל לפתוח וואטסאפ ישירות
-- אליה אם יש שאלה על ההזמנה. הקונה בוחרת אם להשאיר אותו — לא חובה בטופס.
-- לעולם לא נחשף בקריאה הפומבית של החנות; מוגן באותו RLS כמו שאר ה-order.

alter table orders add column if not exists buyer_phone text;

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text default null
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status, ip_hash, buyer_phone)
    values (p_store, n, p_items, p_total, p_note, 'sent', p_ip_hash, p_buyer_phone);
  return n;
end $$;

insert into schema_migrations (name) values ('0020_buyer_phone.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0024_order_archive.sql
-- ───────────────────────────────────────────────────────────────

-- הסתרת הזמנה שאינה רלוונטית.
--
-- "ביטול" כבר קיים והוא סטטוס אמיתי: מישהו הזמין וההזמנה לא יצאה לפועל,
-- והמלאי חוזר. אבל הזמנות מבוטלות נשארו ברשימה לנצח, וגם הזמנות בדיקה
-- שהילדה שלחה לעצמה. היא ביקשה דרך להוריד אותן מהמסך.
--
-- מחיקה רכה בלבד, כמו במוצרים: השורה נשארת לחשבונאות ולגיבוי, והמסך
-- פשוט לא מציג אותה. אין כאן delete.

alter table orders add column if not exists deleted_at timestamptz;

-- אינדקס לרשימה של חנות אחת, שמסננת את המוסתרות
create index if not exists orders_store_visible_idx
  on orders (store_id, created_at desc)
  where deleted_at is null;

insert into schema_migrations (name) values ('0024_order_archive.sql') on conflict do nothing;

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

commit;

-- אחרי ההרצה, בהרצה נפרדת:
-- notify pgrst, 'reload schema';
