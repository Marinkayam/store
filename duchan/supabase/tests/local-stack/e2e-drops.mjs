// E2E: דרופ ושקית הפתעה (מיגרציה 0056), מקצה לקצה.
//
// דרופ — החוזים:
//   1. השרת חוסם הזמנה של דרופ שעוד לא נפתח, ומאפשר אחרי שנפתח.
//   2. בדוכן: רצועה עם ספירה לאחור, בלי "הוספה לסל", באנר לדרופ הקרוב.
//   3. הדרופ נפתח לבד בדפדפן ברגע שהזמן מגיע — בלי רענון.
//   4. טלפון עם שעון שגוי (3 שעות קדימה) לא פותח את הדרופ מוקדם.
//   5. בעורך: זמן שעבר נחסם, זמן עתידי נשמר, "כבר עכשיו" מבטל.
// שקית הפתעה:
//   6. נשמרת מהעורך; בדוכן "🎁 הפתעה", שקית עם "?" במקום תמונה, "מה בפנים?".
//   7. ההזמנה מסומנת כשקית הפתעה — בתשובה, בדאטהבייס ובמסך ההזמנות.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const SHOTS = process.env.SHOTS ?? "/tmp";
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
await db.query("update stores set status='active', show_sold_out=null where id=$1", [store.id]);
const { rows: prods } = await db.query(
  // שם ייחודי בדוכן — הבדיקה מוצאת כרטיסים ושורות לפי השם, ובדיקות אחרות
  // משאירות כמה מוצרים עם אותו שם
  `select id, name from products p where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and options is null
     and (select count(*) from products q where q.store_id=p.store_id and q.name=p.name and q.deleted_at is null) = 1
   order by sort_order, created_at limit 3`, [store.id]);
if (prods.length < 3) {
  console.error("צריך 3 מוצרים בלי אפשרויות");
  process.exit(1);
}
const [A, B, C] = prods;
await db.query("update products set drop_at=null, is_mystery=null, track_stock=true, stock=greatest(stock,5), image_key=null, video_key=null where id = any($1)", [prods.map((p) => p.id)]);

const order = (productId) =>
  fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items: [{ productId, qty: 1 }], buyerName: "בודקת", buyerPhone: "0521234567", wantsShipping: false }),
  });
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

/* ── 1. השרת ── */
await db.query("update products set drop_at=now() + interval '2 hours' where id=$1", [A.id]);
let r = await order(A.id);
let j = await r.json();
check("הזמנה של דרופ שעוד לא נפתח — נחסמת בשרת", r.status === 409 && j.field === "drop" && j.error.includes("עוד לא נפתח"), `${r.status} ${j.error}`);
check("וההודעה אומרת עוד כמה זמן", /\d\d:\d\d:\d\d/.test(j.error ?? ""), j.error);
await db.query("update products set drop_at=now() - interval '1 minute' where id=$1", [A.id]);
r = await order(A.id);
check("אחרי שהדרופ נפתח — ההזמנה עוברת", r.status === 200, String(r.status));
await db.query("update products set drop_at=now() + interval '2 hours' where id=$1", [A.id]);

/* ── 2–3. בדוכן ── */
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const buyer = await ctx.newPage();
const jsErrors = [];
buyer.on("pageerror", (e) => jsErrors.push(e.message));
await db.query("update products set drop_at=now() + interval '12 seconds' where id=$1", [B.id]);
await buyer.goto(fresh(), { waitUntil: "networkidle" });
await buyer.waitForSelector("[data-testid=drop-banner]", { timeout: 10000 });
const cardA = buyer.locator(".s-look div.s-r", { has: buyer.locator(`button[aria-label='${A.name}']`) }).first();
const strip = (await cardA.locator("[data-testid=drop-strip]").textContent().catch(() => "")) ?? "";
check("כרטיס הדרופ: רצועה עם ספירה לאחור", strip.includes("דרופ") && /\d\d:\d\d:\d\d/.test(strip), strip);
check("ובלי 'הוספה לסל' — במקומו 'נפתח …'", (await buyer.locator(`button[aria-label='הוספה מהירה, ${A.name}']`).count()) === 0 &&
  ((await cardA.locator("[data-testid=drop-locked]").textContent()) ?? "").includes("נפתח"));
