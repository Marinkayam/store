// E2E: טיקטוק ואינסטגרם — לינק קצר (duchan.app/xxxxx) שעובד, מה מותר בטיקטוק,
// ורעיונות לסרטון עם טקסט למסך וכיתוב מוכנים.
// 11.2026 (מרינה: "צריך למצוא איזשהי דרך לממשק בין דוכן לטיקטוק"): מסך משלו,
// /dashboard/tiktok, עם תמונות מוכנות למצגת, לינק לכל מוצר (duchan.app/abcde/12),
// וכניסה מההגדרות. הזמנה מטיקטוק נרשמת עם המקור (0074).
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
const { rows: [store] } = await db.query("select slug, display_name from stores where contact_phone='972501234567' order by created_at limit 1");
const host = new URL(BASE).host;

/* ── הלינק הקצר עובד ── */
const r = await fetch(`${BASE}/${store.slug}`, { redirect: "manual" });
check("duchan.app/<קוד> מפנה לדוכן", [307, 308].includes(r.status) && (r.headers.get("location") ?? "").endsWith(`/s/${store.slug}`), `${r.status} ${r.headers.get("location")}`);
const bad = await fetch(`${BASE}/not-a-store-path`, { redirect: "manual" });
check("כתובת שלא נראית כמו קוד — 404 רגיל", bad.status === 404, String(bad.status));
const terms = await fetch(`${BASE}/terms`);
check("ועמודים קיימים (terms) לא נפגעו", terms.status === 200 && (await terms.text()).includes("תנאי"));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL("**/dashboard", { timeout: 20000 });
await p.goto(`${BASE}/dashboard/settings#share`);
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=share-more]", { timeout: 15000 });
await p.click("[data-testid=share-more] summary");
await p.waitForSelector("[data-testid=tiktok-entry]", { timeout: 15000 });
check("בשיתוף: כניסה ל'לטיקטוק ולאינסטגרם'", ((await p.getAttribute("[data-testid=tiktok-entry]", "href")) ?? "") === "/dashboard/tiktok");
const shareLink = ((await p.textContent("[data-testid=share-link]")) ?? "").trim();
await p.goto(`${BASE}/dashboard/tiktok`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=tiktok-card]", { timeout: 15000 });
check("מסך טיקטוק: כתוב שזה מגיל 13", ((await p.textContent("[data-testid=tiktok-age]")) ?? "").includes("מגיל 13"));

const shown = ((await p.textContent("[data-testid=tiktok-link]")) ?? "").trim();
check("הלינק כתוב בגדול, קצר, בלי https", shown === `${host}/${store.slug}`, shown);
check("וגם בלינק הראשי של השיתוף — אותו לינק קצר", shareLink.endsWith(`${host}/${store.slug}`));
await p.click("[data-testid=tiktok-copy-link]");
await p.waitForTimeout(300);
check("לחיצה על הלינק מעתיקה אותו", (await p.evaluate(() => navigator.clipboard.readText())) === shown);

const where = (await p.textContent("[data-testid=tiktok-where]")) ?? "";
check("אומר את האמת: על הסרטון עובד לכולם", where.includes("על הסרטון") && where.includes("עובד לכולם"));
check("ושלינק לחיץ בביו רק מגיל 18 עם 1,000 עוקבים או חשבון עסקי", where.includes("מגיל 18") && where.includes("1,000") && where.includes("עסקי"));

const screen1 = (await p.textContent("[data-testid=tiktok-screen]")) ?? "";
check("רעיון לסרטון: טקסט למסך עם הלינק", screen1.includes("אורזים הזמנה") && screen1.includes(shown), screen1);
await p.click("[data-testid=tiktok-idea-drop]");
const screen2 = (await p.textContent("[data-testid=tiktok-screen]")) ?? "";
const cap2 = (await p.textContent("[data-testid=tiktok-caption]")) ?? "";
check("בחירת רעיון אחר מחליפה טקסט, כיתוב וטיפ", screen2.includes("דרופ חדש") && cap2.includes("#newdrop") && cap2.includes(shown) &&
  ((await p.textContent("[data-testid=tiktok-tip]")) ?? "").length > 5);
await p.click("[data-testid=tiktok-copy-screen]");
await p.waitForTimeout(300);
check("העתקת הטקסט למסך", (await p.evaluate(() => navigator.clipboard.readText())).includes("דרופ חדש"));
await p.click("[data-testid=tiktok-copy-caption]");
await p.waitForTimeout(300);
check("העתקת הכיתוב", (await p.evaluate(() => navigator.clipboard.readText())).includes("#newdrop"));

