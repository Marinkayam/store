-- 0014 — תגיות על מוצרים.
--
-- שתי משפחות, ובכוונה:
--
-- תגיות שהילדה בוחרת:  💎 נדיר · 🎁 מבצע
-- תגיות שהמערכת מחשבת: ⭐ הכי נמכר · 🔥 חדש · ⌛ אחרון במלאי
--
-- ההפרדה היא הלקח העסקי עצמו. "הכי נמכר" שאפשר להדביק על כל מוצר הוא מדבקה;
-- "הכי נמכר" שמחושב מהזמנות ששולמו הוא משוב אמיתי על מה השוק באמת רצה. ילדה
-- שרואה את הכוכב עובר ממוצר למוצר לומדת משהו שאי אפשר ללמד בהסבר.
--
-- התגיות המחושבות לא נשמרות בטבלה — הן נגזרות בקריאה. תגית שנשמרת מתיישנת:
-- "אחרון במלאי" שנכתב אתמול משקר היום.

alter table products add column if not exists badge text;

alter table products drop constraint if exists products_badge_check;
alter table products add constraint products_badge_check
  check (badge is null or badge in ('rare', 'sale'));

comment on column products.badge is 'תגית שהילדה בחרה: rare · sale. null = אין. המחושבות לא נשמרות כאן.';
