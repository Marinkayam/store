// E2E לאפשרויות מוצר, רצועת "אזל", כפתור "+ מוצר חדש", רצועת הבעלים,
// ומחיקה/הסתרה/עריכה של מוצר מהחמ"ל.
// רץ אחרי e2e.mjs → e2e-activation.mjs (משתמש בחנות המופעלת שהן יצרו).
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/options-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
const slug = store.slug;

// הסוויטה יוצרת "צמיד קשת" בכל ריצה. בלי הניקוי הזה נערמים כמה מוצרים
// באותו שם, והבודקים תופסים את הכרטיס של ריצה קודמת במקום את זה שנוצר עכשיו.
await db.query("delete from products where name = 'צמיד קשת'");
// מגבלת ההזמנות היא 5 ל-IP לחנות ליום, וריצות חוזרות ממצות אותה — ואז
// הבדיקות של דחיית בחירה שגויה מקבלות 429 במקום 400 ונראות כמו באג
await db.query("delete from orders where ip_hash is not null and created_at > now() - interval '1 day'");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

/* ── 1. הילדה מוסיפה מוצר עם אפשרויות ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });

// הכפתור הצף היה עיגול "+" בלי מילה, וקל היה לפספס אותו
const addBtn = girl.locator("button[aria-label='מוצר חדש']");
check("the add button says what it does, not just '+'", (await addBtn.textContent())?.includes("מוצר חדש"));
await girl.screenshot({ path: `${shots}/60-products-add-button.png` });

await addBtn.click();
await girl.fill("input[aria-label='שם המוצר']", "צמיד קשת");
await girl.fill("input[aria-label='מחיר']", "25");
await girl.fill("input[aria-label='שם האפשרות']", "צבע");
await girl.fill("input[aria-label='הבחירות']", "ורוד, כחול, ורוד, ");
await girl.waitForTimeout(200);
// הכפילות והרווח הריק נופלים — אחרת היא רואה 4 שבבים ובחנות יש 2
const chips = await girl.locator("[data-chip='option']").allTextContents();
check("duplicate and empty choices are dropped in the preview", chips.length === 2, chips.join("·"));
await girl.screenshot({ path: `${shots}/61-options-editor.png` });
await girl.click("button:has-text('שמירה')");
await girl.waitForTimeout(2500);

const { rows: [bracelet] } = await db.query(
  "select * from products where store_id=$1 and name='צמיד קשת' and deleted_at is null", [store.id]
);
check("option label saved", bracelet?.option_label === "צבע", bracelet?.option_label ?? "—");
check("choices saved deduped, in order", JSON.stringify(bracelet?.options) === '["ורוד","כחול"]', JSON.stringify(bracelet?.options));

// המלאי בעורך הוא 1 כברירת מחדל, וכאן צריך שני צבעים בסל
await db.query("update products set stock=9 where id=$1", [bracelet.id]);
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});

/* ── 2. הקונה חייבת לבחור לפני שהיא מוסיפה לסל ── */
const buyer = await phone();
await buyer.goto(`${BASE}/s/${slug}`, { waitUntil: "networkidle" });
const card = () => buyer.locator("button", { hasText: "צמיד קשת" }).first();
const sheetGone = () => buyer.locator('div[class*="bg-black/45"]').first().waitFor({ state: "detached" });
await card().click();
await buyer.waitForSelector("text=צבע");
const beforePick = buyer.locator("button:has-text('קודם בוחרים')");
check("add-to-cart is blocked until she picks", (await beforePick.count()) === 1 && !(await beforePick.isEnabled()));
await buyer.screenshot({ path: `${shots}/62-must-pick.png` });

await buyer.locator("button:text-is('כחול')").click();
await buyer.locator("button[aria-label='הוספה לסל']").click();
await sheetGone();
check("cart accepts the product once a choice is made", (await buyer.textContent("body")).includes("פריטים"));

/* ── 3. אותו מוצר בשני צבעים = שתי שורות בסל ── */
await card().click();
await buyer.waitForSelector("text=צבע");
await buyer.locator("button:text-is('ורוד')").click();
await buyer.locator("button[aria-label='הוספה לסל']").click();
await sheetGone();
await buyer.click("text=פריטים");
await buyer.waitForSelector("text=ההזמנה שלך");
// נבדק על שורות הסל ולא על גוף הדף: ה-placeholder של ההערה הוא "אפשר בורוד?"
const lines = await buyer.locator("[data-line-name]").allTextContents();
check("the two colours are two separate cart lines",
  lines.length === 2 && lines.some((l) => l.includes("(כחול)")) && lines.some((l) => l.includes("(ורוד)")),
  lines.join(" | "));
