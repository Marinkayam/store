-- ═══════════════════════════════════════════════════════════════
--  דוכן — הקמת הדאטהבייס במלואה
--  להדביק ב-Supabase → SQL Editor → Run. פעם אחת.
--
--  נוצר אוטומטית ע"י scripts/gen-setup.mjs — אין לערוך ביד.
--  מכיל את כל המיגרציות לפי הסדר, ורושם אותן ב-schema_migrations
--  כדי ש-`npm run migrate` בעתיד יריץ רק מיגרציות חדשות.
--
--  בטוח: הכל רץ בטרנזקציה אחת. אם משהו נכשל — שום דבר לא מוחל.
-- ═══════════════════════════════════════════════════════════════

begin;

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 0001_init.sql
-- ───────────────────────────────────────────────────────────────

-- דוכן — סכמה ראשונית
-- מיגרציות רק מוסיפות. עמודה חדשה תמיד nullable. אין שינוי שם, אין מחיקה.

create type store_status  as enum ('active','paused','blocked');
create type order_status  as enum ('sent','paid','delivered','cancelled');

create table stores (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete cascade,
  slug          text unique not null,          -- 5 תווים אקראיים. לא שם.
  display_name  text not null,
  emoji         text not null default '🦄',
  tagline       text,
  theme         text not null default 'cloud',
  cover_key     text,
  contact_phone text not null,                 -- E.164 ללא +: 972501234567
  parent_name   text not null,
  parent_phone  text not null,
  parent_email  text not null,
  status        store_status not null default 'active',
  claim_token   text unique,                   -- לחנויות שנוצרו ע"י אדמין
  media_bytes   bigint not null default 0,     -- מכסה
  created_at    timestamptz default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  description text,
  price       int  not null check (price >= 0),   -- שקלים שלמים. אין אגורות.
  image_key   text,
  video_key   text,
  poster_key  text,
  track_stock boolean not null default true,
  stock       int not null default 0 check (stock >= 0),
  sort_order  int not null default 0,
  deleted_at  timestamptz,                        -- soft delete בלבד
  created_at  timestamptz default now()
);

create table orders (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  order_number int  not null,                     -- רץ פר חנות
  items        jsonb not null,                    -- snapshot: [{name,qty,price}]
  total        int  not null,
  buyer_note   text,
  status       order_status not null default 'sent',
  ip_hash      text,                              -- ל-rate limit: 5 הזמנות מ-IP לחנות ליום
  created_at   timestamptz default now(),
  unique (store_id, order_number)
);

create index on products (store_id) where deleted_at is null;
create index on orders   (store_id, created_at desc);
create index on orders   (store_id, ip_hash, created_at);

-- מספור הזמנות — atomic, לא count()+1.
-- advisory lock פר חנות: PostgreSQL אוסר FOR UPDATE על אגרגט (max),
-- והנעילה מסדרת שתי הזמנות בו-זמניות באותה חנות.
create or replace function next_order_number(p_store uuid)
returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  return n;
end $$;

