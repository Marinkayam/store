// E2E: מבצעים על מוצר (מיגרציה 0064), מקצה לקצה.
//
// הבקשה (לקוחה, דרך מרינה): "אחד ב-₪10, ואם מכניסים שניים לעגלה — ₪15 במקום
// ₪20". ומרינה: "סוגים של מבצעים שהמוכרת בוחרת".
//
// החוזים:
//   1. השרת מחשב בעצמו: 2 ב-₪15, 1+1, מחיר מבצע. 3 יחידות = זוג + אחת רגילה.
//   2. אותו מוצר בשני צבעים נספר יחד (ורוד + כחול = 2).
//   3. מבצע שכבר לא זול יותר (המחיר ירד) — לא חל. הקונה לא משלמת יותר.
//   4. ההזמנה שומרת את שם המבצע ואת סכום השורה (snapshot).
//   5. הדאטהבייס דוחה צורה לא תקינה (גם מהדפדפן).
//   6. בעורך: בוחרים סוג, רואים "בדוכן יופיע", מבצע לא משתלם נחסם.
//   7. בדוכן: תגית על הכרטיס, מחיר מחוק, "עוד אחד וזה …" בסל, חיסכון וסה"כ.
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

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!store?.activated_at) {
  console.error("צריך דוכן פעיל (seed.mjs ואז e2e-activation.mjs)");
  process.exit(1);
}
await db.query("update stores set status='active' where id=$1", [store.id]);
const { rows: prods } = await db.query(
  `select id, name, price, options, option_label, track_stock, stock, drop_at, is_mystery from products p
    where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
      and options is null and coalesce(is_mystery,false)=false
      and (select count(*) from products q where q.store_id=p.store_id and q.name=p.name and q.deleted_at is null) = 1
    order by sort_order, created_at limit 3`, [store.id]);
if (prods.length < 3) {
  console.error("צריך 3 מוצרים בלי אפשרויות");
  process.exit(1);
}
const [A, B, C] = prods;
const restore = async () => {
  for (const p of prods) {
    await db.query("update products set price=$2, deal=null, options=$3, option_label=$4, track_stock=$5, stock=$6, drop_at=$7 where id=$1",
      [p.id, p.price, p.options, p.option_label, p.track_stock, p.stock, p.drop_at]);
  }
};
await db.query("update products set deal=null, drop_at=null, track_stock=true, stock=greatest(stock,20) where id = any($1)", [prods.map((p) => p.id)]);
await db.query("update products set price=10 where id = any($1)", [[A.id, B.id]]);
await db.query("update products set price=15 where id=$1", [C.id]);

const order = (items) =>
  fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items, buyerName: "בודקת", buyerPhone: "0521234567", wantsShipping: false }),
  }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const setDeal = (id, deal) => db.query("update products set deal=$2 where id=$1", [id, deal ? JSON.stringify(deal) : null]);

