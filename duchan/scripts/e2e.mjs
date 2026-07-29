#!/usr/bin/env node
/**
 * מריץ חבילות E2E בזו אחר זו, ונופל אם ולו אחת נפלה.
 *
 * **בסדרה ולא במקביל, בכוונה.** החבילות חולקות דאטהבייס אחד ושרת אחד;
 * הרצה מקבילה הייתה יוצרת נפילות שלא מעידות על באג, וזה הדבר שהורג
 * אמון ברשת ביטחון.
 *
 *   node scripts/e2e.mjs squish        # סקוויש קלאב
 *   node scripts/e2e.mjs duchan        # דוכן, לפי סדר השרשרת
 *   node scripts/e2e.mjs               # הכל
 *   node scripts/e2e.mjs squish-trades # חבילה אחת
 *
 * דורש שרת פיתוח חי על E2E_BASE (ברירת מחדל http://localhost:3777).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQUISH_DIR = join(ROOT, "e2e");
const DUCHAN_DIR = join(ROOT, "supabase", "tests", "local-stack");
const BASE = process.env.E2E_BASE ?? "http://localhost:3777";

/* סדר קבוע: מהיסוד כלפי מעלה. חבילה שנופלת מוקדם מצביעה על משהו בסיסי
   יותר, ולכן קל יותר לאבחן אותה קודם. */
const SQUISH = [
  "squish-collection.mjs",
  "squish-circle.mjs",
  "squish-discover.mjs",
  "squish-trades.mjs",
  "squish-safety.mjs",
  "squish-permissions.mjs",
  "invite-safety.mjs",
  "stickers.mjs",
];

/* שרשרת דוכן **תלויה בסדר**, ולא במקרה: seed בונה את הדוכן הראשון דרך
   האונבורדינג האמיתי, e2e-activation מפעיל אותו, וכל השאר מניחים דוכן
   פעיל. זו הסיבה שהסדר יושב כאן ולא בראש של מי שמריצה. */
const DUCHAN = [
  "seed.mjs",
  "e2e-activation.mjs",
  "e2e.mjs",
  "e2e-flow.mjs",
  "e2e-smoke.mjs",
  "e2e-options.mjs",
  "e2e-pay.mjs",
  "e2e-storeinfo.mjs",
  "e2e-badges.mjs",
  "e2e-media.mjs",
  "e2e-upload.mjs",
  "e2e-sms.mjs",
  "e2e-admin.mjs",
  "e2e-schema-drift.mjs",
  "e2e-selfheal.mjs",
];

/* קבצים ב-local-stack שאינם חבילות: שרתי שים ועזרים. */
const NOT_SUITES = new Set(["s3shim.mjs", "supashim.mjs", "smsshim.mjs", "sms-helper.mjs"]);

const suite = (dir, file) => ({ file, path: join(dir, file), dir });
const squishSuites = SQUISH.filter((f) => existsSync(join(SQUISH_DIR, f))).map((f) => suite(SQUISH_DIR, f));
const duchanSuites = DUCHAN.filter((f) => existsSync(join(DUCHAN_DIR, f))).map((f) => suite(DUCHAN_DIR, f));

/* חבילה חדשה שנוספה לתיקייה ולא נרשמה בסדר לא נעלמת בשקט */
const listed = new Set([...SQUISH, ...DUCHAN, ...NOT_SUITES]);
const orphans = [
  ...readdirSync(SQUISH_DIR).filter((f) => f.endsWith(".mjs")),
  ...readdirSync(DUCHAN_DIR).filter((f) => f.endsWith(".mjs")),
].filter((f) => !listed.has(f));
if (orphans.length) {
  console.warn(`⚠ חבילות שלא רשומות בסדר ההרצה ולכן לא ירוצו: ${orphans.join(", ")}`);
}

const filter = process.argv[2];
const all = [...squishSuites, ...duchanSuites];
const files =
  !filter ? all
  : filter === "squish" ? squishSuites
  : filter === "duchan" ? duchanSuites
  : all.filter((s) => s.file === filter || s.file === `${filter}.mjs`);

if (!files.length) {
  console.error(`אין חבילה שמתאימה ל-"${filter}". קיימות: ${all.map((s) => s.file).join(", ")}`);
  process.exit(2);
}

const alive = await fetch(BASE).then((r) => r.ok).catch(() => false);
if (!alive) {
  console.error(`אין שרת על ${BASE}. הפעילי \`npm run dev\` (ואחרי build תמיד להפעיל מחדש).`);
  process.exit(2);
}

const run = (s) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [s.path], { stdio: "inherit", cwd: s.dir, env: process.env });
    p.on("close", (code) => resolve(code ?? 1));
  });

const results = [];
for (const s of files) {
  console.log(`\n${"═".repeat(52)}\n▶ ${s.file}\n${"═".repeat(52)}`);
  results.push([s.file, await run(s)]);
}

const failed = results.filter(([, code]) => code !== 0);
console.log(`\n${"═".repeat(52)}`);
for (const [file, code] of results) console.log(`${code === 0 ? "✓" : "✗"} ${file}`);
console.log(`${results.length - failed.length}/${results.length} חבילות עברו`);
process.exit(failed.length ? 1 : 0);
