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

  /* סדר: טבלה שמצביעה על אחרת נכנסת אחריה.
     יש טבלאות שמצביעות זו על זו (למשל פריט → פרופיל, ופרופיל → הפריט
     המועדף). מעגל כזה אי אפשר לסדר, ולכן מבחינים בין שני סוגי הצבעה:
       - חובה (העמודה NOT NULL): קובעת את הסדר.
       - רשות (העמודה יכולה להיות ריקה): אם היעד נכנס מאוחר יותר, השורה
         נכנסת קודם בלי הערך, והוא מושלם בסוף, אחרי שכל השורות בפנים. */
  const { rows: fks } = await db.query(
    `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
            a.attname as col, a.attnotnull as hard, format_type(a.atttypid, a.atttypmod) as type
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype='f' and c.connamespace='public'::regnamespace`);
  const order = [];
  const state = new Map(); // 1 = בדרך, 2 = נכנסה
  const visit = (t, path) => {
    if (state.get(t) === 2) return;
    if (state.get(t) === 1) throw new Error(`מעגל של הצבעות חובה, אי אפשר לסדר: ${[...path, t].join(" → ")}`);
    state.set(t, 1);
    for (const f of fks) if (f.child === t && f.hard && f.parent !== t && tables.includes(f.parent)) visit(f.parent, [...path, t]);
    state.set(t, 2);
    order.push(t);
  };
  tables.forEach((t) => visit(t, []));
  tables = order;
  /* עמודות רשות שהיעד שלהן נכנס אחרי הטבלה (או שהוא הטבלה עצמה) */
  const later = new Map();
  for (const f of fks) {
    if (f.hard || !tables.includes(f.child) || !tables.includes(f.parent)) continue;
    if (tables.indexOf(f.parent) >= tables.indexOf(f.child)) {
      later.set(f.child, [...(later.get(f.child) ?? []), { col: f.col, type: f.type }]);
    }
  }

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

  /* הטריגרים כבויים עד הסוף, כולל שלב ההשלמה */
  for (const t of tables) await db.query(`alter table public.${ident(t)} disable trigger user`);

  const fill = []; // מה להשלים בסוף: { t, keys, cols, rows }
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
    const wait = (later.get(t) ?? []).filter((d) => cols.includes(d.col));
    if (wait.length && !keys.length) throw new Error(`${t}: אין מפתח ראשי, אי אפשר להשלים הצבעות`);
    const value = (c) => {
      const w = wait.find((d) => d.col === c);
      return w ? `null::${w.type}` : ident(c);
    };
    let conflict = "on conflict do nothing";
    if (mode === "overwrite" && keys.length) {
      const sets = cols.filter((c) => !keys.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      conflict = sets.length
        ? `on conflict (${keys.map(ident).join(", ")}) do update set ${sets.join(", ")}`
        : "on conflict do nothing";
    }
    const returning = keys.length ? `returning ${keys.map((k) => `${ident(k)}::text as ${ident(k)}`).join(", ")}` : "";
    let written = 0;
    const touched = new Set();
    for (let i = 0; i < rows.length; i += 500) {
      const r = await db.query(
        `insert into public.${ident(t)} (${cols.map(ident).join(", ")})
         select ${cols.map(value).join(", ")} from jsonb_populate_recordset(null::public.${ident(t)}, $1::jsonb)
         ${conflict} ${returning}`, [JSON.stringify(rows.slice(i, i + 500))]);
      written += r.rowCount ?? 0;
      for (const row of r.rows) touched.add(keys.map((k) => row[k]).join("\u0001"));
    }
    if (wait.length) {
      // רק שורות שנכתבו עכשיו: שורה קיימת שלא נגענו בה נשארת כמו שהיא
      const mine = rows.filter((row) => touched.has(keys.map((k) => String(row[k])).join("\u0001")));
      if (mine.length) fill.push({ t, keys, cols: wait.map((d) => d.col), rows: mine });
    }
    report.push({ table: t, inFile: rows.length, written });
  }

  /* השלמה: עכשיו כל השורות בפנים, ואפשר להחזיר את ההצבעות שחיכו */
  for (const { t, keys, cols, rows } of fill) {
    for (let i = 0; i < rows.length; i += 500) {
      await db.query(
        `update public.${ident(t)} x set ${cols.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ")}
           from jsonb_populate_recordset(null::public.${ident(t)}, $1::jsonb) r
          where ${keys.map((k) => `x.${ident(k)} = r.${ident(k)}`).join(" and ")}`, [JSON.stringify(rows.slice(i, i + 500))]);
    }
  }

  for (const t of tables) await db.query(`alter table public.${ident(t)} enable trigger user`);

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
