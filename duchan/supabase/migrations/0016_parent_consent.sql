-- 0016 — אישור הורה לפני פרסום, במקום בקרה הורית.
--
-- אין כאן חשבון להורה, אין אימות ואין מסך נפרד. יש הצהרה אחת של הילדה,
-- ברגע היחיד שבו היא באמת רלוונטית: לפני שהדוכן יוצא לעולם. עד אז היא
-- בונה, מעצבת ומשתפת תצוגה מקדימה — ואין מה לאשר.
--
-- החותמת נשמרת בשרת ולא נכתבת מהדפדפן, כדי שיהיה לזה ערך אמיתי כשמסתכלים
-- על החנות בחמ"ל.

alter table stores add column if not exists parent_consent_at timestamptz;

comment on column stores.parent_consent_at is
  'הילדה אישרה שההורים יודעים ומאשרים. תנאי להצהרת תשלום.';

-- חנויות שכבר פורסמו לא נדרשות לאשר רטרואקטיבית — הן כבר עברו אישור ידני
update stores set parent_consent_at = activated_at
 where parent_consent_at is null and activated_at is not null;

create or replace function set_parent_consent(p_store uuid, p_consent boolean)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update stores
     set parent_consent_at = case when p_consent then now() else null end
   where id = p_store;
end $$;

-- ההצהרה על תשלום היא הצעד שמכניס את החנות לרשימת האישורים שלי, ולכן
-- הבדיקה יושבת כאן ולא רק ב-UI: צ'קבוקס בדפדפן אפשר לעקוף, פונקציה בשרת לא.
create or replace function claim_store_payment(p_store uuid, p_method text, p_ref text)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from stores s where s.id = p_store and s.parent_consent_at is not null
  ) then
    raise exception 'parent consent required';
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
    grant execute on function set_parent_consent(uuid, boolean) to authenticated;
    grant execute on function claim_store_payment(uuid, text, text) to authenticated;
  end if;
end $$;
