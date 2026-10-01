// E2E: קופונים מקצה לקצה (מיגרציה 0054).
//
// הבקשה: "אפשרות בהזמנה להוסיף קוד קופון, וגם בצד של המנהלת וגם לחנויות
// עצמן — מקצה לקצה."
//
// החוזים:
//   1. בדוכן בלי קופון חי — אין שדה קופון בקופה.
//   2. המוכרת יוצרת קופון (דף "להפיץ"); קוד כפול או לא תקין — הודעה ברורה.
//   3. הקונה מחילה קוד (גם באותיות קטנות), רואה כמה ירד, ומזמינה.
//      ההזמנה נשמרת עם הקוד, ההנחה והסכום לפניה; מונה השימושים עולה.
//   4. מינימום, תוקף, כיבוי ומספר שימושים — כל אחד עם הודעה שאומרת מה הבעיה.
//   5. שתי קונות על השימוש האחרון — רק אחת מקבלת אותו.
//   6. המוכרת לא יכולה לשנות את מונה השימושים.
//   7. המנהלת יוצרת קופון לחנות מהחמ"ל, והמוכרת רואה אותו.
//   8. כרטיס ההזמנה בדשבורד מציג את הקופון.
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
  `select id, name, price, stock, track_stock, options from products
    where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
      and (options is null or cardinality(options) = 0)
    order by sort_order, created_at limit 1`,
  [store.id]
);
const prod = prods[0];
if (!prod) {
  console.error("צריך מוצר בלי אפשרויות בדוכן");
  process.exit(1);
}
await db.query("delete from coupons where store_id=$1", [store.id]);
await db.query("update products set price=20, stock=50, track_stock=true where id=$1", [prod.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;
const order = (extra = {}) =>
  fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: store.slug,
      items: [{ productId: prod.id, qty: 2 }],
      buyerName: "נועה",
      buyerPhone: "0521112233",
      payMethod: "cash",
      ...extra,
    }),
  });
