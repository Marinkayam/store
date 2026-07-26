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
