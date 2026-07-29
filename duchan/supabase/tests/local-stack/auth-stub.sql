-- סימולציה של סביבת Supabase: סכמת auth עם users ו-uid()
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

-- **המפתח היחודי על המייל אינו קישוט.** ב-Supabase אמיתי אי אפשר לרשום
-- שני חשבונות עם אותו מייל, ובלי האילוץ הזה השים המקומי צבר כפילויות:
-- הכניסה בסמס מחפשת משתמשת לפי מייל ומקבלת את *הראשונה*, בזמן
-- ש-phone_accounts מצביע על האחרונה. התוצאה היא סשן של משתמשת אחת
-- ובדיקת הרשאה מול משתמשת אחרת — נכשל בלי שום שגיאה שמסבירה למה.
create unique index if not exists auth_users_email_key on auth.users (lower(email));

create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;
