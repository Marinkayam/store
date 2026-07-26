-- 0011 — כתיבת תיאורים ב-AI לכולן, לא כפרימיום.
--
-- ההיגיון: תיאור עולה ~0.6 אגורות ב-Haiku. חנות עם 20 מוצרים = ~12 אגורות.
-- הסף הזה נמוך מכדי להצדיק גדר, והפיצ'ר עוזר בדיוק במקום שילדה בת עשר נתקעת —
-- היא יודעת לצלם, היא לא יודעת לנסח.
--
-- הקרדיטים נשארים, אבל לא כמנגנון מכירה — כתקרה נגד לולאה או שימוש לרעה.
-- 50 מכסה 20 מוצרים עם המון ניסיונות חוזרים.

alter table stores alter column ai_enabled set default true;
alter table stores alter column ai_credits set default 50;

-- חנויות קיימות מקבלות את זה גם הן
update stores set ai_enabled = true where coalesce(ai_enabled, false) = false;
update stores set ai_credits = 50 where ai_credits is null;

comment on column stores.ai_enabled is 'דלוק כברירת מחדל. המנהלת יכולה לכבות לחנות בעייתית.';
comment on column stores.ai_credits is 'תקרת שימוש, לא מכסת מכירה. null = ללא הגבלה.';
