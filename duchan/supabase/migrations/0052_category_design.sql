-- 0052 — עיצוב הקטגוריות בדוכן.
--
-- category_layout — איך נראית שורת הקטגוריות: text (ברירת המחדל, הצ'יפים
--                   של היום), icon, circle, square, card. null = text.
-- category_size   — sm / md / lg. null = md.
-- category_meta   — לכל קטגוריה (לפי השם): { "emoji": "🧸", "image": "<r2 key>" }.
--                   תמונה גוברת על אמוג'י. קטגוריה בלי כלום מקבלת את האות
--                   הראשונה שלה, כך שאין אף פעם משבצת ריקה.
--
-- המפתחות נאכפים בקוד (lib/category-style.ts): ערך לא מוכר נופל לברירת
-- המחדל בתצוגה, והוספת צורה חדשה לא תחייב מיגרציה.

alter table stores add column if not exists category_layout text;
alter table stores add column if not exists category_size   text;
alter table stores add column if not exists category_meta   jsonb;

alter table stores drop constraint if exists stores_category_design_len;
alter table stores add constraint stores_category_design_len
  check (
    (category_layout is null or length(category_layout) <= 20) and
    (category_size is null or length(category_size) <= 10) and
    (category_meta is null or (jsonb_typeof(category_meta) = 'object' and pg_column_size(category_meta) <= 20000))
  );

comment on column stores.category_layout is 'צורת שורת הקטגוריות (lib/category-style.ts). null = text.';
comment on column stores.category_size is 'גודל שורת הקטגוריות: sm/md/lg. null = md.';
comment on column stores.category_meta is 'אמוג''י/תמונה לכל קטגוריה, לפי שם: {"שם": {"emoji": "...", "image": "key"}}';

notify pgrst, 'reload schema';
