-- 0062 — "מי מסתכל על הדוכן": סטטיסטיקה לבעלי הדוכן.
--
-- מרינה: "תבנה גם אנליטיקס שנראה מי מסתכל וכמה צופה".
--
-- **רק מונים. אף שורה כאן לא מזהה אדם.** אין כתובת IP, אין מזהה דפדפן
-- קבוע, אין עוגייה. הדפדפן של הקונה זוכר לבד (localStorage, אצלו) אם הוא
-- כבר היה בדוכן, ושולח רק "ביקור ראשון: כן/לא". השרת מוסיף 1 למונה.
-- לכן גם אנחנו לא יכולים לדעת מי נכנס — רק כמה, מאיפה ומתי.
--
--   store_stats      — מונים לפי דוכן × יום × שעה × מקור הגעה.
--   product_stats    — מונים לפי מוצר × יום: כמה פתחו אותו, כמה הוסיפו לסל.
--   store_presence   — "עכשיו בדוכן": מזהה אקראי לכל לשונית פתוחה (נוצר
--                      מחדש בכל ביקור, sessionStorage), ומתי נראתה לאחרונה.
--                      נספר כ"עכשיו" אם נראה בדקה וחצי האחרונות.
--
-- היום והשעה לפי שעון ישראל — "היום" של ילדה בתל אביב, לא של UTC.
-- הכל של השרת בלבד (service role): הדפדפן לא קורא ולא כותב ישירות.

create table if not exists store_stats (
  store_id      uuid not null references stores(id) on delete cascade,
  day           date not null,
  hour          smallint not null check (hour between 0 and 23),
  source        text not null,          -- whatsapp_or_direct · instagram · tiktok · facebook · google · stall · other
  visits        int not null default 0, -- ביקורים (פעם אחת ללשונית)
  visitors      int not null default 0, -- מבקרים שונים באותו יום (הדפדפן מסמן "ראשון היום")
  new_visitors  int not null default 0, -- נכנסו לדוכן בפעם הראשונה אי פעם
  product_opens int not null default 0, -- ביקורים שבהם פתחו לפחות מוצר אחד
  carts         int not null default 0, -- ביקורים שבהם הוסיפו לפחות משהו אחד לסל
  primary key (store_id, day, hour, source)
);

create table if not exists product_stats (
  store_id   uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  day        date not null,
  opens      int not null default 0,
  carts      int not null default 0,
  primary key (store_id, product_id, day)
);

create table if not exists store_presence (
  store_id uuid not null references stores(id) on delete cascade,
  sid      text not null,
  seen_at  timestamptz not null default now(),
  primary key (store_id, sid)
);
create index if not exists store_presence_seen_idx on store_presence (store_id, seen_at desc);

alter table store_stats    enable row level security;
alter table product_stats  enable row level security;
alter table store_presence enable row level security;
revoke all on store_stats, product_stats, store_presence from public, anon, authenticated;
grant all on store_stats, product_stats, store_presence to service_role;

-- מונה אחד בקריאה אחת. p_kind: visit · product · cart.
-- p_first: זו הפעם הראשונה בביקור הזה (פתיחת מוצר / הוספה לסל). המונים של
-- הדוכן סופרים ביקורים, ולכן עולים רק בפעם הראשונה; המונים של המוצר — בכל
-- מוצר בפעם הראשונה שלו בביקור.
create or replace function bump_store_stat(
  p_store uuid, p_kind text, p_source text,
  p_visitor boolean default false, p_new boolean default false,
  p_product uuid default null, p_first boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare
  local timestamp := now() at time zone 'Asia/Jerusalem';
  d date := local::date;
  h smallint := extract(hour from local)::smallint;
  src text := coalesce(nullif(p_source, ''), 'whatsapp_or_direct');
begin
  insert into store_stats (store_id, day, hour, source, visits, visitors, new_visitors, product_opens, carts)
  values (
    p_store, d, h, src,
    (p_kind = 'visit')::int,
    (p_kind = 'visit' and p_visitor)::int,
    (p_kind = 'visit' and p_new)::int,
    (p_kind = 'product' and p_first)::int,
    (p_kind = 'cart' and p_first)::int
  )
  on conflict (store_id, day, hour, source) do update set
    visits        = store_stats.visits        + excluded.visits,
    visitors      = store_stats.visitors      + excluded.visitors,
    new_visitors  = store_stats.new_visitors  + excluded.new_visitors,
    product_opens = store_stats.product_opens + excluded.product_opens,
    carts         = store_stats.carts         + excluded.carts;

  if p_product is not null and p_kind in ('product', 'cart') then
    insert into product_stats (store_id, product_id, day, opens, carts)
    select p_store, p.id, d, (p_kind = 'product')::int, (p_kind = 'cart')::int
      from products p where p.id = p_product and p.store_id = p_store
    on conflict (store_id, product_id, day) do update set
      opens = product_stats.opens + excluded.opens,
      carts = product_stats.carts + excluded.carts;
  end if;
end $$;
revoke all on function bump_store_stat(uuid, text, text, boolean, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function bump_store_stat(uuid, text, text, boolean, boolean, uuid, boolean) to service_role;
