// E2E: הקופה מצד הקונה, צעד אחר צעד — על דוכן כמו Nanatoyz: ערכת "עץ",
// ביט ופייבוקס בלי לינק/מספר, תשלום שנסגר בוואטסאפ, ומשלוח.
//
// מה נבדק (מרינה: "תעבור טוב טוב על הפלואו"):
//   • כפתורים: טקסט לבן על הגוון העמוק, ניגודיות ≥ 4.5
//   • קופון: אפשר לפתוח, לבטל ולסגור
//   • איך מקבלים: שורות ברורות; משלוח מציג כתובת, מסירה מסתירה
//   • כתובת: טופס רגיל — בית פרטי בלי קומה/דירה, בניין עם שתיהן
//   • איך משלמים: אומרים מה יקרה אחרי השליחה, ואין תשלום *לפני* ההזמנה
//   • אחרי ההזמנה: ביט בלי לינק → "לקבל את פרטי הביט בוואטסאפ", בהודעה כתוב ביט
//   • ביט עם לינק → כפתור תשלום · מזומן → ישר לאישור
import { chromium, devices } from "playwright";
import pg from "pg";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const SHOTS = process.env.SHOTS ?? "/tmp";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
const COLS = ["theme", "look", "bg_pattern", "payout_bit", "payout_paybox", "payout_cash", "payout_whatsapp", "payout_bit_link",
  "payout_bit_phone", "payout_paybox_link", "payout_paybox_phone", "payout_link", "ships", "shipping_price", "shipping_note", "status"];
const orig = Object.fromEntries(COLS.map((c) => [c, store[c]]));
async function config(patch) {
  const keys = Object.keys(patch);
  await db.query(`update stores set ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")} where id=$1`, [store.id, ...keys.map((k) => patch[k])]);
}
const NANA = {
  theme: "minimal", look: "soft", bg_pattern: "stars", payout_bit: true, payout_paybox: true, payout_cash: false,
  payout_whatsapp: true, payout_bit_link: null, payout_bit_phone: null, payout_paybox_link: null, payout_paybox_phone: null, payout_link: null,
  ships: true, shipping_price: 30, shipping_note: "משלוחים לכל הארץ עם שליח עד הבית", status: "active",
};
await config(NANA);
await db.query("update products set deleted_at=null, stock=greatest(stock,5), is_visible=true, drop_at=null where store_id=$1 and name in ('מחזיק מפתחות','גרביים מצחיקות','תג-אלף','צמיד קשת','תג-בית')", [store.id]);
await db.query(`insert into coupons (store_id, code, kind, value, active) select $1, 'TEST10', 'percent', 10, true
  where not exists (select 1 from coupons where store_id=$1 and code='TEST10' and deleted_at is null)`, [store.id]);