await buyer.screenshot({ path: `${shots}/63-cart-two-options.png`, fullPage: true });

/* ── 4. הבחירה נכנסת להזמנה ולהודעת הוואטסאפ ── */
let waUrl = "";
buyer.on("framenavigated", (f) => {
  if (f.url().startsWith("https://wa.me/")) waUrl = f.url();
});
await buyer.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "ok" }));
await buyer.locator("button:text-is('שליחה בוואטסאפ')").click();
await buyer.waitForTimeout(2500);
const msg = decodeURIComponent(waUrl);
check("the chosen colour is in the whatsapp message", msg.includes("כחול") && msg.includes("ורוד"), waUrl ? "ok" : "no wa.me navigation");

const { rows: [order] } = await db.query(
  "select * from orders where store_id=$1 order by created_at desc limit 1", [store.id]
);
const opts = (order?.items ?? []).map((i) => i.option).filter(Boolean).sort();
check("order snapshot stores the choice per line", JSON.stringify(opts) === '["ורוד","כחול"]', JSON.stringify(opts));

/* ── 5. השרת לא סומך על הלקוח גם באפשרויות ── */
const bogus = await fetch(`${BASE}/api/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug, items: [{ productId: bracelet.id, qty: 1, option: "זהב 24 קראט" }] }),
});
check("server rejects an option that isn't on the product", bogus.status === 400, `status=${bogus.status}`);
const missing = await fetch(`${BASE}/api/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug, items: [{ productId: bracelet.id, qty: 1 }] }),
});
check("server rejects a missing option", missing.status === 400, `status=${missing.status}`);

/* ── 6. "אזל" — רצועה על התמונה, לא שבב בפינה ── */
await db.query("update products set track_stock=true, stock=0 where id=$1", [bracelet.id]);
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});
const outPage = await phone();
await outPage.goto(`${BASE}/s/${slug}`, { waitUntil: "networkidle" });
const band = outPage.locator("span:text-is('אזל')").first();
await band.waitFor({ timeout: 10000 });
const box = await band.boundingBox();
const cardBox = await outPage.locator("button", { hasText: "צמיד קשת" }).first().boundingBox();
// רצועה = רחבה כמו הכרטיס ולא בפינה
check("'אזל' spans the card, not a corner chip", box.width > cardBox.width * 0.9, `${Math.round(box.width)}px of ${Math.round(cardBox.width)}px`);
check("'אזל' sits over the image, not under the price", box.y < cardBox.y + cardBox.height * 0.6);
await outPage.screenshot({ path: `${shots}/64-sold-out-band.png` });
await db.query("update products set stock=5 where id=$1", [bracelet.id]);
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});

/* ── 7. רצועת הבעלים: הילדה רואה חנות + ניהול, הקונה רק חנות ── */
const stranger = await phone();
await stranger.goto(`${BASE}/s/${slug}`, { waitUntil: "networkidle" });
const strangerBody = await stranger.textContent("body");
check("a buyer sees no management strip at all", !strangerBody.includes("זו החנות שלך"));
check("a buyer gets no dashboard links", (await stranger.locator("a[href='/dashboard/products']").count()) === 0);

await girl.goto(`${BASE}/s/${slug}`, { waitUntil: "networkidle" });
await girl.waitForSelector("text=זו החנות שלך", { timeout: 10000 });
check("the girl sees her store and the way into management", true);
check("the strip links to orders, products and design",
  (await girl.locator("a[href='/dashboard']").count()) >= 1 &&
  (await girl.locator("a[href='/dashboard/products']").count()) === 1 &&
  (await girl.locator("a[href='/dashboard/settings']").count()) === 1);
check("the strip explains this is the buyers' view", (await girl.textContent("body")).includes("ככה הקונות רואות אותה"));
await girl.screenshot({ path: `${shots}/65-owner-strip.png` });

