-- 0013 — כניסה בסמס במקום מייל וסיסמה.
--
-- ילדה בת עשר לא ממציאה סיסמה ולא זוכרת אותה, וזה היה המסך שבו נטשו. במקום
-- מייל + סיסמה + טלפון של הורה יש עכשיו שדה אחד: המספר שלה. אותו מספר הוא גם
-- מספר הוואטסאפ שאליו יגיעו ההזמנות, אז אין כאן שני שדות שאפשר לבלבל ביניהם.
--
-- הקודים לא נשמרים כטקסט. נשמר HMAC, וכל אימות מוגבל בניסיונות ובזמן.
-- שתי הטבלאות האלה נגישות ל-service role בלבד: RLS דלוק ואין להן שום policy,
-- ולכן anon ו-authenticated לא רואים מהן כלום גם אם ינחשו את השם.

create table if not exists phone_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index if not exists phone_otps_phone_idx on phone_otps (phone, created_at desc);
create index if not exists phone_otps_created_idx on phone_otps (created_at);

-- מיפוי מספר → משתמש. בלעדיו היינו צריכים לסרוק את רשימת המשתמשים בכל כניסה.
create table if not exists phone_accounts (
  phone      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists phone_accounts_user_idx on phone_accounts (user_id);

alter table phone_otps     enable row level security;
alter table phone_accounts enable row level security;

-- RLS בלי policy כבר חוסם, אבל ההרשאות נשללות במפורש כדי לא להישען על שכבה
-- אחת בלבד: ברירות המחדל של Supabase מעניקות הרשאה לטבלאות חדשות, ושתי
-- הטבלאות האלה הן החומר שממנו מורכבת הכניסה לחשבון.
revoke all on phone_otps     from anon, authenticated;
revoke all on phone_accounts from anon, authenticated;
grant  all on phone_otps     to service_role;
grant  all on phone_accounts to service_role;

comment on table phone_otps is 'קודי אימות חד-פעמיים. HMAC בלבד, לא הקוד עצמו. service role בלבד.';
comment on table phone_accounts is 'מספר טלפון מאומת → משתמש. service role בלבד.';

-- המכסה עוברת מאימייל של הורה לטלפון של הילדה. טלפון הוא מזהה חזק יותר
-- למניעת ריבוי חנויות: אפשר להמציא כתובת מייל, קשה יותר להשיג עוד מספר.
create index if not exists stores_contact_phone_idx on stores (contact_phone);
