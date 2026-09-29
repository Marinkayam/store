// E2E: מוצרים שאזלו יורדים מהדוכן, וחלק "המומלצים" (מיגרציה 0053).
//
// הבקשה: "ברגע שהם ייגמרו לא להציג אותם יותר באתר... ושיהיה כתוב משפט,
// נגיד המומלצים, וזה לא קטגוריה — זה פשוט מופיע שם."
//
// החוזים:
//   1. מוצר שאזל לא מופיע בדוכן (ולא נמחק — חוזר כשיש מלאי).
//   2. חנות שבחרה "להציג גם מוצרים שאזלו" רואה אותו עם "אזל".
//   3. ⭐ מומלץ נשמר מהעורך, ומופיע בחלק עם כותרת בראש הדוכן.
//   4. הכותרת ניתנת לשינוי בהגדרות.
//   5. כשבוחרים קטגוריה — רק היא, בלי חלק המומלצים.
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

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
if (!store) {
  console.error("צריך דוכן פעיל. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
const { rows: prods } = await db.query(
  `select id, name, stock, track_stock, featured, categories, category from products
    where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
    order by sort_order, created_at limit 3`,
  [store.id]
);
if (prods.length < 3) {
  console.error("צריך לפחות 3 מוצרים בדוכן");
  process.exit(1);
}
const [outP, featP, plainP] = prods;
await db.query("update stores set show_sold_out=null, featured_title=null, categories=$1 where id=$2", [["א-קט", "ב-קט"], store.id]);
await db.query("update products set featured=null where store_id=$1", [store.id]);
await db.query("update products set track_stock=true, stock=0 where id=$1", [outP.id]);
await db.query("update products set track_stock=true, stock=5, categories=$1 where id=$2", [["א-קט"], featP.id]);
await db.query("update products set track_stock=true, stock=5, categories=$1 where id=$2", [["ב-קט"], plainP.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;
const card = (page, name) => page.locator(`.s-look button[aria-label='${name}']`);

/* ── 1. מוצר שאזל יורד מהדוכן ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("מוצר שאזל לא מופיע בדוכן", (await card(buyer, outP.name).count()) === 0);
check("ואין תווית 'אזל' בכלל", (await buyer.locator("span:text-is('אזל')").count()) === 0);
check("מוצר במלאי כן מופיע", (await card(buyer, featP.name).count()) === 1);
check("ובלי מומלצים — אין חלק מומלצים", (await buyer.locator("[data-testid=featured-section]").count()) === 0);
const { rows: [still] } = await db.query("select deleted_at from products where id=$1", [outP.id]);
check("המוצר לא נמחק, רק מוסתר", still.deleted_at === null);

// מלאי חוזר → המוצר חוזר
await db.query("update products set stock=2 where id=$1", [outP.id]);
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("כשיש שוב מלאי — חוזר לדוכן לבד", (await card(buyer, outP.name).count()) === 1);
await db.query("update products set stock=0 where id=$1", [outP.id]);

/* ── 2. המוכרת: ⭐ מומלץ מהעורך, כותרת והצגת אזל מההגדרות ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.locator(`text=${featP.name}`).first().click();
await girl.waitForSelector("[data-testid=featured-toggle]", { timeout: 10000 });
check("בעורך יש מתג מומלץ, כבוי", (await girl.getAttribute("[data-testid=featured-toggle]", "aria-pressed")) === "false");
await girl.click("[data-testid=featured-toggle]");
check("לחיצה מדליקה", (await girl.getAttribute("[data-testid=featured-toggle]", "aria-pressed")) === "true");
await girl.click("button:has-text('שמירה')");
await girl.waitForTimeout(2500);
const { rows: [f1] } = await db.query("select featured from products where id=$1", [featP.id]);
check("מומלץ נשמר", f1.featured === true, String(f1.featured));
check("וברשימת המוצרים מופיע ★", (await girl.locator("[aria-label='מומלץ']").count()) >= 1);

await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("[data-testid=products-display]", { timeout: 20000 });
check("בהגדרות: הצגת 'אזל' כבויה כברירת מחדל",
  (await girl.getAttribute("[data-testid=show-sold-out-toggle]", "aria-pressed")) === "false");
await girl.fill("input[aria-label='כותרת המומלצים']", "הכי שווים עכשיו");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [s1] } = await db.query("select featured_title, show_sold_out from stores where id=$1", [store.id]);
check("הכותרת נשמרה", s1.featured_title === "הכי שווים עכשיו", String(s1.featured_title));

/* ── 3. הקונה רואה את המומלצים ── */
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const title = (await buyer.textContent("[data-testid=featured-title]").catch(() => "")) ?? "";
check("חלק המומלצים עם הכותרת שבחרה", title.includes("הכי שווים עכשיו"), title);
check("המוצר המומלץ בתוך החלק",
  (await buyer.locator(`[data-testid=featured-section] button[aria-label='${featP.name}']`).count()) === 1);
check("ומתחתיו 'עוד מוצרים' עם השאר",
  (await buyer.locator("[data-testid=rest-title]").count()) === 1 &&
  (await buyer.locator(`[data-testid=featured-section] button[aria-label='${plainP.name}']`).count()) === 0);
const fBox = await buyer.locator("[data-testid=featured-section]").boundingBox();
const rBox = await buyer.locator("[data-testid=rest-title]").boundingBox();
check("המומלצים למעלה, השאר אחריהם", !!fBox && !!rBox && fBox.y < rBox.y);
await buyer.screenshot({ path: "/tmp/featured-store.png", fullPage: true });

// קטגוריה → רק היא, בלי חלק המומלצים
await buyer.click("[data-testid=category-chips] button[aria-label='ב-קט']");
await buyer.waitForTimeout(300);
check("בבחירת קטגוריה — בלי חלק המומלצים", (await buyer.locator("[data-testid=featured-section]").count()) === 0);
check("ורק המוצרים שלה", (await card(buyer, plainP.name).count()) === 1 && (await card(buyer, featP.name).count()) === 0);

/* ── 4. חנות שבוחרת להציג אזל ── */
await girl.click("[data-testid=show-sold-out-toggle]");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [s2] } = await db.query("select show_sold_out from stores where id=$1", [store.id]);
check("הצגת אזל נשמרה", s2.show_sold_out === true);
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("עכשיו המוצר שאזל מופיע", (await card(buyer, outP.name).count()) === 1);
check("עם 'אזל'", (await buyer.locator("span:text-is('אזל')").count()) >= 1);

/* ── ניקוי ── */
await db.query("update stores set show_sold_out=null, featured_title=null, categories=$1 where id=$2", [store.categories, store.id]);
for (const p of prods) {
  await db.query("update products set stock=$1, track_stock=$2, featured=$3, categories=$4, category=$5 where id=$6",
    [p.stock, p.track_stock, p.featured, p.categories, p.category, p.id]);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} featured + sold-out checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