await p.click("[data-testid=tiktok-idea-pack]");
await p.locator("[data-testid=tiktok-card]").scrollIntoViewIfNeeded();
await p.evaluate(() => document.querySelector("[data-testid=tiktok-card]").scrollIntoView({ block: "start" }));
await p.waitForTimeout(300);
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/tiktok-card-1.png` });
await p.evaluate(() => window.scrollBy(0, 640));
await p.waitForTimeout(300);
await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/tiktok-card-2.png` });
/* ── תמונות מוכנות ולינק לכל מוצר ── */
{
  const { rows: [st] } = await db.query("select id from stores where slug=$1", [store.slug]);
  // מוצר עם תמונה מקומית, כדי שיהיה מה לצייר
  const { rows: [prod] } = await db.query(
    "select id, name from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible) order by created_at limit 1", [st.id]);
  const { rows: [orig] } = await db.query("select image_key from products where id=$1", [prod.id]);
  await db.query("update products set image_key='/demo/bao.webp' where id=$1", [prod.id]);
  const { rows: all } = await db.query("select id from products where store_id=$1 order by created_at, id", [st.id]);
  const no = all.findIndex((r) => r.id === prod.id) + 1;
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("[data-testid=slides-make]", { timeout: 15000 });
  const links = await p.locator("[data-testid=product-link]").allTextContents();
  check("לינק לכל מוצר: duchan.app/<קוד>/<מספר>", links.some((l) => l.trim() === `${host}/${store.slug}/${no}`), links.slice(0, 3).join(" | "));
  const picked = await p.locator("[data-testid=slides-pick] button[aria-pressed=true]").count();
  await p.click("[data-testid=slides-make]");
  await p.waitForSelector("[data-testid=slides-ready]", { timeout: 30000 });
  const n = await p.locator("[data-testid=slide]").count();
  check("תמונות: פתיחה + תמונה לכל מוצר שנבחר", n === picked + 1, `${n} / ${picked}+1`);
  const dim = await p.locator("[data-testid=slide]").first().evaluate((img) => new Promise((r) => (img.complete ? r([img.naturalWidth, img.naturalHeight]) : (img.onload = () => r([img.naturalWidth, img.naturalHeight])))));
  check("בגודל של טיקטוק וסטורי, 1080×1920", dim[0] === 1080 && dim[1] === 1920, dim.join("×"));
  check("והסבר איך מעלים לטיקטוק ולאינסטגרם", ((await p.textContent("[data-testid=slides-how]")) ?? "").includes("מצגת תמונות"));
  if (orig.image_key === null) await db.query("update products set image_key=null where id=$1", [prod.id]);
  else await db.query("update products set image_key=$2 where id=$1", [prod.id, orig.image_key]);

  // הלינק של המוצר פותח את הדוכן עם המוצר פתוח
  const r2 = await fetch(`${BASE}/${store.slug}/${no}`, { redirect: "manual" });
  check("duchan.app/<קוד>/<מספר> מפנה לדוכן עם המוצר", [307, 308].includes(r2.status) && (r2.headers.get("location") ?? "").endsWith(`/s/${store.slug}?p=${prod.id}`), r2.headers.get("location") ?? "");
  const r3 = await fetch(`${BASE}/${store.slug}/99999`, { redirect: "manual" });
  check("מספר שלא קיים: לדוכן עצמו", (r3.headers.get("location") ?? "").endsWith(`/s/${store.slug}`));
  const b = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await b.goto(`${BASE}/${store.slug}/${no}`, { waitUntil: "networkidle" });
  await b.waitForSelector("[data-testid=product-close]", { timeout: 15000 });
  check("בדוכן: המוצר נפתח מיד, והכתובת מתנקה", ((await b.textContent("body")) ?? "").includes(prod.name) && !b.url().includes("?p="), b.url());
}

/* ── הזמנה מטיקטוק נרשמת עם המקור (0074) ── */
{
  const tk = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.0 BytedanceWebview",
  })).newPage();
  await tk.goto(`${BASE}/s/${store.slug}`, { waitUntil: "networkidle" });
  const src = await tk.evaluate((slug) => JSON.parse(sessionStorage.getItem(`duchan-stat-${slug}`) ?? "{}").src, store.slug);
  check("בדפדפן של טיקטוק המקור מזוהה כ'tiktok'", src === "tiktok", String(src));
  const { rows: [st] } = await db.query("select id from stores where slug=$1", [store.slug]);
  const { rows: [pr] } = await db.query(
    "select id from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible) and (options is null or cardinality(options)=0) and (not track_stock or stock > 0) order by created_at limit 1", [st.id]);
  const res = await tk.evaluate(async ({ slug, id }) => {
    const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, items: [{ productId: id, qty: 1 }], buyerName: "טל", buyerPhone: "0521234999", payMethod: "cash", source: "tiktok" }) });
    return r.json();
  }, { slug: store.slug, id: pr.id });
  await new Promise((r) => setTimeout(r, 1500));
  const { rows: [o] } = await db.query("select id, source from orders where store_id=$1 and order_number=$2", [st.id, res.orderNumber]);
  check("ההזמנה נשמרה עם source=tiktok", o?.source === "tiktok", String(o?.source));
  const bad = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items: [{ productId: pr.id, qty: 1 }], buyerName: "טל", buyerPhone: "0521234999", payMethod: "cash", source: "evil" }) });
  const bj = await bad.json();
  await new Promise((r) => setTimeout(r, 1200));
  const { rows: [o2] } = await db.query("select id, source from orders where store_id=$1 and order_number=$2", [st.id, bj.orderNumber]);
  check("מקור לא מוכר לא נשמר", o2 && o2.source === null, String(o2?.source));
  await db.query("update orders set deleted_at=now() where id = any($1)", [[o?.id, o2?.id].filter(Boolean)]);
}

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.join(" | "));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} tiktok share checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
