-- תפקידי PostgREST כמו ב-Supabase אמיתי
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- auth.uid() כמו של Supabase: קורא את ה-sub מה-JWT ש-PostgREST שם ב-GUC
create or replace function auth.uid() returns uuid language sql stable as
$$ select coalesce(
     nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
     nullif(current_setting('app.uid', true), '')
   )::uuid $$;

-- אחסון סיסמאות לשים המקומי בלבד (לא קיים בפרודקשן!)
create table if not exists auth.shim_passwords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password text not null
);
