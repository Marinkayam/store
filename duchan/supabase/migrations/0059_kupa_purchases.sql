-- קופת הדוכן: חנות הקישוטים. תוספתי בלבד.
--
-- מה הדוכן קנה במטבעות. המטבעות עצמם לא נשמרים — הם מחושבים מהנתונים
-- (lib/kupa.ts) — ולכן היתרה = מה שהורווח פחות סכום המחירים של מה שכאן.
-- המחירים יושבים בקוד (lib/kupa-shop.ts) ולא בטבלה, כדי ששינוי מחיר לא
-- ישנה בדיעבד יתרה של מי שכבר קנה: נשמר המחיר ששולם.
--
-- equipped: לקישוטים שבוחרים אחד מהם (צבע סוכך). השאר תמיד "על הדוכן".
-- נכתב רק ע"י השרת (/api/kupa/shop), שבודק בעלות, יתרה ומחיר.
create table if not exists kupa_purchases (
  store_id  uuid not null references stores(id) on delete cascade,
  item_key  text not null check (char_length(item_key) between 1 and 40),
  price     int  not null check (price >= 0),
  equipped  boolean not null default true,
  bought_by uuid references auth.users(id) on delete set null,
  bought_at timestamptz not null default now(),
  primary key (store_id, item_key)
);

alter table kupa_purchases enable row level security;

do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant all on kupa_purchases to service_role;
  end if;
end $$;
