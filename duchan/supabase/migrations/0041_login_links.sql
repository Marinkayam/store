-- 0041 — כניסה בקישור מהחמ"ל, בלי סמס.
--
-- הרקע: קודי האימות לא מגיעים לחלק מהילדות — לחבילות סלולר של ילדים
-- יש סינון תכנים שבולע סמסים משמות שולח. הקישור עוקף את הסמס אבל לא
-- את הזהות: הוא נכנס לאותו חשבון לפי מספר הטלפון, כך שהאוסף והחנות
-- של הילדה נשארים שלה בדיוק כמו בכניסה רגילה.
--
-- בטיחות: הקישור נוצר רק על ידי מנהלת, חד-פעמי, פג אחרי 24 שעות,
-- וכל יצירה ושימוש נרשמים כאן.

create table if not exists login_links (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null,
  phone      text not null,               -- E.164 בלי +: 972501234567
  created_by text not null default 'admin',
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz default now()
);

comment on table login_links is
  'קישורי כניסה חד-פעמיים שמנהלת מייצרת כשסמס לא מגיע. הטוקן הוא הסוד — השורה נשרפת בשימוש הראשון.';

-- שרת בלבד. RLS בלי policy = גם אם גרנט ידלוף, אין קריאה.
alter table login_links enable row level security;
revoke all on login_links from public, anon, authenticated;
grant all on login_links to service_role;
