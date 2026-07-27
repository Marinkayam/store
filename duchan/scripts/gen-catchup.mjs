#!/usr/bin/env node
// בונה את supabase/catchup.sql — עדכון של דאטהבייס שכבר קיים.
//
// setup.sql מיועד לדאטהבייס ריק, ועל דאטהבייס קיים הוא נופל מיד
// ("type store_status already exists") ולא מחיל כלום, כי הכל בטרנזקציה אחת.
// זה בדיוק המצב של חנות שכבר עובדת בפרודקשן, ושם חסרות דווקא המיגרציות
// האחרונות — כולל זו שבלעדיה הסמסים לא נשלחים.
//
// הקובץ כולל מיגרציות מ-0008 והלאה בלבד. כולן כתובות עם if not exists או
// create or replace, ולכן הרצה חוזרת שלהן אינה משנה דבר. המיגרציות שלפני כן
// אינן ניתנות להרצה חוזרת, והן ממילא הותקנו בכל דאטהבייס פעיל.
//
//   npm run gen:catchup

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FROM = "0008";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && f.slice(0, 4) >= FROM)
  .sort();

const rule = "─".repeat(63);
const out = [
  `-- ${"═".repeat(63)}`,
  "--  דוכן — עדכון דאטהבייס קיים",
  "--",
  "--  להדביק ב-Supabase → SQL Editor → Run.",
  "--  בטוח להרצה חוזרת: מה שכבר קיים פשוט מדולג.",
  "--",
  "--  נוצר אוטומטית ע\"י scripts/gen-catchup.mjs — אין לערוך ביד.",
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
  out.push(`-- ${rule}`, `-- ${f}`, `-- ${rule}`, "", readFileSync(join(dir, f), "utf8").trim(), "");
  out.push(
    `insert into schema_migrations (name) values ('${f}') on conflict do nothing;`,
    ""
  );
}

out.push("commit;", "");
out.push("-- אחרי ההרצה: לרענן את הקאש של ה-API", "notify pgrst, 'reload schema';", "");

writeFileSync(join(root, "supabase", "catchup.sql"), out.join("\n"));
console.log(`supabase/catchup.sql נבנה מ-${files.length} מיגרציות: ${files[0]} … ${files.at(-1)}`);
