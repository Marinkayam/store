-- 0010 — הפרדה מלאה בין שני סוגי כסף שאין ביניהם שום קשר:
--
--   1. התשלום לדוכן   — ₪200 חד-פעמי על הקמת החנות. עמודות payment_* (מיגרציה 0008).
--                        עובר למנהלת, מאושר ידנית, ומופיע בחמ"ל.
--   2. הכסף של הילדה  — מה שקונה משלמת לה על מוצר. עמודות payout_* (כאן).
--                        לא עובר דרכנו, לא נספר אצלנו, ואין לנו עליו עמלה.
--
-- payout_* הן העדפות תצוגה בלבד: הן אומרות לקונה איך לשלם, וזהו.
-- אנחנו לא מסלקים, לא מאמתים תשלום ולא יודעים אם שולם — הילדה מסמנת "שולם" בעצמה.

alter table stores add column if not exists payout_bit    boolean not null default true;
alter table stores add column if not exists payout_paybox boolean not null default false;
alter table stores add column if not exists payout_cash   boolean not null default true;
alter table stores add column if not exists payout_note   text;

comment on column stores.payout_bit  is 'הילדה מקבלת ביט (למספר הוואטסאפ שלה)';
comment on column stores.payout_cash is 'הילדה מקבלת מזומן במסירה';
comment on column stores.payout_note is 'הערה חופשית לקונה: "ביט לאמא 052-...", "מזומן מדויק בבקשה"';
