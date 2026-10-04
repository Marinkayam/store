// E2E: קופת הדוכן — מטבעות, אותות, רמות, חגיגות וחידות.
//
//   1. /api/kupa: רק לצוות של הדוכן; המטבעות = אותות + מכירות
//   2. מכירות: 10 לכל הזמנה ששולמה, עד 3 ביום; הזמנה עצמית ומבוטלת לא נספרות
//   3. פעם ראשונה בטלפון: "פתחנו לך קופה!" עם כל מה שכבר נאסף
//   4. אות חדש: מסך חגיגה עם המדליה, המונה עולה, ושיתוף לוואטסאפ עם הלינק
//   5. עלייה ברמה: הדוכן נבנה מחדש
//   6. "kupa-quiet" (של הבדיקות האחרות) משתיק חגיגות
//   7. טאב משלה בשורה למטה, אחרונה
//   8. לכל אות חידה עם 3 תשובות שונות ואחת נכונה; טעות → "נסו שוב", נכון → הסבר + כוכב שנשמר
//      ומאגר של 100+ חידות: כוכב על כל חידה, תואר ב-5 כוכבים
//   9. בלי גלילה הצידה ב-360
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const SHOTS = process.env.SHOTS ?? "/tmp";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
const { rows: [other] } = await db.query("select id from stores where id<>$1 and owner_id<>$2 limit 1", [store.id, store.owner_id]);
const MARK = "e2e-kupa";
await db.query("delete from orders where store_id=$1 and buyer_note=$2", [store.id, MARK]);
await db.query("delete from kupa_solved where store_id=$1", [store.id]);
const solvedDb = async () => (await db.query("select riddle_id from kupa_solved where store_id=$1", [store.id])).rows.map((r) => r.riddle_id);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));

/* ── 1. API ── */
const anon = await (await browser.newContext()).request.get(`${BASE}/api/kupa?storeId=${store.id}`);
check("בלי כניסה: 401", anon.status() === 401, String(anon.status()));

await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL("**/dashboard", { timeout: 20000 });
const api = async (id = store.id) => {
  const r = await p.request.get(`${BASE}/api/kupa?storeId=${id}`);
  return { status: r.status(), body: r.ok() ? await r.json() : null };
};
if (other) check("דוכן של מישהו אחר: 403", (await api(other.id)).status === 403);
const k0 = (await api()).body;
const badgeSum = k0.badges.filter((b) => b.reached).reduce((a, b) => a + b.coins, 0);
check("מטבעות = אותות שהושגו + מכירות", k0.coins === badgeSum + k0.saleCoins, `${k0.coins} = ${badgeSum} + ${k0.saleCoins}`);
check("12 אותות, 'הדוכן נפתח' תמיד מושג", k0.badges.length === 12 && k0.badges[0].key === "open" && k0.badges[0].reached);
check("רמה ושם רמה", typeof k0.level === "number" && !!k0.levelName, `${k0.level} · ${k0.levelName}`);
check("ואין בתשובה טלפונים", !/9725\d{8}/.test(JSON.stringify(k0)));

/* ── 2. מכירות: תקרה יומית, הזמנה עצמית, ביטול ── */
const ins = (at, status, phone, total = 0) =>
  db.query(
    `insert into orders (store_id, order_number, items, total, status, buyer_phone, buyer_note, created_at)
     values ($1, (select coalesce(max(order_number),0)+1 from orders where store_id=$1), '[]'::jsonb, $2, $3, $4, $5, $6)`,
    [store.id, total, status, phone, MARK, at]
  );
for (let i = 0; i < 4; i++) await ins("2026-01-15T10:0" + i + ":00+02:00", "paid", "972509990001");
await ins("2026-01-16T10:00:00+02:00", "paid", store.contact_phone); // מעצמי
await ins("2026-01-17T10:00:00+02:00", "cancelled", "972509990002");
const k1 = (await api()).body;
check("4 הזמנות ששולמו באותו יום → 30 מטבעות (עד 3 ביום)", k1.saleCoins - k0.saleCoins === 30, `${k0.saleCoins} → ${k1.saleCoins}`);
await db.query("delete from orders where store_id=$1 and buyer_note=$2", [store.id, MARK]);
const k2 = (await api()).body;
check("והזמנה מהטלפון של הדוכן / מבוטלת — לא נספרת", k2.saleCoins === k0.saleCoins && k2.coins === k0.coins);