-- "שולם" — עדכון סטטוס + ניכוי מלאי בטרנזקציה אחת.
-- המלאי יורד כאן ולא ביצירת ההזמנה (הזמנות רפאים).
create or replace function mark_order_paid(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status <> 'sent' then
    return;
  end if;

  -- security definer עוקף RLS — חובה לוודא שהקוראת היא בעלת החנות
  if not exists (
    select 1 from stores s where s.id = o.store_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update orders set status = 'paid' where id = p_order;

  for it in select * from jsonb_array_elements(o.items) loop
    update products
       set stock = greatest(0, stock - (it->>'qty')::int)
     where store_id = o.store_id
       and name = it->>'name'
       and track_stock;
  end loop;
end $$;

-- RLS
alter table stores   enable row level security;
alter table products enable row level security;
alter table orders   enable row level security;

create policy own_store on stores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_products on products
  for all using (store_id in (select id from stores where owner_id = auth.uid()))
  with check   (store_id in (select id from stores where owner_id = auth.uid()));

create policy own_orders on orders
  for all using (store_id in (select id from stores where owner_id = auth.uid()));

-- אין policy ציבורי על stores בכוונה: החנות הפומבית נקראת בשרת בלבד,
-- עם service role, ומחזירה שדות מפורשים. אחרת contact_phone ו-parent_email דולפים.

-- ───────────────────────────────────────────────────────────────
-- 0002_parent_optional.sql
-- ───────────────────────────────────────────────────────────────

-- פרטי הורה הופכים לאופציונליים — ההרשמה היא של הילדה בלבד.
-- מיגרציה רק מרפה אילוץ (drop not null) — לא שוברת שורות קיימות.

alter table stores alter column parent_name  drop not null;
alter table stores alter column parent_phone drop not null;
alter table stores alter column parent_email drop not null;

-- ───────────────────────────────────────────────────────────────
-- 0003_management.sql
-- ───────────────────────────────────────────────────────────────

-- פיצ'רי ניהול חנות. מיגרציה תוספתית בלבד: עמודות חדשות nullable, פונקציה חדשה.

-- הסתרת מוצר בלי מחיקה. null = מוצג (ברירת מחדל לשורות קיימות).
alter table products add column is_visible boolean default true;

-- הערה אישית של בעלת החנות על הזמנה ("לארוז בורוד")
alter table orders add column owner_note text;

-- ביטול הזמנה — אם המלאי כבר נוכה ("שולם"/"נמסר"), הוא חוזר. אטומי.
create or replace function cancel_order(p_order uuid)
returns void language plpgsql security definer as $$
declare
  o record;
  it jsonb;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status = 'cancelled' then
    return;
  end if;

  -- security definer עוקף RLS — חובה לוודא שהקוראת היא בעלת החנות
  if not exists (
    select 1 from stores s where s.id = o.store_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if o.status in ('paid','delivered') then
    for it in select * from jsonb_array_elements(o.items) loop
      update products
         set stock = stock + (it->>'qty')::int
       where store_id = o.store_id
         and name = it->>'name'
         and track_stock;
    end loop;
  end if;

  update orders set status = 'cancelled' where id = p_order;
end $$;

-- ───────────────────────────────────────────────────────────────
-- 0004_place_order.sql
-- ───────────────────────────────────────────────────────────────

-- יצירת הזמנה אטומית: מספור + כתיבה בטרנזקציה אחת.
-- שני צעדים נפרדים (rpc ואז insert) הם שתי טרנזקציות — הנעילה משתחררת
-- ביניהן ושתי קונות בו-זמניות היו יכולות לקבל אותו מספר.

create or replace function place_order(
  p_store uuid,
  p_items jsonb,
  p_total int,
  p_note text,
  p_ip_hash text
) returns int language plpgsql as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store::text, 0));
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store;
  insert into orders (store_id, order_number, items, total, buyer_note, status, ip_hash)
    values (p_store, n, p_items, p_total, p_note, 'sent', p_ip_hash);
  return n;
end $$;

-- SECURITY INVOKER בכוונה: הקריאה מגיעה מהשרת עם service role אחרי אימות
-- מחירים ומלאי. קליינט מחובר שינסה לקרוא ישירות ייחסם ע"י RLS על orders.

-- ───────────────────────────────────────────────────────────────
-- 0005_avatar.sql
-- ───────────────────────────────────────────────────────────────

-- תמונת פרופיל לחנות (אווטאר). אם אין — האמוג'י מוצג. עמודה nullable, תוספתית.

alter table stores add column avatar_key text;

-- ───────────────────────────────────────────────────────────────
-- 0006_admin_console.sql
-- ───────────────────────────────────────────────────────────────

-- מרכז הניהול של מרינה: ספירת כניסות לחנויות + עדכונים לבנות. תוספתי בלבד.

-- כניסות לחנות, מקובץ לפי יום. נכתב רק ע"י השרת (service role) — אין policies.
create table store_views (
  store_id uuid not null references stores(id) on delete cascade,
  day      date not null default current_date,
  views    int  not null default 0,
  primary key (store_id, day)
);

create or replace function bump_store_view(p_store uuid)
returns void language sql as $$
  insert into store_views (store_id, day, views)
  values (p_store, current_date, 1)
  on conflict (store_id, day) do update set views = store_views.views + 1
$$;

-- עדכונים מהמנהלת לבנות ("הוספתי פיצ'ר חדש!"). כתיבה: אדמין בלבד (service role).
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  emoji      text not null default '✨',
  created_at timestamptz default now()
);

alter table store_views   enable row level security;
alter table announcements enable row level security;

-- כל מי שמחוברת קוראת עדכונים; אין policy לכתיבה — רק service role כותב.
create policy read_announcements on announcements for select using (true);

-- הרשאות מפורשות. ב-Supabase יש default privileges שנותנות את זה אוטומטית,
-- אבל מיגרציה שלא סומכת על הגדרת הפרויקט עובדת בכל סביבה.
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant all on store_views, announcements to service_role;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant select on announcements to authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'anon') then
    grant select on announcements to anon;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────
-- 0007_ai_premium.sql
-- ───────────────────────────────────────────────────────────────

-- פיצ'ר פרימיום: כתיבת תיאור מוצר ע"י AI. מודלק פר חנות ע"י המנהלת.
-- ai_credits: כמה תיאורים נשארו. null = ללא הגבלה.

alter table stores add column ai_enabled boolean default false;
alter table stores add column ai_credits int;

-- ניכוי קרדיט אטומי. מחזיר true אם מותר להשתמש.
create or replace function use_ai_credit(p_store uuid)
returns boolean language plpgsql security definer as $$
declare s record;
begin
  select ai_enabled, ai_credits into s from stores where id = p_store for update;
  if s is null or not coalesce(s.ai_enabled, false) then
    return false;
  end if;
  if s.ai_credits is null then          -- ללא הגבלה
    return true;
  end if;
  if s.ai_credits <= 0 then
    return false;
  end if;
  update stores set ai_credits = ai_credits - 1 where id = p_store;
  return true;
end $$;

-- החזרת קרדיט כשהקריאה ל-AI נכשלה. לא עולה מעל התקרה שנקבעה.
create or replace function refund_ai_credit(p_store uuid)
returns void language sql security definer as $$
  update stores set ai_credits = ai_credits + 1
   where id = p_store and ai_credits is not null
$$;

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

-- ───────────────────────────────────────────────────────────────
-- רישום המיגרציות שהורצו
-- ───────────────────────────────────────────────────────────────

insert into schema_migrations (name) values
  ('0001_init.sql'),
  ('0002_parent_optional.sql'),
  ('0003_management.sql'),
  ('0004_place_order.sql'),
  ('0005_avatar.sql'),
  ('0006_admin_console.sql'),
  ('0007_ai_premium.sql'),
  ('0008_activation.sql'),
  ('0009_referrals.sql'),
  ('0010_payouts.sql'),
  ('0011_ai_for_everyone.sql'),
  ('0012_product_options.sql'),
  ('0013_phone_auth.sql'),
  ('0014_badges.sql'),
  ('0015_cover_presets.sql'),
  ('0016_parent_consent.sql'),
  ('0017_admin_phones.sql'),
  ('0018_payout_link.sql')
on conflict do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════
--  אימות — אמור להחזיר 18
-- ═══════════════════════════════════════════════════════════════
select count(*) as migrations_applied from schema_migrations;
