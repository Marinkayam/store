// E2E מלא: אונבורדינג → חנות → הזמנה → וואטסאפ → דשבורד → מלאי → הפסקה
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/e2e-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();

/* ── שלב 0: תמונת מוצר לבדיקה (לא ריבועית — לבדוק חיתוך) ── */
await page.goto(BASE);
const imgPath = `${shots}/test-product.png`;
await page.screenshot({ path: imgPath }); // 390×780 — רחוק מריבוע

/* ── שלב 1: אונבורדינג מלא ── */
await page.fill("input", "החנות של תמר");
await page.click("button:has-text('בואי נבנה')");
await page.waitForURL("**/onboarding");
await page.click("button:has-text('ממתק')");
await page.click("button:has-text('הלאה')");

await page.setInputFiles("input[type=file]", imgPath);
await page.waitForTimeout(1200); // squareImage רץ בדפדפן
await page.fill("input[placeholder='שם המוצר']", "סקוויש חד-קרן");
await page.fill("input[placeholder='מחיר (₪)']", "15");
await page.click("button:has-text('הלאה')");
await page.click("button:has-text('שמירת החנות')");

await page.fill("input[placeholder='הטלפון שלך (וואטסאפ)']", "050-123-4567"); // עם מקפים — בדיקת נרמול
await page.fill("input[placeholder='אימייל (איתו נכנסים לניהול)']", "tamar-e2e@test.com");
await page.fill("input[placeholder='סיסמה (6 תווים לפחות)']", "sqsq123!");
await page.click("button:has-text('שמירה ופתיחת החנות')");
await page.waitForSelector("text=הלינק שלך מוכן", { timeout: 20000 });
await page.screenshot({ path: `${shots}/10-link-ready.png` });

const urlText = await page.textContent("div[dir=ltr]");
const slug = urlText.trim().split("/s/")[1];
check("onboarding completes to link screen", !!slug, `slug=${slug}`);

/* ── שלב 2: אימות DB — נרמול טלפון, מוצר, תמונה ── */
const storeRow = (await db.query("select * from stores where slug=$1", [slug])).rows[0];
check("store created with random 5-char slug", slug?.length === 5);
check("phone normalized on save (050-123-4567 → 972501234567)", storeRow?.contact_phone === "972501234567", storeRow?.contact_phone);
check("theme saved", storeRow?.theme === "candy", storeRow?.theme);

const prodRow = (await db.query("select * from products where store_id=$1", [storeRow.id])).rows[0];
check("first product saved", prodRow?.name === "סקוויש חד-קרן" && prodRow?.price === 15);
check("product image uploaded to storage", !!prodRow?.image_key, prodRow?.image_key ?? "none");

if (prodRow?.image_key) {
  const img = await fetch(`http://localhost:9000/duchan-media/${prodRow.image_key}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const isWebp = buf.slice(8, 12).toString() === "WEBP";
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  check("uploaded image is webp/jpeg (canvas re-encode, EXIF gone)", img.ok && (isWebp || isJpeg), `${buf.length} bytes`);
  check("media_bytes quota updated", (await db.query("select media_bytes from stores where id=$1", [storeRow.id])).rows[0].media_bytes > 0);
}

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

await buyer.click("text=סקוויש חד-קרן");
await buyer.click("button:has-text('+'):visible");
await buyer.click("button:has-text('הוספה לסל')");
await buyer.click("text=2 פריטים");
await buyer.fill("input[placeholder*='הערה']", "אפשר בורוד?");
await buyer.screenshot({ path: `${shots}/12-order-sheet.png` });
await buyer.click("button:has-text('שליחה בוואטסאפ')");
await buyer.waitForTimeout(2500);

check("wa.me opened only after server confirmed", !!waUrl);
if (waUrl) {
  const msg = decodeURIComponent(new URL(waUrl).searchParams.get("text") ?? "");
  check("whatsapp targets normalized phone", waUrl.includes("wa.me/972501234567"));
  check("message has item line", msg.includes("סקוויש חד-קרן × 2 — ₪30"));
  check("message has total", msg.includes('סה"כ: ₪30'));
  check("message has note", msg.includes("אפשר בורוד?"));
  check("message has order number", msg.includes("הזמנה #1"));
}
const orderRow = (await db.query("select * from orders where store_id=$1", [storeRow.id])).rows[0];
check("order in DB: status sent, snapshot, total", orderRow?.status === "sent" && orderRow?.total === 30 && orderRow?.items[0].qty === 2);
check("stock NOT deducted on order creation", (await db.query("select stock from products where id=$1", [prodRow.id])).rows[0].stock === 4);

/* ── שלב 4: rate limit — 5 הזמנות מ-IP ליום ── */
let limited = false;
for (let i = 0; i < 6; i++) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ slug, items: [{ productId: prodRow.id, qty: 1 }] }),
  });
  if (r.status === 429) { limited = true; break; }
}
check("6th order from same IP hits 429 rate limit", limited);
await db.query("delete from orders where ip_hash is not null and buyer_note is null and order_number > 1"); // ניקוי הזמנות הבדיקה

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
check("storefront shows low-stock badge", (await buyer.textContent("body")).includes("נשארו 2"));

/* ── שלב 7: מצב חופשה ← החנות סגורה ← חזרה ── */
await page.goto(`${BASE}/dashboard/settings`);
await page.waitForSelector("text=החנות פתוחה");
await page.click("button[aria-label='פתיחה או הפסקה של החנות']");
await page.waitForSelector("text=החנות בהפסקה");
await new Promise((r) => setTimeout(r, 400));
const closedRes = await fetch(`${BASE}/s/${slug}`, { headers: { "Cache-Control": "no-cache" } });
const closedHtml = await closedRes.text();
check("paused store shows closed page to buyers", closedHtml.includes("החנות סגורה כרגע"));
await page.click("button[aria-label='פתיחה או הפסקה של החנות']");
await page.waitForSelector("text=החנות פתוחה");
check("store reopens", true);

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