/* ── 3. פעם ראשונה בטלפון: welcome ── */
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("kupa")) localStorage.removeItem(k); });
await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
const cele = p.locator("[data-testid=kupa-celebrate]");
await cele.waitFor({ timeout: 8000 });
check("פעם ראשונה: 'פתחנו לך קופה!'", (await cele.getAttribute("data-kind")) === "welcome" && (await cele.textContent()).includes("פתחנו לך קופה"));
await p.waitForTimeout(1800);
check("המונה מגיע לסכום בקופה", ((await p.textContent("[data-testid=kupa-celebrate-total]")) ?? "").includes(String(k0.coins)), (await p.textContent("[data-testid=kupa-celebrate-total]")) ?? "");
await p.screenshot({ path: `${SHOTS}/kupa-welcome.png` });
await p.click("[data-testid=kupa-close]");
await p.waitForTimeout(400);
check("סגירה — והחגיגה לא חוזרת במעבר מסך", await (async () => {
  await p.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  return (await p.locator("[data-testid=kupa-celebrate]").count()) === 0;
})());

/* ── 7. טאב משלה בשורה למטה ── */
await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
const tabs = await p.locator("nav button").allTextContents();
check("4 טאבים למטה, והקופה אחרונה", tabs.length === 4 && tabs[3].includes("הקופה"), tabs.join(" | "));
await p.click("nav button:has-text('הקופה')");
await p.waitForURL("**/dashboard/kupa");
check("הטאב של הקופה מסומן כפעיל", (await p.getAttribute("nav button:has-text('הקופה')", "aria-current")) === "page");
await p.waitForSelector("[data-testid=kupa-page]");
check("העמוד: מטבעות, רמה, 12 אותות", ((await p.textContent("[data-testid=kupa-coins]")) ?? "").includes(String(k0.coins)) &&
  (await p.textContent("[data-testid=kupa-level]")) === k0.levelName &&
  (await p.locator("[data-testid=kupa-badge]").count()) === 12);
const reachedUi = await p.locator("[data-testid=kupa-badge][data-reached=true]").count();
check("אותות שהושגו בעמוד = ב-API", reachedUi === k0.badges.filter((b) => b.reached).length, String(reachedUi));
if (k0.next) check("כמה חסר לרמה הבאה", ((await p.textContent("[data-testid=kupa-missing]")) ?? "").includes(String(k0.next.missing)));
const nb = k0.badges.find((b) => !b.reached);
if (nb) check("הצעד הבא = האות הראשון שלא הושג", ((await p.textContent("[data-testid=kupa-next]")) ?? "").includes(nb.title), nb.title);

/* ── 8. חידות ── */
let allGood = true;
const bad = [];
for (let i = 0; i < 12; i++) {
  await p.locator("[data-testid=kupa-badge]").nth(i).click();
  await p.waitForSelector("[data-testid=kupa-badge-sheet]");
  const opts = await p.locator("[data-testid=riddle-option]").allTextContents();
  const rights = await p.locator("[data-testid=riddle-option][data-right]").count();
  if (opts.length !== 3 || new Set(opts).size !== 3 || rights !== 1) { allGood = false; bad.push(`${i}: ${opts.join(" | ")}`); }
  await p.click("[data-testid=badge-close]");
  await p.waitForTimeout(150);
}
check("לכל 12 האותות: 3 תשובות שונות, אחת נכונה", allGood, bad.join(" ; "));

await p.locator("[data-testid=kupa-badge]").nth(1).click();
await p.waitForSelector("[data-testid=kupa-badge-sheet]");
await p.locator("[data-testid=riddle-option]:not([data-right])").first().click();
check("טעות: 'נסו שוב', בלי עונש", (await p.locator("[data-testid=riddle-retry]").count()) === 1);
await p.locator("[data-testid=riddle-option][data-right]").click();
check("נכון: הסבר למה", ((await p.textContent("[data-testid=riddle-why]")) ?? "").includes("נכון"));
await p.screenshot({ path: `${SHOTS}/kupa-riddle.png` });
await p.click("[data-testid=badge-close]");
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=kupa-page]");
check("הכוכב של החידה נשמר אחרי רענון", ((await p.locator("[data-testid=kupa-badge]").nth(1).getAttribute("aria-label")) ?? "").includes("החידה נפתרה"));

