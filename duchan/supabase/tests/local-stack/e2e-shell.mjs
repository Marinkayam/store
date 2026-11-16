// E2E: מעטפת הדשבורד — התפריט התחתון, הסימון על ההזמנות, ויציאה מהחשבון.
//
// מרינה, 11.2026: "התפריט לא סטיקי למטה וזה מעצבן … תוודא שהתפריט למטה
// סטיקי ולא זז … שאם יש הזמנה אני רואה אייקון על ההזמנות", ו"כשאני גוללת יש
// יציאה מהחשבון וזה לא אמור להיות שם".
//
// החוזים:
//   1. בכל אחד מארבעת הטאבים התפריט צמוד לתחתית המסך, לפני ואחרי גלילה עד
//      הסוף, והדף עצמו לא נגלל (רק אזור התוכן). כך אין לו ממה לזוז.
//   2. מעבר לטאב אחר מתחיל מלמעלה.
//   3. גם כשהטקסט מוגדל בתפריט הנגישות התפריט נשאר בתחתית.
//   4. על "הזמנות" יש סימון עם מספר ההזמנות החדשות, והוא מתעדכן.
//   5. "יציאה מהחשבון" לא על המסך הראשי של "הדוכן שלי", רק ב"עוד הגדרות".
import { chromium, devices } from "playwright";
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

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!store) {
  console.error("צריך את הדוכן הזרוע. הריצי seed.mjs");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL((u) => new URL(u).pathname.startsWith("/dashboard"), { timeout: 20000 });
const vh = p.viewportSize().height;
const info = () => p.evaluate(() => {
  const n = document.querySelector("nav[data-bottom-bar]").getBoundingClientRect();
  const r = document.querySelector("[data-scroll-root]");
  return { navTop: Math.round(n.top), navBottom: Math.round(n.bottom), winY: Math.round(scrollY), rootTop: Math.round(r.scrollTop), docH: document.documentElement.scrollHeight };
});

/* ── 1. התפריט צמוד לתחתית בכל טאב, והדף לא נגלל ── */
for (const [path, label] of [["/dashboard/settings", "הדוכן שלי"], ["/dashboard/products", "מוצרים"], ["/dashboard", "הזמנות"], ["/dashboard/kupa", "משחק"]]) {
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForSelector("nav[data-bottom-bar]", { timeout: 20000 });
  await p.waitForTimeout(700);
  const a = await info();
  await p.evaluate(() => { const r = document.querySelector("[data-scroll-root]"); r.scrollTo(0, r.scrollHeight); });
  await p.waitForTimeout(300);
  const c = await info();
  check(`${label}: התפריט בתחתית המסך, לפני ואחרי גלילה`, a.navBottom === vh && c.navBottom === vh && a.navTop === c.navTop, `${a.navTop}-${a.navBottom} → ${c.navTop}-${c.navBottom} (מסך ${vh})`);
  check(`${label}: הדף עצמו לא נגלל`, c.winY === 0 && c.docH <= vh, `scrollY ${c.winY}, גובה הדף ${c.docH}`);
}

/* ── 2. מעבר בין טאבים מתחיל מלמעלה ── */
await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector("[data-scroll-root]").scrollTo(0, 400));
await p.locator("nav[data-bottom-bar] button", { hasText: "מוצרים" }).click();
await p.waitForURL("**/dashboard/products");
await p.waitForTimeout(500);
check("מעבר לטאב אחר מתחיל מלמעלה", (await info()).rootTop === 0);

/* ── 3. טקסט מוגדל (תפריט הנגישות) ── */
for (const [cls, zoom] of [["a11y-size-1", 1.15], ["a11y-size-2", 1.3]]) {
  await p.evaluate((c) => { document.documentElement.classList.remove("a11y-size-1", "a11y-size-2"); document.documentElement.classList.add(c); }, cls);
  await p.waitForTimeout(300);
  const i = await info();
  check(`טקסט מוגדל ×${zoom}: התפריט עדיין בתחתית`, i.navBottom === vh || Math.abs(i.navBottom * zoom - vh) < 3, `${i.navBottom}`);
}
await p.evaluate(() => document.documentElement.classList.remove("a11y-size-1", "a11y-size-2"));

