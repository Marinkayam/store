// E2E: מחירים עם אגורות + סגנון ורקע לדוכן (מיגרציות 0049, 0050).
//
// הבקשות מהשטח:
//   • "שאפשר יהיה לכתוב את המחיר עם נקודה עשרונית, כמו 10.90"
//   • "להוסיף רקע שרוצים ולבחור עיצובים... או לחזור לבסיס"
//
// החוזים שנבדקים:
//   1. מחיר עשרוני נשמר מהעורך (גם עם פסיק), ומוצג ₪10.90 — לא 10.9.
//   2. הסה"כ של הזמנה מחושב באגורות: 10.90 × 3 = 32.70 ולא 32.699999.
//   3. מחיר שלם נשאר בלי ".00" — ₪15 ולא ₪15.00.
//   4. סגנון ורקע נשמרים ומשנים את הדוכן לקונות.
//   5. "חזרה לבסיס" מחזירה את הדוכן בדיוק למה שהיה.
//   6. תמונת רקע משלה נשמרת ומוצגת.
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
// מצב נקי: בלי סגנון, בלי רקע — ריצה קודמת לא משפיעה
await db.query("update stores set look=null, bg_pattern=null, bg_key=null where id=$1", [store.id]);
await db.query("delete from products where store_id=$1 and name in ('מחזיק מפתחות מנצנץ','סקוויש עגול')", [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });

/* ── 1. מחיר עם אגורות מהעורך ── */
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.click("button[aria-label='מוצר חדש']");
await girl.fill("input[aria-label='שם המוצר']", "מחזיק מפתחות מנצנץ");
// פסיק במקום נקודה — ככה מקלדת עברית בחלק מהטלפונים
await girl.fill("input[aria-label='מחיר']", "10,905");
check("השדה מקבל פסיק, הופך אותו לנקודה, ועוצר בשתי ספרות",
  (await girl.inputValue("input[aria-label='מחיר']")) === "10.90",
  await girl.inputValue("input[aria-label='מחיר']"));
await girl.click("button:has-text('שמירה')");
await girl.waitForTimeout(2500);

const { rows: [keychain] } = await db.query(
  "select * from products where store_id=$1 and name='מחזיק מפתחות מנצנץ' and deleted_at is null", [store.id]
);
check("המחיר נשמר עם אגורות", Number(keychain?.price) === 10.9, String(keychain?.price));
await db.query("update products set stock=20, track_stock=true, is_visible=true where id=$1", [keychain.id]);

// מוצר במחיר שלם, לבדוק שלא מופיע ".00"
await db.query(
  "insert into products (store_id, name, price, track_stock, stock, sort_order) values ($1,'סקוויש עגול',15,true,20,-1)",
  [store.id]
);

const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const page = (await buyer.textContent("body")) ?? "";
check("הקונה רואה ₪10.90 ולא ₪10.9", page.includes("₪10.90") && !/₪10\.9(?!0)/.test(page));
check("מחיר שלם נשאר ₪15, בלי .00", page.includes("₪15") && !page.includes("₪15.00"));

/* ── 2. הסה"כ מחושב באגורות ── */
const res = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: store.slug,
    items: [{ productId: keychain.id, qty: 3 }],
    buyerName: "נועה",
    buyerPhone: "0521112233",
    payMethod: "cash",
  }),
});
const order = await res.json();
check("הזמנה עם מחיר עשרוני עוברת", res.ok, JSON.stringify(order).slice(0, 160));
check("הסה\"כ בתשובה הוא 32.7 בדיוק", order.total === 32.7, String(order.total));
const { rows: [orderRow] } = await db.query(
  "select total, items from orders where store_id=$1 and order_number=$2", [store.id, order.orderNumber]
);
check("ובדאטהבייס 32.70", orderRow?.total === "32.70", String(orderRow?.total));
check("המחיר ליחידה נשמר ב-snapshot", orderRow?.items?.[0]?.price === 10.9, JSON.stringify(orderRow?.items));

// בדשבורד ההזמנות הסכום מוצג עם אגורות
await girl.goto(`${BASE}/dashboard`);
await girl.waitForSelector("text=היי", { timeout: 15000 });
await girl.waitForTimeout(1200);
const dash = (await girl.textContent("body")) ?? "";
check("בכרטיס ההזמנה: ₪32.70", dash.includes("₪32.70"));
check("ובשורת המוצר: × 3 · ₪32.70", dash.includes("× 3 · ₪32.70"));

/* ── 3. בסל של הקונה ── */
await buyer.click(`button[aria-label='הוספה מהירה, מחזיק מפתחות מנצנץ']`);
await buyer.waitForTimeout(400);
check("פס הסל מציג ₪10.90", ((await buyer.textContent("[data-testid=cart-bar]")) ?? "").includes("₪10.90"));

