// E2E: הגיבוי היומי מכסה את כל המסד, ואפשר באמת לשחזר ממנו.
//
// גיבוי שאי אפשר לשחזר ממנו הוא לא גיבוי. הבדיקה הזו לא מסתפקת בכך שהקרון
// ענה "ok": היא מקימה מסד ריק, משחזרת אליו את הקובץ, ומשווה כל טבלה למקור.
//
//   1. כל טבלה במסד נמצאת בגיבוי, או ברשימת "לא מגובה" עם סיבה. טבלה חדשה
//      שנשכחה מפילה את הבדיקה.
//   2. מספר השורות בקובץ שווה למספר השורות במסד.
//   3. שחזור מלא למסד ריק: כל טבלה זהה למקור, שורה מול שורה.
//   4. תיקון נקודתי: שדות שנדרסו ושורות שנמחקו חוזרים מהגיבוי.
//   5. שחזור לא נוגע בשורה קיימת אלא אם ביקשו במפורש.
import pg from "pg";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const S3_ROOT = process.env.S3_ROOT ?? "/var/lib/pgtest/s3data";
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "..", "scripts", "restore-backup.mjs");
const PG = ["-h", "localhost", "-p", "5433", "-U", "postgres"];
const COPY = "duchan_restore_test";
const COPY_URL = `postgresql://postgres@localhost:5433/${COPY}`;

const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
const restore = (...extra) => {
  const out = sh("node", [SCRIPT, file, COPY_URL, ...extra]);
  return JSON.parse(out.trim().split("\n").pop());
};
/** חתימה של טבלה שלמה: כל השורות, בסדר המפתח הראשי */
/* הקרון כותב את דוח הניקוי (order_retention_last) אחרי שהגיבוי נכתב, ולכן
   השורה הזו במסד תמיד חדשה מהקובץ. היא דוח, לא נתון, ולא משווים אותה. */
const AFTER_BACKUP = { app_settings: `where t.key <> 'order_retention_last'` };
const digest = async (pool, table, keys) =>
  (await pool.query(`select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by ${keys.map((k) => `"${k}"`).join(", ")})), '') as md5 from public."${table}" t ${AFTER_BACKUP[table] ?? ""}`)).rows[0];

/**
 * שחזור של טבלה ריקה לא מוכיח כלום. לפני הגיבוי, כל טבלה מגובה שאין בה
 * שורות מקבלת שורה אחת, שנבנית מהסכמה עצמה: מפתחות זרים מצביעים על שורות
 * קיימות, ושאר העמודות מקבלות ערך לפי הסוג. בסוף הבדיקה השורות נמחקות.
 */
