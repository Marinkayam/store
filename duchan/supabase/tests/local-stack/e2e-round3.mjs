// E2E: סבב רעיונות 3. מרינה, 11.2026: "כן תתחיל הכל".
//
// החוזים:
//   1. שלבי ההזמנה נספרים (0075): פתחו את הסל, נעצרו בטופס, לחצו לשלוח.
//      ובמסך "מי מסתכל על הדוכן" יש "פתחו את הסל" ו"לחצו לשלוח".
//   2. לחיצה על מוצר שאזל: הקונה רואה "בעלי הדוכן יראו שרציתם אותו", זה
//      נספר, ובעלי הדוכן רואים "רצו מוצרים שאזלו" עם כפתור שפותח את המוצר.
//   3. מוצרים בלי תמונה: כרטיס במסך המוצרים, והכפתור פותח את הראשון.
//   4. קופון מוכן: "חברים10" בלחיצה, 10% ל-10 קונים לשבועיים, ושליחה בוואטסאפ.
//   5. חגים: ?season=… מציג את הקישוט של החג על הדוכן ושרשרת בראש הדוכן.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

const { rows: [store] } = await db.query(
  "select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1"
);
// "רצו מוצר שאזל" נספר רק בדוכן שמציג מוצרים שאזלו (show_sold_out)
await db.query("update stores set status='active', ships=false, show_sold_out=true where id=$1", [store.id]);
// מוצר אחד זמין, ומוצר אחד שאזל
const { rows: [ok] } = await db.query(
  "insert into products (store_id, name, price, stock, track_stock, image_key) values ($1,'סבב3 זמין',10,20,true,'/demo/bao.webp') returning id", [store.id]);
const { rows: [gone] } = await db.query(
  "insert into products (store_id, name, price, stock, track_stock, image_key) values ($1,'סבב3 אזל',10,0,true,'/demo/cheese.webp') returning id", [store.id]);
const { rows: [bare] } = await db.query(
  "insert into products (store_id, name, price, stock, track_stock) values ($1,'סבב3 בלי תמונה',10,5,true) returning id", [store.id]);
const sumToday = async (col) =>
  Number((await db.query(`select coalesce(sum(${col}),0) n from store_stats where store_id=$1 and day=$2`, [store.id, today])).rows[0].n);
