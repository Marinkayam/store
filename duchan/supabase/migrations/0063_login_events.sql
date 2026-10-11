-- 0063 — יומן כניסות: רצף אחד לכל מספר, מהבקשה הראשונה ועד הכניסה.
--
-- הרקע: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין קשה לי
-- לתת להם מענה כי אין לי פלואו רציף."
--
-- עד עכשיו החמ"ל ידע רק מה שהשאירה phone_otps: כמה קודים נשלחו וכמה
-- ניסיונות שגויים. לא נרשם: מספר לא תקין שהוקלד, סמס שהספק דחה, קוד שפג,
-- קוד נכון שהכניסה אחריו נכשלה, או שהיא נכנסה ומיד ביקשה קוד שוב (עוגיות
-- חסומות בדפדפן של אפליקציה). כאן נרשם כל שלב כשורה, והחמ"ל מסדר אותן
-- לציר זמן ולמשפט אחד: מה קרה ומה עושים.
--
-- פרטיות: בלי תוכן הקוד ובלי כתובת IP — רק טביעת אצבע חד-כיוונית שלה, כמו
-- ב-phone_otps — ובלי User-Agent גולמי, רק תווית גסה ("ספארי באייפון").
-- נשמר 30 יום (קרון). שרת בלבד, כמו phone_otps.
--
-- additive בלבד: טבלה חדשה, שום דבר קיים לא משתנה.

create table if not exists login_events (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  -- E.164 בלי +. למספר לא תקין: הספרות כפי שהוקלדו (עד 15), כדי שאפשר יהיה
  -- לחפש אותן כשהיא מספרת מה הקלידה.
  phone   text not null,
  kind    text not null,
  detail  text,
  client  text,
  ip_hash text
);

create index if not exists login_events_phone_at on login_events (phone, at desc);
create index if not exists login_events_at on login_events (at desc);

comment on table login_events is
  'יומן שלבי כניסה בסמס ובקישור. נכתב מהשרת בלבד, נשמר 30 יום. בלי קודים ובלי IP.';

alter table login_events enable row level security;
revoke all on login_events from public, anon, authenticated;
grant all on login_events to service_role;
