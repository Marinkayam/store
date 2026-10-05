// E2E: "מי מסתכל על הדוכן" (0062) + באנר "חדש בדוכן".
//
// מרינה: "תעשה באנר של כל הדברים החדשים בדוכן, תבנה גם אנליטיקס שנראה מי
// מסתכל וכמה צופה".
//
// החוזים:
//   1. כניסה של קונה נספרת פעם אחת ללשונית; לשונית נוספת = עוד כניסה, אבל
//      אותו אדם היום; "בפעם הראשונה" רק בפעם הראשונה.
//   2. מקור: אינסטגרם (דפדפן בתוך האפליקציה) מזוהה; בלי referrer = "וואטסאפ או הקלידו".
//   3. פתיחת מוצר והוספה לסל נספרות — לדוכן (פעם לביקור) ולמוצר.
//   4. "עכשיו בדוכן" סופר לשוניות פתוחות.
//   5. בעלי הדוכן לא נספרים.
//   6. אין בטבלאות שום פרט מזהה.
//   7. /api/stats: רק לצוות הדוכן; המסך מציג עכשיו / כניסות / מקורות / מוצרים.
//   8. באנר "חדש בדוכן": לדוכן ותיק, עם כל הפריטים כלינקים, ונסגר לתמיד.
//   9. החמ"ל רואה את כל הדוכנים.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!store?.activated_at) {
  console.error("צריך דוכן פעיל (seed.mjs ואז e2e-activation.mjs)");
  process.exit(1);
}
await db.query("update stores set status='active' where id=$1", [store.id]);
for (const t of ["store_stats", "product_stats", "store_presence"]) await db.query(`delete from ${t} where store_id=$1`, [store.id]);
const { rows: [prod] } = await db.query(
  `select id, name from products p where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and options is null and drop_at is null and (track_stock = false or stock > 0)
     and (select count(*) from products q where q.store_id=p.store_id and q.name=p.name and q.deleted_at is null) = 1
   order by sort_order, created_at limit 1`, [store.id]);
const totals = async () => (await db.query(
  `select coalesce(sum(visits),0)::int v, coalesce(sum(visitors),0)::int u, coalesce(sum(new_visitors),0)::int n,
          coalesce(sum(product_opens),0)::int o, coalesce(sum(carts),0)::int c
     from store_stats where store_id=$1`, [store.id])).rows[0];
const bySource = async (src) => (await db.query("select coalesce(sum(visits),0)::int v from store_stats where store_id=$1 and source=$2", [store.id, src])).rows[0].v;
const waitFor = async (pred, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await pred()) return true; await sleep(200); } return false; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const shop = `${BASE}/s/${store.slug}`;

