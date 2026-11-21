#!/usr/bin/env node
/**
 * בונה את עולם דוכן (app/world-lab) כקובץ HTML אחד שעומד בפני עצמו.
 *
 *   npm run build            # קודם: בשביל ה-CSS המקומפל של האתר
 *   node scripts/world-lab-standalone.mjs <קובץ-פלט.html>
 *
 * בשביל מה: לפתוח את האב־טיפוס בטלפון בסביבה מבודדת לגמרי. הקובץ מכיל רק
 * את רכיבי העולם ואת האיורים שלהם. אין בו כניסה לחשבון, אין בו כתובות של
 * השרת או של המסד, והוא לא יכול לפנות אליהם גם אם ירצה.
 *
 * זה אותו קוד בדיוק כמו בדף /world-lab (אותו רכיב World, אותו KupaStall),
 * לא העתק: הסקריפט אורז את הקבצים מהריפו. esbuild מורד לפי דרישה (npx)
 * ואינו תלות של הפרויקט.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out) {
  console.error("שימוש: node scripts/world-lab-standalone.mjs <קובץ-פלט.html>");
  process.exit(2);
}

const cssDir = join(ROOT, ".next", "static", "css");
let css;
try {
  css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n");
} catch {
  console.error("לא נמצא CSS מקומפל. להריץ קודם: npm run build");
  process.exit(1);
}
if (!css.includes(".wl-root") || !css.includes("kp-sway")) {
  console.error("ה-CSS המקומפל לא כולל את העולם או את האנימציות של הדוכן. לבנות מחדש.");
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "world-lab-"));
const js = join(tmp, "world.js");
const entry = `
import { createRoot } from "react-dom/client";
import World from "./app/world-lab/world";
createRoot(document.getElementById("root")).render(<World />);
`;
execFileSync(
  "npx",
  ["--yes", "esbuild@0.25.10", "--bundle", "--minify", "--format=iife", "--target=es2020", "--loader=tsx", "--jsx=automatic",
    "--define:process.env.NODE_ENV=\"production\"", "--log-level=error", `--outfile=${js}`],
  { cwd: ROOT, input: entry, stdio: ["pipe", "inherit", "inherit"] }
);
const bundle = readFileSync(js, "utf8").replace(/<\/script/gi, "<\\/script");

for (const banned of ["supabase", "/api/", "SERVICE_ROLE", "r2.cloudflarestorage", "duchan.app"]) {
  if (bundle.includes(banned)) {
    console.error(`החבילה מכילה "${banned}". היא אמורה להכיל רק את העולם.`);
    process.exit(1);
  }
}

const html = `<title>עולם דוכן</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800&display=swap">
<style>
${css}
html, body { height: 100%; margin: 0; background: #dfe3c3; overflow: hidden; }
</style>
<div id="root"></div>
<script>
${bundle}
</script>
`;
writeFileSync(out, html);
console.log(`נכתב ${out} · ${(html.length / 1024).toFixed(0)}KB (קוד ${(bundle.length / 1024).toFixed(0)}KB, עיצוב ${(css.length / 1024).toFixed(0)}KB)`);
