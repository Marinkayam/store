-- 0038 — הודעה לקונות בדף הדוכן.
--
-- **הבקשה מהשטח.** בעלת דוכן רצתה מקום לכתוב "בקנייה מעל ₪50 מקבלים
-- מחזיק מפתחות מתנה" — מבצע החודש, הודעה לקונות, משהו שהיא מעדכנת
-- ומכבה בעצמה. עד היום המקום היחיד לכתוב משהו כזה היה התיאור, והוא
-- מיועד לספר מה יש בדוכן, לא להכריז על מבצע שמסתיים.
--
-- שלושה שדות, וזו לא קמצנות: כותרת, טקסט, ומתג. תאריך תפוגה לא נכנס
-- כאן בכוונה — הוא מוסיף שדה, מסך, ולוגיקה, כדי לפתור בעיה שכיבוי
-- בלחיצה אחת כבר פותר.

alter table stores add column if not exists promo_on    boolean not null default false;
alter table stores add column if not exists promo_title text;
alter table stores add column if not exists promo_text  text;

comment on column stores.promo_on is
  'האם ההודעה מוצגת בדף הדוכן. כיבוי לא מוחק את מה שנכתב.';
comment on column stores.promo_title is
  'כותרת קצרה, למשל "מבצע החודש". ריק = כותרת ברירת מחדל במסך.';
comment on column stores.promo_text is
  'ההודעה עצמה. נכתבת על ידי בעלת הדוכן ומוצגת לקונות.';

/* אורך נאכף בדאטהבייס ולא רק במסך: באנר של חמש שורות דוחף את המוצרים
   מתחת לקפל, וזה בדיוק מה שהוא אמור למכור. */
do $$ begin
  alter table stores add constraint stores_promo_len
    check (
      (promo_title is null or char_length(promo_title) <= 40)
      and (promo_text is null or char_length(promo_text) <= 180)
    );
exception when duplicate_object then null; end $$;

/* אין כאן RLS חדש: `own_store` כבר נותן לבעלת הדוכן לערוך את השורה
   שלה, והקריאה הפומבית עוברת בשרת עם שדות מפורשים. */
