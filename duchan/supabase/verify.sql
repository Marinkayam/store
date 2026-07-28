-- ═══════════════════════════════════════════════════════════════
--  דוכן — בדיקה שהדאטהבייס מעודכן
--
--  להדביק ב-Supabase → SQL Editor → Run.
--  לא משנה כלום, רק קורא ומדווח.
--
--  כל שורה שחוזרת עם ✗ היא משהו שחסר. אם הכל ✓, הדאטהבייס מעודכן.
-- ═══════════════════════════════════════════════════════════════

with checks as (

  select 1 as ord, 'מיגרציה 0029 — שם הקונה' as בדיקה,
         exists (select 1 from schema_migrations where name like '0029%') as תקין

  union all select 2, 'מיגרציה 0030 — בטיחות סקוויש קלאב',
         exists (select 1 from schema_migrations where name like '0030%')

  union all select 3, 'עמודה orders.buyer_name',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='orders' and column_name='buyer_name')

  union all select 4, 'עמודה orders.deleted_at',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='orders' and column_name='deleted_at')

  union all select 5, 'place_order עם שם הקונה (7 ארגומנטים)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='place_order' and p.pronargs=7)

  union all select 6, 'טבלאות סקוויש קלאב (12 נדרשות)',
         (select count(*) from information_schema.tables
           where table_schema='public' and table_name like 'squish%') >= 12

  union all select 7, 'חסימת משתמשות — squish_blocks',
         exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='squish_blocks')

  union all select 8, 'השהיית חשבון — squish_profiles.suspended_at',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='squish_profiles' and column_name='suspended_at')

  union all select 9, 'שחרור שמירה נכון — squish_items.pre_reserve_status',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='squish_items' and column_name='pre_reserve_status')

  union all select 10, 'פונקציות הטריידים',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in
             ('squish_send_proposal','squish_counter_proposal','squish_approve_version',
              'squish_accept_and_reserve_trade','squish_cancel_trade','squish_confirm_completion')) >= 6

  union all select 11, 'פונקציות הבטיחות',
         (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in
             ('squish_block_user','squish_remove_connection','squish_delete_profile',
              'squish_is_blocked','squish_rate_ok')) >= 5

  union all select 12, 'RLS דלוק על כל טבלאות סקוויש',
         not exists (select 1 from pg_tables t
                      where t.schemaname='public' and t.tablename like 'squish%'
                        and not t.rowsecurity)
)
select
  case when תקין then '✓' else '✗ חסר' end as מצב,
  בדיקה
from checks
order by תקין, ord;
