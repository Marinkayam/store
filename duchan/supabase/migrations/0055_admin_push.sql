-- 0055 — התראות פוש לטלפון של המנהלת.
--
-- "אני צריכה אצלי פוש מי שיצר חנות, או מחכה למשהו, או לא עובד."
--
-- שלוש טבלאות, כולן של השרת בלבד (service role). אף אחת מהן לא נגישה
-- לדפדפן — לא לילדות ולא למנהלת עצמה; החמ"ל מדבר איתן דרך API שבודק
-- שהיא מנהלת.
--
--   admin_push_subscriptions — טלפון/דפדפן שהמנהלת הדליקה בו התראות.
--     לא נמחקות: מנוי שהדפדפן ביטל מסומן disabled_at (מיגרציות רק מוסיפות,
--     ושורה שמסבירה למה התראות הפסיקו להגיע שווה יותר משורה שנעלמה).
--   admin_alerts — יומן של מה נשלח. המפתח (kind, ref) מונע כפילויות:
--     אותה ילדה שתקועה בכניסה לא מקפיצה עשר התראות.
--   app_secrets — מפתחות VAPID, כשאין אותם במשתני הסביבה. נוצרים פעם אחת
--     בשרת ונשמרים כאן, כדי שהתראות יעבדו בלי שמישהי תצטרך לגעת בוורסל.

create table if not exists admin_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  admin        text not null,           -- מי הדליקה (אימייל/טלפון מהחמ"ל)
  device       text,                     -- "אייפון", "אנדרואיד", "מחשב" — לתצוגה
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz,
  disabled_at  timestamptz
);
alter table admin_push_subscriptions enable row level security;
revoke all on admin_push_subscriptions from public, anon, authenticated;
grant all on admin_push_subscriptions to service_role;

create table if not exists admin_alerts (
  kind        text not null,              -- store_created · payment_claimed · login_stuck · sms_failed · test
  ref         text not null,              -- מזהה למניעת כפילות (מזהה חנות, טלפון+שעה…)
  title       text not null,
  body        text,
  url         text,
  sent_to     int not null default 0,     -- לכמה מכשירים יצא
  created_at  timestamptz not null default now(),
  primary key (kind, ref)
);
create index if not exists admin_alerts_created_idx on admin_alerts (created_at desc);
alter table admin_alerts enable row level security;
revoke all on admin_alerts from public, anon, authenticated;
grant all on admin_alerts to service_role;

create table if not exists app_secrets (
  key         text primary key,
  value       text not null,
  created_at  timestamptz not null default now()
);
alter table app_secrets enable row level security;
revoke all on app_secrets from public, anon, authenticated;
grant all on app_secrets to service_role;
