#!/usr/bin/env bash
#
# מרים את הסטאק המקומי לבדיקות, מאפס או ממה שנשאר.
#
# **למה הקובץ הזה קיים.** הסביבה שבה הבדיקות רצות היא מכולה זמנית שנמחקת
# מדי כמה שעות. שלוש פעמים בנינו את הסטאק הזה מחדש ביד — Postgres,
# תפקידים, מיגרציות, הרשאות, PostgREST, שלושה שימים, seed — וכל פעם זה
# לקח עשרים דקות של ארכיאולוגיה במקום דקה של סקריפט.
#
#   bash scripts/local-stack.sh          # מרים מה שחסר
#   bash scripts/local-stack.sh --fresh  # מוחק את הדאטהבייס ובונה מאפס
#
# הסקריפט מדלג בשקט על כל מה שכבר עובד, ולכן אפשר להריץ אותו שוב ושוב.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE" || exit 1

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/tmp/pgdata
PGREST=/var/lib/pgtest/postgrest
PGREST_CONF=/var/lib/pgtest/postgrest.conf
LOGS=/tmp/local-stack-logs
mkdir -p "$LOGS"

say() { printf '  %s\n' "$1"; }
up()  { curl -s -o /dev/null --max-time 4 "http://127.0.0.1:$1/" 2>/dev/null; }

if [ "${1:-}" = "--fresh" ]; then
  say "מוחק את הדאטהבייס הקיים"
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1
  rm -rf "$PGDATA"
fi

# ── תלויות ──
if [ ! -d node_modules/playwright ] || [ ! -d node_modules/pg ]; then
  say "מתקין תלויות"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install >"$LOGS/npm.log" 2>&1 \
    || { echo "✗ npm install נכשל, ראה $LOGS/npm.log"; exit 1; }
fi

# ── Postgres ──
# /tmp נמחק באתחול מכולה, ולכן האשכול נבנה מחדש כשהוא חסר.
if [ ! -d "$PGDATA" ]; then
  say "בונה אשכול Postgres"
  mkdir -p "$PGDATA" && chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >"$LOGS/initdb.log" 2>&1 \
    || { echo "✗ initdb נכשל, ראה $LOGS/initdb.log"; exit 1; }
fi
if ! psql -h localhost -p 5433 -U postgres -lqt >/dev/null 2>&1; then
  say "מפעיל Postgres על 5433"
  chmod 1777 /tmp
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p 5433 -k /tmp' -l $PGDATA/server.log start" \
    >/dev/null 2>&1
  sleep 3
fi
psql -h localhost -p 5433 -U postgres -lqt 2>/dev/null | grep -q duchan \
  || { say "יוצר את הדאטהבייס duchan"; psql -h localhost -p 5433 -U postgres -qc "create database duchan"; }

# ── סכמה ──
# התפקידים נוצרים לפני המיגרציות: 0013 מעניקה הרשאות ל-anon, ובלעדיו
# היא נופלת על 'role "anon" does not exist' באמצע השרשרת.
say "תפקידים, סכמת auth, מיגרציות והרשאות"
psql -h localhost -p 5433 -U postgres -d duchan -q <<'SQL' 2>/dev/null
do $$ begin
  if not exists (select from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role')  then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
SQL
psql -h localhost -p 5433 -U postgres -d duchan -qf supabase/tests/local-stack/auth-stub.sql >/dev/null 2>&1
node scripts/migrate.mjs "postgresql://postgres@localhost:5433/duchan" >"$LOGS/migrate.log" 2>&1 \
  || { echo "✗ מיגרציות נכשלו, ראה $LOGS/migrate.log"; exit 1; }
# ההרשאות הן תצלום רגע: כל טבלה חדשה צריכה grant מפורש, ולכן זה רץ
# **אחרי** המיגרציות ולא לפניהן.
psql -h localhost -p 5433 -U postgres -d duchan -qf supabase/tests/local-stack/postgrest-setup.sql >/dev/null 2>&1
# ה-grant הגורף שם פותח מחדש גם פונקציות שמיגרציה 0040 נעלה לשרת
# בלבד — ואז הבדיקה המקומית עוברת בזמן שפרודקשן חסום, או להפך.
# מריצים את הנעילה שוב, אחרונה, כדי שהמקומי יתנהג כמו פרודקשן.
psql -h localhost -p 5433 -U postgres -d duchan -qf supabase/migrations/0040_function_grants.sql >/dev/null 2>&1

# ── PostgREST והשימים ──
up 3001 || { say "מפעיל PostgREST"; ("$PGREST" "$PGREST_CONF" >"$LOGS/postgrest.log" 2>&1 &); sleep 5; }
for s in supashim:8000 s3shim:9000 smsshim:9100; do
  name="${s%%:*}"; port="${s##*:}"
  up "$port" || { say "מפעיל $name"; (node "supabase/tests/local-stack/$name.mjs" >"$LOGS/$name.log" 2>&1 &); sleep 2; }
done

# ── דגלים שהבדיקות מניחות ──
# .env.local אינו בגיט, ולכן דגל שנשכח בו לא מפיל את השרת אלא גורם
# למסלול להחזיר 404 — כשל שנראה כמו באג במוצר. scripts/e2e.mjs בודק
# את זה גם הוא, אבל עדיף לתקן מכאן מראש.
grep -q '^NEXT_PUBLIC_SQUISH_PARENT_APPROVAL=1' .env.local 2>/dev/null || {
  say "מוסיף NEXT_PUBLIC_SQUISH_PARENT_APPROVAL ל-.env.local"
  printf '\nNEXT_PUBLIC_SQUISH_PARENT_APPROVAL=1\n' >> .env.local
}

# ── האפליקציה ──
# **בילד פרודקשן ולא שרת פיתוח.** שרת פיתוח מקמפל מסלולים לפי דרישה,
# וכל המתנה בבדיקה מתחרה בקומפילציה — זה היה המקור של כמעט כל הפלייקים
# כאן, עד כדי אחת-עשרה חבילות שנפלו על timeout בניווט. מול בילד אותם
# מסלולים עונים במילישניות.
if ! up 3777; then
  say "בונה ומרים את האפליקציה על 3777"
  npm run build >"$LOGS/build.log" 2>&1 || { echo "✗ הבילד נכשל, ראה $LOGS/build.log"; exit 1; }
  (npx next start -p 3777 >"$LOGS/next.log" 2>&1 &)
  for _ in $(seq 1 30); do up 3777 && break; sleep 2; done
fi

# ── seed ──
psql -h localhost -p 5433 -U postgres -d duchan -tAc \
  "select count(*) from stores where activated_at is not null" 2>/dev/null | grep -q '^[1-9]' \
  || { say "זורע דוכן"; node supabase/tests/local-stack/seed.mjs >"$LOGS/seed.log" 2>&1; }

echo
printf 'הסטאק מוכן:\n'
for s in "Next:3777" "PostgREST:3001" "supashim:8000" "s3shim:9000" "smsshim:9100"; do
  name="${s%%:*}"; port="${s##*:}"
  printf '  %-11s %s\n' "$name" "$(up "$port" >/dev/null && echo ✓ || echo ✗)"
done
printf '  %-11s %s\n' "Postgres" "$(psql -h localhost -p 5433 -U postgres -d duchan -tAc 'select 1' 2>/dev/null | grep -q 1 && echo ✓ || echo ✗)"
echo
echo "להרצה:  npm run test:e2e"