/* ── 8ב. מאגר החידות: כוכב על כל חידה ── */
const starsNow = async () => Number(((await p.textContent("[data-testid=kupa-stars]")) ?? "").replace(/\D/g, ""));
const remainingNow = async () => Number(((await p.textContent("[data-testid=riddle-remaining]")) ?? "").replace(/\D/g, ""));
const s0 = await starsNow(), r0 = await remainingNow();
check("כוכבים = חידות שנפתרו (חידת האות נתנה כוכב)", s0 === 1, String(s0));
check("מאגר גדול: יותר מ-100 חידות", r0 > 100, String(r0));
await p.click("[data-testid=riddle-new]");
await p.waitForSelector("[data-testid=riddle-sheet]");
const q1 = (await p.textContent("[data-testid=riddle-sheet] #riddle-q")) ?? "";
await p.locator("[data-testid=riddle-sheet] [data-testid=riddle-option]:not([data-right])").first().click();
check("מאגר: טעות לא נותנת כוכב", ((await p.textContent("[data-testid=riddle-sheet-stars]")) ?? "").includes(`${s0} כוכבים`));
await p.locator("[data-testid=riddle-sheet] [data-testid=riddle-option][data-right]").click();
check("מאגר: נכון → כוכב קופץ ו'קיבלת כוכב'", (await p.locator("[data-testid=riddle-star]").count()) === 1 &&
  ((await p.textContent("[data-testid=riddle-sheet] [data-testid=riddle-why]")) ?? "").includes("קיבלת כוכב"));
check("ומונה הכוכבים עלה", ((await p.textContent("[data-testid=riddle-sheet-stars]")) ?? "").includes(`${s0 + 1} כוכבים`));
await p.screenshot({ path: `${SHOTS}/kupa-riddle-star.png` });
await p.click("[data-testid=riddle-next]");
const q2 = (await p.textContent("[data-testid=riddle-sheet] #riddle-q")) ?? "";
check("'עוד חידה' מביא שאלה אחרת", q2 !== "" && q2 !== q1, q2.slice(0, 40));
// עוד 3 חידות → 5 כוכבים = תואר חדש
for (let i = 0; i < 3; i++) {
  await p.locator("[data-testid=riddle-sheet] [data-testid=riddle-option][data-right]").click();
  if (i < 2) await p.click("[data-testid=riddle-next]");
}
check("5 כוכבים: 'תואר חדש!' — ניצוץ של חשבון", ((await p.textContent("[data-testid=riddle-rankup]").catch(() => "")) ?? "").includes("ניצוץ של חשבון"));
await p.screenshot({ path: `${SHOTS}/kupa-rankup.png` });
await p.click("[data-testid=riddle-close]");
check("בעמוד: 5 כוכבים והתואר", (await starsNow()) === 5 && ((await p.textContent("[data-testid=riddle-rank]")) ?? "") === "ניצוץ של חשבון");
check("ונשארו 4 חידות פחות במאגר", (await remainingNow()) === r0 - 4, `${r0} → ${await remainingNow()}`);
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=kupa-riddles]");
check("הכוכבים נשמרים אחרי רענון", (await starsNow()) === 5);

/* ── 8ג. שמירה במסד (0058) ── */
const inDb = await solvedDb();
check("במסד: 5 חידות שנפתרו (כולל חידת האות)", inDb.length === 5, inDb.join(","));
const post = (body) => p.request.post(`${BASE}/api/kupa/solve`, { data: { storeId: store.id, ...body } });
const fresh = (await api()).body;
check("ה-API מחזיר את החידות שנפתרו", Array.isArray(fresh.solved) && fresh.solved.length === 5);
const unsolvedId = "c-receipt";
const wrong = await post({ riddleId: unsolvedId, answer: "אין סיבה, זה רק נייר" });
check("תשובה לא נכונה → 400 ולא נשמר כוכב", wrong.status() === 400 && !(await solvedDb()).includes(unsolvedId));
check("חידה שלא קיימת → 400", (await post({ riddleId: "c-nope", answer: "x" })).status() === 400);
if (other) {
  const foreign = await p.request.post(`${BASE}/api/kupa/solve`, { data: { storeId: other.id, riddleId: unsolvedId, answer: "כדי שאפשר יהיה להחזיר או להחליף" } });
  check("כוכב לדוכן של מישהו אחר → 403", foreign.status() === 403);
}
const ok1 = await post({ riddleId: unsolvedId, answer: "כדי שאפשר יהיה להחזיר או להחליף" });
check("תשובה נכונה ישר ל-API → נשמר", ok1.ok() && (await solvedDb()).includes(unsolvedId));
const imp = await post({ import: ["c-need-want", "c-only-today", "c-privacy"] });
check("ייבוא מהטלפון לא עובד כשכבר יש כוכבים במסד", imp.ok() && (await solvedDb()).length === 6);

