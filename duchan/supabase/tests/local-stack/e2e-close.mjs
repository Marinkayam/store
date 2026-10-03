// E2E: ✕ לסגירה בכל גיליון — "גם צריך להיות פה איקס".
// עורך מוצר, מוצרים שנמחקו (מוכרים) · גיליון מוצר וסל (קונים).
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
const page = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const box44 = async (p, sel) => {
  const b = await p.locator(sel).first().boundingBox();
  return !!b && b.width >= 44 && b.height >= 44;
};

/* ── מוכרים: עורך מוצר ── */
const girl = await page();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("[data-testid=editor-close]");
check("עורך מוצר: יש ✕", true);
check("בגודל אצבע (44px)", await box44(girl, "[data-testid=editor-close]"));
await girl.click("[data-testid=editor-close]");
await girl.waitForTimeout(300);
check("✕ סוגר את העורך", (await girl.locator("input[aria-label='שם המוצר']").count()) === 0);

/* ── קונים: גיליון מוצר וסל ── */
const buyer = await page();
await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
const { rows: [prod] } = await db.query(
  `select p.name from products p join stores s on s.id=p.store_id where s.slug=$1 and p.deleted_at is null
     and (p.is_visible is null or p.is_visible) and (not p.track_stock or p.stock > 0) order by p.sort_order, p.created_at limit 1`, [store.slug]);
await buyer.click(`.s-look button[aria-label='${prod.name}']`);
await buyer.waitForTimeout(500);
const productOpen = await buyer.locator("[data-testid=product-close]").count();
if (productOpen) {
  check("גיליון מוצר: יש ✕", await box44(buyer, "[data-testid=product-close]"));
  await buyer.click("[data-testid=product-close]");
  await buyer.waitForTimeout(300);
  check("✕ סוגר את גיליון המוצר", (await buyer.locator("[data-testid=product-close]").count()) === 0);
} else {
  check("גיליון מוצר נפתח בלחיצה על מוצר", false);
}
await buyer.locator("button[aria-label^='הוספה מהירה']:not([aria-label*='גרבי צבעים'])").first().click();
await buyer.waitForTimeout(600);
await buyer.click("[data-testid=cart-bar]");
await buyer.waitForSelector("[data-testid=order-close]");
check("סל: יש ✕", await box44(buyer, "[data-testid=order-close]"));
await buyer.click("[data-testid=order-close]");
await buyer.waitForTimeout(300);
check("✕ סוגר את הסל, והסל נשמר", (await buyer.locator("[data-testid=order-close]").count()) === 0 &&
  (await buyer.locator("[data-testid=cart-bar]").count()) === 1);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} close-button checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
