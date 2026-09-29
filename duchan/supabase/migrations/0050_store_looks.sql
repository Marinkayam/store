-- 0050 — סגנון ורקע לדוכן.
--
-- look       — צורת הדוכן: פינות, קווים, צל וגופן. null = הבסיס.
-- bg_pattern — הרקע של הדף: דוגמה מוכנה, או 'photo' לתמונה שהמוכרת העלתה.
--              null = הרקע השטוח של ערכת הצבעים.
-- bg_key     — התמונה עצמה ב-R2 ({storeId}/background.webp).
--
-- הצבעים נשארים ב-theme. שלושת אלה מתלבשים עליו, כך ש"חזרה לבסיס"
-- היא פשוט שלושה null.
--
-- המפתחות נאכפים בקוד ולא ב-check: מפתח שלא מוכר נופל לבסיס בתצוגה,
-- ואסור שהוספת סגנון חדש תחייב מיגרציה.

alter table stores add column if not exists look       text;
alter table stores add column if not exists bg_pattern text;
alter table stores add column if not exists bg_key     text;

alter table stores drop constraint if exists stores_look_len;
alter table stores add constraint stores_look_len
  check ((look is null or length(look) <= 20) and (bg_pattern is null or length(bg_pattern) <= 20));

comment on column stores.look is 'סגנון הדוכן (lib/looks.ts). null = בסיס.';
comment on column stores.bg_pattern is 'רקע הדף: מפתח דוגמה, או photo. null = בלי רקע.';
comment on column stores.bg_key is 'תמונת רקע שהועלתה. בשימוש רק כש-bg_pattern = photo.';

notify pgrst, 'reload schema';