const { rows: [prod] } = await db.query(
  `select name from products p where store_id=$1 and deleted_at is null and options is null and (not track_stock or stock>0)
     and (select count(*) from products q where q.store_id=p.store_id and q.name=p.name and q.deleted_at is null)=1
   order by sort_order limit 1`, [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function buyerWithCart() {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  await p.locator(`button[aria-label='הוספה מהירה, ${prod.name}']`).click();
  await p.waitForTimeout(300);
  await p.click("[data-testid=cart-bar]");
  await p.waitForTimeout(500);
  return p;
}
const fillBuyer = async (p) => {
  await p.fill("input[aria-label='השם שלך']", "נועה");
  await p.fill("input[aria-label='מספר טלפון']", "0527778899");
};
const lastOrder = async () => (await db.query("select * from orders where store_id=$1 order by created_at desc limit 1", [store.id])).rows[0];
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => { const c = +v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/* ── 1. כפתורים ── */
let p = await buyerWithCart();
const sendBtn = p.locator("button:has-text('שליחת ההזמנה')");
const [fg, bg] = await sendBtn.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
check("'שליחת ההזמנה': טקסט לבן על גוון עמוק", fg === "rgb(255, 255, 255)", `${fg} על ${bg}`);
check("וניגודיות של לפחות 4.5", ratio(fg, bg) >= 4.5, ratio(fg, bg).toFixed(2));
await p.screenshot({ path: `${SHOTS}/co-1-cart.png` });

/* ── 2. קופון: פותחים ומבטלים ── */
await p.click("[data-testid=coupon-open]");
await p.fill("input[aria-label='קוד קופון']", "ABC");
await p.click("[data-testid=coupon-cancel]");
check("קופון: 'ביטול' סוגר את השדה", (await p.locator("input[aria-label='קוד קופון']").count()) === 0 && (await p.locator("[data-testid=coupon-open]").count()) === 1);
await p.click("[data-testid=coupon-open]");
check("ופתיחה מחדש — השדה ריק", (await p.inputValue("input[aria-label='קוד קופון']")) === "");
await p.click("[data-testid=coupon-cancel]");

/* ── 3. איך מקבלים ── */
const group = p.locator("[role=radiogroup][aria-label='איך לקבל את ההזמנה']");
check("'איך לקבל את ההזמנה?' — שורות בחירה עם הסבר", (await group.locator("[role=radio]").count()) === 2 &&
  ((await group.textContent()) ?? "").includes("₪30"));
check("משלוח: מופיע 'לאן לשלוח?' עם עיר ורחוב", (await p.locator("[data-testid=ship-address]").count()) === 1);
check("ואין יותר כפתורי 'בניין / בית פרטי'", (await p.locator("button[aria-label='בניין'], button[aria-label='בית פרטי']").count()) === 0);
await p.locator("[data-testid=ship-address]").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SHOTS}/co-2-address.png` });
await p.click("button:has-text('מסירה אישית')");
check("מסירה אישית: הכתובת נעלמת", (await p.locator("[data-testid=ship-address]").count()) === 0);
await p.locator("[role=radio]:has-text('משלוח')").click();

/* ── 4. כתובת ── */
await fillBuyer(p);
await p.fill("input[aria-label='עיר למשלוח']", "יבנה");
await p.fill("input[aria-label='רחוב למשלוח']", "הרצל 12");
await p.fill("input[aria-label='קומה']", "3");
await p.click("button[aria-label='תשלום בביט']");
await sendBtn.click();
await p.waitForTimeout(700);
check("קומה בלי דירה — 'בבניין צריך גם קומה וגם מספר דירה'", ((await p.textContent("body")) ?? "").includes("בבניין צריך גם קומה וגם מספר דירה"));
await p.fill("input[aria-label='קומה']", "");

/* ── 5. איך משלמים ── */
const next = (await p.textContent("[data-testid=pay-next]")) ?? "";
check("ביט בלי לינק: 'אחרי שליחת ההזמנה כותבים לדוכן בוואטסאפ'", next.includes("אחרי שליחת ההזמנה") && next.includes("וואטסאפ") && next.includes("ביט"), next);
check("ואין כפתור תשלום לפני שההזמנה נשלחה", (await p.locator("a:has-text('תשלום בביט')").count()) === 0);
await p.locator("[data-testid=pay-next]").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SHOTS}/co-3-pay.png` });
await sendBtn.click();
await p.waitForSelector("[data-testid=order-pay-first]", { timeout: 15000 });
const o1 = await lastOrder();
check("בית פרטי (בלי קומה ודירה) — נשמר כבית פרטי", o1.ship_details?.homeType === "private" && o1.ship_city === "יבנה", JSON.stringify(o1.ship_details));

/* ── 6. אחרי ההזמנה: ביט דרך וואטסאפ ── */
const sheet = (await p.textContent("[data-testid=order-pay-first]")) ?? "";
check("כתוב שההזמנה נשלחה, ושנשאר לשלם — בביט", sheet.includes("ההזמנה נשלחה") && sheet.includes("ביט"), sheet.slice(0, 90));
const explain = (await p.textContent("[data-testid=pay-whatsapp-explain]")) ?? "";
check("ומוסבר: בעלי הדוכן שולחים את פרטי הביט בוואטסאפ", explain.includes("פרטי הביט") && explain.includes("בעלי הדוכן"), explain);
// מרינה: "שפה נקייה... איקון כמו בשפה של הדוכן, איזושהי אנימציה"
check("בלי אימוג'י במסך", !/\p{Extended_Pictographic}/u.test(sheet), sheet.match(/\p{Extended_Pictographic}/u)?.[0] ?? "");
check("הסמל הוא אייקון של דוכן (svg) עם אנימציה",
  (await p.locator("[data-testid=order-pay-first] [data-testid=order-badge] svg").count()) >= 2 &&
    (await p.locator("[data-testid=order-pay-first] [data-testid=order-badge]").evaluate((e) => getComputedStyle(e).animationName)) !== "none");
// מרינה: "למה פעם עגול פעם מרובע" — כל הכפתורים והקופסאות באותן פינות של הסגנון
const radii = await p.locator("[data-testid=order-pay-first] a.s-r, [data-testid=order-pay-first] button, [data-testid=order-pay-first] [data-testid=pay-phone]")
  .evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).borderTopLeftRadius))]);
