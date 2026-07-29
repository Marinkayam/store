#!/usr/bin/env node
/**
 * מריץ חבילות E2E בזו אחר זו, ונופל אם ולו אחת נפלה.
 *
 * **בסדרה ולא במקביל, בכוונה.** החבילות חולקות דאטהבייס אחד ושרת אחד;
 * הרצה מקבילה הייתה יוצרת נפילות שלא מעידות על באג, וזה הדבר שהורג
 * אמון ברשת ביטחון.
 *
 *   node scripts/e2e.mjs squish        # רק סקוויש קלאב
 *   node scripts/e2e.mjs               # הכל
 *   node scripts/e2e.mjs squish-trades # חבילה אחת
 *
 * דורש שרת פיתוח חי על E2E_BASE (ברירת מחדל http://localhost:3777).
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = join(dirname(fileURLToPath(import.meta.url)), "..", "e2e");
const BASE = process.env.E2E_BASE ?? "http://localhost:3777";

/* סדר קבוע: מהיסוד כלפי מעלה. חבילה שנופלת מוקדם מצביעה על משהו בסיסי
   יותר, ולכן קל יותר לאבחן אותה קודם. */
const SQUISH = [
  "squish-collection.mjs",
  "squish-circle.mjs",
  "squish-discover.mjs",
  "squish-trades.mjs",
  "squish-safety.mjs",
  "invite-safety.mjs",
  "stickers.mjs",
];

const filter = process.argv[2];
const all = readdirSync(E2E).filter((f) => f.endsWith(".mjs")).sort();
const ordered = [...SQUISH.filter((f) => all.includes(f)), ...all.filter((f) => !SQUISH.includes(f))];

const files =
  !filter ? ordered
  : filter === "squish" ? SQUISH.filter((f) => all.includes(f))
  : ordered.filter((f) => f === filter || f === `${filter}.mjs`);

if (!files.length) {
  console.error(`אין חבילה שמתאימה ל-"${filter}". קיימות: ${all.join(", ")}`);
  process.exit(2);
}

const alive = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!alive) {
  console.error(`אין שרת על ${BASE}. הפעילי \`npm run dev\` (ואחרי build תמיד להפעיל מחדש).`);
  process.exit(2);
}

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [join(E2E, file)], { stdio: "inherit", env: process.env });
    p.on("close", (code) => resolve(code ?? 1));
  });

const results = [];
for (const file of files) {
  console.log(`\n${"═".repeat(52)}\n▶ ${file}\n${"═".repeat(52)}`);
  results.push([file, await run(file)]);
}

const failed = results.filter(([, code]) => code !== 0);
console.log(`\n${"═".repeat(52)}`);
for (const [file, code] of results) console.log(`${code === 0 ? "✓" : "✗"} ${file}`);
console.log(`${results.length - failed.length}/${results.length} חבילות עברו`);
process.exit(failed.length ? 1 : 0);