try {
  /* ── 1–4. השרת ── */
  await setDeal(A.id, { type: "bundle", qty: 2, price: 15 });
  await setDeal(B.id, { type: "free", buy: 1 });
  await setDeal(C.id, { type: "sale", price: 10 });

  let r = await order([{ productId: A.id, qty: 2 }]);
  check("2 ב-₪15: שניים = ₪15 (ולא ₪20)", r.status === 200 && Number(r.total) === 15, `${r.status} ${r.total} ${r.error ?? ""}`);
  r = await order([{ productId: A.id, qty: 3 }]);
  check("2 ב-₪15: שלושה = ₪25 (זוג + אחד רגיל)", Number(r.total) === 25, String(r.total));
  r = await order([{ productId: B.id, qty: 2 }]);
  check("1+1: שניים = ₪10", Number(r.total) === 10, String(r.total));
  r = await order([{ productId: B.id, qty: 3 }]);
  check("1+1: שלושה = ₪20", Number(r.total) === 20, String(r.total));
  r = await order([{ productId: C.id, qty: 2 }]);
  check("מחיר מבצע ₪10 במקום ₪15: שניים = ₪20", Number(r.total) === 20, String(r.total));
  r = await order([{ productId: A.id, qty: 2 }, { productId: B.id, qty: 1 }]);
  check("סל מעורב: זוג במבצע + אחד בלי = ₪25", Number(r.total) === 25, String(r.total));
  const { rows: [saved] } = await db.query("select items, total from orders where store_id=$1 and order_number=$2", [store.id, r.orderNumber]);
  const itA = saved.items.find((i) => i.id === A.id);
  const itB = saved.items.find((i) => i.id === B.id);
  check("ההזמנה שומרת את שם המבצע ואת סכום השורה", itA?.deal === "2 ב-₪15" && Number(itA?.line) === 15, JSON.stringify(itA));
  check("שורה שהמבצע לא תפס בה — בלי סימון", itB && itB.deal === undefined && itB.line === undefined, JSON.stringify(itB));

  // ורוד + כחול = 2
  await db.query("update products set options=$2, option_label='צבע' where id=$1", [A.id, ["ורוד", "כחול"]]);
  r = await order([{ productId: A.id, qty: 1, option: "ורוד" }, { productId: A.id, qty: 1, option: "כחול" }]);
  check("אותו מוצר בשני צבעים נספר יחד: ורוד + כחול = ₪15", Number(r.total) === 15, `${r.status} ${r.total} ${r.error ?? ""}`);
  await db.query("update products set options=null, option_label=null where id=$1", [A.id]);

  // המחיר ירד → המבצע כבר לא משתלם → לא חל
  await db.query("update products set price=7 where id=$1", [A.id]);
  r = await order([{ productId: A.id, qty: 2 }]);
  check("מבצע שכבר לא זול יותר (2 ב-₪15 כשהמחיר ₪7) — לא חל: ₪14", Number(r.total) === 14, String(r.total));
  await db.query("update products set price=10 where id=$1", [A.id]);

  /* ── 5. הדאטהבייס ── */
  const bad = async (d) => {
    try {
      await db.query("update products set deal=$2 where id=$1", [A.id, JSON.stringify(d)]);
      return false;
    } catch (e) {
      return /products_deal_shape/.test(e.message);
    }
  };
  check("הדאטהבייס דוחה '1 ב-…' (כמות 1)", await bad({ type: "bundle", qty: 1, price: 5 }));
  check("ו-9+1", await bad({ type: "free", buy: 9 }));
  check("וסוג לא מוכר", await bad({ type: "half" }));
  check("ומחיר שהוא טקסט", await bad({ type: "sale", price: "5" }));
  await setDeal(A.id, null);
  await setDeal(B.id, null);
  await setDeal(C.id, null);

  /* ── 6. העורך ── */
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  const girl = await ctx.newPage();
  const jsErrors = [];
  girl.on("pageerror", (e) => jsErrors.push(e.message));
  await girl.goto(`${BASE}/login`);
  await verifyPhone(girl, "0501234567");
  await girl.waitForURL("**/dashboard", { timeout: 20000 });
  await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });

  const openRow = async (p) => {
    await girl.locator(`[data-testid=product-row]:has-text('${p.name}')`).first().click();
    await girl.waitForSelector("[data-testid=editor-close]");
    if (!(await girl.locator("[data-testid=editor-deal]").isVisible())) await girl.click("[data-testid=editor-more]");
    await girl.locator("[data-testid=editor-deal]").scrollIntoViewIfNeeded();
  };
  const save = async () => {
    await girl.click("button:has-text('שמירה')");
    await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
  };
  const dealOf = async (id) => (await db.query("select deal from products where id=$1", [id])).rows[0].deal;
  // jsonb מסדר מפתחות מחדש — משווים שדה-שדה, לא מחרוזת
  const same = (a, b) => !!a && !!b && Object.keys(b).length === Object.keys(a).length && Object.keys(b).every((k) => a[k] === b[k]);

  await openRow(A);
  check("בעורך: 'מבצע' עם 4 אפשרויות", (await girl.locator("[data-testid=editor-deal] [role=radio]").count()) === 4);
  await girl.click("[data-testid=deal-bundle]");
  await girl.fill("[data-testid=deal-bundle-price]", "25");
  check("2 ביחד ב-₪25 כשאחד ₪10 — מסומן כבעיה",
    ((await girl.textContent("[data-testid=deal-problem]").catch(() => "")) ?? "").includes("פחות מ-₪20"));
  await girl.click("button:has-text('שמירה')");
  await girl.waitForTimeout(700);
  check("והשמירה נחסמת", (await girl.locator("[data-testid=editor-close]").count()) === 1 && (await dealOf(A.id)) === null);
  await girl.fill("[data-testid=deal-bundle-price]", "15");
  const preview = (await girl.textContent("[data-testid=deal-preview]").catch(() => "")) ?? "";
  check("'בדוכן יופיע: 2 ב-₪15 · במקום ₪20. חוסכים ₪5'", preview.includes("2 ב-₪15") && preview.includes("חוסכים ₪5"), preview);
  await girl.locator("[data-testid=editor-deal]").screenshot({ path: `${SHOTS}/deal-editor.png` });
  await save();
  check("נשמר: {bundle, 2, 15}", same(await dealOf(A.id), { type: "bundle", qty: 2, price: 15 }), JSON.stringify(await dealOf(A.id)));
  check("ברשימת המוצרים: 'מבצע 2 ב-₪15'",
    ((await girl.textContent(`[data-testid=product-row]:has-text('${A.name}') [data-testid=row-deal]`).catch(() => "")) ?? "").includes("2 ב-₪15"));

  await openRow(B);
  await girl.click("[data-testid=deal-free]");
  check("1+1: 'קונים אחד, השני מתנה'", ((await girl.textContent("[data-testid=deal-preview]").catch(() => "")) ?? "").includes("השני מתנה"));
  await save();
  check("נשמר: {free, 1}", same(await dealOf(B.id), { type: "free", buy: 1 }), JSON.stringify(await dealOf(B.id)));

  await openRow(C);
  await girl.click("[data-testid=deal-sale]");
  await girl.fill("[data-testid=deal-sale-price]", "10");
  await save();
  check("נשמר: {sale, 10}", same(await dealOf(C.id), { type: "sale", price: 10 }), JSON.stringify(await dealOf(C.id)));

  // פתיחה מחדש: הטופס נטען עם המבצע השמור
  await openRow(A);
  check("פתיחה מחדש: '2 במחיר' מסומן, ₪15 בשדה",
    (await girl.getAttribute("[data-testid=deal-bundle]", "aria-checked")) === "true" && (await girl.inputValue("[data-testid=deal-bundle-price]")) === "15");
  await girl.click("[data-testid=editor-close]");

  /* ── 7. הדוכן ── */
  const buyer = await ctx.newPage();
  buyer.on("pageerror", (e) => jsErrors.push(e.message));
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  const card = (p) => buyer.locator(".s-look div.s-r", { has: buyer.locator(`button[aria-label='${p.name}']`) }).first();
  check("כרטיס: תגית '2 ב-₪15'", ((await card(A).locator("[data-testid=deal-tag]").textContent().catch(() => "")) ?? "") === "2 ב-₪15");
  check("כרטיס: תגית '1+1'", ((await card(B).locator("[data-testid=deal-tag]").textContent().catch(() => "")) ?? "") === "1+1");
  const cText = (await card(C).textContent()) ?? "";
  check("כרטיס מחיר מבצע: ₪10 ו-₪15 מחוק", cText.includes("₪10") && (await card(C).locator("s").textContent()) === "₪15", cText.slice(0, 60));
  await card(A).screenshot({ path: `${SHOTS}/deal-card.png` });

  await buyer.click(`button[aria-label='${A.name}']`);
  await buyer.waitForSelector("[data-testid=deal-box]", { timeout: 8000 });
  const box = (await buyer.textContent("[data-testid=deal-box]")) ?? "";
  check("בדף המוצר: 'מבצע 2 ב-₪15' + כמה חוסכים", box.includes("מבצע 2 ב-₪15") && box.includes("חוסכים ₪5"), box);
  await buyer.locator("[role=dialog] button[aria-label='סגירה'], button[aria-label='סגירה']").first().click().catch(() => {});
  await buyer.waitForTimeout(300);

  await buyer.click(`button[aria-label='הוספה מהירה, ${A.name}']`);
  await buyer.waitForTimeout(300);
  await buyer.click("[data-testid=cart-bar]");
  await buyer.waitForSelector("[data-testid=deal-nudge]", { timeout: 8000 });
  check("בסל, עם אחד: 'עוד אחד וזה 2 ב-₪15'", ((await buyer.textContent("[data-testid=deal-nudge]")) ?? "").includes("עוד אחד וזה 2 ב-₪15"));
  await buyer.click(`button[aria-label='עוד, ${A.name}']`);
  await buyer.waitForSelector("[data-testid=line-deal]", { timeout: 5000 });
  check("עם שניים: 'מבצע 2 ב-₪15 · חסכת ₪5'", ((await buyer.textContent("[data-testid=line-deal]")) ?? "").includes("חסכת ₪5"));
  check("וההצעה נעלמת", (await buyer.locator("[data-testid=deal-nudge]").count()) === 0);
  check("'חסכת במבצעים ₪5' מעל הסה\"כ", ((await buyer.textContent("[data-testid=deal-saved]")) ?? "").includes("₪5"));
  check("סה\"כ לתשלום ₪15", ((await buyer.textContent("[data-testid=order-total]")) ?? "").includes("₪15"));
  await buyer.screenshot({ path: `${SHOTS}/deal-cart.png` });
  check("בלי שגיאות JS", jsErrors.length === 0, jsErrors.join(" | "));
  await browser.close();
} finally {
  await restore();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} deal checks passed`);
process.exit(failed.length ? 1 : 0);
