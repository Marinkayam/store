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

let file = "";
let copy = null;
try {
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
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public."${t}"`);
    if ((backup[t] ?? []).length !== n) { countsOk = false; off.push(`${t}: ${backup[t]?.length} בקובץ, ${n} במסד`); }
  }
  check("מספר השורות בקובץ שווה למסד, בכל טבלה", countsOk, off.join(" · "));
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
  if (copy) await copy.end().catch(() => {});
  try { sh("dropdb", [...PG, "--if-exists", COPY]); } catch {}
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} backup and restore checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