const sheetRadius = await p.locator("[data-testid=order-pay-first]").evaluate((e) => getComputedStyle(e).borderTopLeftRadius);
check("הכפתורים: אותן פינות כמו הגיליון", radii.length === 1 && radii[0] === sheetRadius, `${radii.join(" / ")} · גיליון ${sheetRadius}`);
const wa = p.locator("[data-testid=pay-whatsapp]");
check("הכפתור: 'לקבל את פרטי הביט בוואטסאפ'", ((await wa.textContent()) ?? "").includes("לקבל את פרטי הביט"));
const href = decodeURIComponent((await wa.getAttribute("href")) ?? "");
check("וההודעה המוכנה אומרת 'בחרתי לשלם בביט — לאן להעביר?'", href.includes("בחרתי לשלם בביט") && href.includes(`#${o1.order_number}`));
check("והכפתור השני 'שלחתי הודעה' (לא 'שילמתי' — עוד לא שילמו)", (await p.locator("button:has-text('שלחתי הודעה')").count()) === 1);
await p.screenshot({ path: `${SHOTS}/co-4-after.png` });
await p.click("button:has-text('שלחתי הודעה')");
check("ואז: 'ההזמנה נשלחה!'", (await p.locator("[data-testid=order-confirmed]").count()) === 1);
await p.context().close();

/* ── 7. בניין ── */
p = await buyerWithCart();
await fillBuyer(p);
await p.fill("input[aria-label='עיר למשלוח']", "יבנה");
await p.fill("input[aria-label='רחוב למשלוח']", "הרצל 12");
await p.fill("input[aria-label='קומה']", "2");
await p.fill("input[aria-label='מספר דירה']", "5");
await p.click("button[aria-label='תשלום בפייבוקס']");
await p.locator("button:has-text('שליחת ההזמנה')").click();
await p.waitForSelector("[data-testid=order-pay-first]", { timeout: 15000 });
const o2 = await lastOrder();
check("קומה + דירה — נשמר כבניין", o2.ship_details?.homeType === "building" && o2.ship_details?.floor === "2" && o2.ship_details?.apartment === "5");
check("ובפייבוקס: 'לקבל את פרטי הפייבוקס'", ((await p.textContent("[data-testid=pay-whatsapp]")) ?? "").includes("פייבוקס"));
await p.context().close();

/* ── 8. ביט עם לינק ── */
await config({ payout_bit_link: "https://www.bitpay.co.il/app/me/ABC123", payout_whatsapp: false });
p = await buyerWithCart();
await fillBuyer(p);
await p.click("button:has-text('מסירה אישית')");
await p.click("button[aria-label='תשלום בביט']");
check("ביט עם לינק: 'יופיע כפתור לתשלום בביט'", ((await p.textContent("[data-testid=pay-next]")) ?? "").includes("יופיע כפתור"));
await p.locator("button:has-text('שליחת ההזמנה')").click();
await p.waitForSelector("[data-testid=order-pay-first]", { timeout: 15000 });
const bitLinks = await p.locator("[data-testid=order-pay-first] a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
check("ואחרי ההזמנה — כפתור לתשלום בביט", bitLinks.some((h) => (h ?? "").includes("bitpay.co.il")), bitLinks.join(" | ").slice(0, 120));
check("ו'שילמתי'", (await p.locator("[data-testid=order-pay-first] button", { hasText: "שילמתי" }).count()) === 1,
  String(await p.locator("button", { hasText: "שילמתי" }).count()));
await p.context().close();

/* ── 9. מזומן ── */
await config({ payout_cash: true });
p = await buyerWithCart();
await fillBuyer(p);
await p.click("button:has-text('מסירה אישית')");
await p.click("button[aria-label='תשלום במזומן']");
check("מזומן: 'משלמים במזומן כשמקבלים'", ((await p.textContent("[data-testid=pay-next]")) ?? "").includes("במזומן"));
await p.locator("button:has-text('שליחת ההזמנה')").click();
await p.waitForSelector("[data-testid=order-confirmed]", { timeout: 15000 });
check("ובלי מסך תשלום — ישר 'ההזמנה נשלחה!'", (await p.locator("[data-testid=order-pay-first]").count()) === 0);
await p.context().close();

/* ── 10. עוגיות: הפס למטה (מרינה, 10.2026), מעל פס הבית של האייפון ── */
const cctx = await browser.newContext({ ...devices["iPhone 13"] });
const cp = await cctx.newPage();
await cp.goto(`${BASE}/s/${store.slug}`, { waitUntil: "networkidle" });
const pb = await cp.evaluate(() => document.querySelector("[data-testid=cookie-note]")?.getAttribute("style") ?? "");
check("פס העוגיות למטה מתחשב בפס הבית של האייפון (safe-area)", pb.includes("safe-area-inset-bottom"), pb.slice(0, 80));
await cctx.close();

/* ── ניקוי ── */
await config(orig);
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checkout checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
