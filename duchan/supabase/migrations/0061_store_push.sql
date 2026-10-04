-- 0061 — התראת פוש לדוכן כשמגיעה הזמנה.
--
-- "אגב אפשר לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה."
--
-- מכשיר (טלפון/דפדפן) שראש הדוכן או השותף/ה הדליקו בו התראות, לדוכן מסוים.
-- של השרת בלבד (service role) — הדפדפן מדבר איתה דרך /api/push, שבודק
-- שהמשתמש/ת מנהל/ת את הדוכן. אותו מכשיר יכול לקבל התראות מכמה דוכנים,
-- ולכן המפתח הוא (store_id, endpoint) ולא endpoint לבד.
--
-- לא נמחקות: מנוי שהדפדפן ביטל או שכובה מסומן disabled_at (מיגרציות רק
-- מוסיפות, ושורה שמסבירה למה ההתראות הפסיקו שווה יותר משורה שנעלמה).
-- שותף/ה שיצא/ה מהדוכן מפסיק/ה לקבל התראות גם בלי למחוק — השרת שולח רק
-- למי שעדיין בצוות.

create table if not exists store_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  device       text,                     -- "אייפון", "אנדרואיד", "מחשב" — לתצוגה
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz,
  disabled_at  timestamptz,
  unique (store_id, endpoint)
);
create index if not exists store_push_subscriptions_store_idx
  on store_push_subscriptions (store_id) where disabled_at is null;
alter table store_push_subscriptions enable row level security;
revoke all on store_push_subscriptions from public, anon, authenticated;
grant all on store_push_subscriptions to service_role;
