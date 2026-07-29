-- 0035 — פרוב סכמה, כדי שפיגור בפרודקשן ייראה במקום להיבלע.
--
-- **מה זה פותר.** קוד המדבקות עלה לפרודקשן 43 דקות לפני שהעמודה
-- `squish_items.stickers` נוצרה שם, ובמשך שש שעות כל בניית אוסף נכשלה
-- בשקט. `schema_migrations` לא עזרה: היא רישום של מה שהרצנו, לא של מה
-- שקיים — היא הייתה אומרת "0031 רץ" גם אם רק השורה נוספה.
--
-- מכאן והלאה השאלה נשאלת על הסכמה עצמה: אילו מהעמודות והפונקציות
-- שהקוד הזה צריך באמת קיימות כאן.
--
-- הפונקציה מחזירה **שמות בלבד** — אין בה שום נתון של אף אחת, ולכן
-- אפשר להריץ אותה גם בלי משתמשת מחוברת.

create or replace function squish_schema_probe(p_tables text[], p_functions text[])
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'columns', coalesce((
      select json_agg(c.table_name || '.' || c.column_name)
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = any(p_tables)
    ), '[]'::json),
    'functions', coalesce((
      select json_agg(distinct p.proname)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any(p_functions)
    ), '[]'::json)
  );
$$;

comment on function squish_schema_probe(text[], text[]) is
  'מה באמת קיים בסכמה, לעומת מה שהקוד מצפה. שמות בלבד, בלי נתונים.';

do $$ begin
  grant execute on function squish_schema_probe(text[], text[])
    to anon, authenticated, service_role;
exception when undefined_object then null; end $$;
