// E2E: שיתוף בטיקטוק — לינק קצר (duchan.app/xxxxx) שעובד, מה מותר בטיקטוק,
// ורעיונות לסרטון עם טקסט למסך וכיתוב מוכנים. בלי תמונה מיוצרת.
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
const host = new URL(BASE).host;

/* ── הלינק הקצר עובד ── */
const r = await fetch(`${BASE}/${store.slug}`, { redirect: "manual" });
check("duchan.app/<קוד> מפנה לדוכן", [307, 308].includes(r.status) && (r.headers.get("location") ?? "").endsWith(`/s/${store.slug}`), `${r.status} ${r.headers.get("location")}`);
const bad = await fetch(`${BASE}/not-a-store-path`, { redirect: "manual" });
check("כתובת שלא נראית כמו קוד — 404 רגיל", bad.status === 404, String(bad.status));
const terms = await fetch(`${BASE}/terms`);
check("ועמודים קיימים (terms) לא נפגעו", terms.status === 200 && (await terms.text()).includes("תנאי"));

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

const shown = ((await p.textContent("[data-testid=tiktok-link]")) ?? "").trim();
check("הלינק כתוב בגדול, קצר, בלי https", shown === `${host}/${store.slug}`, shown);
check("וגם בלינק הראשי של השיתוף — אותו לינק קצר", ((await p.textContent("[data-testid=share-link]")) ?? "").trim().endsWith(`${host}/${store.slug}`));
await p.click("[data-testid=tiktok-copy-link]");
await p.waitForTimeout(300);
check("לחיצה על הלינק מעתיקה אותו", (await p.evaluate(() => navigator.clipboard.readText())) === shown);

const where = (await p.textContent("[data-testid=tiktok-where]")) ?? "";
check("אומר את האמת: על הסרטון עובד לכולם", where.includes("על הסרטון") && where.includes("עובד לכולם"));
check("ושלינק לחיץ בביו רק מגיל 18 עם 1,000 עוקבים או חשבון עסקי", where.includes("מגיל 18") && where.includes("1,000") && where.includes("עסקי"));
check("אין יותר תמונה מיוצרת", (await p.locator("[data-testid=tiktok-make-image], [data-testid=tiktok-image]").count()) === 0);

const screen1 = (await p.textContent("[data-testid=tiktok-screen]")) ?? "";
check("רעיון לסרטון: טקסט למסך עם הלינק", screen1.includes("אורזים הזמנה") && screen1.includes(shown), screen1);
await p.click("[data-testid=tiktok-idea-drop]");
const screen2 = (await p.textContent("[data-testid=tiktok-screen]")) ?? "";
const cap2 = (await p.textContent("[data-testid=tiktok-caption]")) ?? "";
check("בחירת רעיון אחר מחליפה טקסט, כיתוב וטיפ", screen2.includes("דרופ חדש") && cap2.includes("#newdrop") && cap2.includes(shown) &&
  ((await p.textContent("[data-testid=tiktok-tip]")) ?? "").length > 5);
await p.click("[data-testid=tiktok-copy-screen]");
await p.waitForTimeout(300);
check("העתקת הטקסט למסך", (await p.evaluate(() => navigator.clipboard.readText())).includes("דרופ חדש"));
await p.click("[data-testid=tiktok-copy-caption]");
await p.waitForTimeout(300);
check("העתקת הכיתוב", (await p.evaluate(() => navigator.clipboard.readText())).includes("#newdrop"));

await p.click("[data-testid=tiktok-idea-pack]");
await p.locator("[data-testid=tiktok-card]").scrollIntoViewIfNeeded();
await p.evaluate(() => document.querySelector("[data-testid=tiktok-card]").scrollIntoView({ block: "start" }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/tiktok-card-1.png` });
await p.evaluate(() => window.scrollBy(0, 640));
await p.waitForTimeout(300);
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/tiktok-card-2.png` });
check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.join(" | "));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} tiktok share checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
