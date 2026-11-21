#!/usr/bin/env node
/**
 * שחזור מקובץ הגיבוי היומי (app/api/cron/route.ts → R2, _backups/YYYY-MM-DD.json).
 *
 *   node scripts/restore-backup.mjs <backup.json> <postgres-url> [אפשרויות]
 *
 *   --tables a,b      רק הטבלאות האלה (ברירת מחדל: כל מה שבקובץ וקיים במסד)
 *   --mode missing    ברירת המחדל: מוסיף רק שורות שחסרות. לא נוגע בשורה קיימת.
 *   --mode overwrite  גם מחזיר שורות קיימות למה שהיה בגיבוי (לפי המפתח הראשי).
 *   --dry-run         מריץ הכול ומבטל בסוף. מדפיס מה היה קורה.
 *
 * שני שימושים:
 *   1. מסד שנמחק או נהרס: מקימים סכמה מהמיגרציות, ומשחזרים הכול (missing).
 *   2. תיקון נקודתי: שורות שנמחקו בטעות או שדות שנדרסו — משחזרים טבלה אחת
 *      (למשל --tables orders --mode overwrite).
 *
 * הכול בטרנזקציה אחת: או שהכול נכנס, או ששום דבר.
 * הטריגרים של הטבלה כבויים בזמן השחזור, כדי שהשורות ייכנסו בדיוק כמו שנשמרו
 * (בלי ש-closed_at ייקבע מחדש, ובלי ששומרי הכתיבה ידחו שדות).
 *
 * מה שהקובץ *לא* מכיל: תמונות וסרטונים (הם ב-R2 עצמו) ומפתחות (app_secrets).
 * ראה docs/restore.md.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? "";
};
const [file, url] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").match(/^--(tables|mode)$/));
const mode = flag("--mode") ?? "missing";
const only = flag("--tables")?.split(",").map((t) => t.trim()).filter(Boolean) ?? null;
const dry = args.includes("--dry-run");

if (!file || !url || !["missing", "overwrite"].includes(mode)) {
  console.error("שימוש: node scripts/restore-backup.mjs <backup.json> <postgres-url> [--tables a,b] [--mode missing|overwrite] [--dry-run]");
  process.exit(2);
}

const backup = JSON.parse(readFileSync(file, "utf8"));
const META = new Set(["day", "format", "partial", "failed", "counts", "keys", "auth_users"]);
const inFile = Object.keys(backup).filter((k) => !META.has(k) && Array.isArray(backup[k]));
if (backup.partial) console.warn(`⚠ הגיבוי מסומן חלקי. טבלאות שנכשלו: ${(backup.failed ?? []).join(" | ")}`);

const db = new pg.Client({ connectionString: url });
await db.connect();
const ident = (s) => `"${s.replace(/"/g, '""')}"`;
const report = [];

try {
  await db.query("begin");

  const { rows: existing } = await db.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const have = new Set(existing.map((r) => r.table_name));
  let tables = inFile.filter((t) => have.has(t) && (!only || only.includes(t)));
  const unknown = (only ?? []).filter((t) => !inFile.includes(t));
  if (unknown.length) throw new Error(`הטבלאות האלה לא בקובץ הגיבוי: ${unknown.join(", ")}`);

  /* סדר: טבלה שמצביעה על אחרת נכנסת אחריה */
  const { rows: fks } = await db.query(
    `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
       from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace`);
  const order = [];
  const seen = new Set();
  const visit = (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    for (const f of fks) if (f.child === t && f.parent !== t && tables.includes(f.parent)) visit(f.parent);
    order.push(t);
  };
  tables.forEach(visit);
  tables = order;

  /* משתמשי Auth. בסביבת הבדיקות auth.users היא טבלה פשוטה (id, email) ואפשר
     לשחזר אליה ישירות. ב-Supabase אמיתי המשתמשים מוקמים דרך ה-Admin API,
     וזה לא נעשה כאן — ראה docs/restore.md. */
  if (!only && Array.isArray(backup.auth_users)) {
    const { rows: cols } = await db.query(
      "select column_name from information_schema.columns where table_schema='auth' and table_name='users'");
    const names = cols.map((c) => c.column_name);
    if (names.length && names.every((n) => ["id", "email"].includes(n))) {
      const r = await db.query(
        `insert into auth.users (id, email)
         select (u->>'id')::uuid, u->>'email' from jsonb_array_elements($1::jsonb) u
         on conflict (id) do nothing`, [JSON.stringify(backup.auth_users)]);
      report.push({ table: "auth.users", inFile: backup.auth_users.length, written: r.rowCount });
    } else {
      console.warn("⚠ auth.users: מסד Supabase אמיתי. המשתמשים לא שוחזרו כאן — צריך להקים אותם דרך ה-Admin API (docs/restore.md).");
      report.push({ table: "auth.users", inFile: backup.auth_users.length, written: 0, skipped: true });
    }
  }

  for (const t of tables) {
    const rows = backup[t];
    const { rows: pk } = await db.query(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
        where i.indisprimary and i.indrelid = $1::regclass order by array_position(i.indkey::int[], a.attnum::int)`, [`public.${t}`]);
    const keys = pk.map((r) => r.attname);
    const { rows: colRows } = await db.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name=$1
        and is_generated='NEVER' order by ordinal_position`, [t]);
    const cols = colRows.map((r) => r.column_name);
    let conflict = "on conflict do nothing";
    if (mode === "overwrite" && keys.length) {
      const sets = cols.filter((c) => !keys.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      conflict = sets.length
        ? `on conflict (${keys.map(ident).join(", ")}) do update set ${sets.join(", ")}`
        : "on conflict do nothing";
    }
    await db.query(`alter table public.${ident(t)} disable trigger user`);
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const r = await db.query(
        `insert into public.${ident(t)} (${cols.map(ident).join(", ")})
         select ${cols.map(ident).join(", ")} from jsonb_populate_recordset(null::public.${ident(t)}, $1::jsonb)
         ${conflict}`, [JSON.stringify(rows.slice(i, i + 500))]);
      written += r.rowCount ?? 0;
    }
    await db.query(`alter table public.${ident(t)} enable trigger user`);
    report.push({ table: t, inFile: rows.length, written });
  }

  await db.query(dry ? "rollback" : "commit");
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("✗ השחזור נכשל, שום דבר לא נכתב:", e.message);
  await db.end();
  process.exit(1);
}

await db.end();
console.log(`גיבוי מיום ${backup.day ?? "?"} · מצב: ${mode}${dry ? " · הרצה יבשה (בוטלה)" : ""}`);
for (const r of report) console.log(`${r.table.padEnd(30)} בקובץ: ${String(r.inFile).padStart(6)}   נכתבו: ${String(r.written).padStart(6)}${r.skipped ? "   (דולג)" : ""}`);
console.log(JSON.stringify({ ok: true, mode, dry, report }));
