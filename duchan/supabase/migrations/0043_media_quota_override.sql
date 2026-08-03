-- 0043 — מכסת אחסון מוגדלת לילדה ספציפית.
--
-- "תן לילדה עוד אפשרות אחסון מעל 25": 25MB לחנות הספיקו לתמונות,
-- אבל חנות פעילה עם סרטונים (גם דחוסים, ~1MB האחד) מתמלאת. במקום
-- להרים את התקרה לכולן — מה שפותח את מודל העלות — המנהלת מגדילה
-- לחנות/אוסף ספציפיים מהחמ"ל.
--
-- null = ברירת המחדל הגלובלית (25MB, lib/quotas.ts). ערך = תקרה
-- בבייטים לחנות/אוסף הזו בלבד.

alter table stores add column if not exists media_quota_bytes bigint;
comment on column stores.media_quota_bytes is
  'תקרת מדיה מותאמת לחנות, בבייטים. null = ברירת המחדל הגלובלית.';

alter table squish_profiles add column if not exists media_quota_bytes bigint;
comment on column squish_profiles.media_quota_bytes is
  'תקרת מדיה מותאמת לאוסף, בבייטים. null = ברירת המחדל הגלובלית.';
