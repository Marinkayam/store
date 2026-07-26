#!/usr/bin/env node
/**
 * מריץ את כל המיגרציות לפי הסדר מול מסד נתונים אמיתי.
 *
 *   node scripts/migrate.mjs "postgresql://postgres:<סיסמה>@db.<ref>.supabase.co:5432/postgres"
 *   node scripts/migrate.mjs            # לוקח DATABASE_URL מהסביבה
 *   node scripts/migrate.mjs <url> --baseline=0007
 *
 * בטוח להרצה חוזרת: כל מיגרציה נרשמת ב-schema_migrations ולא רצה פעמיים.
 *
 * --baseline=<מספר> מסמן את המיגרציות עד המספר הזה (כולל) כ"הורצו", בלי להריץ.
 * זה המצב של מסד שהוקם ידנית ב-SQL Editor: בלעדיו הסקריפט ינסה להריץ שוב את
 * 0001 וייפול על "type store_status already exists".
 *
 * המספר הוא חובה בכוונה. `--baseline` בלי מספר היה מסמן גם מיגרציות שלא רצו
 * באמת, והן היו נשארות חסרות לנצח בלי שאף אחד ישים לב.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const args = process.argv.slice(2);
const baselineArg = args.find((a) => a.startsWith("--baseline"));
const url = args.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;

const baselineUpTo = baselineArg?.includes("=") ? baselineArg.split("=")[1] : null;
if (baselineArg && !baselineUpTo) {
  console.error(
    "צריך לציין עד איפה: --baseline=0007\n" +
      "כלומר: אילו מיגרציות כבר הרצת ידנית. כל מה שאחרי זה יורץ כרגיל."
  );
  process.exit(1);
}

if (!url) {
  console.error("צריך connection string.\n  node scripts/migrate.mjs \"postgresql://...\"");
  process.exit(1);
}

// Supabase דורש TLS; התעודה שלהם לא בשרשרת המקומית, ולכן rejectUnauthorized:false.
// זה מקובל לחיבור ניהולי חד-פעמי מהמחשב שלך.
const ssl = url.includes("localhost") || url.includes("127.0.0.1")
  ? false
  : { rejectUnauthorized: false };

const client = new pg.Client({ connectionString: url, ssl });
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query("select name from schema_migrations");
const done = new Set(rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

if (baselineUpTo) {
  const cutoff = files.findIndex((f) => f.startsWith(baselineUpTo));
  if (cutoff === -1) {
    console.error(`אין מיגרציה שמתחילה ב-"${baselineUpTo}". יש: ${files.join(", ")}`);
    process.exit(1);
  }
  for (const file of files.slice(0, cutoff + 1)) {
    await client.query("insert into schema_migrations (name) values ($1) on conflict do nothing", [file]);
    console.log(`•  ${file} — סומנה כהורצה`);
  }
  const rest = files.slice(cutoff + 1);
  console.log(
    rest.length
      ? `\nנשארו להרצה: ${rest.join(", ")}\nהריצי שוב בלי --baseline.`
      : "\nהכל מסומן. אין מה להריץ."
  );
  await client.end();
  process.exit(0);
}

let applied = 0;
for (const file of files) {
  if (done.has(file)) {
    console.log(`•  ${file} — כבר הורץ`);
    continue;
  }
  const sql = readFileSync(join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`✓  ${file}`);
    applied++;
  } catch (err) {
    await client.query("rollback");
    console.error(`✗  ${file}\n   ${err.message}`);
    process.exit(1);
  }
}

console.log(`\n${applied} מיגרציות חדשות הורצו, ${files.length} סה"כ.`);
await client.end();
