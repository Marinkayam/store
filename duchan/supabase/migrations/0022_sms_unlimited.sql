-- דגל פר-חנות שפוטר את מספר הטלפון שלה ממכסת הסמס היומית, בלי להעניק לה
-- גישת אדמין. שימושי ללקוחה שבודקת הרבה ונתקעת במכסה שנועדה לעצור הצפה,
-- לא אותה. נשלט מהחמ"ל בלבד.

alter table stores add column if not exists sms_unlimited boolean not null default false;
