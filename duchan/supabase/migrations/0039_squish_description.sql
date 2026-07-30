-- 0039 — תיאור לסקווישי, ומכסה יומית לכתיבה האוטומטית.
--
-- מהישיבה של מרינה עם ים (8): היא רוצה שה-AI יכתוב על הסקווישי —
-- צבע, צורה — כמו שהוא כותב תיאורי מוצרים בדוכן.
--
-- הכתיבה עצמה קורית בשרת (/api/squish/describe) עם אותו מפתח של
-- דוכן. כאן רק שני דברים: איפה התיאור גר, וכמה מותר ביום.

alter table squish_items add column if not exists description text;
comment on column squish_items.description is
  'תיאור קצר של הסקווישי. נכתב על ידי הילדה או מוצע על ידי AI ונערך על ידה.';

/* המכסה יושבת על הפרופיל ולא על חנות: לילדת סקוויש לא בהכרח יש דוכן,
   ומערכת הקרדיטים של דוכן היא פר-חנות. עשרים ביום זה הרבה יותר ממה
   שאוסף סביר צריך, ומעט מדי בשביל שמישהו ירוץ על המפתח שלנו. */
alter table squish_profiles add column if not exists ai_used_on date;
alter table squish_profiles add column if not exists ai_used_count int not null default 0;

create or replace function squish_use_ai(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update squish_profiles
     set ai_used_on   = current_date,
         ai_used_count = case when ai_used_on = current_date then ai_used_count + 1 else 1 end
   where user_id = p_user
     and (ai_used_on is distinct from current_date or ai_used_count < 20)
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

/* בסופרבייס יש default privileges שנותנות EXECUTE ל-anon ול-authenticated
   על כל פונקציה חדשה — ו-revoke מ-public לא מוריד גרנט ישיר. בלי השורה
   השנייה כל דפדפן יכול לקרוא לפונקציה דרך PostgREST ולשרוף את המכסה
   של ילדה אחרת. נתפס ואומת מול פרודקשן. */
revoke all on function squish_use_ai(uuid) from public;
revoke execute on function squish_use_ai(uuid) from anon, authenticated;
grant execute on function squish_use_ai(uuid) to service_role;
