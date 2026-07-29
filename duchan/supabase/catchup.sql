-- ═══════════════════════════════════════════════════════════════
--  דוכן — עדכון דאטהבייס קיים
--
--  להדביק ב-Supabase → SQL Editor → Run.
--  בטוח להרצה חוזרת: מה שכבר קיים פשוט מדולג.
--
--  נוצר אוטומטית ע"י scripts/gen-catchup.mjs — אין לערוך ביד.
-- ═══════════════════════════════════════════════════════════════

begin;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 0008_activation.sql
-- ───────────────────────────────────────────────────────────────

-- 0008 — הפעלת חנות בתשלום חד-פעמי.
-- הילדה בונה הכל בחינם. הלינק נפתח לשיתוף רק אחרי שהחנות הופעלה.
-- אנחנו לא סולקים כסף: היא משלמת בביט/פייבוקס והמנהלת מאשרת ידנית.

alter table stores add column if not exists activated_at       timestamptz;
alter table stores add column if not exists payment_claimed_at timestamptz;
alter table stores add column if not exists payment_method     text;
alter table stores add column if not exists payment_ref        text;
alter table stores add column if not exists payment_amount     int;

comment on column stores.activated_at       is 'רגע ההפעלה. null = טיוטה, הלינק לא פומבי.';
comment on column stores.payment_claimed_at is 'הילדה הצהירה ששילמה. ממתין לאישור המנהלת.';

-- חנויות שנפתחו לפני מודל התשלום ממשיכות לעבוד. מיגרציות רק מוסיפות.
update stores set activated_at = created_at where activated_at is null;

-- ההפעלה נעשית בשרת בלבד.
-- ל-RLS יש policy אחד רחב על stores (own_store, for all), כך שבלי השמירה הזו
-- הבעלות יכולה פשוט לעדכן activated_at מהדפדפן ולפרסם בלי לשלם.
-- למפתח service role אין sub ב-JWT, ולכן auth.uid() שלו null — וזה מה שמבדיל.
--
-- security definer כאן הוא חובה ולא נוחות: הטריגר רץ בהקשר של כל מי שמעדכן
-- את stores, ולא לכל תפקיד יש הרשאה על סכמת auth. בלי זה כל UPDATE על חנות
-- נופל ב-"permission denied for schema auth". auth.uid() קוראת GUC של הבקשה,
-- ולכן היא עדיין מחזירה את המשתמשת האמיתית גם תחת security definer.
create or replace function guard_store_activation()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    new.activated_at   := old.activated_at;
    new.payment_amount := old.payment_amount;
  end if;
  return new;
end $$;

drop trigger if exists stores_guard_activation on stores;
create trigger stores_guard_activation
  before update on stores
  for each row execute function guard_store_activation();

-- הצהרת תשלום של הילדה. security definer כדי שהחותמת תהיה של השרת ולא של הדפדפן.
create or replace function claim_store_payment(p_store uuid, p_method text, p_ref text)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update stores
     set payment_claimed_at = now(),
         payment_method     = nullif(left(coalesce(p_method, ''), 20), ''),
         payment_ref        = nullif(left(coalesce(p_ref, ''), 60), '')
   where id = p_store
     and activated_at is null;   -- חנות פעילה לא מצהירה שוב
end $$;

do $$ begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant execute on function claim_store_payment(uuid, text, text) to authenticated;
  end if;
end $$;