const banner = (await buyer.textContent("[data-testid=drop-banner]")) ?? "";
check("באנר בראש הדוכן: הדרופ הקרוב (B, לא A)", banner.includes(B.name) && !banner.includes(A.name), banner);
await buyer.screenshot({ path: `${SHOTS}/drop-store.png` });

await buyer.click("[data-testid=drop-banner]");
await buyer.waitForSelector("[data-testid=drop-box]");
const addBtn = buyer.locator("button[aria-label='הוספה לסל']");
check("לחיצה על הבאנר פותחת את המוצר, עם 'נפתח בעוד'", ((await buyer.textContent("[data-testid=drop-box]")) ?? "").includes("נפתח בעוד"));
check("וכפתור הסל נעול: '🔒 עוד לא נפתח'", (await addBtn.isDisabled()) && ((await addBtn.textContent()) ?? "").includes("עוד לא נפתח"));
await buyer.screenshot({ path: `${SHOTS}/drop-sheet.png` });

// מחכים שהדרופ ייפתח — בלי רענון
await buyer.waitForSelector("[data-testid=drop-box]", { state: "detached", timeout: 20000 }).catch(() => {});
check("כשהזמן מגיע הדרופ נפתח לבד — בלי רענון", (await buyer.locator("[data-testid=drop-box]").count()) === 0 && !(await addBtn.isDisabled()));
check("ומופיעה הודעה 'הדרופ נפתח'", ((await buyer.textContent("body")) ?? "").includes("הדרופ נפתח"));
await addBtn.click();
await buyer.waitForTimeout(300);
check("ואפשר להוסיף לסל", ((await buyer.textContent("body")) ?? "").includes("נוסף לסל"));
const banner2 = (await buyer.textContent("[data-testid=drop-banner]").catch(() => "")) ?? "";
check("הבאנר עבר לדרופ הבא (A)", banner2.includes(A.name), banner2);

/* ── 4. שעון טלפון שגוי ── */
const skewed = await browser.newContext({ viewport: { width: 390, height: 844 } });
await skewed.addInitScript(() => {
  try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {}
  const real = Date.now.bind(Date);
  Date.now = () => real() + 3 * 3600_000; // הטלפון חושב שעברו 3 שעות
});
const sk = await skewed.newPage();
await sk.goto(fresh(), { waitUntil: "networkidle" });
await sk.waitForTimeout(1200);
const skCard = sk.locator(".s-look div.s-r", { has: sk.locator(`button[aria-label='${A.name}']`) }).first();
check("טלפון ששעונו 3 שעות קדימה — הדרופ עדיין נעול (לפי שעון השרת)", (await skCard.locator("[data-testid=drop-strip]").count()) === 1);
await skewed.close();

/* ── 5. העורך ── */
const girlCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await girlCtx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const girl = await girlCtx.newPage();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
const rowA = girl.locator(`[data-testid=product-row]:has-text('${A.name}')`).first();
check("ברשימת המוצרים: '🔥 נפתח …' על הדרופ", ((await rowA.locator("[data-testid=row-drop]").textContent().catch(() => "")) ?? "").includes("נפתח"));
await rowA.click();
await girl.waitForSelector("[data-testid=editor-close]");
check("בעורך: הדרופ פתוח עם הזמן השמור", (await girl.getAttribute("[data-testid=drop-choice]", "data-on")) === "false" &&
  ((await girl.inputValue("[data-testid=drop-at]")) ?? "").length === 16);
const pad = (n) => String(n).padStart(2, "0");
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
await girl.fill("[data-testid=drop-at]", local(new Date(Date.now() - 3600_000)));
check("זמן שעבר — מסומן כבעיה", ((await girl.textContent("[data-testid=drop-problem]").catch(() => "")) ?? "").includes("כבר עבר"));
await girl.click("button:has-text('שמירה')");
await girl.waitForTimeout(700);
check("והשמירה נחסמת (המוצר לא נפתח בטעות)", (await girl.locator("[data-testid=editor-close]").count()) === 1 &&
  (await db.query("select drop_at > now() as up from products where id=$1", [A.id])).rows[0].up === true);
