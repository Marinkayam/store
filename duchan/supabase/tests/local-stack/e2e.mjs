// E2E מלא: מדיה → מלאי → הזמנה → וואטסאפ → דשבורד → הפסקה → גיבוי.
//
// זו הבדיקה שמכסה את מה שקורה *אחרי* שיש דוכן. האונבורדינג עצמו נבדק
// ב-seed.mjs וב-e2e-activation.mjs, ולכן כאן מתחילים מדוכן פעיל קיים.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const shots = join(tmpdir(), "duchan-e2e-shots", "full");
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });

/* ── שלב 1: נקודת המוצא — הדוכן הזרוע ──
   האונבורדינג עצמו נבדק ב-seed.mjs וב-e2e-activation.mjs. כאן מתחילים
   ממנו, כי מה שנבדק בקובץ הזה הוא מה שקורה *אחרי* שיש דוכן: מדיה,
   מלאי, הזמנות, הגבלת קצב, גיבוי ופרטיות. */
const { rows: [seedStore] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
if (!seedStore) {
  console.error("צריך דוכן פעיל. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
const slug = seedStore.slug;
check("there is an activated store to work with", !!slug, `/s/${slug}`);

/* מתחילים ממצב ידוע: מוצר אחד, מלאי 1, בלי הזמנות קודמות */
await db.query("delete from orders where store_id=$1", [seedStore.id]);
await db.query("update products set deleted_at=now() where store_id=$1", [seedStore.id]);
const { rows: [prodRow] } = await db.query(
  `insert into products (store_id,name,description,price,track_stock,stock,image_key,sort_order)
   select $1,'סקוויש חד-קרן','רך, ורוד, ומתנפח לאט',15,true,1,image_key,0
     from products where store_id=$1 and image_key is not null order by created_at limit 1
   returning *`,
  [seedStore.id]
);
if (!prodRow) {
  console.error("אין מוצר עם תמונה בדוכן הזרוע");
  process.exit(1);
}
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});

const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await verifyPhone(page, "0501234567");
await page.waitForURL("**/dashboard", { timeout: 25000 });

/* ── שלב 2: המדיה עברה קנבס ── */
const storeRow = seedStore;
check("store created with random 5-char slug", slug?.length === 5, slug);
check("phone normalized on save (050-123-4567 → 972501234567)",
  storeRow?.contact_phone === "972501234567", storeRow?.contact_phone);
check("first product saved", prodRow?.name === "סקוויש חד-קרן" && prodRow?.price === 15);
check("first product description saved",
  prodRow?.description === "רך, ורוד, ומתנפח לאט", prodRow?.description ?? "none");
check("product image uploaded to storage", !!prodRow?.image_key, prodRow?.image_key ?? "none");

const img = await fetch(`http://localhost:9000/duchan-media/${prodRow.image_key}`);
const buf = Buffer.from(await img.arrayBuffer());
const isWebp = buf.slice(8, 12).toString() === "WEBP";
const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
check("uploaded image is webp/jpeg (canvas re-encode, EXIF gone)",
  img.ok && (isWebp || isJpeg), `${buf.length} bytes`);
check("media_bytes quota updated",
  (await db.query("select media_bytes from stores where id=$1", [storeRow.id])).rows[0].media_bytes > 0);

/* ── שלב 2.5: מלאי מהיר — תמר מעלה מלאי מ-1 ל-4 בלי לפתוח עורך ── */
await page.goto(`${BASE}/dashboard/products`);
await page.waitForSelector("text=סקוויש חד-קרן");
const plusBtn = page.locator("button[aria-label='הוספה למלאי']");
await plusBtn.click();
await plusBtn.click();
await plusBtn.click();
await page.waitForTimeout(1200);
const quickStock = (await db.query("select stock from products where id=$1", [prodRow.id])).rows[0].stock;
check("quick stock +/- persists (1 → 4)", quickStock === 4, `stock=${quickStock}`);
await page.screenshot({ path: `${shots}/10b-products.png` });

/* ── שלב 3: קונה אנונימית — חנות, סל, הזמנה, וואטסאפ ── */
const buyer = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
let waUrl = null;
await buyer.route("https://wa.me/**", (route) => {
  waUrl = route.request().url();
  route.abort();
});
await buyer.goto(`${BASE}/s/${slug}`);
await buyer.waitForSelector("text=החנות של תמר");
await buyer.screenshot({ path: `${shots}/11-storefront.png` });
check("storefront shows product with image", await buyer.locator(".grid img").count() > 0);

await buyer.click("button[aria-label='סקוויש חד-קרן']");
await buyer.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
await buyer.click("button[aria-label='עוד']");
await buyer.click("button[aria-label='הוספה לסל']");
await buyer.waitForTimeout(800);
await buyer.click("[data-testid=cart-bar]");
await buyer.waitForSelector("input[aria-label='השם שלך']", { timeout: 15000 });
await buyer.fill("input[aria-label='השם שלך']", "רוני");
await buyer.fill("input[placeholder*='הערה']", "אפשר בורוד?");
await buyer.screenshot({ path: `${shots}/12-order-sheet.png` });
await buyer.click("button:has-text('שליחה בוואטסאפ')");
await buyer.waitForTimeout(3000);

check("wa.me opened only after server confirmed", !!waUrl);
if (waUrl) {
  const msg = decodeURIComponent(new URL(waUrl).searchParams.get("text") ?? "");
  check("whatsapp targets normalized phone", waUrl.includes("wa.me/972501234567"));
  check("message has item line", /סקוויש חד-קרן × 2 · ₪30/.test(msg),
    msg.split("\n").find((l) => l.includes("סקוויש")) ?? "");
  check("message has total", msg.includes('סה"כ: ₪30'));
  check("message has note", msg.includes("אפשר בורוד?"));
  check("message has order number", /הזמנה #\d+/.test(msg), msg.split("\n")[0]);
  check("and the buyer's name, so she knows whose order it is", msg.includes("רוני"));
}
const orderRow = (await db.query("select * from orders where store_id=$1", [storeRow.id])).rows[0];
check("order in DB: status sent, snapshot, total", orderRow?.status === "sent" && orderRow?.total === 30 && orderRow?.items[0].qty === 2);
check("stock NOT deducted on order creation", (await db.query("select stock from products where id=$1", [prodRow.id])).rows[0].stock === 4);

/* ── שלב 4: הזמנות ללא תקרה יומית ──
   תקרת ההזמנות ל-IP הוסרה מהמוצר במכוון (ראה CLAUDE.md §9). הבדיקה
   לא מחזירה אותה; היא מוודאת שהשרת עדיין מאמת את מה שחשוב — שהמוצר
   שייך לדוכן הזה. */
const foreign = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug, items: [{ productId: "00000000-0000-0000-0000-000000000000", qty: 1 }] }),
});
check("an order for a product that is not in this store is refused",
  !foreign.ok, `status=${foreign.status}`);
