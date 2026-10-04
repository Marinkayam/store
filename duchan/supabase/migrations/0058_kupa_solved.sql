-- קופת הדוכן: חידות שנפתרו = כוכבים. תוספתי בלבד.
--
-- הכוכבים שייכים לדוכן ולא לאדם (כמו המטבעות): בדוכן משותף שני השותפים
-- רואים אותם, ועוברים בין טלפונים. עד עכשיו נשמרו רק בטלפון.
--
-- נכתב רק ע"י השרת (/api/kupa/solve, service role), שבודק שהתשובה נכונה
-- ושהכותב/ת בצוות של הדוכן. אין policies — הדפדפן לא קורא ולא כותב ישירות.
create table if not exists kupa_solved (
  store_id  uuid not null references stores(id) on delete cascade,
  riddle_id text not null check (char_length(riddle_id) between 1 and 64),
  solved_by uuid references auth.users(id) on delete set null,
  solved_at timestamptz not null default now(),
  primary key (store_id, riddle_id)
);

alter table kupa_solved enable row level security;

do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant all on kupa_solved to service_role;
  end if;
end $$;