/* ── 4. סגנון ורקע ── */
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("[data-testid=look-picker]", { timeout: 20000 });
check("אין 'חזרה לבסיס' כשעוד לא נבחר כלום",
  (await girl.locator("[data-testid=reset-design]").count()) === 0);
check("הבסיס מסומן כברירת מחדל",
  (await girl.getAttribute("button[aria-label='סגנון בסיס']", "aria-pressed")) === "true");

await girl.click("button[aria-label='סגנון עגלגל']");
await girl.click("button[aria-label='רקע לבבות']");
await girl.waitForTimeout(300);
check("הבחירה נרשמת", (await girl.getAttribute("button[aria-label='סגנון עגלגל']", "aria-pressed")) === "true");
const previewBg = await girl.locator("#identity").evaluate((el) => getComputedStyle(el).backgroundImage);
check("התצוגה המקדימה מקבלת את הרקע מיד", previewBg.includes("svg"), previewBg.slice(0, 60));
await girl.screenshot({ path: "/tmp/looks-settings.png", fullPage: true });

await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [s1] } = await db.query("select look, bg_pattern from stores where id=$1", [store.id]);
check("הסגנון והרקע נשמרו", s1.look === "round" && s1.bg_pattern === "hearts", `${s1.look} · ${s1.bg_pattern}`);

const b2 = await phone();
await b2.goto(fresh(), { waitUntil: "networkidle" });
const rootBg = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).backgroundImage);
check("הדוכן לקונות מקבל את הרקע", rootBg.includes("svg"), rootBg.slice(0, 60));
const card = b2.locator(".s-look .s-r.relative").first();
const radius = await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
check("כרטיסי המוצרים עגולים (22px)", radius === "22px", radius);
const font = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).fontFamily);
check("והגופן מתחלף", font.includes("Varela Round"), font);
await b2.screenshot({ path: "/tmp/looks-store-round-hearts.png" });

// סגנון שני, לראות שהוא לא תקוע על הראשון
await db.query("update stores set look='pop', bg_pattern='stars' where id=$1", [store.id]);
await b2.goto(fresh(), { waitUntil: "networkidle" });
const popShadow = await b2.locator(".s-look .s-r.relative").first().evaluate((el) => getComputedStyle(el).boxShadow);
check("פופ: צל חד", /3px 3px 0px/.test(popShadow), popShadow);
await b2.screenshot({ path: "/tmp/looks-store-pop-stars.png" });

/* ── 5. חזרה לבסיס ── */
await girl.reload();
await girl.waitForSelector("[data-testid=reset-design]", { timeout: 20000 });
await girl.click("[data-testid=reset-design]");
await girl.waitForTimeout(300);
check("חזרה לבסיס מסמנת את הבסיס",
  (await girl.getAttribute("button[aria-label='סגנון בסיס']", "aria-pressed")) === "true" &&
  (await girl.getAttribute("button[aria-label='בלי רקע']", "aria-pressed")) === "true");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [s2] } = await db.query("select look, bg_pattern, theme from stores where id=$1", [store.id]);
check("בדאטהבייס: בלי סגנון ובלי רקע", s2.look === null && s2.bg_pattern === null, `${s2.look} · ${s2.bg_pattern}`);
check("והצבעים לא נגעו", s2.theme === store.theme, `${s2.theme} / ${store.theme}`);

await b2.goto(fresh(), { waitUntil: "networkidle" });
const baseBg = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).backgroundImage);
const baseRadius = await b2.locator(".s-look .s-r.relative").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
check("הדוכן חזר לבסיס: בלי רקע ובלי עיגול", baseBg === "none" && baseRadius === "0px", `${baseBg} · ${baseRadius}`);

/* ── 6. תמונת רקע משלה ── */
// ה-input המוסתר של הרקע יושב ממש לפני רשת הרקעים
await girl.locator("[data-testid=bg-picker]").locator("xpath=preceding-sibling::input[@type='file']")
  .setInputFiles(new URL("../../../e2e/fixtures/square.png", import.meta.url).pathname);
await girl.waitForTimeout(3500);
const { rows: [s3] } = await db.query("select bg_pattern, bg_key from stores where id=$1", [store.id]);
check("תמונת רקע נשמרת מיד", s3.bg_pattern === "photo" && /\/bg\/.+\.webp$/.test(s3.bg_key ?? ""), `${s3.bg_pattern} · ${s3.bg_key}`);
await b2.goto(fresh(), { waitUntil: "networkidle" });
const photoBg = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).backgroundImage);
check("והדוכן מציג אותה", photoBg.includes(s3.bg_key ?? "@@"), photoBg.slice(0, 120));

/* ── ניקוי: הבדיקות שאחריי מצפות לדוכן בסיס ── */
await db.query("update stores set look=null, bg_pattern=null, bg_key=null where id=$1", [store.id]);
await db.query("delete from products where store_id=$1 and name in ('מחזיק מפתחות מנצנץ','סקוויש עגול')", [store.id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} prices + looks checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