const before = { checkouts: await sumToday("checkouts"), blocked: await sumToday("blocked"), submits: await sumToday("submits") };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  /* בעלי הדוכן מתחברים קודם: רענון הדף הציבורי (/api/revalidate) רק לבעלים */
  const me = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await me.goto(`${BASE}/login`);
  await verifyPhone(me, "0501234567");
  await me.waitForURL("**/dashboard", { timeout: 20000 });
  await me.evaluate(async (slug) => {
    await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
  }, store.slug);

  /* ── 1+2. קונה ── */
  const buyer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  await buyer.waitForTimeout(800);
  await buyer.click("button[aria-label='סבב3 אזל']");
  await buyer.waitForTimeout(400);
  check("מוצר שאזל: 'בעלי הדוכן יראו שרציתם אותו'", ((await buyer.textContent("body")) ?? "").includes("יראו שרציתם אותו"));
  await buyer.click("button[aria-label='סבב3 זמין']");
  await buyer.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
  await buyer.click("button[aria-label='הוספה לסל']");
  await buyer.waitForTimeout(600);
  await buyer.click("[data-testid=cart-bar]");
  await buyer.waitForSelector("input[aria-label='מספר טלפון']", { timeout: 15000 });
  await buyer.click("button:has-text('שליחת ההזמנה')"); // בלי שם: נעצר
  await buyer.waitForTimeout(400);
  await buyer.fill("input[aria-label='השם שלכם'], input[aria-label='שם ושם משפחה']", "נגה");
  await buyer.fill("input[aria-label='מספר טלפון']", "052-000-3333");
  await buyer.click("button:has-text('שליחת ההזמנה')");
  await buyer.locator("[data-testid=order-pay-first], [data-testid=order-confirmed]").first().waitFor({ timeout: 15000 });
  await buyer.waitForTimeout(1500);
  const after = { checkouts: await sumToday("checkouts"), blocked: await sumToday("blocked"), submits: await sumToday("submits") };
  check("נספר: פתחו את הסל", after.checkouts === before.checkouts + 1, `${before.checkouts}→${after.checkouts}`);
  check("נספר: נעצרו בטופס", after.blocked === before.blocked + 1, `${before.blocked}→${after.blocked}`);
  check("נספר: לחצו לשלוח (פעם אחת לביקור)", after.submits === before.submits + 1, `${before.submits}→${after.submits}`);
  const { rows: [w] } = await db.query("select coalesce(sum(wanted),0) n from product_stats where product_id=$1", [gone.id]);
  check("נספר: ניסו לקנות מוצר שאזל", Number(w.n) >= 1, String(w.n));

  /* ── בעלי הדוכן ── */
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const wc = me.locator("[data-testid=wanted-card]");
  await wc.waitFor({ timeout: 15000 });
  check("'רצו מוצרים שאזלו' עם המוצר", ((await wc.textContent()) ?? "").includes("סבב3 אזל"));
  await wc.locator("a", { hasText: "להוסיף למלאי" }).first().click();
  await me.waitForSelector("#ed-name", { timeout: 15000 });
  check("'להוסיף למלאי' פותח את המוצר לעריכה", (await me.inputValue("#ed-name")) === "סבב3 אזל");

  await me.goto(`${BASE}/dashboard/stats`, { waitUntil: "networkidle" });
  await me.waitForSelector("[data-testid=stats-funnel]", { timeout: 15000 });
  check("בסטטיסטיקה: 'פתחו את הסל' ו'לחצו לשלוח'",
    (await me.locator("[data-testid=stats-funnel-checkouts]").count()) === 1 && (await me.locator("[data-testid=stats-funnel-submits]").count()) === 1);

  /* ── 3. בלי תמונה ── */
  await me.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  const np = me.locator("[data-testid=no-photo-card]");
  await np.waitFor({ timeout: 15000 });
  check("כרטיס 'מוצרים בלי תמונה'", ((await np.textContent()) ?? "").includes("בלי תמונה"));
  await me.click("[data-testid=no-photo-fix]");
  await me.waitForSelector("#ed-name", { timeout: 15000 });
  const opened = await me.inputValue("#ed-name");
  const { rows: bareNames } = await db.query(
    "select name from products where store_id=$1 and deleted_at is null and coalesce(image_key,'')='' and coalesce(video_key,'')='' and (is_visible is null or is_visible)", [store.id]);
  check("'להוסיף תמונה' פותח מוצר בלי תמונה", bareNames.some((r) => r.name === opened), opened);

  /* ── 4. קופון מוכן ── */
  await db.query("update coupons set deleted_at=now() where store_id=$1 and deleted_at is null", [store.id]);
  await me.goto(`${BASE}/dashboard/settings#coupons`, { waitUntil: "networkidle" });
  await me.locator("[data-testid=preset-coupon-create]").waitFor({ timeout: 15000 }).catch(async () => {
    const det = me.locator("details:has([data-testid=preset-coupon]) summary");
    if (await det.count()) await det.first().click();
  });
  await me.locator("[data-testid=preset-coupon-create]").scrollIntoViewIfNeeded();
  await me.click("[data-testid=preset-coupon-create]");
  await me.waitForSelector("[data-testid=preset-coupon-share]", { timeout: 15000 });
  const { rows: [c] } = await db.query("select code, kind, value, max_uses, expires_at from coupons where store_id=$1 and deleted_at is null order by created_at desc limit 1", [store.id]);
  const days = c ? Math.round((new Date(c.expires_at).getTime() - Date.now()) / 864e5) : 0;
  check("קופון מוכן: חברים10, 10%, 10 שימושים, שבועיים", !!c && c.code === "חברים10" && c.kind === "percent" && Number(c.value) === 10 && c.max_uses === 10 && days >= 13 && days <= 15, JSON.stringify(c));
  const share = decodeURIComponent((await me.getAttribute("[data-testid=preset-coupon-share]", "href")) ?? "");
  check("ושליחה לחברים עם הקוד והלינק", share.includes("חברים10") && share.includes(`/${store.slug}`));
  await db.query("update coupons set deleted_at=now() where store_id=$1 and code='חברים10'", [store.id]);

  /* ── 5. חגים ── */
  const g = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  for (const s of ["tubishvat", "purim", "pesach", "atzmaut", "roshhashana"]) {
    await g.goto(`${BASE}/?season=${s}`, { waitUntil: "networkidle" });
    await g.waitForSelector("[data-testid=season-stall]", { timeout: 10000 });
    check(`חג: ${s} מופיע על הדוכן`, (await g.getAttribute("[data-testid=season-stall]", "data-season")) === s);
  }
  await g.goto(`${BASE}/s/${store.slug}?season=purim`, { waitUntil: "networkidle" });
  check("שרשרת החג בראש הדוכן", await g.locator("[data-testid=season-garland]").isVisible());
} finally {
  await browser.close();
  await closeHelper();
  await db.query("update products set deleted_at=now() where id = any($1)", [[ok.id, gone.id, bare.id]]);
  await db.query("update orders set deleted_at=now() where store_id=$1 and buyer_name='נגה'", [store.id]);
  await db.query("update stores set show_sold_out=$2 where id=$1", [store.id, store.show_sold_out]);
}

await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
