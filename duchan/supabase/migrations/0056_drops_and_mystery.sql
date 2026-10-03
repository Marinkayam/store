-- 0056 — דרופ ושקית הפתעה.
--
-- products.drop_at     — המוצר נפתח להזמנה בזמן הזה. עד אז הוא מוצג בדוכן
--                        עם ספירה לאחור, ואי אפשר להזמין אותו (נאכף ב-/api/orders,
--                        place_order פתוחה רק לשרת — 0051). null = פתוח רגיל.
-- products.is_mystery  — שקית הפתעה: הקונים לא יודעים מה בפנים. null = מוצר רגיל.
--
-- רק מוסיפים, ושני השדות nullable — כמו כל עמודה חדשה (CLAUDE.md §9).
alter table products add column if not exists drop_at timestamptz;
alter table products add column if not exists is_mystery boolean;

comment on column products.drop_at is 'דרופ: נפתח להזמנה בזמן הזה. null = פתוח רגיל.';
comment on column products.is_mystery is 'שקית הפתעה: הקונים לא יודעים מה בפנים. null = מוצר רגיל.';

-- הדרופים הקרובים של דוכן נקראים בכל טעינה של הדף הפומבי
create index if not exists products_drop_at on products (store_id, drop_at) where drop_at is not null and deleted_at is null;