const checkCode = (code, qty = 2) =>
  fetch(`${BASE}/api/coupons/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, code, items: [{ productId: prod.id, qty }] }),
  });

async function openCheckout(page) {
  await page.goto(fresh(), { waitUntil: "networkidle" });
  await page.click(`button[aria-label='הוספה מהירה, ${prod.name}']`);
  await page.waitForTimeout(300);
  await page.click(`button[aria-label='הוספה מהירה, ${prod.name}']`).catch(() => {});
  await page.waitForTimeout(300);
  await page.click("[data-testid=cart-bar]");
  await page.waitForTimeout(500);
}

/* ── 1. בלי קופון חי — אין שדה ── */
const buyer = await phone();
await openCheckout(buyer);
check("בדוכן בלי קופונים — אין 'יש לך קוד קופון?'", (await buyer.locator("[data-testid=coupon-box]").count()) === 0);

/* ── 2. המוכרת יוצרת קופון ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
// בעלת הדוכן שמזמינה מעצמה, כשעוד אין קופון — רואה הסבר וקישור; קונה לא
await openCheckout(girl);
check("בעלת הדוכן רואה 'עוד אין לך קופון' עם קישור ליצירה",
  (await girl.locator("[data-testid=coupon-owner-hint]").count()) === 1 &&
  ((await girl.getAttribute("[data-testid=coupon-owner-hint]", "href")) ?? "").includes("/dashboard/share#coupons"));
check("וקונה לא רואה את ההודעה הזו", (await buyer.locator("[data-testid=coupon-owner-hint]").count()) === 0);
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("[data-testid=settings-coupons-link]", { timeout: 20000 });
check("בהגדרות יש קיצור לקופונים", true);

await girl.goto(`${BASE}/dashboard/share`);
await girl.waitForSelector("[data-testid=seller-coupons]", { timeout: 20000 });
check("ב'להפיץ' יש חלק קופונים", (await girl.locator("[data-testid=coupon-manager]").count()) === 1);

await girl.click("[data-testid=coupon-new]");
await girl.fill("input[aria-label='קוד הקופון']", "A");
await girl.fill("input[aria-label='גובה ההנחה']", "10");
await girl.click("[data-testid=coupon-create]");
check("קוד קצר מדי — הודעה ברורה",
  ((await girl.textContent("[data-testid=coupon-form-error]").catch(() => "")) ?? "").includes("3 עד 20"));
await girl.fill("input[aria-label='קוד הקופון']", "sale10");
check("הקוד הופך לאותיות גדולות תוך כדי הקלדה", (await girl.inputValue("input[aria-label='קוד הקופון']")) === "SALE10");
await girl.click("[data-testid=coupon-create]");
await girl.waitForSelector("[data-testid=coupon-row][data-code=SALE10]", { timeout: 10000 });
const { rows: [c1] } = await db.query("select * from coupons where store_id=$1 and code='SALE10'", [store.id]);
check("הקופון נשמר: 10% ע״י המוכרת", c1?.kind === "percent" && Number(c1?.value) === 10 && c1?.created_by === "store",
  `${c1?.kind} ${c1?.value} ${c1?.created_by}`);

// כפול
await girl.click("[data-testid=coupon-new]");
await girl.fill("input[aria-label='קוד הקופון']", "SALE10");
await girl.fill("input[aria-label='גובה ההנחה']", "5");
await girl.click("[data-testid=coupon-create]");
await girl.waitForTimeout(800);
check("קוד שכבר קיים — 'כבר יש קופון'",
  ((await girl.textContent("[data-testid=coupon-form-error]").catch(() => "")) ?? "").includes("כבר יש קופון"));
await girl.click("button:text-is('ביטול')");

// קוד בעברית, עם רווח — נשמר עם מקף
await girl.click("[data-testid=coupon-new]");
await girl.fill("input[aria-label='קוד הקופון']", "מבצע חורף");
await girl.fill("input[aria-label='גובה ההנחה']", "15");
await girl.click("[data-testid=coupon-create]");
await girl.waitForSelector("[data-testid=coupon-row][data-code='מבצע-חורף']", { timeout: 10000 });
const { rows: [heb] } = await db.query("select code from coupons where store_id=$1 and code='מבצע-חורף'", [store.id]);
check("קוד בעברית נשמר (רווח הופך למקף)", heb?.code === "מבצע-חורף", String(heb?.code));

// המוכרת לא נוגעת במונה
const { rows: [priv] } = await db.query(
  "select has_column_privilege('authenticated','coupons','used_count','UPDATE') u, has_table_privilege('anon','coupons','SELECT') a");
check("למוכרת אין הרשאה לשנות את מונה השימושים", priv.u === false);
check("קונה (anon) לא יכולה לקרוא את טבלת הקופונים", priv.a === false);

/* ── 3. הקונה מחילה את הקוד ומזמינה ── */
await openCheckout(buyer);
check("עכשיו יש 'יש לך קוד קופון?'", (await buyer.locator("[data-testid=coupon-open]").count()) === 1);
await buyer.click("[data-testid=coupon-open]");
await buyer.fill("input[aria-label='קוד קופון']", "nope");
await buyer.click("[data-testid=coupon-apply]");
await buyer.waitForSelector("[data-testid=coupon-error]", { timeout: 8000 });
check("קוד שלא קיים — 'לא קיים בדוכן'", ((await buyer.textContent("[data-testid=coupon-error]")) ?? "").includes("לא קיים"));
await buyer.fill("input[aria-label='קוד קופון']", "sale10");
await buyer.click("[data-testid=coupon-apply]");
await buyer.waitForSelector("[data-testid=coupon-applied]", { timeout: 8000 });
const applied = (await buyer.textContent("[data-testid=coupon-applied]")) ?? "";
check("הקוד הוחל (גם באותיות קטנות) עם 10% הנחה", applied.includes("SALE10") && applied.includes("10% הנחה"), applied);
check("חסכת ₪4 על ₪40", applied.includes("₪4"), applied);
check("הסה״כ לתשלום ₪36", ((await buyer.textContent("[data-testid=order-total]")) ?? "").includes("₪36"));
check("פירוט: סכום המוצרים וקופון", ((await buyer.textContent("[data-testid=coupon-summary]")) ?? "").includes("₪40"));
await buyer.screenshot({ path: "/tmp/coupon-checkout.png" });

const pickup = buyer.locator("button:has-text('מסירה אישית')");
if (await pickup.count()) await pickup.click();
await buyer.fill("input[aria-label='שם פרטי']", "מאיה").catch(async () => {
  await buyer.locator("input[placeholder='שם פרטי']").fill("מאיה");
});
await buyer.locator("input[placeholder='050-0000000']").fill("0527778899");
const cash = buyer.locator("button:has-text('מזומן')");
if (await cash.count()) await cash.click();
await buyer.locator("button:text-is('שליחת ההזמנה')").click();
await buyer.locator("[data-testid=order-pay-first], [data-testid=order-confirmed]").first().waitFor({ timeout: 15000 });
const { rows: [o1] } = await db.query(
  "select coupon_code, discount, subtotal, total from orders where store_id=$1 order by created_at desc limit 1", [store.id]);
check("ההזמנה נשמרה עם הקופון", o1.coupon_code === "SALE10", String(o1.coupon_code));
check("הנחה 4, לפני הנחה 40, סה״כ 36",
  o1.discount === "4.00" && o1.subtotal === "40.00" && o1.total === "36.00",
  `${o1.discount} / ${o1.subtotal} / ${o1.total}`);
const { rows: [u1] } = await db.query("select used_count from coupons where id=$1", [c1.id]);
check("מונה השימושים עלה ל-1", u1.used_count === 1, String(u1.used_count));

/* ── 4. תנאים ── */
await db.query(
  `insert into coupons (store_id, code, kind, value, min_total) values ($1,'BIG',  'amount', 15, 100),
                                                                    ($1,'OLD',  'percent', 20, null),
                                                                    ($1,'OFF',  'amount', 5, null)`,
  [store.id]);
await db.query("update coupons set expires_at = now() - interval '1 day' where store_id=$1 and code='OLD'", [store.id]);
await db.query("update coupons set active = false where store_id=$1 and code='OFF'", [store.id]);
const big = await (await checkCode("BIG")).json();
check("מינימום: '₪100 ומעלה' ומה חסר", (big.error ?? "").includes("₪100 ומעלה") && (big.error ?? "").includes("₪60"), big.error);
const old = await (await checkCode("OLD")).json();
check("פג תוקף: 'תוקף הקוד הזה נגמר'", (old.error ?? "").includes("תוקף"), old.error);
const off = await (await checkCode("OFF")).json();
check("כבוי: 'לא פעיל'", (off.error ?? "").includes("לא פעיל"), off.error);
const amount = await (await checkCode("BIG", 6)).json();
check("סכום קבוע: ₪15 מ-₪120", Number(amount.discount) === 15 && Number(amount.total) === 105, JSON.stringify(amount));
// עברית ומקלדת בשפה הלא נכונה
const hebApply = await (await checkCode("מבצע חורף")).json();
check("קונה מקלידה 'מבצע חורף' עם רווח — עובד", hebApply.code === "מבצע-חורף" && Number(hebApply.discount) === 6, JSON.stringify(hebApply));
await db.query("insert into coupons (store_id, code, kind, value) values ($1,'SUMMER','amount',3), ($1,'חנוכה','amount',4)", [store.id]);
const wrongHeb = await (await checkCode("דוצצקר")).json();
check("SUMMER שהוקלד במקלדת עברית (דוצצקר) — מזוהה", wrongHeb.code === "SUMMER", JSON.stringify(wrongHeb));
const wrongEng = await (await checkCode("jbufv")).json();
check("חנוכה שהוקלד במקלדת אנגלית (jbufv) — מזוהה", wrongEng.code === "חנוכה", JSON.stringify(wrongEng));
const hebOrder = await order({ couponCode: "דוצצקר" });
const hebOrderBody = await hebOrder.json();
check("וגם ההזמנה עצמה מקבלת את זה, עם הקוד הנכון", hebOrder.ok && hebOrderBody.couponCode === "SUMMER", JSON.stringify(hebOrderBody).slice(0, 120));

const bad = await order({ couponCode: "OLD" });
check("גם ההזמנה עצמה דוחה קוד שפג (לא רק הבדיקה)", bad.status === 400 && (await bad.json()).field === "coupon");

/* ── 5. שתי קונות על השימוש האחרון ── */
await db.query("insert into coupons (store_id, code, kind, value, max_uses) values ($1,'LAST','amount',5,1)", [store.id]);
const [r1, r2] = await Promise.all([order({ couponCode: "LAST" }), order({ couponCode: "LAST" })]);
const oks = [r1, r2].filter((r) => r.ok).length;
check("שימוש אחרון: רק הזמנה אחת מקבלת אותו", oks === 1, `${r1.status}, ${r2.status}`);
const { rows: [last] } = await db.query("select used_count from coupons where store_id=$1 and code='LAST'", [store.id]);
check("והמונה לא עבר את המקסימום", last.used_count === 1, String(last.used_count));
const third = await (await checkCode("LAST")).json();
check("אחרי שנוצל: 'נוצל עד הסוף'", (third.error ?? "").includes("נוצל"), third.error);

/* ── 6. כרטיס ההזמנה אצל המוכרת ── */
await girl.goto(`${BASE}/dashboard`);
await girl.waitForSelector("text=היי", { timeout: 15000 });
await girl.waitForTimeout(1200);
check("כרטיס ההזמנה מציג 'קופון SALE10'",
  ((await girl.locator("[data-testid=order-coupon]").allTextContents()).join(" ")).includes("SALE10"));

/* ── 7. המוכרת מכבה ומוחקת ── */
await girl.goto(`${BASE}/dashboard/share`);
await girl.waitForSelector("[data-testid=coupon-row][data-code=SALE10]", { timeout: 20000 });
await girl.click("button[aria-label='כיבוי SALE10']");
await girl.waitForTimeout(1000);
const { rows: [c2] } = await db.query("select active from coupons where id=$1", [c1.id]);
check("כיבוי נשמר", c2.active === false);
await girl.click("button[aria-label='מחיקה SALE10']");
await girl.click("button:has-text('כן, למחוק')");
await girl.waitForTimeout(1000);
const { rows: [c3] } = await db.query("select deleted_at from coupons where id=$1", [c1.id]);
check("מחיקה רכה (deleted_at), לא DELETE", c3.deleted_at !== null);

/* ── 8. המנהלת מהחמ"ל ── */
const admin = await phone();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("text=חמ\"ל", { timeout: 15000 });
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(500);
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("[data-testid=admin-coupons] [data-testid=coupon-manager]", { timeout: 15000 });
check("בתיק החנות בחמ״ל יש קופונים", true);
await admin.click("[data-testid=admin-coupons] [data-testid=coupon-new]");
await admin.fill("[data-testid=admin-coupons] input[aria-label='קוד הקופון']", "VIP20");
await admin.fill("[data-testid=admin-coupons] input[aria-label='גובה ההנחה']", "20");
await admin.click("[data-testid=admin-coupons] [data-testid=coupon-create]");
await admin.waitForSelector("[data-testid=admin-coupons] [data-testid=coupon-row][data-code=VIP20]", { timeout: 10000 });
const { rows: [v] } = await db.query("select created_by, value from coupons where store_id=$1 and code='VIP20' and deleted_at is null", [store.id]);
check("המנהלת יצרה קופון לחנות (created_by=admin)", v?.created_by === "admin" && Number(v?.value) === 20);
await admin.screenshot({ path: "/tmp/coupon-admin.png" });

await girl.goto(`${BASE}/dashboard/share`);
await girl.waitForSelector("[data-testid=coupon-row][data-code=VIP20]", { timeout: 20000 });
check("והמוכרת רואה אותו אצלה, עם 'נוצר ע״י דוכן'",
  ((await girl.textContent("[data-testid=coupon-row][data-code=VIP20]")) ?? "").includes("נוצר ע״י דוכן"));
await girl.screenshot({ path: "/tmp/coupon-seller.png", fullPage: true });

/* ── ניקוי ── */
await db.query("delete from coupons where store_id=$1", [store.id]);
await db.query("update products set price=$1, stock=$2, track_stock=$3 where id=$4", [prod.price, prod.stock, prod.track_stock, prod.id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} coupon checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
