// E2E: משיכה למטה ← רענון, עם הגג של הדוכן שמציץ.
// מגע אמיתי דרך CDP (Input.dispatchTouchEvent) — כמו אצבע על המסך.
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
const { rows: [store] } = await db.query("select slug from stores where contact_phone='972501234567' order by created_at limit 1");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const touch = (type, y) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 200, y }] });
async function drag(to, { release = true } = {}) {
  await touch("touchStart", 220);
  for (let y = 220; y <= to; y += 20) {
    await touch("touchMove", y);
    await p.waitForTimeout(16);
  }
  if (release) await touch("touchEnd", to);
}

/* ── הדוכן לקונים ── */
await p.goto(`${BASE}/s/${store.slug}`, { waitUntil: "networkidle" });
await p.evaluate(() => { window.__notReloaded = true; });
await drag(300, { release: false }); // משיכה קצרה
const short = await p.locator("[data-testid=pull-refresh]").count();
const shortLabel = (await p.textContent("[data-testid=pull-refresh-label]").catch(() => "")) ?? "";
check("משיכה קצרה: הגג מציץ", short === 1);
check("ואומר 'למשוך לרענון'", shortLabel.includes("למשוך לרענון"), shortLabel);
const opa = await p.locator("[data-testid=pull-refresh] svg").evaluate((el) => Number(getComputedStyle(el).opacity));
check("בשקיפות (לא מלא)", opa > 0 && opa < 0.9, String(opa));
await touch("touchEnd", 300);
await p.waitForTimeout(300);
check("שחרור לפני הסף — לא מרענן", (await p.evaluate(() => window.__notReloaded === true)) && (await p.locator("[data-testid=pull-refresh]").count()) === 0);

await drag(520, { release: false }); // משיכה ארוכה
const longLabel = (await p.textContent("[data-testid=pull-refresh-label]")) ?? "";
check("אחרי הסף: 'לשחרר לרענון'", longLabel.includes("לשחרר לרענון"), longLabel);
const nav = p.waitForEvent("load", { timeout: 8000 }).then(() => true).catch(() => false);
await touch("touchEnd", 520);
await p.waitForTimeout(150);
check("בשחרור: 'מרעננים…' עם הגג", ((await p.textContent("[data-testid=pull-refresh-label]").catch(() => "")) ?? "").includes("מרעננים"));
check("והעמוד מתרענן", await nav);
check("(באמת עמוד חדש)", (await p.evaluate(() => window.__notReloaded)) !== true);

/* ── לא בתוך גיליון ── */
await p.waitForLoadState("networkidle");
const { rows: [prod] } = await db.query(
  `select p.name from products p join stores s on s.id=p.store_id where s.slug=$1 and p.deleted_at is null
     and (p.is_visible is null or p.is_visible) and (not p.track_stock or p.stock > 0) order by p.sort_order, p.created_at limit 1`, [store.slug]);
await p.click(`.s-look button[aria-label='${prod.name}']`);
await p.waitForSelector("[data-testid=product-close]");
await p.evaluate(() => { window.__notReloaded = true; });
await drag(520);
await p.waitForTimeout(700);
check("בתוך גיליון מוצר — משיכה לא מרעננת", (await p.evaluate(() => window.__notReloaded === true)));

/* ── "הדוכן שלי" עם שינוי שלא נשמר — לא מרענן ── */
await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL("**/dashboard", { timeout: 20000 });
await p.goto(`${BASE}/dashboard/settings#design`);
await p.waitForSelector("input[aria-label='שם הדוכן']");
await p.fill("input[aria-label='שם הדוכן']", "שינוי שלא נשמר");
await p.evaluate(() => { window.scrollTo(0, 0); window.__notReloaded = true; });
await drag(520);
await p.waitForTimeout(300);
const blocked = (await p.textContent("[data-testid=pull-refresh-label]").catch(() => "")) ?? "";
check("שינוי שלא נשמר: לא מרענן, ואומר למה", blocked.includes("שינויים שלא נשמרו"), blocked);
await p.waitForTimeout(800);
check("והשינוי עדיין במסך", (await p.evaluate(() => window.__notReloaded === true)) &&
  (await p.inputValue("input[aria-label='שם הדוכן']")) === "שינוי שלא נשמר");

const ov = await p.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
check("הרענון של הדפדפן עצמו כבוי (שלא יהיו שניים)", ov === "none", ov);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} pull-to-refresh checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