// טלפון אחר, בלי שום דבר שמור מקומית: אותם כוכבים
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx2.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/login`);
await verifyPhone(p2, "0501234567");
await p2.waitForURL("**/dashboard", { timeout: 20000 });
await p2.goto(`${BASE}/dashboard/kupa`, { waitUntil: "networkidle" });
await p2.waitForSelector("[data-testid=kupa-riddles]");
await p2.waitForTimeout(600);
const s2 = Number(((await p2.textContent("[data-testid=kupa-stars]")) ?? "").replace(/\D/g, ""));
check("בטלפון אחר: אותם 6 כוכבים מהמסד", s2 === 6, String(s2));
await ctx2.close();

// כוכבים שהיו רק בטלפון (גרסה קודמת) עולים למסד בכניסה הראשונה
await db.query("delete from kupa_solved where store_id=$1", [store.id]);
await p.evaluate((id) => localStorage.setItem(`kupa-solved:${id}`, JSON.stringify(["c-need-want", "c-receipt", "t-times-0", "not-a-riddle"])), store.id);
await p.goto(`${BASE}/dashboard/kupa`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=kupa-riddles]");
await p.waitForTimeout(1500);
const imported = (await solvedDb()).sort();
check("כוכבים מהטלפון עלו למסד (בלי מזהים לא חוקיים)", imported.join(",") === ["c-need-want", "c-receipt", "t-times-0"].sort().join(","), imported.join(","));
await db.query("delete from kupa_solved where store_id=$1", [store.id]);
await p.evaluate((id) => localStorage.removeItem(`kupa-solved:${id}`), store.id);

/* ── 4. אות חדש ── */
const reachedKeys = k0.badges.filter((b) => b.reached).map((b) => b.key);
const target = k0.badges.filter((b) => b.reached && b.key !== "open").slice(-1)[0];
await p.evaluate(({ id, badges, level, coins }) => localStorage.setItem(`kupa-seen:${id}`, JSON.stringify({ badges, level, coins })),
  { id: store.id, badges: reachedKeys.filter((k) => k !== target.key), level: k0.level, coins: k0.coins - target.coins });
await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await cele.waitFor({ timeout: 8000 });
check(`אות חדש: חגיגה עם '${target.title}'`, (await cele.getAttribute("data-kind")) === "badge" && ((await p.textContent("#kupa-cele-title")) ?? "") === target.title);
check(`+${target.coins} מטבעות`, ((await cele.textContent()) ?? "").includes(`+${target.coins}`));
if (target.share && store.activated_at) {
  const href = decodeURIComponent((await p.getAttribute("[data-testid=kupa-share]", "href")) ?? "");
  check("שיתוף לוואטסאפ עם הלינק לדוכן", href.startsWith("https://wa.me/?text=") && href.includes(store.slug), href.slice(0, 80));
}
const go = (await p.getAttribute("[data-testid=kupa-open]", "href")) ?? "";
check("ומשם ישר לחידה של האות", go.includes(`badge=${target.key}`), go);
await p.screenshot({ path: `${SHOTS}/kupa-badge.png` });
await p.click("[data-testid=kupa-close]");

/* ── 5. עלייה ברמה ── */
if (k0.level > 0) {
  await p.evaluate(({ id, badges, coins }) => localStorage.setItem(`kupa-seen:${id}`, JSON.stringify({ badges, level: 0, coins })),
    { id: store.id, badges: reachedKeys, coins: 0 });
  await p.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await cele.waitFor({ timeout: 8000 });
  check("עלייה ברמה: 'הדוכן עלה רמה'", (await cele.getAttribute("data-kind")) === "level" && ((await cele.textContent()) ?? "").includes("הדוכן עלה רמה"));
  check("והדוכן נבנה באנימציה", (await p.locator("[data-testid=kupa-celebrate] svg .kp-drop").count()) > 0);
  await p.screenshot({ path: `${SHOTS}/kupa-level.png` });
  await p.click("[data-testid=kupa-close]");
}

/* ── 6. שקט לבדיקות ── */
await p.evaluate((id) => { localStorage.removeItem(`kupa-seen:${id}`); localStorage.setItem("kupa-quiet", "1"); }, store.id);
await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
check("kupa-quiet: בלי חגיגות", (await p.locator("[data-testid=kupa-celebrate]").count()) === 0);

/* ── 9. מסך צר ── */
await p.setViewportSize({ width: 360, height: 780 });
await p.goto(`${BASE}/dashboard/kupa`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=kupa-page]");
const sw = await p.evaluate(() => document.documentElement.scrollWidth);
check("360px: בלי גלילה הצידה", sw <= 360, String(sw));
await p.screenshot({ path: `${SHOTS}/kupa-page.png`, fullPage: true });

check("בלי שגיאות JS", errors.length === 0, errors.join(" | "));

await browser.close();
await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
