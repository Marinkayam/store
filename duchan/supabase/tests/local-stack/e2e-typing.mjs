// E2E: אפשר להקליד בכל שדה, בכל מסך, בטלפון.
//
// מרינה, 11.2026: "תוודא שאפשר להקליד בכל השדות כי זה עושה בלאגן".
//
// על כל שדה גלוי בכל מסך (טלפון: מסך מגע, 390px):
//   1. נוגעים בו (tap) ומקלידים תו-תו, כמו אצבע — עברית, מספרים, טלפון.
//   2. הטקסט שהוקלד נמצא בשדה במלואו (שום תו לא נבלע, שום רינדור לא מחק).
//   3. הפוקוס נשאר בשדה עד הסוף (שדה שנבנה מחדש באמצע ההקלדה "בורח").
//   4. גודל הטקסט לפחות 16px — מתחת לזה אייפון עושה זום לכל נגיעה בשדה,
//      והמסך כולו זז הצידה. זה ה"בלאגן" הכי נפוץ.
//   5. הדף לא נהיה רחב מהמסך אחרי ההקלדה (גלילה הצידה).
// ואחרי הבדיקה — מחזירים לכל שדה את מה שהיה בו.
import { chromium, devices } from "playwright";
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
// קופון חי — כדי ששדה הקופון יופיע בסל
await db.query(
  `insert into coupons (store_id, code, kind, value, active) values ($1, 'TYPE10', 'percent', 10, true)
   on conflict do nothing`, [store.id]).catch(() => {});