const future = new Date(Date.now() + 3 * 86400_000);
future.setHours(18, 0, 0, 0);
await girl.fill("[data-testid=drop-at]", local(future));
const help = (await girl.textContent("[data-testid=drop-help]").catch(() => "")) ?? "";
check("זמן עתידי — כתוב מתי נפתח (שעון ישראל)", help.includes("18:00"), help);
await girl.click("button:has-text('שמירה')");
await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
const saved = (await db.query("select drop_at from products where id=$1", [A.id])).rows[0].drop_at;
// הטלפון של הבדיקה מכוון ל-UTC — ו"18:00" בשדה עדיין צריך להיות 18:00 בישראל
const savedIL = new Date(saved).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
check("נשמר בדאטהבייס כ-18:00 שעון ישראל, גם מטלפון שמכוון לאזור זמן אחר", savedIL === "18:00", `${saved} → ${savedIL}`);
await girl.locator(`[data-testid=product-row]:has-text('${A.name}')`).first().click();
await girl.waitForSelector("[data-testid=editor-close]");
await girl.click("[data-testid=drop-choice-on]");
await girl.click("button:has-text('שמירה')");
await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
check("'כבר עכשיו' מבטל את הדרופ", (await db.query("select drop_at from products where id=$1", [A.id])).rows[0].drop_at === null);

/* ── 6. שקית הפתעה ── */
await girl.locator(`[data-testid=product-row]:has-text('${C.name}')`).first().click();
await girl.waitForSelector("[data-testid=editor-close]");
await girl.click("[data-testid=mystery-toggle]");
check("בעורך: ההסבר והתיאור מתחלפים לשקית הפתעה",
  ((await girl.getAttribute("textarea", "placeholder")) ?? "").includes("מה יכול להיות בפנים"));
await girl.click("button:has-text('שמירה')");
await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
check("נשמר: is_mystery", (await db.query("select is_mystery from products where id=$1", [C.id])).rows[0].is_mystery === true);
check("ברשימה: '🎁 הפתעה'", (await girl.locator(`[data-testid=product-row]:has-text('${C.name}') [data-testid=row-mystery]`).count()) === 1);

await buyer.goto(fresh(), { waitUntil: "networkidle" });
const cardC = buyer.locator(".s-look div.s-r", { has: buyer.locator(`button[aria-label='${C.name}']`) }).first();
check("בדוכן: '🎁 הפתעה' על הכרטיס", (await cardC.locator("[data-testid=mystery-chip]").count()) === 1);
check("ושקית עם סימן שאלה במקום תמונה", (await cardC.locator("svg[aria-label='שקית הפתעה']").count()) === 1);
await buyer.click(`button[aria-label='${C.name}']`);
check("בגיליון: 'מה בפנים? זו ההפתעה!'", ((await buyer.textContent("[data-testid=mystery-note]").catch(() => "")) ?? "").includes("מה בפנים"));
await buyer.screenshot({ path: `${SHOTS}/mystery-sheet.png` });

/* ── 7. ההזמנה ── */
r = await order(C.id);
j = await r.json();
check("ההזמנה מסומנת כשקית הפתעה בתשובה", r.status === 200 && j.items?.[0]?.mystery === true);
const { rows: [ord] } = await db.query("select items from orders where store_id=$1 and order_number=$2", [store.id, j.orderNumber]);
check("ובדאטהבייס", ord?.items?.[0]?.mystery === true);
await girl.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
check("ובמסך ההזמנות: '🎁 … שקית הפתעה'", (await girl.locator("[data-testid=order-mystery]").count()) >= 1);

// מוצר רגיל לא מסומן
r = await order(B.id);
j = await r.json();
check("מוצר רגיל לא מסומן כהפתעה", r.status === 200 && !j.items?.[0]?.mystery);
check("אין שגיאות ג׳אווהסקריפט בדוכן", jsErrors.length === 0, jsErrors.join(" | "));

/* ── ניקוי ── */
await db.query("update products set drop_at=null, is_mystery=null where id = any($1)", [prods.map((p) => p.id)]);
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} drop + mystery checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