insert into schema_migrations (name) values ('0008_activation.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0009_referrals.sql
-- ───────────────────────────────────────────────────────────────

-- 0009 — מאיפה הגיעה כל חנות.
-- כך נבנית הרשת: ילדה רואה חנות של חברה, לוחצת "גם אני רוצה", ופותחת חנות
-- שרשומה כמי שהגיעה ממנה. מהאדמין רואים את האשכולות — כיתה, שכבה, שכונה.

alter table stores add column if not exists referred_by     uuid references stores(id) on delete set null;
alter table stores add column if not exists referral_source text;
alter table stores add column if not exists ref_clicks      int not null default 0;

comment on column stores.referred_by     is 'החנות שממנה הגיעה. null = הגיעה ישירות.';
comment on column stores.referral_source is 'store | direct | admin';
comment on column stores.ref_clicks      is 'כמה פעמים לחצו "פתחי חנות משלך" מדף החנות הזו.';

create index if not exists stores_referred_by_idx on stores (referred_by);

-- הגנה: הבעלות לא משנה שיוך אחרי היצירה (ולא מפעילה חנות — ראה 0008).
-- security definer מאותה סיבה שמוסברת ב-0008.
create or replace function guard_store_activation()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    new.activated_at   := old.activated_at;
    new.payment_amount := old.payment_amount;
    new.referred_by    := old.referred_by;
    new.ref_clicks     := old.ref_clicks;
  end if;
  return new;
end $$;

-- ספירת לחיצות על "פתחי חנות משלך". אטומית — כמה מבקרות בו-זמנית זה המצב הרגיל.
create or replace function bump_ref_click(p_store uuid)
returns void language sql security definer as $$
  update stores set ref_clicks = ref_clicks + 1 where id = p_store
$$;

-- לא מסתמכים על default privileges: פונקציה חדשה שאין עליה grant נכשלת בשקט
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function bump_ref_click(uuid) to service_role;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant execute on function bump_ref_click(uuid) to authenticated;
  end if;
end $$;

insert into schema_migrations (name) values ('0009_referrals.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0010_payouts.sql
-- ───────────────────────────────────────────────────────────────

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

insert into schema_migrations (name) values ('0010_payouts.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0011_ai_for_everyone.sql
-- ───────────────────────────────────────────────────────────────

-- 0011 — כתיבת תיאורים ב-AI לכולן, לא כפרימיום.
--
-- ההיגיון: תיאור עולה ~0.6 אגורות ב-Haiku. חנות עם 20 מוצרים = ~12 אגורות.
-- הסף הזה נמוך מכדי להצדיק גדר, והפיצ'ר עוזר בדיוק במקום שילדה בת עשר נתקעת —
-- היא יודעת לצלם, היא לא יודעת לנסח.
--
-- הקרדיטים נשארים, אבל לא כמנגנון מכירה — כתקרה נגד לולאה או שימוש לרעה.
-- 50 מכסה 20 מוצרים עם המון ניסיונות חוזרים.

alter table stores alter column ai_enabled set default true;
alter table stores alter column ai_credits set default 50;

-- חנויות קיימות מקבלות את זה גם הן
update stores set ai_enabled = true where coalesce(ai_enabled, false) = false;
update stores set ai_credits = 50 where ai_credits is null;

comment on column stores.ai_enabled is 'דלוק כברירת מחדל. המנהלת יכולה לכבות לחנות בעייתית.';
comment on column stores.ai_credits is 'תקרת שימוש, לא מכסת מכירה. null = ללא הגבלה.';

insert into schema_migrations (name) values ('0011_ai_for_everyone.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0012_product_options.sql
-- ───────────────────────────────────────────────────────────────

-- 0012 — אפשרות בחירה אחת לכל מוצר: צבע, מידה, טעם.
--
-- מכוון שזו *אפשרות אחת* ולא מטריצת וריאנטים. "חולצה S/M/L × 3 צבעים עם מלאי
-- לכל שילוב" הוא מוצר אחר לגמרי: הוא מכפיל את מסך עריכת המוצר, דורש ניהול מלאי
-- דו-ממדי, וילדה בת עשר נופלת בו. כאן: תווית אחת ורשימת בחירות.
--
-- המלאי נשאר על המוצר כולו ולא פר בחירה — מסיבה זהה.
-- הבחירה של הקונה נכנסת ל-snapshot של ההזמנה ולהודעת הוואטסאפ.

alter table products add column if not exists option_label text;
alter table products add column if not exists options      text[];

comment on column products.option_label is 'התווית שהילדה בחרה: "צבע" · "מידה" · "טעם". null = אין אפשרויות.';
comment on column products.options      is 'הבחירות עצמן. הקונה חייבת לבחור אחת לפני הוספה לסל.';

insert into schema_migrations (name) values ('0012_product_options.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0013_phone_auth.sql
-- ───────────────────────────────────────────────────────────────

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

insert into schema_migrations (name) values ('0013_phone_auth.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0014_badges.sql
-- ───────────────────────────────────────────────────────────────

-- 0014 — תגיות על מוצרים.
--
-- שתי משפחות, ובכוונה:
--
-- תגיות שהילדה בוחרת:  💎 נדיר · 🎁 מבצע
-- תגיות שהמערכת מחשבת: ⭐ הכי נמכר · 🔥 חדש · ⌛ אחרון במלאי
--
-- ההפרדה היא הלקח העסקי עצמו. "הכי נמכר" שאפשר להדביק על כל מוצר הוא מדבקה;
-- "הכי נמכר" שמחושב מהזמנות ששולמו הוא משוב אמיתי על מה השוק באמת רצה. ילדה
-- שרואה את הכוכב עובר ממוצר למוצר לומדת משהו שאי אפשר ללמד בהסבר.
--
-- התגיות המחושבות לא נשמרות בטבלה — הן נגזרות בקריאה. תגית שנשמרת מתיישנת:
-- "אחרון במלאי" שנכתב אתמול משקר היום.

alter table products add column if not exists badge text;

alter table products drop constraint if exists products_badge_check;
alter table products add constraint products_badge_check
  check (badge is null or badge in ('rare', 'sale'));

comment on column products.badge is 'תגית שהילדה בחרה: rare · sale. null = אין. המחושבות לא נשמרות כאן.';

insert into schema_migrations (name) values ('0014_badges.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0015_cover_presets.sql
-- ───────────────────────────────────────────────────────────────

-- 0015 — קאבר מוכן לבחירה, לא רק העלאה.
--
-- באונבורדינג ילדה עוד לא צילמה כלום, ולבקש ממנה תמונת קאבר לפני שיש לה
-- חנות זה לבקש החלטה על משהו שהיא לא רואה. רשימת קאברים מוכנים נותנת לה
-- חנות שנראית גמורה בשנייה, ואפשר להחליף בתמונה אמיתית מתי שתרצה.
--
-- הקאברים הם גרדיאנטים בקוד ולא קבצים: אפס בייטים באחסון, אפס תעבורה,
-- והם נראים חד בכל רזולוציה. cover_key גובר עליהם כשיש תמונה אמיתית.

alter table stores add column if not exists cover_preset text;

comment on column stores.cover_preset is 'מפתח קאבר מוכן מ-lib/covers.ts. cover_key (תמונה שהועלתה) גובר עליו.';

insert into schema_migrations (name) values ('0015_cover_presets.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0016_parent_consent.sql
-- ───────────────────────────────────────────────────────────────

-- 0016 — אישור הורה לפני פרסום, במקום בקרה הורית.
--
-- אין כאן חשבון להורה, אין אימות ואין מסך נפרד. יש הצהרה אחת של הילדה,
-- ברגע היחיד שבו היא באמת רלוונטית: לפני שהדוכן יוצא לעולם. עד אז היא
-- בונה, מעצבת ומשתפת תצוגה מקדימה — ואין מה לאשר.
--
-- החותמת נשמרת בשרת ולא נכתבת מהדפדפן, כדי שיהיה לזה ערך אמיתי כשמסתכלים
-- על החנות בחמ"ל.

alter table stores add column if not exists parent_consent_at timestamptz;

comment on column stores.parent_consent_at is
  'הילדה אישרה שההורים יודעים ומאשרים. תנאי להצהרת תשלום.';

-- חנויות שכבר פורסמו לא נדרשות לאשר רטרואקטיבית — הן כבר עברו אישור ידני
update stores set parent_consent_at = activated_at
 where parent_consent_at is null and activated_at is not null;

create or replace function set_parent_consent(p_store uuid, p_consent boolean)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update stores
     set parent_consent_at = case when p_consent then now() else null end
   where id = p_store;
end $$;

-- ההצהרה על תשלום היא הצעד שמכניס את החנות לרשימת האישורים שלי, ולכן
-- הבדיקה יושבת כאן ולא רק ב-UI: צ'קבוקס בדפדפן אפשר לעקוף, פונקציה בשרת לא.
create or replace function claim_store_payment(p_store uuid, p_method text, p_ref text)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from stores s where s.id = p_store and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from stores s where s.id = p_store and s.parent_consent_at is not null
  ) then
    raise exception 'parent consent required';
  end if;

  update stores
     set payment_claimed_at = now(),
         payment_method     = nullif(left(coalesce(p_method, ''), 20), ''),
         payment_ref        = nullif(left(coalesce(p_ref, ''), 60), '')
   where id = p_store
     and activated_at is null;   -- חנות פעילה לא מצהירה שוב
end $$;

do $$ begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant execute on function set_parent_consent(uuid, boolean) to authenticated;
    grant execute on function claim_store_payment(uuid, text, text) to authenticated;
  end if;
end $$;

insert into schema_migrations (name) values ('0016_parent_consent.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0017_admin_phones.sql
-- ───────────────────────────────────────────────────────────────

-- 0017 — רשימת המנהלות בדאטהבייס, לא רק במשתני סביבה.
--
-- הכניסה עברה לסמס, והזיהוי כמנהלת נשען על ADMIN_PHONES בוורסל. משתנה סביבה
-- שלא הוגדר (או הוגדר בסביבה הלא נכונה, או בלי Redeploy) נועל את המנהלת מחוץ
-- לחמ"ל שלה — וזו נעילה שאי אפשר לפרוץ מבפנים, כי כדי להיכנס צריך להיות
-- מנהלת. שורה בטבלה נשמרת פעם אחת ולא תלויה בדיפלוי.
--
-- ADMIN_PHONES ו-ADMIN_EMAILS ממשיכים לעבוד; זו תוספת, לא החלפה.

create table if not exists admin_phones (
  phone      text primary key,          -- E.164 ללא +: 972501234567
  note       text,
  created_at timestamptz not null default now()
);

comment on table admin_phones is
  'מספרים שמורשים לחמ"ל. נכתב רק מהשרת (CRON_SECRET), לעולם לא מהדפדפן.';

alter table admin_phones enable row level security;

-- אין policy בכוונה: RLS בלי policy חוסם הכל. ההרשאות נשללות גם במפורש
-- כדי לא להישען על שכבה אחת — הטבלה הזו היא רשימת המפתחות לבית.
revoke all on admin_phones from anon, authenticated;
grant  all on admin_phones to service_role;

insert into schema_migrations (name) values ('0017_admin_phones.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0018_payout_link.sql
-- ───────────────────────────────────────────────────────────────

-- 0018 — לינק תשלום של הילדה (פייבוקס / ביט).
--
-- עד עכשיו החנות ידעה *באילו* אמצעים היא מקבלת כסף, אבל הקונה עדיין הייתה
-- צריכה להקליד מספר ידנית. לינק תשלום הופך את זה ללחיצה אחת, וזה בדיוק
-- המקום שבו עסקאות נופלות: הקונה רוצה לשלם ולא יודעת איך.
--
-- שתי הערות שקובעות איך זה מיושם:
-- 1. אנחנו עדיין לא נוגעים בכסף. הלינק מוביל לאפליקציה של הילדה, והתשלום
--    קורה שם, בינה לבין הקונה. אין סליקה ואין עמלה.
-- 2. הלינק מוצג בדף פומבי, ולכן מותרים רק לינקים של ביט ופייבוקס. הבדיקה
--    יושבת בשרת (טריגר) ולא רק במסך, כי RLS מרשה לבעלות לעדכן את החנות
--    שלה ישירות — וילדה שמישהו שכנע אותה להדביק לינק אחר היא בדיוק
--    התרחיש שצריך למנוע.

alter table stores add column if not exists payout_link text;

comment on column stores.payout_link is
  'לינק תשלום של הילדה — ביט או פייבוקס בלבד. מוצג לקונה בגיליון ההזמנה.';

create or replace function guard_payout_link()
returns trigger language plpgsql as $$
begin
  if new.payout_link is not null then
    new.payout_link := nullif(btrim(new.payout_link), '');
  end if;

  if new.payout_link is not null and new.payout_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|bitpay\.co\.il)(/|$)'
  then
    raise exception 'payout link must be a bit or paybox https link';
  end if;

  return new;
end $$;

drop trigger if exists stores_guard_payout_link on stores;
create trigger stores_guard_payout_link
  before insert or update on stores
  for each row execute function guard_payout_link();

insert into schema_migrations (name) values ('0018_payout_link.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0019_store_info.sql
-- ───────────────────────────────────────────────────────────────

-- 0019 — מה שהחנות מספרת על עצמה, ואיך ההזמנה מגיעה.
--
-- ארבעה דברים שקונה שואלת לפני שהיא קונה, וששאלו אותם בוואטסאפ שוב ושוב:
-- מי את · מאיפה את · יש משלוח וכמה · איך משלמים. כל אחד מהם שנשאר בלי
-- תשובה בדף הוא הודעה שהילדה צריכה לענות עליה ידנית, ולעיתים קרובות
-- מכירה שלא נסגרה.
--
-- אין כאן שדה כתובת. עיר בלבד, מרשימה סגורה בממשק — "רמת גן" זה מספיק
-- כדי לדעת אם המסירה הגיונית, ובלי לחשוף איפה הילדה גרה.

alter table stores add column if not exists about           text;
alter table stores add column if not exists city            text;
alter table stores add column if not exists ships           boolean not null default false;
alter table stores add column if not exists shipping_note   text;
alter table stores add column if not exists shipping_price  int;
alter table stores add column if not exists order_intro     text;
alter table stores add column if not exists order_outro     text;

comment on column stores.about          is 'כמה מילים על הדוכן. מוצג מתחת לשם.';
comment on column stores.city           is 'עיר בלבד — לעולם לא כתובת.';
comment on column stores.ships          is 'האם יש משלוח בכלל.';
comment on column stores.shipping_note  is 'איך ולאן שולחים, בלשון שלה.';
comment on column stores.shipping_price is 'מחיר משלוח בשקלים. null = לא צוין.';
comment on column stores.order_intro    is 'שורת הפתיחה של הודעת ההזמנה שמגיעה אליה.';
comment on column stores.order_outro    is 'שורת הסיום של אותה הודעה.';

-- מחיר משלוח שלילי הוא טעות הקלדה, לא כוונה
alter table stores drop constraint if exists stores_shipping_price_check;
alter table stores add constraint stores_shipping_price_check
  check (shipping_price is null or (shipping_price >= 0 and shipping_price <= 200));

insert into schema_migrations (name) values ('0019_store_info.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0020_buyer_phone.sql
-- ───────────────────────────────────────────────────────────────

-- מספר טלפון של הקונה, אופציונלי, כדי שהמוכרת תוכל לפתוח וואטסאפ ישירות
-- אליה אם יש שאלה על ההזמנה. הקונה בוחרת אם להשאיר אותו — לא חובה בטופס.
-- לעולם לא נחשף בקריאה הפומבית של החנות; מוגן באותו RLS כמו שאר ה-order.

alter table orders add column if not exists buyer_phone text;

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text default null
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status, ip_hash, buyer_phone)
    values (p_store, n, p_items, p_total, p_note, 'sent', p_ip_hash, p_buyer_phone);
  return n;
end $$;

insert into schema_migrations (name) values ('0020_buyer_phone.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0021_store_age.sql
-- ───────────────────────────────────────────────────────────────

-- גיל (מספר), לא תאריך לידה מלא: פחות מזהה, ומספיק כדי לשייך תוכן בפיד
-- עתידי לפי קבוצת גיל. לא חובה בטופס, ולעולם לא נחשף בקריאה הפומבית של
-- החנות — אותו כלל כמו contact_phone ו-parent_email.

alter table stores add column if not exists age int;

alter table stores drop constraint if exists stores_age_check;
alter table stores add constraint stores_age_check check (age is null or (age between 5 and 18));

insert into schema_migrations (name) values ('0021_store_age.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0022_sms_unlimited.sql
-- ───────────────────────────────────────────────────────────────

-- דגל פר-חנות שפוטר את מספר הטלפון שלה ממכסת הסמס היומית, בלי להעניק לה
-- גישת אדמין. שימושי ללקוחה שבודקת הרבה ונתקעת במכסה שנועדה לעצור הצפה,
-- לא אותה. נשלט מהחמ"ל בלבד.

alter table stores add column if not exists sms_unlimited boolean not null default false;

insert into schema_migrations (name) values ('0022_sms_unlimited.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0023_parent_aware.sql
-- ───────────────────────────────────────────────────────────────

-- חותמת של הרגע שבו הילדה סימנה "ההורים שלי יודעים", בתחילת ההקמה —
-- לפני שמוזן טלפון או שנוצר חשבון. נפרדת מ-parent_consent_at (מיגרציה
-- 0016), שנקבעת הרבה יותר מאוחר, ממש לפני פרסום החנות לעולם. שתי חותמות
-- לשתי החלטות שונות: מודעות מוקדמת מול אישור לפרסם בפועל.

alter table stores add column if not exists parent_aware_at timestamptz;

insert into schema_migrations (name) values ('0023_parent_aware.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0024_order_archive.sql
-- ───────────────────────────────────────────────────────────────

-- הסתרת הזמנה שאינה רלוונטית.
--
-- "ביטול" כבר קיים והוא סטטוס אמיתי: מישהו הזמין וההזמנה לא יצאה לפועל,
-- והמלאי חוזר. אבל הזמנות מבוטלות נשארו ברשימה לנצח, וגם הזמנות בדיקה
-- שהילדה שלחה לעצמה. היא ביקשה דרך להוריד אותן מהמסך.
--
-- מחיקה רכה בלבד, כמו במוצרים: השורה נשארת לחשבונאות ולגיבוי, והמסך
-- פשוט לא מציג אותה. אין כאן delete.

alter table orders add column if not exists deleted_at timestamptz;

-- אינדקס לרשימה של חנות אחת, שמסננת את המוסתרות
create index if not exists orders_store_visible_idx
  on orders (store_id, created_at desc)
  where deleted_at is null;

insert into schema_migrations (name) values ('0024_order_archive.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0025_squish_core.sql
-- ───────────────────────────────────────────────────────────────

-- 0025 — Squish Club, הליבה.
--
-- מועדון טרייד פרטי לאספניות סקווישים, שרץ על אותו חשבון, אותו אימות
-- ואותה תשתית מדיה כמו דוכן. אין כאן טבלת משתמשים חדשה: הכל תלוי
-- ב-auth.users הקיים, בדיוק כמו stores.
--
-- שלושה כללי בטיחות שמעוגנים כאן ולא רק בממשק:
-- 1. קוד האוסף אקראי ולא ניתן לניחוש, בדיוק כמו slug של חנות.
-- 2. אין עמודת כתובת, בית ספר, כיתה, שם מלא או גיל מדויק. עיר כללית בלבד.
-- 3. ברירת המחדל לצפייה היא direct_friends. קישור לבדו לא חושף אוסף.

/* ── טיפוסים ── */

do $$ begin
  create type squish_type as enum (
    'needoh','water','sand','ice','bubble_blowing','eye_popping','taba','clay','foam','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_size as enum ('small','medium','large','huge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_condition as enum ('new','like_new','good','used','flawed');
exception when duplicate_object then null; end $$;

-- keep / open_for_trade / maybe_trade הן בחירה של הבעלים.
-- reserved / traded / moved_to_duchan נקבעות על ידי המערכת.
do $$ begin
  create type squish_trade_status as enum (
    'keep','open_for_trade','maybe_trade','reserved','traded','moved_to_duchan'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_visibility as enum ('private','direct_friends','extended_circle','group_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_connection_type as enum ('direct_friend','friend_of_friend','group_member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_connection_status as enum ('pending','active','blocked');
exception when duplicate_object then null; end $$;

/* ── פרופיל האוסף ── */

create table if not exists squish_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  nickname                    text not null,
  general_city                text,
  collection_title            text,
  collection_code             text unique not null,
  collection_visibility       squish_visibility not null default 'direct_friends',
  theme                       text not null default 'cloud',
  cover_preset                text,
  parent_awareness_at         timestamptz,
  parent_awareness_version    text,
  media_bytes                 bigint not null default 0,
  completed_trades            int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (user_id)
);

comment on column squish_profiles.collection_code is 'קוד אקראי לקישור. לא שם ולא כינוי.';
comment on column squish_profiles.general_city   is 'עיר כללית בלבד. לעולם לא כתובת, בית ספר או כיתה.';

/* ── פריטי האוסף ── */

create table if not exists squish_items (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  profile_id          uuid not null references squish_profiles(id) on delete cascade,
  name                text not null,
  squishy_type        squish_type not null default 'other',
  custom_type         text,
  size                squish_size not null default 'medium',
  condition           squish_condition not null default 'good',
  condition_note      text,
  trade_status        squish_trade_status not null default 'keep',
  wanted_description  text,
  wanted_types        text[],
  wanted_colors       text[],
  image_key           text,
  video_key           text,
  poster_key          text,
  sort_order          int not null default 0,
  duchan_product_id   uuid references products(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists squish_items_profile_idx
  on squish_items (profile_id, sort_order) where deleted_at is null;
create index if not exists squish_items_owner_idx
  on squish_items (owner_user_id) where deleted_at is null;

/* ── מעגל החברות ── */

create table if not exists squish_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  connected_user_id   uuid not null references auth.users(id) on delete cascade,
  connection_type     squish_connection_type not null default 'direct_friend',
  invited_by_user_id  uuid references auth.users(id) on delete set null,
  status              squish_connection_status not null default 'active',
  created_at          timestamptz not null default now(),
  unique (user_id, connected_user_id),
  check (user_id <> connected_user_id)
);

create index if not exists squish_connections_user_idx on squish_connections (user_id, status);

create table if not exists squish_invites (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  inviter_user_id   uuid not null references auth.users(id) on delete cascade,
  clicks            int not null default 0,
  joined_user_id    uuid references auth.users(id) on delete set null,
  joined_at         timestamptz,
  activated_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists squish_invites_inviter_idx on squish_invites (inviter_user_id);

/* ── מי רשאית לראות אוסף של מי ──
   הפונקציה היא מקור האמת היחיד להרשאת צפייה, והיא נקראת גם מה-RLS וגם
   מהשרת. לעולם לא סומכים על ערך שהגיע מהלקוח. */

create or replace function squish_can_view(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_owner is null then false
    when p_viewer = p_owner then true
    else exists (
      select 1
      from squish_profiles pr
      where pr.user_id = p_owner
        and case pr.collection_visibility
          when 'private' then false
          -- חברה ישירה
          when 'direct_friends' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'direct_friend'
          )
          -- חברה ישירה, או חברה של חברה
          when 'extended_circle' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner and c.status = 'active'
          ) or exists (
            select 1
            from squish_connections a
            join squish_connections b on b.user_id = a.connected_user_id
            where a.user_id = p_viewer and a.status = 'active'
              and b.connected_user_id = p_owner and b.status = 'active'
          )
          -- קבוצות נבנות בשלב מאוחר יותר; עד אז רק חברות ישירות
          when 'group_only' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'group_member'
          )
          else false
        end
    )
  end;
$$;

/* ── RLS ── */

alter table squish_profiles    enable row level security;
alter table squish_items       enable row level security;
alter table squish_connections enable row level security;
alter table squish_invites     enable row level security;

drop policy if exists squish_own_profile on squish_profiles;
create policy squish_own_profile on squish_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- צפייה באוסף של אחרת נעשית דרך הפונקציה, ולא דרך ערך שהלקוח שולח
drop policy if exists squish_view_permitted_profile on squish_profiles;
create policy squish_view_permitted_profile on squish_profiles
  for select using (squish_can_view(auth.uid(), user_id));

drop policy if exists squish_own_items on squish_items;
create policy squish_own_items on squish_items
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists squish_view_permitted_items on squish_items;
create policy squish_view_permitted_items on squish_items
  for select using (deleted_at is null and squish_can_view(auth.uid(), owner_user_id));

drop policy if exists squish_own_connections on squish_connections;
create policy squish_own_connections on squish_connections
  for all using (user_id = auth.uid() or connected_user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists squish_own_invites on squish_invites;
create policy squish_own_invites on squish_invites
  for all using (inviter_user_id = auth.uid()) with check (inviter_user_id = auth.uid());

/* ── "לפחות שלושה פריטים" נאכף בשרת, לא רק במסך ── */

create or replace function squish_item_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from squish_items
   where owner_user_id = p_user and deleted_at is null
     and trade_status <> 'moved_to_duchan';
$$;

/* ── הרשאות ──
   לא מסתמכים על default privileges: טבלה חדשה בלי grant מחזירה
   "permission denied" ל-PostgREST, וזה נראה מבחוץ כמו RLS שחוסם. */

do $$ begin
  grant all on squish_profiles, squish_items, squish_connections, squish_invites to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete
    on squish_profiles, squish_items, squish_connections, squish_invites to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_can_view(uuid, uuid) to authenticated, anon, service_role;
  grant execute on function squish_item_count(uuid) to authenticated, service_role;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0025_squish_core.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0026_squish_circle.sql
-- ───────────────────────────────────────────────────────────────

-- 0026 — סקוויש קלאב: פרופיל בסגנון דוכן, מעגל חברות אמיתי, ו"מעניין אותי".
--
-- שלושה דברים:
-- 1. לפרופיל האוסף יש עכשיו קאבר, תמונת פרופיל, כותרת ותיאור — בדיוק
--    כמו לדוכן. אותם טוקנים, אותה הרגשה.
-- 2. הצטרפות דרך קישור הזמנה יוצרת חיבור *דו-כיווני*. זה חייב לרוץ
--    בפונקציה עם הרשאות: המצטרפת לא יכולה לכתוב שורה שבה user_id הוא
--    המזמינה, וזה נכון — אחרת כל אחת הייתה יכולה להוסיף את עצמה למעגל
--    של מישהי אחרת.
-- 3. "מעניין אותי" נשמר כשורה, ולא כהודעה. הבעלים רואה כמה התעניינו,
--    וזה הבסיס ל"התאמות" בשלב הבא.

/* ── פרופיל בסגנון דוכן ── */

alter table squish_profiles add column if not exists emoji      text not null default '🧸';
alter table squish_profiles add column if not exists avatar_key text;
alter table squish_profiles add column if not exists cover_key  text;
alter table squish_profiles add column if not exists about      text;

comment on column squish_profiles.about is 'כמה מילים על האוסף. מוצג מתחת לכותרת.';

/* ── "מעניין אותי" ── */

create table if not exists squish_interests (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references squish_items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (item_id, user_id)
);

create index if not exists squish_interests_item_idx on squish_interests (item_id);
create index if not exists squish_interests_user_idx on squish_interests (user_id, created_at desc);

alter table squish_interests enable row level security;

-- המתעניינת רואה ומוחקת את השורות שלה; הבעלים רואה מי התעניין בפריט שלו
drop policy if exists squish_own_interests on squish_interests;
create policy squish_own_interests on squish_interests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists squish_owner_sees_interests on squish_interests;
create policy squish_owner_sees_interests on squish_interests
  for select using (
    exists (select 1 from squish_items i
             where i.id = item_id and i.owner_user_id = auth.uid())
  );

/* ── הצטרפות למעגל דרך קישור הזמנה ──
   security definer בכוונה: החיבור ההופכי נכתב בשם המזמינה, ואי אפשר
   לתת ללקוח את ההרשאה הזו. הפונקציה מאמתת את הקוד, ולא סומכת על שום
   ערך שהגיע מהדפדפן חוץ מהקוד עצמו. */

create or replace function squish_join(p_code text)
returns table (inviter_user_id uuid, nickname text, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_me      uuid := auth.uid();
  v_nick    text;
  v_exists  boolean;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select i.inviter_user_id into v_inviter
    from squish_invites i where i.code = p_code;

  if v_inviter is null then
    raise exception 'invite not found';
  end if;
  if v_inviter = v_me then
    raise exception 'cannot join your own circle';
  end if;

  select p.nickname into v_nick from squish_profiles p where p.user_id = v_inviter;

  select exists (
    select 1 from squish_connections c
    where c.user_id = v_me and c.connected_user_id = v_inviter and c.status = 'active'
  ) into v_exists;

  -- חיבור דו-כיווני: שתיהן רואות אחת את השנייה
  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_me, v_inviter, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend';

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_inviter, v_me, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend';

  update squish_invites
     set joined_user_id = coalesce(joined_user_id, v_me),
         joined_at = coalesce(joined_at, now())
   where code = p_code;

  return query select v_inviter, v_nick, v_exists;
end $$;

/* הפניה נחשבת מוצלחת רק כשיש אוסף אמיתי: הצטרפה, שלושה פריטים,
   ולפחות אחד פתוח לטרייד. לחיצה על קישור לבדה לא נחשבת. */
create or replace function squish_mark_activated()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  if squish_item_count(v_me) < 3 then return; end if;
  if not exists (
    select 1 from squish_items
     where owner_user_id = v_me and deleted_at is null and trade_status = 'open_for_trade'
  ) then return; end if;

  update squish_invites
     set activated_at = coalesce(activated_at, now())
   where joined_user_id = v_me;
end $$;

/* ספירת לחיצות על קישור הזמנה. נקראת מהשרת, בלי אימות. */
create or replace function squish_invite_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update squish_invites set clicks = clicks + 1 where code = p_code;
$$;

/* ── הרשאות ── */

do $$ begin
  grant all on squish_interests to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_interests to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_join(text) to authenticated;
  grant execute on function squish_mark_activated() to authenticated;
  grant execute on function squish_invite_click(text) to anon, authenticated, service_role;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0026_squish_circle.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0027_squish_collection.sql
-- ───────────────────────────────────────────────────────────────

-- 0027 — האוסף הוא המוצר, לא הפרופיל.
--
-- מה שהופך מדף לאוסף זה לא קאבר ואוואטר. זה שם לאוסף, סקווישי אהוב,
-- רשימת מבוקשים, ומה שיש בפנים לפי סוג. אלה הדברים שילדה מדברת עליהם
-- עם חברה.
--
-- מה שבמפורש *לא* כאן: נדירות מומצאת, אחוזי השלמה מול קטלוג שלא קיים,
-- ורצפים יומיים. תג או מספר שאי אפשר לגזור מהאוסף האמיתי לא נכנס.

/* ── שם לאוסף, וסקווישי אהוב ── */

alter table squish_items add column if not exists series text;
comment on column squish_items.series is
  'סדרה שהילדה הגדירה בעצמה, למשל "סדרת הממתקים". טקסט חופשי, לא קטלוג.';

create index if not exists squish_items_series_idx
  on squish_items (profile_id, series) where deleted_at is null and series is not null;

alter table squish_profiles
  add column if not exists favorite_item_id uuid references squish_items(id) on delete set null;
comment on column squish_profiles.favorite_item_id is
  'הסקווישי האהוב. אחד לאוסף, נעוץ בראש הגלריה.';

/**
 * האהוב חייב להיות פריט חי של אותה בעלים.
 *
 * on delete set null מטפל במחיקה קשה, אבל אצלנו מחיקה היא רכה
 * (deleted_at), ופריט יכול גם לעבור לדוכן או להיסחר. בכל אחד מהמצבים
 * האלה הסימון חייב להתנקות לבד — אחרת הגלריה נועצת בראש פריט שכבר לא
 * קיים.
 */
create or replace function squish_clear_stale_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null
     or new.trade_status in ('traded', 'moved_to_duchan') then
    update squish_profiles
       set favorite_item_id = null
     where favorite_item_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists squish_favorite_guard on squish_items;
create trigger squish_favorite_guard
  after update on squish_items
  for each row execute function squish_clear_stale_favorite();

/* ── רשימת המבוקשים של האוסף ── */

create table if not exists squish_wishlist (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references squish_profiles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  squishy_type squish_type,
  color        text,
  description  text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists squish_wishlist_profile_idx
  on squish_wishlist (profile_id, sort_order);

alter table squish_wishlist enable row level security;

drop policy if exists squish_own_wishlist on squish_wishlist;
create policy squish_own_wishlist on squish_wishlist
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- הרשימה נראית למי שרשאית לראות את האוסף — אותו כלל בדיוק
drop policy if exists squish_view_permitted_wishlist on squish_wishlist;
create policy squish_view_permitted_wishlist on squish_wishlist
  for select using (squish_can_view(auth.uid(), owner_user_id));

/* ── הרשאות ── */

do $$ begin
  grant all on squish_wishlist to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_wishlist to authenticated;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0027_squish_collection.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0028_squish_trades.sql
-- ───────────────────────────────────────────────────────────────

-- 0028 — טריידים: הסכמה מובנית בין שתי אספניות.
--
-- זה לא צ'אט. שתי הצדדים צריכות להבין בדיוק מה עובר לאיזה כיוון,
-- לאשר את *אותה* גרסה, ורק אז לעבור לוואטסאפ.
--
-- שלוש החלטות שמעוגנות כאן ולא בממשק:
--
-- 1. **הצעה נגדית יכולה רק לצמצם.** המקבלת בוחרת תת-קבוצה ממה שכבר
--    הוצע לה, ולעולם לא פריט אחר מהאוסף של השולחת. אחרת עצם המשא ומתן
--    היה חושף פריטים פרטיים שהשולחת לא בחרה להציע. זה נאכף בפונקציה,
--    לא בבדיקה בדפדפן.
-- 2. **שמירת פריטים היא אטומית.** או שכל הפריטים בטרייד ננעלים יחד, או
--    ששום דבר לא ננעל. שני טריידים לא יכולים לנעול את אותו סקווישי.
-- 3. **מספר הטלפון לא יוצא מהשרת** עד שהטרייד באמת שמור ומאושר משני
--    הצדדים. אין דרך לקבל אותו קודם, גם לא דרך ה-API.

/* ── טיפוסים ── */

do $$ begin
  create type squish_proposal_status as enum (
    'draft','sent','viewed','countered','accepted',
    'ready_for_whatsapp','completed','declined','cancelled','reported'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_side as enum ('requested','offered');
exception when duplicate_object then null; end $$;

/* ── ההצעה, הגרסאות והפריטים ── */

create table if not exists squish_trade_proposals (
  id                        uuid primary key default gen_random_uuid(),
  sender_user_id            uuid not null references auth.users(id) on delete cascade,
  receiver_user_id          uuid not null references auth.users(id) on delete cascade,
  requested_item_id         uuid not null references squish_items(id) on delete cascade,
  current_version_id        uuid,
  status                    squish_proposal_status not null default 'draft',
  connection_context        text,
  accepted_by_sender_at     timestamptz,
  accepted_by_receiver_at   timestamptz,
  reserved_at               timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  cancel_reason             text,
  completed_by_sender_at    timestamptz,
  completed_by_receiver_at  timestamptz,
  parent_ack_sender_at      timestamptz,
  parent_ack_receiver_at    timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (sender_user_id <> receiver_user_id)
);

create index if not exists squish_proposals_receiver_idx
  on squish_trade_proposals (receiver_user_id, status, updated_at desc);
create index if not exists squish_proposals_sender_idx
  on squish_trade_proposals (sender_user_id, status, updated_at desc);
create index if not exists squish_proposals_item_idx
  on squish_trade_proposals (requested_item_id, status);

create table if not exists squish_trade_versions (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references squish_trade_proposals(id) on delete cascade,
  created_by_user_id  uuid not null references auth.users(id) on delete cascade,
  version_number      int not null,
  requested_item_id   uuid not null references squish_items(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (proposal_id, version_number)
);

create table if not exists squish_trade_version_items (
  version_id     uuid not null references squish_trade_versions(id) on delete cascade,
  item_id        uuid not null references squish_items(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  side           squish_side not null,
  primary key (version_id, item_id)
);

create table if not exists squish_trade_reports (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references squish_trade_proposals(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id    uuid not null references auth.users(id) on delete cascade,
  reason              text not null,
  details             text,
  status              text not null default 'open',
  created_at          timestamptz not null default now()
);

/* איזה טרייד נועל את הפריט. פריט יכול להיות נעול בטרייד אחד בלבד. */
alter table squish_items
  add column if not exists reserved_by_proposal_id uuid references squish_trade_proposals(id) on delete set null;

create index if not exists squish_items_reserved_idx
  on squish_items (reserved_by_proposal_id) where reserved_by_proposal_id is not null;

/* מה היה הסטטוס לפני שהפריט ננעל.
   בלי זה, ביטול היה צריך לנחש: להחזיר הכל ל"פתוח לטרייד" חושף פריט
   שהיא שמרה לעצמה, ולהחזיר הכל ל"שלי" מוריד בשקט פריט פתוח מלגלות. */
alter table squish_items
  add column if not exists pre_reserve_status squish_trade_status;

/* ── RLS ── */

alter table squish_trade_proposals    enable row level security;
alter table squish_trade_versions     enable row level security;
alter table squish_trade_version_items enable row level security;
alter table squish_trade_reports      enable row level security;

-- רק שני הצדדים רואים את ההצעה. אין צד שלישי, ואין קריאה פומבית.
drop policy if exists squish_trade_parties on squish_trade_proposals;
create policy squish_trade_parties on squish_trade_proposals
  for select using (sender_user_id = auth.uid() or receiver_user_id = auth.uid());

drop policy if exists squish_version_parties on squish_trade_versions;
create policy squish_version_parties on squish_trade_versions
  for select using (exists (
    select 1 from squish_trade_proposals p
     where p.id = proposal_id
       and (p.sender_user_id = auth.uid() or p.receiver_user_id = auth.uid())
  ));

drop policy if exists squish_version_item_parties on squish_trade_version_items;
create policy squish_version_item_parties on squish_trade_version_items
  for select using (exists (
    select 1 from squish_trade_versions v
      join squish_trade_proposals p on p.id = v.proposal_id
     where v.id = version_id
       and (p.sender_user_id = auth.uid() or p.receiver_user_id = auth.uid())
  ));

-- דיווח: רק המדווחת רואה את הדיווח שלה. אין חשיפה לצד השני.
drop policy if exists squish_report_mine on squish_trade_reports;
create policy squish_report_mine on squish_trade_reports
  for select using (reported_by_user_id = auth.uid());

/* ── כתיבה רק דרך פונקציות ──
   אין policy ל-insert/update/delete בכוונה: כל מעבר מצב עובר בפונקציה
   שמאמתת מי מבקשת, מה המצב הנוכחי, ומה מותר ממנו. סטטוס שמגיע מהלקוח
   לא נכתב לעולם. */

/* עוזר: הפריטים של הגרסה הנוכחית */
create or replace function squish_version_items(p_version uuid)
returns table (item_id uuid, owner_user_id uuid, side squish_side)
language sql stable security definer set search_path = public as $$
  select vi.item_id, vi.owner_user_id, vi.side
    from squish_trade_version_items vi where vi.version_id = p_version;
$$;

/** האם הפריט זמין להצעה או לשמירה */
create or replace function squish_item_available(p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squish_items i
     where i.id = p_item
       and i.deleted_at is null
       and i.trade_status not in ('reserved','traded','moved_to_duchan')
       and i.duchan_product_id is null
  );
$$;

/* ── שליחת הצעה ── */

create or replace function squish_send_proposal(
  p_requested uuid,
  p_offered   uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_owner    uuid;
  v_prop     uuid;
  v_version  uuid;
  v_item     uuid;
  v_ctx      text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_offered is null or array_length(p_offered, 1) is null then
    raise exception 'offer at least one item';
  end if;
  if array_length(p_offered, 1) > 3 then raise exception 'at most three items'; end if;

  select owner_user_id into v_owner from squish_items
   where id = p_requested and deleted_at is null and trade_status = 'open_for_trade';
  if v_owner is null then raise exception 'item not open for trade'; end if;
  if v_owner = v_me then raise exception 'cannot trade with yourself'; end if;

  -- ההרשאה החברתית היא אותה הרשאה של הצפייה. אין דרך אחרת להגיע לפריט.
  if not squish_can_view(v_me, v_owner) then raise exception 'not in circle'; end if;

  -- שלושה פריטים פעילים לפחות, אחרת אין ממה להציע
  if squish_item_count(v_me) < 3 then raise exception 'need three items'; end if;

  foreach v_item in array p_offered loop
    if not exists (select 1 from squish_items where id = v_item and owner_user_id = v_me) then
      raise exception 'offered item is not yours';
    end if;
    if not squish_item_available(v_item) then raise exception 'offered item not available'; end if;
  end loop;

  select case
    when exists (select 1 from squish_connections c
                  where c.user_id = v_me and c.connected_user_id = v_owner
                    and c.status = 'active' and c.connection_type = 'direct_friend')
    then 'חברה שלי' else 'חברה של חברה' end into v_ctx;

  insert into squish_trade_proposals (sender_user_id, receiver_user_id, requested_item_id, status, connection_context)
  values (v_me, v_owner, p_requested, 'sent', v_ctx)
  returning id into v_prop;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (v_prop, v_me, 1, p_requested)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, p_requested, v_owner, 'requested');
  foreach v_item in array p_offered loop
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_me, 'offered');
  end loop;

  -- השולחת מאשרת את הגרסה שהיא עצמה יצרה
  update squish_trade_proposals
     set current_version_id = v_version,
         accepted_by_sender_at = now(),
         updated_at = now()
   where id = v_prop;

  return v_prop;
end $$;

/* ── נצפה ── */

create or replace function squish_mark_viewed(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set status = 'viewed', updated_at = now()
   where id = p_proposal and receiver_user_id = v_me and status = 'sent';
end $$;

/* ── הצעה נגדית ──
   **רק צמצום.** הפריטים חייבים להיות תת-קבוצה של מה שכבר הוצע בגרסה
   הנוכחית. המקבלת לא יכולה לבחור פריט אחר מהאוסף של השולחת, כי היא לא
   אמורה לראות פריטים שהשולחת לא בחרה להציע. */

create or replace function squish_counter_proposal(
  p_proposal uuid,
  p_keep     uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_prop    record;
  v_version uuid;
  v_num     int;
  v_item    uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status in ('completed','cancelled','declined','ready_for_whatsapp') then
    raise exception 'proposal is closed';
  end if;
  if p_keep is null or array_length(p_keep, 1) is null then
    raise exception 'keep at least one item';
  end if;

  -- כל פריט חייב להיות כבר בהצעה הנוכחית, בצד המוצע
  foreach v_item in array p_keep loop
    if not exists (
      select 1 from squish_trade_version_items vi
       where vi.version_id = v_prop.current_version_id
         and vi.item_id = v_item and vi.side = 'offered'
    ) then
      raise exception 'can only narrow the existing offer';
    end if;
  end loop;

  select coalesce(max(version_number), 0) + 1 into v_num
    from squish_trade_versions where proposal_id = p_proposal;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (p_proposal, v_me, v_num, v_prop.requested_item_id)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, v_prop.requested_item_id, v_prop.receiver_user_id, 'requested');
  foreach v_item in array p_keep loop
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_prop.sender_user_id, 'offered');
  end loop;

  -- גרסה חדשה מאפסת את שני האישורים, ומאשרת רק את מי שיצרה אותה
  update squish_trade_proposals
     set current_version_id = v_version,
         status = 'countered',
         accepted_by_sender_at   = case when v_me = sender_user_id   then now() else null end,
         accepted_by_receiver_at = case when v_me = receiver_user_id then now() else null end,
         updated_at = now()
   where id = p_proposal;

  return v_version;
end $$;

/* ── אישור הגרסה הנוכחית ── */

create or replace function squish_approve_version(p_proposal uuid, p_version uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  -- מאשרים גרסה מסוימת, לא "את ההצעה". אם הגרסה התחלפה בינתיים, האישור
  -- לא תופס — וזה בדיוק מה שמונע אישור של משהו שכבר השתנה.
  if v_prop.current_version_id is distinct from p_version then
    raise exception 'version changed';
  end if;
  if v_prop.status in ('completed','cancelled','declined') then
    raise exception 'proposal is closed';
  end if;

  update squish_trade_proposals
     set accepted_by_sender_at   = case when v_me = sender_user_id   then now() else accepted_by_sender_at end,
         accepted_by_receiver_at = case when v_me = receiver_user_id then now() else accepted_by_receiver_at end,
         updated_at = now()
   where id = p_proposal;

  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop.accepted_by_sender_at is not null and v_prop.accepted_by_receiver_at is not null then
    update squish_trade_proposals set status = 'accepted', updated_at = now() where id = p_proposal;
    return 'accepted';
  end if;
  return 'waiting';
end $$;

/* ── דחייה ── */

create or replace function squish_decline_proposal(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set status = 'declined', updated_at = now()
   where id = p_proposal
     and receiver_user_id = v_me
     and status in ('sent','viewed','countered','accepted');
end $$;

/* ── שמירה אטומית ──
   הלב של השלב הזה. או שכל הפריטים ננעלים יחד, או ששום דבר. */

create or replace function squish_accept_and_reserve_trade(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_prop  record;
  v_item  record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status = 'ready_for_whatsapp' then return 'already'; end if;
  if v_prop.accepted_by_sender_at is null or v_prop.accepted_by_receiver_at is null then
    raise exception 'both sides must approve';
  end if;

  -- נועלים את כל שורות הפריטים לפני שבודקים אותן. בלי הנעילה הזו שני
  -- טריידים מקבילים היו יכולים לעבור את הבדיקה ואז לדרוס זה את זה.
  for v_item in
    select vi.item_id, vi.owner_user_id
      from squish_trade_version_items vi
     where vi.version_id = v_prop.current_version_id
     order by vi.item_id
     for update
  loop
    perform 1 from squish_items i where i.id = v_item.item_id for update;

    if not exists (
      select 1 from squish_items i
       where i.id = v_item.item_id
         and i.owner_user_id = v_item.owner_user_id
         and i.deleted_at is null
         and i.trade_status not in ('reserved','traded','moved_to_duchan')
         and i.duchan_product_id is null
    ) then
      raise exception 'item unavailable';
    end if;
  end loop;

  update squish_items
     set pre_reserve_status = trade_status,
         trade_status = 'reserved',
         reserved_by_proposal_id = p_proposal,
         updated_at = now()
   where id in (
     select vi.item_id from squish_trade_version_items vi
      where vi.version_id = v_prop.current_version_id
   );

  update squish_trade_proposals
     set status = 'ready_for_whatsapp', reserved_at = now(), updated_at = now()
   where id = p_proposal;

  -- הצעות מתחרות שנוגעות באחד הפריטים כבר לא יכולות להתממש. מבטלים
  -- אותן במפורש במקום להשאיר אישור שייכשל בסוף.
  update squish_trade_proposals p
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'item_unavailable',
         updated_at = now()
   where p.id <> p_proposal
     and p.status in ('sent','viewed','countered','accepted')
     and exists (
       select 1 from squish_trade_version_items vi
        where vi.version_id = p.current_version_id
          and vi.item_id in (
            select vi2.item_id from squish_trade_version_items vi2
             where vi2.version_id = v_prop.current_version_id
          )
     );

  return 'reserved';
end $$;

/* ── ביטול ומשחרר את השמירה ── */

create or replace function squish_cancel_trade(p_proposal uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status = 'completed' then raise exception 'already completed'; end if;

  -- הפריטים חוזרים בדיוק למצב שממנו הגיעו, לפי מה שנשמר בשמירה עצמה.
  -- הפריט המבוקש היה בהכרח פתוח לטרייד; המוצעים יכלו להיות גם "שלי",
  -- וביטול לא אמור לפתוח אותם לעולם בלי שהיא ביקשה.
  update squish_items
     set trade_status = coalesce(
           pre_reserve_status,
           case when id = v_prop.requested_item_id
                then 'open_for_trade'::squish_trade_status
                else 'keep'::squish_trade_status end),
         pre_reserve_status = null,
         reserved_by_proposal_id = null,
         updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(p_reason, 'other'), updated_at = now()
   where id = p_proposal;
end $$;

/* ── אישור הורה לפני וואטסאפ ── */

create or replace function squish_ack_parent(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set parent_ack_sender_at   = case when v_me = sender_user_id   then now() else parent_ack_sender_at end,
         parent_ack_receiver_at = case when v_me = receiver_user_id then now() else parent_ack_receiver_at end,
         updated_at = now()
   where id = p_proposal and (sender_user_id = v_me or receiver_user_id = v_me);
end $$;

/* ── השלמה ── */

create or replace function squish_confirm_completion(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status <> 'ready_for_whatsapp' and v_prop.status <> 'completed' then
    raise exception 'trade is not ready';
  end if;

  update squish_trade_proposals
     set completed_by_sender_at   = case when v_me = sender_user_id   then now() else completed_by_sender_at end,
         completed_by_receiver_at = case when v_me = receiver_user_id then now() else completed_by_receiver_at end,
         updated_at = now()
   where id = p_proposal;

  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop.completed_by_sender_at is null or v_prop.completed_by_receiver_at is null then
    return 'waiting';
  end if;

  -- שני הצדדים אישרו: הפריטים עוברים ל"הוחלף" ויורדים מלגלות
  update squish_items
     set trade_status = 'traded', reserved_by_proposal_id = null,
         pre_reserve_status = null, updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_proposal;

  update squish_profiles
     set completed_trades = completed_trades + 1, updated_at = now()
   where user_id in (v_prop.sender_user_id, v_prop.receiver_user_id);

  return 'completed';
end $$;

/* ── דיווח על בעיה ── */

create or replace function squish_report_trade(p_proposal uuid, p_reason text, p_details text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_prop  record;
  v_other uuid;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  v_other := case when v_me = v_prop.sender_user_id then v_prop.receiver_user_id else v_prop.sender_user_id end;

  insert into squish_trade_reports (proposal_id, reported_by_user_id, reported_user_id, reason, details)
  values (p_proposal, v_me, v_other, coalesce(p_reason, 'other'), p_details);

  -- טרייד עם דיווח פתוח לא נסגר בשקט כ"הושלם"
  update squish_trade_proposals
     set status = 'reported', updated_at = now()
   where id = p_proposal and status <> 'completed';
end $$;

/* ── דוכן וסקוויש לא יכולים לסתור ──
   פריט ששמור בטרייד לא יעבור לדוכן, ופריט שכבר בדוכן לא יישמר. */

create or replace function squish_guard_duchan_transfer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.duchan_product_id is not null and old.duchan_product_id is null then
    if old.trade_status = 'reserved' then
      raise exception 'item reserved in trade';
    end if;
    -- הצעות פתוחות על הפריט מתבטלות: אי אפשר להציע משהו שנמכר
    update squish_trade_proposals p
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'item_unavailable', updated_at = now()
     where p.status in ('sent','viewed','countered','accepted')
       and exists (
         select 1 from squish_trade_version_items vi
          where vi.version_id = p.current_version_id and vi.item_id = new.id
       );
  end if;
  return new;
end $$;

drop trigger if exists squish_duchan_guard on squish_items;
create trigger squish_duchan_guard
  before update on squish_items
  for each row execute function squish_guard_duchan_transfer();

/* ── הרשאות ── */

do $$ begin
  grant all on squish_trade_proposals, squish_trade_versions,
                squish_trade_version_items, squish_trade_reports to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select on squish_trade_proposals, squish_trade_versions,
                  squish_trade_version_items, squish_trade_reports to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_send_proposal(uuid, uuid[])        to authenticated;
  grant execute on function squish_mark_viewed(uuid)                   to authenticated;
  grant execute on function squish_counter_proposal(uuid, uuid[])      to authenticated;
  grant execute on function squish_approve_version(uuid, uuid)         to authenticated;
  grant execute on function squish_decline_proposal(uuid)              to authenticated;
  grant execute on function squish_accept_and_reserve_trade(uuid)      to authenticated;
  grant execute on function squish_cancel_trade(uuid, text)            to authenticated;
  grant execute on function squish_ack_parent(uuid)                    to authenticated;
  grant execute on function squish_confirm_completion(uuid)            to authenticated;
  grant execute on function squish_report_trade(uuid, text, text)      to authenticated;
  grant execute on function squish_item_available(uuid)                to authenticated, service_role;
  grant execute on function squish_version_items(uuid)                 to authenticated, service_role;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0028_squish_trades.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0029_buyer_name.sql
-- ───────────────────────────────────────────────────────────────

-- 0029 — למי שייכת ההזמנה.
--
-- הבעיה שזה פותר: כרטיס ההזמנה היה אנונימי. המפתח היחיד שקישר בין
-- הדשבורד לשיחות בוואטסאפ היה מספר ההזמנה, והוא ישב בשורה האחרונה של
-- ההודעה. עם ארבעים הזמנות, "מי זו #7?" הפך לפתיחת צ'אט אחרי צ'אט.
--
-- שם פרטי בלבד, ובלי שם משפחה, בלי כתובת ובלי גיל — בדיוק כמו בכל
-- שאר המוצר. הוא לא מוחזר בקריאה הפומבית של החנות, ומוגן באותו RLS
-- כמו שאר שדות ההזמנה.

alter table orders add column if not exists buyer_name text;

comment on column orders.buyer_name is
  'שם פרטי של הקונה. מה שמאפשר לקשר בין ההזמנה לשיחה בוואטסאפ.';

/**
 * גרסה שביעית של place_order.
 *
 * p_buyer_name **בלי ברירת מחדל** בכוונה: כך קריאה עם שישה ארגומנטים
 * לא יכולה להתאים גם לחתימה הזו וגם לקודמת, ואין אי-בהירות בבחירת
 * הפונקציה. השרת מנסה מהחתימה החדשה לישנה, כדי שדאטהבייס שעוד לא
 * קיבל את המיגרציה ימשיך לקבל הזמנות.
 */
create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text,
  p_buyer_phone text,
  p_buyer_name text
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status,
                      ip_hash, buyer_phone, buyer_name)
    values (p_store, n, p_items, p_total, p_note, 'sent',
            p_ip_hash, p_buyer_phone, nullif(btrim(p_buyer_name), ''));
  return n;
end $$;

insert into schema_migrations (name) values ('0029_buyer_name.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0030_squish_safety.sql
-- ───────────────────────────────────────────────────────────────

-- 0030 — סקוויש קלאב: בטיחות, ניהול, והגנה מפני שימוש לרעה.
--
-- עד כאן נבנתה היכולת לבצע טרייד. המיגרציה הזו לא מוסיפה יכולת חדשה —
-- היא הופכת את מה שקיים לבטוח מספיק בשביל ילדות אמיתיות.
--
-- ארבעה עקרונות:
--
-- 1. **חסימה גוברת על הכל.** מי שחסמה ומי שנחסמה לא רואות זו את זו
--    בשום מסך, ולא יכולות לפתוח, לאשר או להשלים טרייד. זה נאכף בתוך
--    squish_can_view ובתוך כל פונקציית טרייד, לא בסינון בממשק.
-- 2. **חשבון מושהה נעלם, לא נמחק.** הוא יוצא מכל המסכים של כולן,
--    והפעולות שלו נחסמות — אבל הדאטה נשמרת, כי השהיה היא החלטה של
--    מנהלת ואפשר לבטל אותה.
-- 3. **הגבלות קצב בפונקציה ולא בממשק.** ילדה שתפתח את הקונסולה לא
--    תעקוף אותן, וההודעה שהיא מקבלת בעברית ולא "429".
-- 4. **דיווח נשאר פרטי לנצח.** הצד המדווח עליו לא רואה אותו, לא את
--    התוכן ולא את העובדה שהוא קיים.

/* ══════════════════ 1. השהיית חשבון ══════════════════ */

alter table squish_profiles add column if not exists suspended_at     timestamptz;
alter table squish_profiles add column if not exists suspended_reason text;

comment on column squish_profiles.suspended_at is
  'חשבון מושהה יוצא מכל המסכים ולא יכול לפעול. הדאטה נשמרת.';

create index if not exists squish_profiles_suspended_idx
  on squish_profiles (suspended_at) where suspended_at is not null;

/* ══════════════════ 2. חסימה ══════════════════ */

create table if not exists squish_blocks (
  id               uuid primary key default gen_random_uuid(),
  blocker_user_id  uuid not null references auth.users(id) on delete cascade,
  blocked_user_id  uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists squish_blocks_blocked_idx on squish_blocks (blocked_user_id);

alter table squish_blocks enable row level security;

-- רואה ומנהלת רק את החסימות שלה. הנחסמת לא יודעת שהיא נחסמה.
drop policy if exists squish_own_blocks on squish_blocks;
create policy squish_own_blocks on squish_blocks
  for all using (blocker_user_id = auth.uid()) with check (blocker_user_id = auth.uid());

/** חסימה לכל כיוון מבטלת את הקשר. */
create or replace function squish_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squish_blocks
     where (blocker_user_id = p_a and blocked_user_id = p_b)
        or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$$;

/* ══════════════════ 3. הרשאת הצפייה, מחדש ══════════════════
   שלוש שכבות לפני כל השאר: חסימה, השהיה של הבעלים, והשהיה של הצופה.
   הן מקדימות את בדיקת המעגל בכוונה — אחרת מספיק היה להיות "חברה של
   חברה" כדי לעקוף חסימה. */

create or replace function squish_can_view(p_viewer uuid, p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_owner is null then false
    when p_viewer is not null and p_viewer <> p_owner
         and squish_is_blocked(p_viewer, p_owner) then false
    when exists (select 1 from squish_profiles s
                  where s.user_id = p_owner and s.suspended_at is not null) then false
    when p_viewer is not null
         and exists (select 1 from squish_profiles s
                      where s.user_id = p_viewer and s.suspended_at is not null) then false
    when p_viewer = p_owner then true
    else exists (
      select 1
      from squish_profiles pr
      where pr.user_id = p_owner
        and case pr.collection_visibility
          when 'private' then false
          when 'direct_friends' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'direct_friend'
          )
          when 'extended_circle' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner and c.status = 'active'
          ) or exists (
            select 1
            from squish_connections a
            join squish_connections b on b.user_id = a.connected_user_id
            where a.user_id = p_viewer and a.status = 'active'
              and b.connected_user_id = p_owner and b.status = 'active'
          )
          when 'group_only' then exists (
            select 1 from squish_connections c
            where c.user_id = p_viewer and c.connected_user_id = p_owner
              and c.status = 'active' and c.connection_type = 'group_member'
          )
          else false
        end
    )
  end;
$$;

/* ══════════════════ 4. שליטה של המשתמשת ══════════════════ */

/**
 * חסימה: מבטלת את החיבור לשני הכיוונים, מבטלת טריידים פתוחים בין השתיים
 * ומשחררת את הפריטים ששמורים בהם. בלי זה, פריט של מי שנחסמה היה נשאר
 * נעול לנצח בטרייד שאי אפשר להשלים.
 */
create or replace function squish_block_user(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_prop record;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_other = v_me then raise exception 'cannot block yourself'; end if;

  insert into squish_blocks (blocker_user_id, blocked_user_id)
  values (v_me, p_other) on conflict do nothing;

  update squish_connections set status = 'blocked'
   where (user_id = v_me and connected_user_id = p_other)
      or (user_id = p_other and connected_user_id = v_me);

  -- כל טרייד חי בין השתיים נסגר, והשמירות חוזרות למצב שממנו הגיעו
  for v_prop in
    select id from squish_trade_proposals
     where status not in ('completed','declined','cancelled','reported')
       and ((sender_user_id = v_me and receiver_user_id = p_other)
         or (sender_user_id = p_other and receiver_user_id = v_me))
  loop
    update squish_items
       set trade_status = coalesce(
             pre_reserve_status,
             case when id = (select requested_item_id from squish_trade_proposals where id = v_prop.id)
                  then 'open_for_trade'::squish_trade_status
                  else 'keep'::squish_trade_status end),
           pre_reserve_status = null,
           reserved_by_proposal_id = null,
           updated_at = now()
     where reserved_by_proposal_id = v_prop.id;

    update squish_trade_proposals
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'blocked', updated_at = now()
     where id = v_prop.id;
  end loop;

  -- "מעניין אותי" הדדי נמחק: הוא רמז על פריטים שכבר לא אמורים להיראות
  delete from squish_interests i using squish_items it
   where i.item_id = it.id
     and ((i.user_id = v_me and it.owner_user_id = p_other)
       or (i.user_id = p_other and it.owner_user_id = v_me));
end $$;

create or replace function squish_unblock_user(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  delete from squish_blocks where blocker_user_id = v_me and blocked_user_id = p_other;
  -- החיבור *לא* חוזר לבד. אם הן רוצות להתחבר שוב, דרך קישור הזמנה.
end $$;

/** הסרת חברה מהמעגל — בלי חסימה, ולשני הכיוונים. */
create or replace function squish_remove_connection(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  delete from squish_connections
   where (user_id = v_me and connected_user_id = p_other)
      or (user_id = p_other and connected_user_id = v_me);
end $$;

/* ══════════════════ 5. דיווח על פריט ══════════════════ */

do $$ begin
  create type squish_report_state as enum ('open','reviewed','resolved');
exception when duplicate_object then null; end $$;

/* המדווחת יכולה למחוק את החשבון שלה, והדיווח חייב לשרוד בלעדיה: הוא
   רשומת מודרציה, לא רכוש פרטי שלה. בלי זה `on delete set null` שעל
   המפתח הזר סותר את ה-not null, והמחיקה נופלת. */
alter table squish_trade_reports alter column reported_by_user_id drop not null;

alter table squish_trade_reports add column if not exists state       squish_report_state not null default 'open';
alter table squish_trade_reports add column if not exists reviewed_at timestamptz;
alter table squish_trade_reports add column if not exists admin_note  text;

create table if not exists squish_item_reports (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references squish_items(id) on delete cascade,
  -- ניתן ל-null בכוונה: אחרי שהמדווחת מוחקת את החשבון, הדיווח נשאר
  -- למודרציה בלי הקשר אליה
  reporter_user_id  uuid references auth.users(id) on delete set null,
  reported_user_id  uuid not null references auth.users(id) on delete cascade,
  reason            text not null,
  details           text,
  state             squish_report_state not null default 'open',
  reviewed_at       timestamptz,
  admin_note        text,
  created_at        timestamptz not null default now()
);

create index if not exists squish_item_reports_state_idx on squish_item_reports (state, created_at desc);
create index if not exists squish_item_reports_user_idx  on squish_item_reports (reported_user_id);

alter table squish_item_reports enable row level security;

-- **רק המדווחת רואה את השורה שלה.** אין policy שנותן למדווח-עליו לראות
-- שדווח, ואין policy שנותן לו לראות את הסיבה.
drop policy if exists squish_item_report_mine on squish_item_reports;
create policy squish_item_report_mine on squish_item_reports
  for all using (reporter_user_id = auth.uid()) with check (reporter_user_id = auth.uid());

/* ══════════════════ 6. הגבלות קצב והתנהגות ══════════════════ */

/** כמה הצעות בשעה, וכמה הזמנות בשעה. מספרים נדיבים לילדה, צרים לספאם. */
create or replace function squish_rate_ok(p_user uuid, p_what text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_what
    when 'proposal' then (
      select count(*) from squish_trade_proposals
       where sender_user_id = p_user and created_at > now() - interval '1 hour'
    ) < 10
    when 'invite' then (
      select count(*) from squish_invites
       where inviter_user_id = p_user and created_at > now() - interval '1 hour'
    ) < 10
    else true
  end;
$$;

/* קישור הזמנה נוצר ב-insert ישיר מהדפדפן, ולכן ההגבלה חייבת לשבת
   בטריגר: בדיקה בממשק היא בקשה, לא כלל. */
create or replace function squish_invite_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from squish_profiles
     where user_id = new.inviter_user_id and suspended_at is not null
  ) then
    raise exception 'account suspended';
  end if;
  if not squish_rate_ok(new.inviter_user_id, 'invite') then
    raise exception 'too many invites';
  end if;
  return new;
end $$;

drop trigger if exists squish_invite_rate on squish_invites;
create trigger squish_invite_rate
  before insert on squish_invites
  for each row execute function squish_invite_guard();

/* ══════════════════ 7. שליחת הצעה, עם כל השכבות ══════════════════ */

create or replace function squish_send_proposal(p_requested uuid, p_offered uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_owner    uuid;
  v_prop     uuid;
  v_version  uuid;
  v_item     uuid;
  v_ctx      text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_offered is null or array_length(p_offered, 1) is null then
    raise exception 'offer at least one item';
  end if;
  if array_length(p_offered, 1) > 3 then raise exception 'at most three items'; end if;

  if exists (select 1 from squish_profiles where user_id = v_me and suspended_at is not null) then
    raise exception 'account suspended';
  end if;

  select owner_user_id into v_owner from squish_items
   where id = p_requested and deleted_at is null and trade_status = 'open_for_trade';
  if v_owner is null then raise exception 'item not open for trade'; end if;
  if v_owner = v_me then raise exception 'cannot trade with yourself'; end if;

  if squish_is_blocked(v_me, v_owner) then raise exception 'blocked'; end if;
  if exists (select 1 from squish_profiles where user_id = v_owner and suspended_at is not null) then
    raise exception 'item not open for trade';
  end if;

  -- ההרשאה החברתית היא אותה הרשאה של הצפייה. אין דרך אחרת להגיע לפריט.
  if not squish_can_view(v_me, v_owner) then raise exception 'not in circle'; end if;

  -- שלושה פריטים פעילים לפחות, אחרת אין ממה להציע
  if squish_item_count(v_me) < 3 then raise exception 'need three items'; end if;

  if not squish_rate_ok(v_me, 'proposal') then raise exception 'too many proposals'; end if;

  -- הצעה פעילה אחת לכל פריט מבוקש בין אותן שתיים. שתי הצעות מקבילות על
  -- אותו סקווישי הן רק בלבול, ומי שמקבלת לא יודעת על מה היא עונה.
  if exists (
    select 1 from squish_trade_proposals
     where sender_user_id = v_me and receiver_user_id = v_owner
       and requested_item_id = p_requested
       and status not in ('completed','declined','cancelled','reported')
  ) then
    raise exception 'duplicate proposal';
  end if;

  -- אחרי "לא הפעם" מחכים. הצעה חוזרת מיד היא נדנוד, לא משא ומתן.
  if exists (
    select 1 from squish_trade_proposals
     where sender_user_id = v_me and receiver_user_id = v_owner
       and requested_item_id = p_requested
       and status = 'declined'
       and updated_at > now() - interval '24 hours'
  ) then
    raise exception 'recently declined';
  end if;

  select case
    when exists (select 1 from squish_connections c
                  where c.user_id = v_me and c.connected_user_id = v_owner
                    and c.status = 'active' and c.connection_type = 'direct_friend')
    then 'חברה שלך'
    else 'חברה של חברה'
  end into v_ctx;

  insert into squish_trade_proposals (sender_user_id, receiver_user_id, requested_item_id, status, connection_context)
  values (v_me, v_owner, p_requested, 'sent', v_ctx)
  returning id into v_prop;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (v_prop, v_me, 1, p_requested)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, p_requested, v_owner, 'requested');

  foreach v_item in array p_offered loop
    if not exists (
      select 1 from squish_items
       where id = v_item and owner_user_id = v_me and deleted_at is null
         and duchan_product_id is null
         and trade_status not in ('reserved','traded','moved_to_duchan')
    ) then
      raise exception 'offered item unavailable';
    end if;
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_me, 'offered');
  end loop;

  -- השולחת מאשרת את הגרסה שהיא עצמה יצרה
  update squish_trade_proposals
     set current_version_id = v_version,
         accepted_by_sender_at = now(),
         updated_at = now()
   where id = v_prop;

  return v_prop;
end $$;

/* ══════════════════ 8. חסימה והשהיה עוצרות גם באמצע ══════════════════
   שתיים יכולות להיות באמצע טרייד כשאחת נחסמת או מושהית. במקום לשכפל
   את הבדיקה לתוך כל פונקציה — ולשכוח אותה בפונקציה הבאה שתיכתב — היא
   יושבת בטריגר על הטבלה עצמה.

   מצבים סופיים תמיד עוברים: הם הדרך *החוצה* מטרייד תקוע, ולחסום אותם
   היה כולא את שני הצדדים בפנים. */

create or replace function squish_trade_progress_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled','declined','reported','completed') then
    return new;
  end if;

  if (new.status is distinct from old.status)
     or (new.accepted_by_sender_at   is distinct from old.accepted_by_sender_at)
     or (new.accepted_by_receiver_at is distinct from old.accepted_by_receiver_at)
     or (new.current_version_id      is distinct from old.current_version_id)
     or (new.reserved_at             is distinct from old.reserved_at)
  then
    if squish_is_blocked(new.sender_user_id, new.receiver_user_id) then
      raise exception 'blocked';
    end if;
    if exists (
      select 1 from squish_profiles
       where user_id in (new.sender_user_id, new.receiver_user_id)
         and suspended_at is not null
    ) then
      raise exception 'account suspended';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists squish_trade_progress on squish_trade_proposals;
create trigger squish_trade_progress
  before update on squish_trade_proposals
  for each row execute function squish_trade_progress_guard();

/* ══════════════════ 9. פעולות מנהלת ══════════════════ */

create table if not exists squish_admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_label  text not null,
  action       text not null,
  target_user  uuid references auth.users(id) on delete set null,
  target_id    uuid,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists squish_admin_actions_idx on squish_admin_actions (created_at desc);

alter table squish_admin_actions enable row level security;
-- אין policy: רק service_role (שעוקף RLS) נוגע בטבלה הזו.

/** השהיה ושחזור. p_admin הוא תווית לתיעוד, לא הרשאה — ההרשאה היא
    בעצם היכולת לקרוא לפונקציה, שניתנת ל-service_role בלבד. */
create or replace function squish_admin_suspend(p_user uuid, p_reason text, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update squish_profiles
     set suspended_at = now(), suspended_reason = p_reason, updated_at = now()
   where user_id = p_user;
  insert into squish_admin_actions (admin_label, action, target_user, note)
  values (coalesce(p_admin, 'admin'), 'suspend', p_user, p_reason);
end $$;

create or replace function squish_admin_restore(p_user uuid, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update squish_profiles
     set suspended_at = null, suspended_reason = null, updated_at = now()
   where user_id = p_user;
  insert into squish_admin_actions (admin_label, action, target_user)
  values (coalesce(p_admin, 'admin'), 'restore', p_user);
end $$;

/**
 * ביטול טרייד על ידי מנהלת, ושחרור השמירות.
 *
 * משתמש באותו pre_reserve_status כמו ביטול רגיל: פריט חוזר בדיוק למצב
 * שממנו הגיע. מנהלת שמשחררת טרייד תקוע לא אמורה להפוך פריט פרטי לפתוח
 * לטרייד בטעות.
 */
create or replace function squish_admin_cancel_trade(p_proposal uuid, p_note text, p_admin text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;

  update squish_items
     set trade_status = coalesce(
           pre_reserve_status,
           case when id = v_prop.requested_item_id
                then 'open_for_trade'::squish_trade_status
                else 'keep'::squish_trade_status end),
         pre_reserve_status = null,
         reserved_by_proposal_id = null,
         updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = 'admin', updated_at = now()
   where id = p_proposal;

  insert into squish_admin_actions (admin_label, action, target_id, note)
  values (coalesce(p_admin, 'admin'), 'cancel_trade', p_proposal, p_note);
end $$;

/* ══════════════════ 10. מחיקת אוסף וחשבון ══════════════════
   מחיקה אמיתית של הדאטה של הילדה, אבל *לא* של דיווחים שאחרות הגישו
   עליה: דיווח הוא רשומה של מי שדיווחה, ומחיקה עצמית לא אמורה לנקות
   היסטוריית מודרציה. במקום זה השורה נשמרת בלי קשר לחשבון שנמחק. */

create or replace function squish_delete_profile()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_prop record;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  -- כל טרייד חי נסגר קודם, אחרת פריטים של אחרות נשארים נעולים
  for v_prop in
    select id, requested_item_id from squish_trade_proposals
     where status not in ('completed','declined','cancelled','reported')
       and (sender_user_id = v_me or receiver_user_id = v_me)
  loop
    update squish_items
       set trade_status = coalesce(
             pre_reserve_status,
             case when id = v_prop.requested_item_id
                  then 'open_for_trade'::squish_trade_status
                  else 'keep'::squish_trade_status end),
           pre_reserve_status = null,
           reserved_by_proposal_id = null,
           updated_at = now()
     where reserved_by_proposal_id = v_prop.id;

    update squish_trade_proposals
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'account_deleted', updated_at = now()
     where id = v_prop.id;
  end loop;

  delete from squish_interests where user_id = v_me;
  delete from squish_interests i using squish_items it
   where i.item_id = it.id and it.owner_user_id = v_me;
  delete from squish_wishlist where owner_user_id = v_me;
  delete from squish_blocks where blocker_user_id = v_me or blocked_user_id = v_me;
  delete from squish_connections where user_id = v_me or connected_user_id = v_me;
  delete from squish_invites where inviter_user_id = v_me;

  -- דיווחים *שהיא* הגישה מאבדים את הקשר אליה, ונשארים למודרציה
  update squish_item_reports  set reporter_user_id = null where reporter_user_id = v_me;
  update squish_trade_reports set reported_by_user_id = null where reported_by_user_id = v_me;

  delete from squish_items where owner_user_id = v_me;
  delete from squish_profiles where user_id = v_me;
  -- חשבון ה-auth עצמו נשאר: הוא משותף עם דוכן.
end $$;

/* ══════════════════ 11. משוב מהפיילוט ══════════════════ */

create table if not exists squish_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  moment      text not null,
  choice      text not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, moment)
);

alter table squish_feedback enable row level security;

drop policy if exists squish_own_feedback on squish_feedback;
create policy squish_own_feedback on squish_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/* ══════════════════ 12. אישור הורה חד-פעמי (מאחורי דגל) ══════════════════
   לא בקרת הורים ולא דשבורד. רק הוכחה שההורה קיבל את המידע ואישר, עם
   גרסת הנוסח שהוצג לו — כדי שאם הנוסח ישתנה, יהיה ברור על מה חתמו. */

create table if not exists squish_parent_approvals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  token          text unique not null,
  parent_phone   text not null,
  copy_version   text not null,
  sent_at        timestamptz not null default now(),
  decided_at     timestamptz,
  approved       boolean,
  created_at     timestamptz not null default now()
);

create index if not exists squish_parent_approvals_user_idx on squish_parent_approvals (user_id, created_at desc);

alter table squish_parent_approvals enable row level security;

-- הילדה רואה שנשלח ומה הוחלט, ולא יכולה להחליט בשם ההורה:
-- ההחלטה נכתבת בשרת דרך הטוקן, לא מהדפדפן שלה.
drop policy if exists squish_own_parent_approval on squish_parent_approvals;
create policy squish_own_parent_approval on squish_parent_approvals
  for select using (user_id = auth.uid());

/* ══════════════════ 13. הרשאות ══════════════════ */

do $$ begin
  grant all on squish_blocks, squish_item_reports, squish_feedback,
                squish_parent_approvals, squish_admin_actions to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select, insert, update, delete on squish_blocks to authenticated;
  grant select, insert on squish_item_reports to authenticated;
  grant select, insert, update on squish_feedback to authenticated;
  grant select on squish_parent_approvals to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_is_blocked(uuid, uuid)        to authenticated, service_role;
  grant execute on function squish_block_user(uuid)              to authenticated;
  grant execute on function squish_unblock_user(uuid)            to authenticated;
  grant execute on function squish_remove_connection(uuid)       to authenticated;
  grant execute on function squish_delete_profile()              to authenticated;
  grant execute on function squish_rate_ok(uuid, text)           to authenticated, service_role;
exception when undefined_object then null; end $$;

-- פעולות מנהלת: service_role בלבד. הן לא נגישות למשתמשת מחוברת.
do $$ begin
  revoke execute on function squish_admin_suspend(uuid, text, text)     from authenticated, anon;
  revoke execute on function squish_admin_restore(uuid, text)           from authenticated, anon;
  revoke execute on function squish_admin_cancel_trade(uuid, text, text) from authenticated, anon;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_admin_suspend(uuid, text, text)      to service_role;
  grant execute on function squish_admin_restore(uuid, text)            to service_role;
  grant execute on function squish_admin_cancel_trade(uuid, text, text) to service_role;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0030_squish_safety.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0031_squish_stickers.sql
-- ───────────────────────────────────────────────────────────────

-- 0031 — מדבקות על סקווישי.
--
-- מה שהופך פריט מרשומה באוסף לחפץ אספני הוא לא עוד שדה טקסט, אלא סימן
-- קטן שהילדה שמה עליו בעצמה.
--
-- **ההפרדה החשובה כאן היא בין מדבקה אישית למדבקת פעולה:**
--
--   אישית  — "נדיר בעיניי", "חדש באוסף". דעה של הילדה, ולכן היא נשמרת
--            כאן, בעמודה הזו.
--   פעולה  — "פתוח לטרייד" נגזר מ-trade_status, ו"אהוב עליי" נגזר
--            מ-squish_profiles.favorite_item_id. שניהם *מצב* ולא תווית,
--            ולכן הם לא נכנסים לעמודה — אחרת היה אפשר לסמן "פתוח
--            לטרייד" על פריט שנעול בטרייד, והמדבקה הייתה משקרת.
--
-- **"נדיר בעיניי" ולא "נדיר".** אין קטלוג שיודע כמה קיימים בעולם, ולכן
-- כל טענת נדירות מוחלטת היא מידע מומצא. הניסוח שומר על תחושת האספנות
-- בלי להמציא עובדה.

alter table squish_items
  add column if not exists stickers text[] not null default '{}';

comment on column squish_items.stickers is
  'מדבקות אישיות שהילדה בחרה. rare/new בלבד — טרייד ואהוב נגזרים ממצב.';

/* רשימה סגורה, נאכפת בדאטהבייס ולא רק בממשק: מדבקה שהגיעה מקוד ישן או
   מהקונסולה לא תיכנס, וכך אין ערכים שהמסך לא יודע לצייר. */
do $$ begin
  alter table squish_items
    add constraint squish_items_stickers_known
    check (stickers <@ array['rare','new']::text[]);
exception when duplicate_object then null; end $$;

insert into schema_migrations (name) values ('0031_squish_stickers.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- 0032_invite_safety.sql
-- ───────────────────────────────────────────────────────────────

-- 0032 — שלב א': סגירת חורי בטיחות בהזמנה ובהצטרפות.
--
-- המיגרציה הזו לא משנה שום הרשאת צפייה. היא סוגרת שלושה פערים שקיימים
-- כבר היום:
--
-- 1. **נחסמת יכלה לחזור.** squish_join עשה `on conflict do update set
--    status = 'active'` בלי לבדוק חסימה. מי שנחסמה ונכנסה שוב דרך אותו
--    קישור קיבלה קשר פעיל בחזרה — והופיעה שוב ב"החברות שלי" עם כינוי
--    וספירת פריטים. הצפייה עצמה נחסמה ב-squish_can_view, אבל היא לא
--    הייתה אמורה להופיע שם מלכתחילה.
-- 2. **מושהית יכלה להצטרף** ולהרחיב מעגל בזמן שהחשבון שלה מושהה.
-- 3. **קישור הזמנה היה דלת פתוחה לנצח** — בלי תוקף, בלי ביטול, ובלי
--    תקרת שימושים.
--
-- **קישורים קיימים לא מתים.** expires_at ו-max_uses נאכפים רק כשהם
-- מלאים, וקישור שכבר יושב בוואטסאפ של מישהי נשאר תקף. התוקף חל על מה
-- שנוצר מכאן והלאה.

/* ══════════════ 1. תוקף, ביטול ותקרה ══════════════ */

alter table squish_invites add column if not exists label      text;
alter table squish_invites add column if not exists expires_at timestamptz;
alter table squish_invites add column if not exists revoked_at timestamptz;
alter table squish_invites add column if not exists max_uses   int;
alter table squish_invites add column if not exists uses       int not null default 0;

comment on column squish_invites.label is
  'שם שהילדה נתנה לקישור, למשל "חוג ריקוד". מחליף קבוצות.';
comment on column squish_invites.expires_at is
  'ריק = ללא תוקף. קישורים שנוצרו לפני 0032 נשארים כך בכוונה.';
comment on column squish_invites.max_uses is
  'ריק = בלי תקרה, לקישורים ישנים. חדשים נוצרים עם 10.';

/* ברירות המחדל חלות רק על שורות חדשות — בדיוק מה שאנחנו רוצים. */
alter table squish_invites alter column expires_at set default (now() + interval '30 days');
alter table squish_invites alter column max_uses   set default 10;

create index if not exists squish_invites_live_idx
  on squish_invites (inviter_user_id, created_at desc)
  where revoked_at is null;

/* מחיקה רכה לקשר, כדי שמודרציה תוכל לראות שהיה קשר ונותק */
alter table squish_connections add column if not exists removed_at timestamptz;

/* ══════════════ 2. מצב ההזמנה, במקום אחד ══════════════ */

/**
 * למה פונקציה ולא שלושה תנאים מפוזרים: אותה תשובה בדיוק נחוצה גם
 * ב-squish_join, גם במסך ההצטרפות וגם במסך "שלי". שלושה עותקים של
 * אותו תנאי הם שלוש הזדמנויות להתפצל.
 */
create or replace function squish_invite_state(p_code text)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when i.id is null                                then 'not_found'
    when i.revoked_at is not null                    then 'revoked'
    when i.expires_at is not null
         and i.expires_at < now()                    then 'expired'
    when i.max_uses is not null
         and i.uses >= i.max_uses                    then 'exhausted'
    else 'ok'
  end
  from (select 1) one
  left join squish_invites i on i.code = p_code;
$$;

/** ביטול קישור — רק מי שיצרה אותו. */
create or replace function squish_revoke_invite(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  update squish_invites
     set revoked_at = coalesce(revoked_at, now())
   where code = p_code and inviter_user_id = v_me;
end $$;

/* ══════════════ 3. הצטרפות, עם כל השערים ══════════════ */

create or replace function squish_join(p_code text)
returns table (inviter_user_id uuid, nickname text, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_me      uuid := auth.uid();
  v_nick    text;
  v_exists  boolean;
  v_state   text;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  v_state := squish_invite_state(p_code);
  if v_state = 'not_found' then raise exception 'invite not found'; end if;
  if v_state = 'revoked'   then raise exception 'invite revoked';   end if;
  if v_state = 'expired'   then raise exception 'invite expired';   end if;
  if v_state = 'exhausted' then raise exception 'invite exhausted'; end if;

  select i.inviter_user_id into v_inviter
    from squish_invites i where i.code = p_code;

  if v_inviter = v_me then
    raise exception 'cannot join your own circle';
  end if;

  /* חסימה גוברת על הכל — גם על קישור תקף.
     בלי הבדיקה הזו `on conflict do update` היה מחזיר לחיים קשר חסום. */
  if squish_is_blocked(v_me, v_inviter) then
    raise exception 'blocked';
  end if;

  if exists (select 1 from squish_profiles
              where user_id = v_me and suspended_at is not null) then
    raise exception 'account suspended';
  end if;

  /* חשבון מושהה לא מרחיב מעגל, וגם לא נחשף כמושהה למי שמנסה להצטרף */
  if exists (select 1 from squish_profiles
              where user_id = v_inviter and suspended_at is not null) then
    raise exception 'invite unavailable';
  end if;

  select p.nickname into v_nick from squish_profiles p where p.user_id = v_inviter;

  select exists (
    select 1 from squish_connections c
    where c.user_id = v_me and c.connected_user_id = v_inviter and c.status = 'active'
  ) into v_exists;

  -- חיבור דו-כיווני: שתיהן רואות אחת את השנייה
  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_me, v_inviter, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  insert into squish_connections (user_id, connected_user_id, connection_type, invited_by_user_id, status)
  values (v_inviter, v_me, 'direct_friend', v_inviter, 'active')
  on conflict (user_id, connected_user_id)
  do update set status = 'active', connection_type = 'direct_friend', removed_at = null;

  /* uses נספר רק על הצטרפות *חדשה*. מי שלוחצת פעמיים על אותו קישור לא
     שורפת שימוש, אחרת תקרה של עשרה נגמרת משבע חברות. */
  update squish_invites
     set joined_user_id = coalesce(joined_user_id, v_me),
         joined_at      = coalesce(joined_at, now()),
         uses           = uses + case when v_exists then 0 else 1 end
   where code = p_code;

  return query select v_inviter, v_nick, v_exists;
end $$;

/* ספירת לחיצות — רק על קישור חי. אין טעם לספור לחיצות על קישור מבוטל. */
create or replace function squish_invite_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update squish_invites set clicks = clicks + 1
   where code = p_code and revoked_at is null;
$$;

/* ══════════════ 4. group_only — הסרה ══════════════
   האפשרות הוצעה בהגדרות, אבל שום דבר לא יוצר קשר מסוג group_member,
   ולכן בחירה בה הסתירה את האוסף מכולן. אין מנגנון קבוצות ולא יהיה
   בשלב הזה, אז זו לא הגדרה עתידית — זה מסך שבור.

   ערך ה-enum *נשאר*: מחיקת ערך enum שוברת כל שורה שמצביעה עליו, וזה
   בדיוק סוג הדבר שאסור לעשות למיגרציה. רק הנתונים עוברים. */

update squish_profiles
   set collection_visibility = 'direct_friends', updated_at = now()
 where collection_visibility = 'group_only';

/* ══════════════ 5. הרשאות ══════════════ */

do $$ begin
  grant execute on function squish_invite_state(text)  to anon, authenticated, service_role;
  grant execute on function squish_revoke_invite(text) to authenticated;
exception when undefined_object then null; end $$;

insert into schema_migrations (name) values ('0032_invite_safety.sql') on conflict do nothing;

commit;

-- אחרי ההרצה: לרענן את הקאש של ה-API
notify pgrst, 'reload schema';
