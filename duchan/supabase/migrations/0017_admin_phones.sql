-- 0017 — רשימת המנהלות בדאטהבייס, לא רק במשתני סביבה.
--
-- הכניסה עברה לסמס, והזיהוי כמנהלת נשען על ADMIN_PHONES בוורסל. משתנה סביבה
-- שלא הוגדר (או הוגדר בסביבה הלא נכונה, או בלי Redeploy) נועל את המנהלת מחוץ
-- לחמ"ל שלה — וזו נעילה שאי אפשר לפרוץ מבפנים, כי כדי להיכנס צריך להיות
-- מנהלת. שורה בטבלה נשמרת פעם אחת ולא תלויה בדיפלוי.
--
-- ADMIN_PHONES ו-ADMIN_EMAILS ממשיכים לעבוד; זו תוספת, לא החלפה.

create table if not exists admin_phones (
  phone      text primary key,          -- E.164 ללא +: 972501234567
  note       text,
  created_at timestamptz not null default now()
);

comment on table admin_phones is
  'מספרים שמורשים לחמ"ל. נכתב רק מהשרת (CRON_SECRET), לעולם לא מהדפדפן.';

alter table admin_phones enable row level security;

-- אין policy בכוונה: RLS בלי policy חוסם הכל. ההרשאות נשללות גם במפורש
-- כדי לא להישען על שכבה אחת — הטבלה הזו היא רשימת המפתחות לבית.
revoke all on admin_phones from anon, authenticated;
grant  all on admin_phones to service_role;
