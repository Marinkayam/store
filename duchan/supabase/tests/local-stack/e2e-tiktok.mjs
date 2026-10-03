// E2E: שיתוף בטיקטוק — לינק לביו, תמונה מוכנה 1080×1920, כיתוב מוכן.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const { rows: [store] } = await db.query("select slug, display_name from stores where contact_phone='972501234567' order by created_at limit 1");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL("**/dashboard", { timeout: 20000 });
await p.goto(`${BASE}/dashboard/settings#share`);
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=tiktok-card]", { timeout: 15000 });

const card = (await p.textContent("[data-testid=tiktok-card]")) ?? "";
check("בשיתוף יש 'לשתף בטיקטוק'", card.includes("לשתף בטיקטוק"));
check("מסביר איפה מדביקים: עריכת פרופיל ← אתר", card.includes("עריכת פרופיל") && card.includes("אתר"));

await p.click("[data-testid=tiktok-copy-link]");
await p.waitForTimeout(300);
const clip = await p.evaluate(() => navigator.clipboard.readText());
check("'העתקת הלינק לביו' מעתיק את הלינק לדוכן", clip.endsWith(`/s/${store.slug}`), clip);

const caption = (await p.textContent("[data-testid=tiktok-caption]")) ?? "";
check("כיתוב מוכן: שם הדוכן, 'הלינק בביו' והאשטגים", caption.includes(store.display_name) && caption.includes("הלינק בביו") && caption.includes("#דוכן"), caption);
await p.click("[data-testid=tiktok-copy-caption]");
await p.waitForTimeout(300);
check("והעתקת הכיתוב עובדת", (await p.evaluate(() => navigator.clipboard.readText())).includes("הלינק בביו"));

await p.click("[data-testid=tiktok-make-image]");
await p.waitForSelector("[data-testid=tiktok-image]", { timeout: 10000 });
const dims = await p.evaluate(async () => {
  const im = document.querySelector("[data-testid=tiktok-image]");
  await im.decode();
  return [im.naturalWidth, im.naturalHeight];
});
check("נוצרת תמונה בגודל של טיקטוק (1080×1920)", dims[0] === 1080 && dims[1] === 1920, dims.join("×"));
const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await p.click("[data-testid=tiktok-share-image]");
const d = await dl;
check("במחשב (בלי חלון שיתוף) התמונה נשמרת", !!d && d.suggestedFilename().endsWith(".png"), d?.suggestedFilename() ?? "");
if (d) await d.saveAs(`${process.env.SHOTS ?? "/tmp"}/tiktok-story.png`);
await p.locator("[data-testid=tiktok-card]").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/tiktok-card.png`, fullPage: true });
check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.join(" | "));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} tiktok share checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