const SAMPLE = {
  text: "'גיבוי'", "character varying": "'גיבוי'", uuid: "gen_random_uuid()", integer: "1", bigint: "1", smallint: "1",
  numeric: "1", "double precision": "1", boolean: "false", "timestamp with time zone": "now()", date: "current_date",
  jsonb: "'{}'::jsonb", json: "'{}'::json", ARRAY: "'{}'",
};
/* ערכים שהסכמה דורשת ואי אפשר לנחש מהסוג (אילוצי check) */
const OTHER_USER = "(select id from auth.users order by id desc limit 1)";
const OVERRIDE = {
  coupons: { kind: "'percent'", code: "'BACKUP10'", value: "10", created_by: "'store'" },
  squish_connections: { connected_user_id: OTHER_USER },
  squish_blocks: { blocked_user_id: OTHER_USER },
  squish_trade_proposals: { receiver_user_id: OTHER_USER },
};
const planted = [];
async function plantRow(t) {
  const { rows: cols } = await db.query(
    `select c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_generated, c.is_identity
       from information_schema.columns c where c.table_schema='public' and c.table_name=$1 order by c.ordinal_position`, [t]);
  const { rows: fks } = await db.query(
    `select a.attname as col, c.confrelid::regclass::text as ref, af.attname as refcol
       from pg_constraint c
       join lateral unnest(c.conkey, c.confkey) with ordinality as k(att, fatt, i) on true
       join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.att
       join pg_attribute af on af.attrelid=c.confrelid and af.attnum=k.fatt
      where c.contype='f' and c.conrelid=$1::regclass`, [`public.${t}`]);
  const { rows: pk } = await db.query(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
      where i.indisprimary and i.indrelid=$1::regclass`, [`public.${t}`]);
  const names = [];
  const exprs = [];
  for (const c of cols) {
    if (c.is_generated !== "NEVER" || c.is_identity === "YES") continue;
    const fk = fks.find((f) => f.col === c.column_name);
    const over = OVERRIDE[t]?.[c.column_name];
    let expr = null;
    if (over !== undefined) expr = over;
    else if (fk) expr = `(select "${fk.refcol}" from ${fk.ref} order by 1 limit 1)`;
    else if (c.is_nullable === "NO" && c.column_default === null) {
      if (c.data_type === "USER-DEFINED") {
        const { rows: [e] } = await db.query("select enumlabel from pg_enum where enumtypid=$1::regtype order by enumsortorder limit 1", [c.udt_name]);
        expr = `'${e.enumlabel}'::${c.udt_name}`;
      } else expr = SAMPLE[c.data_type] ?? "'גיבוי'";
    }
    if (expr === null) continue;
    names.push(`"${c.column_name}"`);
    exprs.push(expr);
  }
  const ret = pk.map((r) => `"${r.attname}"`).join(", ");
  const { rows: [row] } = await db.query(`insert into public."${t}" (${names.join(", ")}) select ${exprs.join(", ")} returning ${ret}`);
  planted.push({ t, row });
}
async function unplant() {
  for (const { t, row } of planted.reverse()) {
    const ks = Object.keys(row);
    await db.query(`delete from public."${t}" where ${ks.map((k, i) => `"${k}" = $${i + 1}`).join(" and ")}`, ks.map((k) => row[k])).catch(() => {});
  }
}

let file = "";
let copy = null;
try {
  /* ── 0. שורה בכל טבלה ── */
  const { rows: order } = await db.query(
    `with recursive t as (
       select c.oid, c.oid as cur, c.relname, 0 as depth from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
       union all
       select t.oid, f.confrelid, t.relname, t.depth + 1 from t
         join pg_constraint f on f.conrelid = t.cur and f.contype='f' and f.confrelid <> t.cur
         join pg_class p on p.oid = f.confrelid and p.relnamespace='public'::regnamespace
        where t.depth < 12)
     select relname, max(depth) as depth from t group by relname order by 2, 1`);
  const probe = await (await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } })).json();
  const inBackup = Object.keys(probe.counts ?? {}).filter((t) => t !== "auth_users");
  /* כמה סבבים: יש טבלאות שמצביעות זו על זו, והסדר לא תמיד מספיק */
  let couldNot = [];
  for (let pass = 0; pass < 4; pass++) {
    couldNot = [];
    for (const { relname: t } of order) {
      if (!inBackup.includes(t)) continue;
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public."${t}" t ${AFTER_BACKUP[t] ?? ""}`);
      if (n > 0) continue;
      try { await plantRow(t); } catch (e) { couldNot.push(`${t}: ${e.message}`); }
    }
    if (!couldNot.length) break;
  }
  /* הצבעות רשות שנשארו ריקות (כי היעד עוד לא היה קיים) מתמלאות עכשיו, כדי
     שגם מעגלים ייבדקו: פריט → פרופיל → הפריט המועדף. הטריגרים כבויים רק
     לעדכון הזה; הערכים עצמם אמיתיים. */
  let loops = 0;
  const raw = await db.connect();
  try {
    await raw.query("set session_replication_role = replica");
    for (const { t, row } of planted) {
      const { rows: soft } = await raw.query(
        `select a.attname as col, c.confrelid::regclass::text as ref, af.attname as refcol
           from pg_constraint c
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
           join pg_attribute af on af.attrelid=c.confrelid and af.attnum=c.confkey[1]
          where c.contype='f' and c.conrelid=$1::regclass and not a.attnotnull and c.confrelid::regclass::text not like 'auth.%'`, [`public.${t}`]);
      const ks = Object.keys(row);
      for (const f of soft) {
        const r = await raw.query(
          `update public."${t}" set "${f.col}" = (select "${f.refcol}" from ${f.ref} order by 1 limit 1)
            where ${ks.map((k, i) => `"${k}" = $${i + 1}`).join(" and ")} and "${f.col}" is null`, ks.map((k) => row[k])).catch(() => null);
        if (r?.rowCount) loops++;
      }
    }
    await raw.query("set session_replication_role = origin");
  } finally { raw.release(); }
  check("וגם הצבעות הדדיות בין טבלאות מלאות (מעגלים)", loops > 0, `${loops} הצבעות`);
  check("לפני הגיבוי, בכל טבלה מגובה יש לפחות שורה אחת", couldNot.length === 0, couldNot.join(" · ") || `${planted.length} טבלאות ריקות קיבלו שורה`);

  /* ── 1. כיסוי ── */
  const res = await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } });
  const cron = await res.json();
  check("הקרון רץ והגיבוי מלא (לא חלקי)", res.status === 200 && cron.ok === true && cron.partial === false, JSON.stringify(cron.failed ?? []));

  const { rows: all } = await db.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const backed = Object.keys(cron.counts ?? {}).filter((t) => t !== "auth_users");
  const skipped = cron.skipped ?? [];
  const uncovered = all.map((r) => r.table_name).filter((t) => !backed.includes(t) && !skipped.includes(t));
  check("כל טבלה במסד מגובה, או מסומנת 'לא מגובה' עם סיבה", uncovered.length === 0, uncovered.join(", ") || `${backed.length} מגובות · ${skipped.length} לא`);
  const both = backed.filter((t) => skipped.includes(t));
  check("אין טבלה בשתי הרשימות", both.length === 0, both.join(", "));
  for (const t of ["coupons", "store_members", "store_invites", "kupa_purchases", "kupa_solved", "store_stats", "product_stats", "store_push_subscriptions", "app_settings"]) {
    if (!backed.includes(t)) check(`${t} בגיבוי`, false);
  }
  check("הטבלאות שהיו חסרות (קופונים, שותפים, משחק, סטטיסטיקות) בגיבוי",
    ["coupons", "store_members", "store_invites", "kupa_purchases", "kupa_solved", "store_stats", "product_stats", "store_push_subscriptions"].every((t) => backed.includes(t)));

  /* ── 2. הקובץ ── */
  const day = new Date().toISOString().slice(0, 10);
  file = join(S3_ROOT, "duchan-media", "_backups", `${day}.json`);
  check("קובץ הגיבוי של היום נכתב", existsSync(file), file);
  const backup = JSON.parse(readFileSync(file, "utf8"));
  const keys = backup.keys ?? {};
  let countsOk = true;
  const off = [];
  for (const t of backed) {
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public."${t}" t ${AFTER_BACKUP[t] ?? ""}`);
    const inFile = (backup[t] ?? []).filter((r) => !(t === "app_settings" && r.key === "order_retention_last")).length;
    if (inFile !== n) { countsOk = false; off.push(`${t}: ${inFile} בקובץ, ${n} במסד`); }
  }
  check("מספר השורות בקובץ שווה למסד, בכל טבלה", countsOk, off.join(" · "));
  const emptyInFile = backed.filter((t) => (backup[t] ?? []).filter((r) => !(t === "app_settings" && r.key === "order_retention_last")).length === 0);
  check("אין בקובץ טבלה ריקה: כל טבלה נבדקת עם שורות", emptyInFile.length === 0, emptyInFile.join(", "));
  const { rows: [{ n: users }] } = await db.query("select count(*)::int as n from auth.users");
  check("משתמשי החשבונות בקובץ, עם המייל שמזהה אותם",
    backup.auth_users.length === users && backup.auth_users.every((u) => typeof u.email === "string" && u.email.length > 3), `${backup.auth_users.length} משתמשים`);
  check("הקובץ לא מכיל מפתחות", backup.app_secrets === undefined);

  /* ── 3. שחזור מלא למסד ריק ── */
  try { sh("dropdb", [...PG, "--if-exists", COPY]); } catch {}
  sh("createdb", [...PG, COPY]);
  const schema = sh("pg_dump", [...PG, "--schema-only", "--no-owner", "--no-privileges", "duchan"], { maxBuffer: 64 * 1024 * 1024 });
  sh("psql", [...PG, "-q", "-v", "ON_ERROR_STOP=0", "-d", COPY], { input: schema });
  copy = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: COPY });
  const { rows: [{ n: empty }] } = await copy.query("select count(*)::int as n from stores");
  check("המסד החדש ריק, עם אותה סכמה", empty === 0);

  const full = restore();
  check("השחזור הסתיים בלי שגיאה", full.ok === true, `${full.report.length} טבלאות`);
  const diff = [];
  for (const t of backed) {
    const a = await digest(db, t, keys[t]);
    const b = await digest(copy, t, keys[t]);
    if (a.n !== b.n || a.md5 !== b.md5) diff.push(`${t} (${a.n} מול ${b.n})`);
  }
  check("אחרי שחזור מלא כל טבלה זהה למקור, שורה מול שורה", diff.length === 0, diff.join(", ") || `${backed.length} טבלאות`);
  console.log("      טבלה                           מקור  שוחזר");
  for (const t of backed) {
    const x = await digest(db, t, keys[t]);
    const y = await digest(copy, t, keys[t]);
    console.log(`      ${t.padEnd(30)} ${String(x.n).padStart(5)}  ${String(y.n).padStart(5)}  ${x.md5 === y.md5 ? "זהה" : "שונה"}`);
  }
  const o1 = (await copy.query("select count(*)::int as n from orders where status in ('delivered','cancelled') and closed_at is null")).rows[0].n;
  const o0 = (await db.query("select count(*)::int as n from orders where status in ('delivered','cancelled') and closed_at is null")).rows[0].n;
  check("הטריגרים לא שינו את השורות בדרך (closed_at נשאר כמו במקור)", o0 === o1, `${o0} מול ${o1}`);

  /* ── 4. תיקון נקודתי ── */
  const { rows: [victim] } = await copy.query("select id, buyer_name, buyer_phone from orders where buyer_name is not null order by created_at limit 1");
  const { rows: [gone] } = await copy.query("select id from products order by created_at limit 1");
  await copy.query("update orders set buyer_name=null, buyer_phone=null, buyer_note=null, ship_address=null");
  await copy.query("alter table product_stats disable trigger user");
  await copy.query("delete from product_stats where product_id=$1", [gone.id]);
  await copy.query("delete from products where id=$1", [gone.id]);

  const soft = restore("--tables", "orders,products,product_stats");
  const afterSoft = (await copy.query("select buyer_name from orders where id=$1", [victim.id])).rows[0];
  const back = (await copy.query("select count(*)::int as n from products where id=$1", [gone.id])).rows[0].n;
  check("ברירת המחדל: שורה שנמחקה חוזרת, ושורה קיימת לא נדרסת", soft.ok && back === 1 && afterSoft.buyer_name === null);

  const hard = restore("--tables", "orders", "--mode", "overwrite");
  const afterHard = (await copy.query("select buyer_name, buyer_phone from orders where id=$1", [victim.id])).rows[0];
  check("overwrite: פרטים שנדרסו חוזרים מהגיבוי", hard.ok && afterHard.buyer_name === victim.buyer_name && afterHard.buyer_phone === victim.buyer_phone);
  const a = await digest(db, "orders", keys.orders);
  const b = await digest(copy, "orders", keys.orders);
  check("וטבלת ההזמנות שוב זהה למקור", a.md5 === b.md5 && a.n === b.n);

  /* ── 5. הרצה יבשה ── */
  await copy.query("update orders set buyer_name='שונה' where id=$1", [victim.id]);
  const dry = restore("--tables", "orders", "--mode", "overwrite", "--dry-run");
  check("הרצה יבשה מדווחת ולא כותבת", dry.dry === true && (await copy.query("select buyer_name from orders where id=$1", [victim.id])).rows[0].buyer_name === "שונה");
  let refused = false;
  try { restore("--tables", "no_such_table"); } catch { refused = true; }
  check("טבלה שלא קיימת בגיבוי עוצרת את השחזור", refused);
} finally {
  await unplant();
  if (copy) await copy.end().catch(() => {});
  // KEEP_COPY=1 משאיר את המסד המשוחזר לבדיקה ידנית
  if (!process.env.KEEP_COPY) try { sh("dropdb", [...PG, "--if-exists", COPY]); } catch {}
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} backup and restore checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