/* ── 8. החמ"ל: הסתרה, מחיקה רכה, שחזור, עריכה ── */
const admin = await (await browser.newContext({ viewport: { width: 720, height: 900 } })).newPage();
await admin.goto(`${BASE}/login`);
await fetch("http://localhost:8000/auth/v1/signup", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@duchan.test", password: "admin123!" }),
});
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector('text=חמ"ל', { timeout: 15000 });
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(500);
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("text=צמיד קשת");

// שורת המוצר בתיק החנות: ה-div הפנימי ביותר שמכיל גם את השם וגם את הכפתור.
// "last div containing the name" לבדו תופס את ה-div של הטקסט, בלי הכפתורים.
const rowBtn = (label) =>
  admin
    .locator("div")
    .filter({ hasText: "צמיד קשת" })
    .filter({ has: admin.locator(`button[aria-label='${label}']`) })
    .last()
    .locator(`button[aria-label='${label}']`);

await rowBtn("הסתרה").click();
await admin.waitForTimeout(1500);
const { rows: [hidden] } = await db.query("select is_visible from products where id=$1", [bracelet.id]);
check("admin hides a product", hidden.is_visible === false);
const hiddenStore = await (await fetch(`${BASE}/s/${slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("a hidden product is gone from the live store", !hiddenStore.includes("צמיד קשת"));
await admin.screenshot({ path: `${shots}/66-admin-hidden.png`, fullPage: true });

await rowBtn("הצגה").click();
await admin.waitForTimeout(1500);
const { rows: [shown] } = await db.query("select is_visible from products where id=$1", [bracelet.id]);
check("admin puts it back", shown.is_visible === true);

// עריכה: שם, מחיר, מלאי
await rowBtn("עריכה").click();
await admin.fill("input[aria-label='מחיר']", "44");
await admin.fill("input[aria-label='מלאי']", "9");
await admin.locator("button:text-is('שמירה')").last().click();
await admin.waitForTimeout(1800);
const { rows: [edited] } = await db.query("select price, stock from products where id=$1", [bracelet.id]);
check("admin edits price and stock", edited.price === 44 && edited.stock === 9, `₪${edited.price} · ${edited.stock}`);

// מחיקה — רכה בלבד. השורה נשארת.
await rowBtn("הוצאה מהחנות").click();
await admin.waitForTimeout(1800);
const { rows: [gone] } = await db.query("select deleted_at from products where id=$1", [bracelet.id]);
check("admin delete is soft — the row is still there", !!gone?.deleted_at);
const afterDelete = await (await fetch(`${BASE}/s/${slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("deleted product leaves the live store", !afterDelete.includes("צמיד קשת"));
await admin.screenshot({ path: `${shots}/67-admin-deleted.png`, fullPage: true });

await admin.locator("div").filter({ hasText: "צמיד קשת" })
  .filter({ has: admin.locator("button:text-is('שחזור')") }).last()
  .locator("button:text-is('שחזור')").click();
await admin.waitForTimeout(1800);
const { rows: [back] } = await db.query("select deleted_at from products where id=$1", [bracelet.id]);
check("admin restores it", back.deleted_at === null);

/* ── 9. לא-אדמין לא יכול למחוק מוצר של אף אחת ── */
const anon = await fetch(`${BASE}/api/admin/store`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: bracelet.id, action: "delete" }),
});
check("admin product API is closed to strangers", anon.status === 403, `status=${anon.status}`);
// דרך הדפדפן של המנהלת — אחרת ה-403 של הזרה מסתיר את ולידציית הפעולה עצמה
const badAction = await admin.evaluate(async (id) => {
  const r = await fetch("/api/admin/store", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: id, action: "drop table products" }),
  });
  return r.status;
}, bracelet.id);
check("an authenticated admin still can't send an action off the list", badAction === 400, `status=${badAction}`);
// ו"edit" בלי שדות מוכרים לא הופך לעדכון ריק
const emptyEdit = await admin.evaluate(async (id) => {
  const r = await fetch("/api/admin/store", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: id, action: "edit", store_id: "00000000-0000-0000-0000-000000000000" }),
  });
  return r.status;
}, bracelet.id);
check("'edit' with no known field is refused, and store_id is never honoured", emptyEdit === 400, `status=${emptyEdit}`);
const { rows: [stillMine] } = await db.query("select store_id from products where id=$1", [bracelet.id]);
check("the product never moved stores", stillMine.store_id === store.id);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} options+admin-edit checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
