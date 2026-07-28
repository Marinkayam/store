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

commit;

-- אחרי ההרצה: לרענן את הקאש של ה-API
notify pgrst, 'reload schema';
