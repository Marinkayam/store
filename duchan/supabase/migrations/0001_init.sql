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