/* ── 4. הסימון על ההזמנות ── */
const badge = async () => ((await p.locator("[data-testid=orders-badge]").count()) ? ((await p.locator("[data-testid=orders-badge] [dir=ltr]").textContent()) ?? "").trim() : "");
const want = (n) => (n === 0 ? "" : n > 9 ? "9+" : String(n));
const sent = async () => Number((await db.query("select count(*) from orders where store_id=$1 and status='sent'", [store.id])).rows[0].count);
await p.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
check("הסימון מראה כמה הזמנות חדשות מחכות", (await badge()) === want(await sent()), `בדאטהבייס ${await sent()}, על המסך "${await badge()}"`);
/* מכאן מתחילים מאפס הזמנות חדשות, כדי שהמעבר 0 → 1 ייבדק באמת (מעל 9 המסך
   מראה "9+" לפני ואחרי). אין טריגרים על orders, אז שינוי הסטטוס זמני ונקי. */
const { rows: parked } = await db.query("update orders set status='paid' where store_id=$1 and status='sent' returning id", [store.id]);
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(900);
const n0 = await sent();
check("בלי הזמנות חדשות אין סימון", n0 === 0 && (await badge()) === "", `בדאטהבייס ${n0}, על המסך "${await badge()}"`);
// הזמנה חדשה נכנסת → הסימון מתעדכן כשחוזרים לאפליקציה
const { rows: [num] } = await db.query("select coalesce(max(order_number),0)+1 as n from orders where store_id=$1", [store.id]);
const { rows: [added] } = await db.query(
  `insert into orders (store_id, order_number, items, total, status, buyer_name, buyer_phone)
   values ($1, $2, '[{"name":"בדיקת סימון","qty":1,"price":5}]'::jsonb, 5, 'sent', 'בדיקה', '972520000000') returning id`,
  [store.id, num.n]
);
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await p.waitForFunction((w) => {
  const b = document.querySelector("[data-testid=orders-badge] [dir=ltr]");
  return (b ? b.textContent.trim() : "") === w;
}, want(n0 + 1), { timeout: 8000 }).catch(() => {});
check("הזמנה חדשה מעדכנת את הסימון", (await badge()) === want(n0 + 1), `ציפינו "${want(n0 + 1)}", על המסך "${await badge()}"`);
await db.query("delete from orders where id=$1", [added.id]);
if (parked.length) await db.query("update orders set status='sent' where id = any($1)", [parked.map((r) => r.id)]);

/* ── 5. יציאה מהחשבון ── */
await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=hub-more]", { timeout: 20000 });
check("'יציאה מהחשבון' לא על המסך הראשי", !(await p.locator("[data-testid=logout]").isVisible()));
await p.click("[data-testid=hub-more]");
await p.waitForTimeout(300);
check("והיא נמצאת בסוף 'עוד הגדרות'", await p.locator("[data-testid=logout]").isVisible());

/* ── 6. האיקס: אותו כפתור, באותה פינה ── */
await p.evaluate(() => { try { localStorage.removeItem("duchan-install-dismissed"); } catch {} });
await p.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
await p.waitForTimeout(700);
if (await p.locator("[data-testid=install-card] [data-testid=install-dismiss]").count()) {
  const card = await p.locator("[data-testid=install-card]").boundingBox();
  const x = await p.locator("[data-testid=install-dismiss]").boundingBox();
  check("כרטיס 'הדוכן כאפליקציה': האיקס בפינה, 44px", !!card && !!x && Math.round(x.width) === 44 && Math.round(x.height) === 44 && x.x - card.x < 12 && x.y - card.y < 12,
    `${Math.round(x.x - card.x)},${Math.round(x.y - card.y)} מהפינה · ${Math.round(x.width)}×${Math.round(x.height)}`);
}
const glyphs = await p.locator("[data-close-x]").evaluateAll((els) => els.every((e) => !!e.querySelector("svg path")));
check("כל כפתורי הסגירה במסך משתמשים באותו סימן", glyphs);

check("בלי שגיאות JS", errors.length === 0, errors[0] ?? "");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} shell checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
