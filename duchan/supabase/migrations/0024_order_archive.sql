-- הסתרת הזמנה שאינה רלוונטית.
--
-- "ביטול" כבר קיים והוא סטטוס אמיתי: מישהו הזמין וההזמנה לא יצאה לפועל,
-- והמלאי חוזר. אבל הזמנות מבוטלות נשארו ברשימה לנצח, וגם הזמנות בדיקה
-- שהילדה שלחה לעצמה. היא ביקשה דרך להוריד אותן מהמסך.
--
-- מחיקה רכה בלבד, כמו במוצרים: השורה נשארת לחשבונאות ולגיבוי, והמסך
-- פשוט לא מציג אותה. אין כאן delete.

alter table orders add column if not exists deleted_at timestamptz;

-- אינדקס לרשימה של חנות אחת, שמסננת את המוסתרות
create index if not exists orders_store_visible_idx
  on orders (store_id, created_at desc)
  where deleted_at is null;
