#!/usr/bin/env node
// בונה מחדש את supabase/setup.sql מכל המיגרציות שבתיקייה.
//
// הקובץ הזה קיים כי setup.sql נכתב פעם אחת ביד, ומיגרציה 0012 כבר לא נכנסה אליו.
// קובץ הקמה שמפגר אחרי המיגרציות גרוע יותר מלא להחזיק קובץ כזה בכלל: הוא נראה
// מלא, מריצים אותו, וחסרה עמודה.
//
//   npm run gen:setup

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // 0001, 0002… הסדר הלקסיקוגרפי הוא הסדר הכרונולוגי בזכות ריפוד האפסים

const rule = "─".repeat(63);
const parts = [
  `-- ${"═".repeat(63)}`,
  "--  דוכן — הקמת הדאטהבייס במלואה",
  "--  להדביק ב-Supabase → SQL Editor → Run. פעם אחת.",
  "--",
  "--  נוצר אוטומטית ע\"י scripts/gen-setup.mjs — אין לערוך ביד.",
  "--  מכיל את כל המיגרציות לפי הסדר, ורושם אותן ב-schema_migrations",
  "--  כדי ש-`npm run migrate` בעתיד יריץ רק מיגרציות חדשות.",
  "--",
  "--  בטוח: הכל רץ בטרנזקציה אחת. אם משהו נכשל — שום דבר לא מוחל.",
  `-- ${"═".repeat(63)}`,
  "",
  "begin;",
  "",
  "create table if not exists schema_migrations (",
  "  name text primary key,",
  "  applied_at timestamptz not null default now()",
  ");",
  "",
];

for (const f of files) {
  parts.push(`-- ${rule}`, `-- ${f}`, `-- ${rule}`, "", readFileSync(join(dir, f), "utf8").trimEnd(), "");
}

parts.push(
  `-- ${rule}`,
  "-- רישום המיגרציות שהורצו",
  `-- ${rule}`,
  "",
  "insert into schema_migrations (name) values",
  files.map((f) => `  ('${f}')`).join(",\n"),
  "on conflict do nothing;",
  "",
  "commit;",
  "",
  `-- ${"═".repeat(63)}`,
  `--  אימות — אמור להחזיר ${files.length}`,
  `-- ${"═".repeat(63)}`,
  "select count(*) as migrations_applied from schema_migrations;",
  ""
);

const out = join(root, "supabase", "setup.sql");
writeFileSync(out, parts.join("\n"));
console.log(`supabase/setup.sql נבנה מ-${files.length} מיגרציות: ${files[0]} … ${files.at(-1)}`);
