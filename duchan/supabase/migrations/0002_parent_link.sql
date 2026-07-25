-- לינק בקרה להורה: נשלח ב-SMS בפתיחת החנות, מאפשר השהיה/הפעלה בלי חשבון.
-- מיגרציות רק מוסיפות: עמודה חדשה, nullable.

alter table stores add column parent_token text unique;
