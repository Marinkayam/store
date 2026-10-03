// E2E: מסך השגיאה — דוכן שהתפרק עם שלט "אופס!", פנייה לשני המינים, ו"לרענן"
// שמיישר את הדוכן באנימציה ואז באמת מנסה שוב.
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
await p.goto(`${BASE}/test-error`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=oops-stall]", { timeout: 15000 });
await p.waitForTimeout(600);
const body = (await p.textContent("main")) ?? "";
check("מסך השגיאה מופיע עם הדוכן שהתפרק", (await p.locator("[data-testid=oops-stall]").count()) === 1);
check("השלט אומר 'אופס!'", ((await p.textContent("[data-testid=oops-stall] text")) ?? "").includes("אופס"));
check("פונה לשני המינים: 'זו לא אשמתכם'", body.includes("זו לא אשמתכם") && !body.includes("זו לא את,"), body.slice(0, 80));
const swinging = await p.evaluate(() => getComputedStyle(document.querySelector(".oops-sign")).animationName);
check("השלט מתנדנד", swinging === "oops-swing", swinging);
check("הכפתור הוא 'לרענן'", ((await p.textContent("[data-testid=error-retry]")) ?? "").includes("לרענן"));
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/error-oops.png` });

await p.click("[data-testid=error-retry]");
await p.waitForTimeout(250);
check("בלחיצה: 'מסדרים את הדוכן…' והאייקון מסתובב",
  ((await p.textContent("[data-testid=error-retry]")) ?? "").includes("מסדרים") &&
  (await p.locator("[data-testid=error-retry] svg.oops-spin").count()) === 1);
check("והשלט מתיישר ('עוד רגע')", ((await p.textContent("[data-testid=oops-stall] text")) ?? "").includes("עוד רגע"));
await p.waitForTimeout(400);
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/error-fixing.png` });
await p.waitForSelector("[data-testid=recovered]", { timeout: 10000 }).catch(() => {});
check("ואז באמת מנסה שוב — והעמוד חוזר לעבוד", (await p.locator("[data-testid=recovered]").count()) === 1);

/* בלי תנועה (תפריט הנגישות) — השלט נשאר עקום אבל לא זז */
const still = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
await still.goto(`${BASE}/test-error`, { waitUntil: "networkidle" });
await still.waitForSelector("[data-testid=oops-stall]", { timeout: 15000 });
check("עם 'פחות תנועה' השלט לא מתנדנד", (await still.evaluate(() => getComputedStyle(document.querySelector(".oops-sign")).animationName)) === "none");

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} error screen checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
