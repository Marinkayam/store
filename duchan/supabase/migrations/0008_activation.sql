-- 0008 — הפעלת חנות בתשלום חד-פעמי.
-- הילדה בונה הכל בחינם. הלינק נפתח לשיתוף רק אחרי שהחנות הופעלה.
-- אנחנו לא סולקים כסף: היא משלמת בביט/פייבוקס והמנהלת מאשרת ידנית.

alter table stores add column if not exists activated_at       timestamptz;
alter table stores add column if not exists payment_claimed_at timestamptz;
alter table stores add column if not exists payment_method     text;
alter table stores add column if not exists payment_ref        text;
alter table stores add column if not exists payment_amount     int;

comment on column stores.activated_at       is 'רגע ההפעלה. null = טיוטה, הלינק לא פומבי.';
comment on column stores.payment_claimed_at is 'הילדה הצהירה ששילמה. ממתין לאישור המנהלת.';

-- חנויות שנפתחו לפני מודל התשלום ממשיכות לעבוד. מיגרציות רק מוסיפות.
update stores set activated_at = created_at where activated_at is null;

-- ההפעלה נעשית בשרת בלבד.
-- ל-RLS יש policy אחד רחב על stores (own_store, for all), כך שבלי השמירה הזו
-- הבעלות יכולה פשוט לעדכן activated_at מהדפדפן ולפרסם בלי לשלם.
-- למפתח service role אין sub ב-JWT, ולכן auth.uid() שלו null — וזה מה שמבדיל.
--
-- security definer כאן הוא חובה ולא נוחות: הטריגר רץ בהקשר של כל מי שמעדכן
-- את stores, ולא לכל תפקיד יש הרשאה על סכמת auth. בלי זה כל UPDATE על חנות
-- נופל ב-"permission denied for schema auth". auth.uid() קוראת GUC של הבקשה,
-- ולכן היא עדיין מחזירה את המשתמשת האמיתית גם תחת security definer.
create or replace function guard_store_activation()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    new.activated_at   := old.activated_at;
    new.payment_amount := old.payment_amount;
  end if;
  return new;
end $$;

drop trigger if exists stores_guard_activation on stores;
create trigger stores_guard_activation
  before update on stores
  for each row execute function guard_store_activation();

-- הצהרת תשלום של הילדה. security definer כדי שהחותמת תהיה של השרת ולא של הדפדפן.
create or replace function claim_store_payment(p_store uuid, p_method text, p_ref text)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update stores
     set payment_claimed_at = now(),
         payment_method     = nullif(left(coalesce(p_method, ''), 20), ''),
         payment_ref        = nullif(left(coalesce(p_ref, ''), 60), '')
   where id = p_store
     and activated_at is null;   -- חנות פעילה לא מצהירה שוב
end $$;

do $$ begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant execute on function claim_store_payment(uuid, text, text) to authenticated;
  end if;
end $$;