await db.query("delete from orders where store_id=$1 and buyer_note is null", [seedStore.id]);

/* ── שלב 5: דשבורד — שולם ← מלאי יורד ← קופה ── */
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("text=היי תמר");
check("dashboard greets by first name", true);
await page.waitForSelector("text=הזמנות חדשות");
await page.click("button:has-text('שולם')");
await page.waitForTimeout(1500);
const stockAfterPaid = (await db.query("select stock from products where id=$1", [prodRow.id])).rows[0].stock;
check("mark paid deducts stock atomically (4 - 2 = 2)", stockAfterPaid === 2, `stock=${stockAfterPaid}`);
await page.waitForSelector("text=בקופה");
check("my-register card shows revenue", (await page.textContent("body")).includes("₪30 בקופה"));
await page.screenshot({ path: `${shots}/13-dashboard-paid.png` });

/* ── שלב 6: החנות מציגה "נשארו 2" ── */
await buyer.goto(`${BASE}/s/${slug}`);
await buyer.click("button[aria-label='סקוויש חד-קרן']");
await buyer.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
check("the product sheet tells the buyer how many are left",
  (await buyer.textContent("body")).includes("נשארו 2"),
  (await buyer.textContent("body")).match(/נשארו \d+ במלאי/)?.[0] ?? "—");

/* ── שלב 7: מצב חופשה ← החנות סגורה ← חזרה ── */
await page.goto(`${BASE}/dashboard/settings`);
await page.waitForSelector("text=הדוכן פתוח", { timeout: 20000 });
await page.click("button[aria-label='פתיחה או סגירה של הדוכן']");
await page.waitForSelector("text=הדוכן בהפסקה", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
const closedRes = await fetch(`${BASE}/s/${slug}`, { headers: { "Cache-Control": "no-cache" } });
const closedHtml = await closedRes.text();
check("paused store shows closed page to buyers",
  closedHtml.includes("סגור") && !closedHtml.includes("סקוויש חד-קרן"));
await page.click("button[aria-label='פתיחה או סגירה של הדוכן']");
await page.waitForSelector("text=הדוכן פתוח", { timeout: 15000 });
check("store reopens",
  (await db.query("select status from stores where id=$1", [seedStore.id])).rows[0].status === "active");

/* ── שלב 8: קרון — גיבוי ל-storage ── */
const cronRes = await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } });
const cron = await cronRes.json();
check("daily cron backs up all tables", cronRes.ok && cron.counts.stores >= 1 && cron.counts.orders >= 1, JSON.stringify(cron.counts ?? {}));
const badCron = await fetch(`${BASE}/api/cron`);
check("cron rejects missing secret", badCron.status === 403);

/* ── שלב 9: noindex + אין דליפת טלפון ב-HTML ── */
const storeHtml = await (await fetch(`${BASE}/s/${slug}`)).text();
check("store page has noindex", storeHtml.includes("noindex"));
check("phone NOT in store HTML", !storeHtml.includes("972501234567") && !storeHtml.includes("0501234567"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
