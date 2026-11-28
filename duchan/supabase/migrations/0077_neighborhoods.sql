-- 0077: השוק של השכונה (שלב 1 של העיר הקהילתית).
--
-- מרינה, 11.2026: "בוא נעשה בשכונה". דוכן יכול להיכנס לשוק של השכונה שלו,
-- ושם רואים רק את הדוכנים של השכנים שההורים שלהם אישרו.
--
-- כללים (CLAUDE.md, סעיף 9):
--   • שכונה היא שורה אחת עם מזהה, ביישוב מרשימת הלמ"ס, וייחודית לפי מפתח
--     השם בתוך היישוב. אין רשימה רשמית ארצית של שכונות, אז הרשימה נבנית
--     מבקשות: הורה כותב שם, המנהלת מאשרת (או מאחדת עם שכונה קיימת), ורק
--     אז נוצרת שורה. טקסט חופשי לא יוצר רשומה.
--   • השיוך לא יושב על שורת stores (הדפדפן כותב אליה), אלא בטבלה משלו
--     שרק השרת כותב אליה. בלי policies: service role בלבד.
--   • לדוכן אין כתובת ואין רחוב. רק יישוב ושכונה.
--   • מוסיפים בלבד.

create table if not exists neighborhoods (
  id          uuid primary key default gen_random_uuid(),
  locality_id integer not null references localities(id),
  name        text not null check (char_length(name) between 2 and 40),
  -- מפתח השוואה (lib/hood.ts → hoodKey): בלי "שכונת", בלי ניקוד וגרשיים
  name_key    text not null,
  created_at  timestamptz not null default now(),
  unique (locality_id, name_key)
);

comment on table neighborhoods is 'שכונות לשוק של השכונה (0077). נוצרות רק באישור המנהלת. שרת בלבד.';

create table if not exists neighborhood_members (
  store_id           uuid primary key references stores(id) on delete cascade,
  locality_id        integer not null references localities(id),
  -- null כשבחרו "השכונה שלנו לא ברשימה" ועוד לא אושר שם
  neighborhood_id    uuid references neighborhoods(id),
  -- השם שההורה כתב, כשהשכונה לא ברשימה. לבדיקה בחמ"ל בלבד, לא מוצג לאף אחד
  requested_name     text check (requested_name is null or char_length(requested_name) between 2 and 40),
  -- parent: מחכה לאישור ההורה · review: ההורה אישר, השם בבדיקה ·
  -- active: בשוק · rejected: השם לא אושר · left: יצאו מהשוק
  status             text not null default 'parent' check (status in ('parent', 'review', 'active', 'rejected', 'left')),
  invited_by         uuid references stores(id) on delete set null,
  parent_approved_at timestamptz,
  joined_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table neighborhood_members is 'דוכן ← שכונה (0077). שורה אחת לדוכן. רק השרת כותב.';

create index if not exists neighborhood_members_hood on neighborhood_members (neighborhood_id, status);

alter table neighborhoods enable row level security;
alter table neighborhood_members enable row level security;
-- בכוונה בלי policies: קריאה וכתיבה רק דרך השרת (service role), שבודק
-- שהקורא חבר פעיל באותה שכונה.
