-- פרטי הורה הופכים לאופציונליים — ההרשמה היא של הילדה בלבד.
-- מיגרציה רק מרפה אילוץ (drop not null) — לא שוברת שורות קיימות.

alter table stores alter column parent_name  drop not null;
alter table stores alter column parent_phone drop not null;
alter table stores alter column parent_email drop not null;
