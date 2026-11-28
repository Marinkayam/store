-- 0077: השוק של העיר (שלב 1 של העיר הקהילתית).
--
-- מרינה, 11.2026: "בגלל שאנחנו רק מתפתחים, שיהיה עיר, ואז יהיה אחד ליד
-- השני, ואז כשנגדל נוכל לסווג את זה בשכונות". דוכן נכנס לשוק של העיר שלו,
-- ושם רואים רק את הדוכנים מאותה עיר שההורים שלהם אישרו.
--
-- כללים (CLAUDE.md, סעיף 9):
--   • העיר מרשימת היישובים של הלמ"ס (localities). אין טקסט חופשי.
--   • השיוך לא יושב על שורת stores (הדפדפן כותב אליה), אלא בטבלה משלו
--     שרק השרת כותב אליה. בלי policies: service role בלבד.
--   • לדוכן אין כתובת. רק יישוב. שכונות יתווספו בעתיד, בטבלה משלהן
--     ובעמודה חדשה כאן, במיגרציה נפרדת.
--   • מוסיפים בלבד.

create table if not exists community_members (
  store_id           uuid primary key references stores(id) on delete cascade,
  locality_id        integer not null references localities(id),
  -- parent: מחכה לאישור ההורה · active: בשוק · left: יצאו (או שההורה לא אישר)
  status             text not null default 'parent' check (status in ('parent', 'active', 'left')),
  invited_by         uuid references stores(id) on delete set null,
  parent_approved_at timestamptz,
  joined_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table community_members is 'דוכן ← השוק של העיר (0077). שורה אחת לדוכן. רק השרת כותב.';

create index if not exists community_members_city on community_members (locality_id, status);

alter table community_members enable row level security;
-- בכוונה בלי policies: קריאה וכתיבה רק דרך השרת (service role), שבודק
-- שהקורא חבר פעיל באותה עיר.
