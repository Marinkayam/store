-- 0053 — "המומלצים" בראש הדוכן, ומוצרים שאזלו יורדים מהדוכן לבד.
--
-- products.featured      — המוכרת סימנה ⭐ מומלץ. null = לא.
-- stores.featured_title  — הכותרת של חלק המומלצים. null = "המומלצים שלי".
-- stores.show_sold_out   — true = להציג מוצרים שאזלו עם תווית "אזל".
--                          null/false = להסתיר אותם (ההתנהגות החדשה לכולם).
--                          המוצר לא נמחק; הוא חוזר ברגע שמוסיפים מלאי.

alter table products add column if not exists featured boolean;
alter table stores   add column if not exists featured_title text;
alter table stores   add column if not exists show_sold_out  boolean;

alter table stores drop constraint if exists stores_featured_title_len;
alter table stores add constraint stores_featured_title_len
  check (featured_title is null or length(featured_title) <= 40);

comment on column products.featured is 'מופיע בחלק "המומלצים" בראש הדוכן. null = לא.';
comment on column stores.featured_title is 'כותרת חלק המומלצים. null = "המומלצים שלי".';
comment on column stores.show_sold_out is 'true = להציג מוצרים שאזלו עם "אזל". null/false = להסתיר.';

notify pgrst, 'reload schema';
