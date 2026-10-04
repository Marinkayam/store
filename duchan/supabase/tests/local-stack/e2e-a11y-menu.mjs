// E2E: תפריט הנגישות, דילוג לתוכן, והודעת העוגיות.
import { chromium } from "playwright";
import pg from "pg";

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
const jsErrors = [];
const fresh = async () => {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on("pageerror", (e) => jsErrors.push(e.message));
  return p;
};
const cls = (p) => p.evaluate(() => document.documentElement.className);
const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/* ── 🍪 עוגיות ── */
let p = await fresh();
await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
check("ביקור ראשון: הודעת העוגיות מופיעה", (await p.locator("[data-testid=cookie-note]").count()) === 1);
const note = (await p.textContent("[data-testid=cookie-note]")) ?? "";
check("בשפה קלילה: 'ואי עוגיות, יאמי!', 'בלי פרסומות ובלי מעקב'", note.includes("ואי עוגיות, יאמי") && !note.includes("רק הקטנות שצריך") && note.includes("בלי פרסומות ובלי מעקב"), note);
check("ויש קישור 'מה זה עוגיות?' להסבר", (await p.getAttribute("[data-testid=cookie-note] a", "href")) === "/privacy#cookies");
await p.click("[data-testid=cookie-ok]");
check("'הבנתי' סוגר", (await p.locator("[data-testid=cookie-note]").count()) === 0);
await p.reload({ waitUntil: "networkidle" });
check("ולא חוזר בביקור הבא", (await p.locator("[data-testid=cookie-note]").count()) === 0);
await p.goto(`${BASE}/privacy#cookies`, { waitUntil: "networkidle" });
const cookiesSection = (await p.textContent("#cookies")) ?? "";
check("בפרטיות: סעיף עוגיות בשפה פשוטה", cookiesSection.includes("פתק קטן") && cookiesSection.includes("מה אין"), cookiesSection.slice(0, 60));

/* ── דילוג לתוכן ── */
await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
await p.keyboard.press("Tab");
const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
check("טאב ראשון: 'דילוג לתוכן'", first === "דילוג לתוכן", String(first));
const skipVisible = await p.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0);
check("ונראה כשמגיעים אליו", skipVisible);
await p.keyboard.press("Enter");
check("Enter מעביר לתוכן", (await p.evaluate(() => document.activeElement?.id)) === "main");

/* ── ♿ התפריט ── */
check("כפתור ♿ בכל עמוד", (await p.locator("[data-testid=a11y-button]").count()) === 1);
await p.click("[data-testid=a11y-button]");
check("נפתח חלון נגישות (dialog)", (await p.locator("[role=dialog][aria-labelledby=a11y-title]").count()) === 1);
await p.keyboard.press("Escape");
check("Esc סוגר", (await p.locator("[data-testid=a11y-panel]").count()) === 0);
check("והמיקוד חוזר לכפתור", (await p.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "a11y-button");

for (const [path, label] of [["/", "דף הבית"], [`/s/${store.slug}`, "הדוכן"], ["/price", "מחיר"]]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await p.click("[data-testid=a11y-button]");
  await p.click("[data-testid=a11y-size-2]");
  await p.waitForTimeout(200);
  check(`${label}: אותיות ענק — בלי גלילה הצידה`, (await cls(p)).includes("a11y-size-2") && (await noSideScroll(p)));
  await p.click("[data-testid=a11y-size-0]");
  await p.keyboard.press("Escape");
}

await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
await p.click("[data-testid=a11y-button]");
await p.click("[data-testid=a11y-size-1]");
await p.click("[data-testid=a11y-contrast]");
await p.click("[data-testid=a11y-still]");
await p.click("[data-testid=a11y-links]");
await p.click("[data-testid=a11y-font]");
const on = await cls(p);
check("כל ההגדרות מופעלות", ["a11y-size-1", "a11y-contrast", "a11y-still", "a11y-links", "a11y-font"].every((c) => on.includes(c)), on);
const muted = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--muted").trim());
check("צבעים חזקים: הטקסט האפור הופך לשחור", muted === "#000", muted);
const anim = await p.evaluate(() => { const el = document.querySelector(".fx-rise, .fx-shine"); return el ? getComputedStyle(el).animationName : "none"; });
check("בלי תנועה: האנימציות נעצרות", anim === "none", anim);
await p.keyboard.press("Escape");
await p.reload({ waitUntil: "domcontentloaded" });
const afterReload = await cls(p);
check("נשמר בטלפון — גם אחרי טעינה מחדש", afterReload.includes("a11y-contrast") && afterReload.includes("a11y-size-1"), afterReload);
await p.goto(`${BASE}/s/${store.slug}`, { waitUntil: "networkidle" });
check("וחל גם בדוכן עצמו", (await cls(p)).includes("a11y-contrast"));
await p.click("[data-testid=a11y-button]");
await p.click("[data-testid=a11y-reset]");
check("'לחזור לרגיל' מנקה הכל", !(await cls(p)).includes("a11y-"));

check("אין שגיאות ג׳אווהסקריפט", jsErrors.length === 0, jsErrors.join(" | "));
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} a11y menu + cookie checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