try {
  /* ── 1. קונה ── */
  const buyer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b1 = await buyer.newPage();
  b1.on("pageerror", (e) => errs.push(e.message));
  await b1.goto(shop);
  check("כניסה ראשונה נספרת", await waitFor(async () => (await totals()).v === 1), JSON.stringify(await totals()));
  let s = await totals();
  check("…כאדם אחד, בפעם הראשונה", s.u === 1 && s.n === 1, JSON.stringify(s));
  check("בלי referrer — 'וואטסאפ או הקלידו את הלינק'", (await bySource("whatsapp_or_direct")) === 1);
  await b1.reload();
  await sleep(1500);
  check("רענון באותה לשונית לא נספר שוב", (await totals()).v === 1);
  const b2 = await buyer.newPage();
  await b2.goto(shop);
  await waitFor(async () => (await totals()).v === 2);
  s = await totals();
  check("לשונית נוספת: עוד כניסה, אבל אותו אדם היום ולא 'פעם ראשונה'", s.v === 2 && s.u === 1 && s.n === 1, JSON.stringify(s));

  /* ── 3. מוצר וסל ── */
  await b1.click(`button[aria-label="${prod.name}"]`);
  await b1.waitForTimeout(600);
  await b1.keyboard.press("Escape");
  await b1.goto(shop); // סוגר את הגיליון; אותה לשונית — לא כניסה חדשה
  await b1.click(`button[aria-label="${prod.name}"]`);
  await b1.waitForTimeout(400);
  check("פתיחת מוצר נספרת (פעם אחת לביקור)", await waitFor(async () => (await totals()).o >= 1), JSON.stringify(await totals()));
  const b3 = await buyer.newPage();
  await b3.goto(shop);
  await b3.click(`button[aria-label="הוספה מהירה, ${prod.name}"]`);
  check("הוספה לסל נספרת", await waitFor(async () => (await totals()).c === 1), JSON.stringify(await totals()));
  const { rows: [ps] } = await db.query("select coalesce(sum(opens),0)::int o, coalesce(sum(carts),0)::int c from product_stats where store_id=$1 and product_id=$2", [store.id, prod.id]);
  check("וגם למוצר עצמו", ps.o >= 1 && ps.c === 1, JSON.stringify(ps));

  /* ── 2. אינסטגרם ── */
  const insta = await browser.newContext({ ...devices["iPhone 13"], userAgent: devices["iPhone 13"].userAgent + " Instagram 312.0.0.0" });
  const ig = await insta.newPage();
  await ig.goto(shop);
  check("כניסה מתוך אינסטגרם מזוהה כאינסטגרם", await waitFor(async () => (await bySource("instagram")) === 1));

  /* ── 4. עכשיו בדוכן ── */
  const { rows: [live] } = await db.query("select count(*)::int n from store_presence where store_id=$1 and seen_at > now() - interval '90 seconds'", [store.id]);
  check("'עכשיו בדוכן' סופר את הלשוניות הפתוחות", live.n >= 3, String(live.n));

  /* ── 6. בלי פרטים מזהים ── */
  const { rows: cols } = await db.query(
    "select table_name, column_name from information_schema.columns where table_name in ('store_stats','product_stats','store_presence')");
  check("אין בטבלאות IP, טלפון, user agent או מיקום",
    !cols.some((c) => /ip|phone|agent|ua$|city|geo|lat|lng|name|email|referrer/i.test(c.column_name)), cols.map((c) => c.column_name).join(","));

  /* ── 5 + 7. בעלי הדוכן ── */
  const ownerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerCtx.newPage();
  owner.on("pageerror", (e) => errs.push(e.message));
  await owner.goto(`${BASE}/login`);
  await verifyPhone(owner, "0501234567");
  await owner.waitForURL("**/dashboard", { timeout: 20000 });
  const before = (await totals()).v;
  await owner.goto(shop);
  await owner.waitForTimeout(2500);
  check("בעלי הדוכן שנכנסים לדוכן שלהם לא נספרים", (await totals()).v === before, `${before} → ${(await totals()).v}`);

  const anon = await fetch(`${BASE}/api/stats?storeId=${store.id}&range=today`);
  check("/api/stats בלי כניסה — 401", anon.status === 401);
  const { rows: [other] } = await db.query("select id from stores where id<>$1 and owner_id<>$2 limit 1", [store.id, store.owner_id]);
  if (other) check("/api/stats של דוכן אחר — 403", (await owner.request.get(`${BASE}/api/stats?storeId=${other.id}&range=today`)).status() === 403);
  const api = await (await owner.request.get(`${BASE}/api/stats?storeId=${store.id}&range=today`)).json();
  // 3 לשוניות של אותו קונה + אינסטגרם = 4 כניסות של 2 אנשים
  check("/api/stats: הכניסות של היום", api.totals?.visits === 4 && api.totals.visitors === 2 && api.totals.newVisitors === 2, JSON.stringify(api.totals));
  check("/api/stats: עכשיו בדוכן", api.live >= 3, String(api.live));
  check("/api/stats: מקורות", api.sources?.some((x) => x.source === "instagram" && x.visits === 1));
  check("/api/stats: המוצר ברשימה", api.products?.some((x) => x.id === prod.id && x.carts === 1));
  check("/api/stats: 24 שעות בגרף של היום", api.series?.length === 24);
  const week = await (await owner.request.get(`${BASE}/api/stats?storeId=${store.id}&range=7`)).json();
  check("/api/stats 7 ימים: 7 עמודות, והיום בסוף", week.series?.length === 7 && week.series[6].visits === 4);

  await owner.goto(`${BASE}/dashboard/stats`);
  await owner.waitForSelector("[data-testid=stats-kpi-visits]");
  await owner.waitForFunction(() => document.querySelector("[data-testid=stats-live-n]")?.textContent !== "–");
  const liveText = (await owner.textContent("[data-testid=stats-live-text]")) ?? "";
  check("המסך: 'אנשים מסתכלים על הדוכן עכשיו!'", /מסתכלים על הדוכן עכשיו|מסתכל על הדוכן עכשיו/.test(liveText), liveText);
  check("המסך: 4 כניסות", ((await owner.textContent("[data-testid=stats-kpi-visits]")) ?? "").includes("4"));
  check("המסך: מאיפה הגיעו", await owner.locator("[data-testid=stats-source-instagram]").isVisible());
  check("המסך: מהכניסה ועד ההזמנה", await owner.locator("[data-testid=stats-funnel-carts]").isVisible());
  check("המסך: על מה הכי מסתכלים", ((await owner.textContent("[data-testid=stats-products]")) ?? "").includes(prod.name));
  check("המסך: מסביר שאין שמות", ((await owner.textContent("[data-testid=stats-privacy]")) ?? "").includes("לא שומרים מי נכנס"));
  if (process.env.SHOTS) await owner.screenshot({ path: `${process.env.SHOTS}/stats.png`, fullPage: true });
  await owner.click("[data-testid=stats-range-7]");
  await owner.waitForTimeout(800);
  check("מעבר ל-7 ימים", ((await owner.textContent("[data-testid=stats-chart]")) ?? "").includes("כניסות לפי יום"));

  /* ── 8. באנר "חדש בדוכן" ── */
  const { rows: [orig] } = await db.query("select created_at from stores where id=$1", [store.id]);
  await db.query("update stores set created_at='2026-01-01' where id=$1", [store.id]);
  await owner.evaluate(() => localStorage.removeItem("duchan-whatsnew-2026-10-new"));
  await owner.goto(`${BASE}/dashboard`);
  await owner.waitForSelector("[data-testid=whatsnew-banner]", { timeout: 15000 });
  const items = await owner.locator("[data-testid=whatsnew-banner] a").count();
  check("באנר 'חדש בדוכן' לדוכן ותיק, עם 7 דברים חדשים", items === 7, String(items));
  check("ובו 'מי מסתכל על הדוכן' ו'התראה על כל הזמנה'",
    (await owner.getAttribute("[data-testid=whatsnew-stats]", "href")) === "/dashboard/stats" &&
    (await owner.getAttribute("[data-testid=whatsnew-push]", "href")) === "/dashboard/settings#app");
  check("שורת 'מי מסתכל' בראש ההזמנות", await owner.locator("[data-testid=stats-peek]").isVisible());
  await owner.waitForFunction(() => /היום/.test(document.querySelector("[data-testid=stats-peek-text]")?.textContent ?? ""));
  check("…עם המספר של היום", ((await owner.textContent("[data-testid=stats-peek-text]")) ?? "").includes("נכנסו 4"));
  if (process.env.SHOTS) await owner.screenshot({ path: `${process.env.SHOTS}/whatsnew.png` });
  await owner.click("[data-testid=whatsnew-close]");
  await owner.reload();
  await owner.waitForSelector("[data-testid=stats-peek]");
  await owner.waitForTimeout(800);
  check("אחרי סגירה הבאנר לא חוזר", (await owner.locator("[data-testid=whatsnew-banner]").count()) === 0);
  await db.query("update stores set created_at=now() where id=$1", [store.id]);
  await owner.evaluate(() => localStorage.removeItem("duchan-whatsnew-2026-10-new"));
  await owner.reload();
  await owner.waitForSelector("[data-testid=stats-peek]");
  await owner.waitForTimeout(800);
  check("דוכן חדש לא מקבל את הבאנר", (await owner.locator("[data-testid=whatsnew-banner]").count()) === 0);
  await db.query("update stores set created_at=$1 where id=$2", [orig.created_at, store.id]);

  /* ── 9. החמ"ל ── */
  const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await adminCtx.newPage();
  await admin.goto(`${BASE}/login`);
  await verifyPhone(admin, "0509990000");
  await admin.waitForTimeout(1500);
  const ad = await (await admin.request.get(`${BASE}/api/admin/stats?range=today`)).json();
  check("החמ\"ל: כל הדוכנים", ad.live >= 3 && ad.totals.visits >= 3 && ad.stores?.some((x) => x.id === store.id), JSON.stringify({ live: ad.live, v: ad.totals?.visits }));
  check("והדוכן הזה לא רואה את הסיכום של החמ\"ל", (await owner.request.get(`${BASE}/api/admin/stats?range=today`)).status() === 403);
  await admin.goto(`${BASE}/admin`);
  await admin.waitForSelector("[data-testid=admin-stats]", { timeout: 20000 });
  check("החמ\"ל: המקטע 'מי מסתכל על הדוכנים'", true);

  check("בלי שגיאות בדפדפן", errs.length === 0, errs.join(" | "));
} finally {
  for (const t of ["store_stats", "product_stats", "store_presence"]) await db.query(`delete from ${t} where store_id=$1`, [store.id]);
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
