-- גיל (מספר), לא תאריך לידה מלא: פחות מזהה, ומספיק כדי לשייך תוכן בפיד
-- עתידי לפי קבוצת גיל. לא חובה בטופס, ולעולם לא נחשף בקריאה הפומבית של
-- החנות — אותו כלל כמו contact_phone ו-parent_email.

alter table stores add column if not exists age int;

alter table stores drop constraint if exists stores_age_check;
alter table stores add constraint stores_age_check check (age is null or (age between 5 and 18));