const { rows: [prod] } = await db.query(
  `select id, name from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and options is null and coalesce(is_mystery,false)=false and drop_at is null
     and (not track_stock or stock > 0) order by sort_order, created_at limit 1`, [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const jsErrors = [];
async function phone() {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "he-IL" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("duchan-cookies-ok", "1");
      localStorage.setItem("duchan-install-dismissed", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => jsErrors.push(e.message));
  return p;
}

const SKIP_TYPES = new Set(["checkbox", "radio", "file", "range", "color", "hidden", "submit", "button", "date", "time", "datetime-local", "month", "week"]);
const norm = (s) => String(s ?? "").replace(/[\s\-–]/g, "").toUpperCase();
let fieldsSeen = 0;

/** כל שדה שגלוי עכשיו במסך: נוגעים, מקלידים, בודקים, מחזירים. */
async function sweep(page, screen) {
  await page.waitForTimeout(400);
  const count = await page.locator("input, textarea").count();
  const bad = [];
  let n = 0;
  for (let i = 0; i < count; i++) {
    const el = page.locator("input, textarea").nth(i);
    const info = await el
      .evaluate((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return {
          type: (e.getAttribute("type") || "text").toLowerCase(),
          mode: (e.getAttribute("inputmode") || "").toLowerCase(),
          max: e.maxLength > 0 ? e.maxLength : null,
          // תוכן של <details> סגור לא נראה לאף אחד — לא שדה "תקוע"
          visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[hidden]") && !e.closest("details:not([open])"),
          disabled: e.disabled || e.readOnly,
          label: e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.name || e.id || e.tagName,
          value: e.value,
        };
      })
      .catch(() => null);
    if (!info || !info.visible || info.disabled || SKIP_TYPES.has(info.type)) continue;
    n++;
    fieldsSeen++;
    const sample =
      info.type === "tel" || info.mode === "tel" ? "0521234567"
      : info.type === "number" || info.mode === "numeric" || info.mode === "decimal" ? "25"
      : info.type === "email" ? "a@b.co"
      : info.label.includes("קוד") ? "TYPE10"
      : "טל 12 שלום";
    const expected = info.max ? sample.slice(0, info.max) : sample;
    try {
      await el.scrollIntoViewIfNeeded();
      await el.tap({ timeout: 5000 });
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.type(expected, { delay: 35 });
      await page.waitForTimeout(150);
      const after = await el.evaluate((e) => ({
        value: e.value,
        focused: document.activeElement === e,
        font: parseFloat(getComputedStyle(e).fontSize),
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      const digits = (s) => String(s).replace(/\D/g, "");
      const typedOk =
        norm(after.value).includes(norm(expected)) ||
        ((info.type === "tel" || info.mode === "tel") && digits(after.value).includes(digits(expected).slice(1)));
      const problems = [];
      if (!typedOk) problems.push(`הוקלד "${expected}", בשדה "${after.value}"`);
      if (!after.focused) problems.push("הפוקוס ברח");
      if (after.font < 16) problems.push(`טקסט ${after.font}px (זום באייפון)`);
      if (after.wide) problems.push("הדף נהיה רחב מהמסך");
      if (problems.length) bad.push(`${info.label}: ${problems.join(", ")}`);
      // מחזירים את מה שהיה
      await el.fill(info.value).catch(() => {});
      await el.evaluate((e) => e.blur()).catch(() => {});
    } catch (e) {
      bad.push(`${info.label}: לא הצלחתי לגעת/להקליד (${String(e.message).split("\n")[0].slice(0, 80)})`);
    }
  }
  check(`${screen}: מקלידים בכל השדות (${n})`, bad.length === 0, bad.join(" | "));
  return n;
}

/** פותחים מה שאדם היה פותח: "עוד…" מקופל, ובחירות שחושפות שדות */
async function reveal(page) {
  await page.evaluate(() => document.querySelectorAll("details:not([open])").forEach((d) => (d.open = true)));
  for (const t of ["promo-toggle-on", "ships-choice-on"]) {
    const b = page.locator(`[data-testid=${t}]`);
    if ((await b.count()) && (await b.isVisible())) await b.click().catch(() => {});
  }
  await page.waitForTimeout(300);
}

/* ── קונים ── */
const buyer = await phone();
await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
await sweep(buyer, "דוכן");
if (prod) {
  await buyer.click(`button[aria-label='הוספה מהירה, ${prod.name}']`);
  await buyer.waitForTimeout(300);
  await buyer.click("[data-testid=cart-bar]");
  await buyer.waitForTimeout(600);
  const ship = buyer.locator("button:has-text('משלוח')").first();
  if (await ship.count()) await ship.click().catch(() => {});
  const open = buyer.locator("[data-testid=coupon-open]");
  if (await open.count()) await open.click();
  await sweep(buyer, "סל ותשלום");
  await buyer.screenshot({ path: `${SHOTS}/typing-checkout.png` });
}

/* ── כניסה ── */
const guest = await phone();
await guest.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await sweep(guest, "כניסה");

/* ── אונבורדינג → דוכן חדש → הפעלה ── */
const NEW = "0521119876";
await db.query("delete from phone_otps where phone=$1", ["972521119876"]);
await guest.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
await guest.waitForSelector("input[aria-label='שם הדוכן']", { timeout: 15000 });
await sweep(guest, "אונבורדינג: שם");
await guest.fill("input[aria-label='שם הדוכן']", "דוכן הקלדה");
await guest.click("[data-testid=ob-next]");
await guest.waitForTimeout(900);
await sweep(guest, "אונבורדינג: מוצר");
await guest.click("[data-testid=ob-skip-product]");
await guest.waitForTimeout(600);
await guest.click("[data-testid=ob-next]");
await guest.waitForTimeout(900);
await guest.check("input[aria-label='ההורים שלי יודעים']");
await guest.click("button:has-text('הלאה, למספר הטלפון')");
await guest.waitForSelector("input[aria-label='מספר טלפון']", { timeout: 15000 });
await sweep(guest, "אונבורדינג: טלפון");
await verifyPhone(guest, NEW);
await guest.waitForURL("**/dashboard**", { timeout: 20000 }).catch(() => {});
await guest.goto(`${BASE}/activate`, { waitUntil: "networkidle" });
const parentHere = guest.locator("[data-testid=parent-here]");
if (await parentHere.count()) await parentHere.click();
await guest.waitForTimeout(500);
await sweep(guest, "הפעלה (הורים)");

/* ── בעלי הדוכן ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await sweep(girl, "הזמנות");
const note = girl.locator("button:has-text('הערה לעצמי')").first();
if (await note.count()) {
  await note.click();
  await sweep(girl, "הזמנות: הערה לעצמי");
}

await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("[data-testid=editor-close]");
if (!(await girl.locator("[data-testid=editor-more-panel]").isVisible())) await girl.click("[data-testid=editor-more]");
await girl.locator("button:has-text('צבעים')").first().click().catch(() => {});
await sweep(girl, "מוצר חדש");
for (const k of ["sale", "bundle"]) {
  await girl.click(`[data-testid=deal-${k}]`);
  await sweep(girl, `מוצר חדש: מבצע ${k}`);
}
await girl.click("[data-testid=editor-close]");

for (const sec of ["design", "products", "promo", "coupons", "payment", "shipping", "details", "team", "share"]) {
  await girl.goto(`${BASE}/dashboard/settings#${sec}`);
  await girl.reload({ waitUntil: "networkidle" });
  // מקטעים שבהם הטופס נפתח בכפתור
  for (const t of ["קופון חדש", "ליצור קופון", "להוסיף שותפים"]) {
    const b = girl.locator(`button:has-text('${t}')`).first();
    if (await b.count()) await b.click().catch(() => {});
  }
  await reveal(girl);
  await sweep(girl, `הדוכן שלי: ${sec}`);
}
await girl.goto(`${BASE}/dashboard/settings#design`);
await girl.reload({ waitUntil: "networkidle" });
await girl.screenshot({ path: `${SHOTS}/typing-design.png` });

/* ── חמ"ל ── */
const admin = await phone();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await admin.waitForSelector("[data-testid=admin-tab-stores]", { timeout: 20000 });
for (const tab of ["overview", "stores", "logins", "news"]) {
  await admin.click(`[data-testid=admin-tab-${tab}]`);
  await admin.waitForTimeout(1200);
  await sweep(admin, `חמ"ל: ${tab}`);
}

check("עברנו על שדות אמיתיים (לא רשימה ריקה)", fieldsSeen >= 30, String(fieldsSeen));
check("בלי שגיאות JS", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));

await browser.close();
await db.query("delete from coupons where store_id=$1 and code='TYPE10'", [store.id]).catch(() => {});
await db.end();
const { closeHelper } = await import("./sms-helper.mjs");
await closeHelper();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} typing checks passed · ${fieldsSeen} fields`);
process.exit(failed.length ? 1 : 0);
