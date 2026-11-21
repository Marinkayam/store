// E2E: העיר של הדוכן נבחרת מרשימת היישובים הרשמית (מיגרציה 0070).
//
// מה נבדק:
//   1. הרשימה במסד זהה לרשימה בקוד (lib/localities-data.json).
//   2. בדוכן הציבורי מוצג רק שם של יישוב. מספר טלפון, קישור או "נשר חיפה"
//      שנשארו בטקסט הישן לא מוצגים.
//   3. בהגדרות בוחרים מרשימה. מה שלא ברשימה לא נשמר.
//   4. הדפדפן לא יכול לכתוב טקסט חופשי לעיר, וגם לא מזהה שלא קיים.
import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "node:fs";
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
  "select id, slug, owner_id, city, city_id from stores where contact_phone='972501234567' order by created_at limit 1");
const restore = { city: store.city, city_id: store.city_id };
const setCity = (text, id) => db.query("update stores set city=$2, city_id=$3 where id=$1", [store.id, text, id]);
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

try {
  /* ── 1. הרשימה ── */
  const list = JSON.parse(readFileSync(new URL("../../../lib/localities-data.json", import.meta.url), "utf8"));
  const { rows: dbList } = await db.query("select id, name from localities");
  const byId = new Map(dbList.map((r) => [r.id, r.name]));
  check("הרשימה במסד זהה לרשימה בקוד", dbList.length === list.length && list.every(([id, name]) => byId.get(id) === name),
    `${dbList.length} במסד · ${list.length} בקוד`);
  check("יותר מאלף יישובים, עם סמלים מוכרים",
    list.length > 1000 && byId.get(5000) === "תל אביב - יפו" && byId.get(2500) === "נשר" && byId.get(8600) === "רמת גן");
  const { rows: [priv] } = await db.query(
    `select has_table_privilege('anon', 'localities', 'select') as r,
            has_table_privilege('anon', 'localities', 'insert') as w,
            has_table_privilege('authenticated', 'localities', 'update') as u`);
  check("הרשימה לקריאה בלבד מהדפדפן", priv.r === true && priv.w === false && priv.u === false, JSON.stringify(priv));

  /* ── 2. הדוכן הציבורי ── */
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const buyer = await phone();
  const header = async () => {
    await buyer.goto(fresh(), { waitUntil: "networkidle" });
    return (await buyer.textContent("[data-testid=store-header]")) ?? "";
  };

  await setCity("050-7654321", null);
  let h = await header();
  check("מספר טלפון בשדה העיר הישן לא מוצג בדוכן", !h.includes("7654321") && !(await buyer.content()).includes("7654321"));

  await setCity("https://duchan.app/abcde", null);
  h = await header();
  check("קישור בשדה העיר הישן לא מוצג בדוכן", !h.includes("duchan.app/abcde"));

  await setCity("נשר חיפה", null);
  h = await header();
  check("כתיב שאינו שם של יישוב לא מוצג", !h.includes("נשר"));

  await setCity("‏נשר ", null); // עם תו כיווניות נסתר ורווח
  h = await header();
  check("טקסט ישן שהוא שם מדויק של יישוב ממשיך להופיע", h.includes("נשר"));

  await setCity("הסקווישים הכי שווים", 8600);
  h = await header();
  check("כשיש מזהה, מוצג שם היישוב ולא הטקסט הישן", h.includes("רמת גן") && !h.includes("הכי שווים"));

  /* ── 3. בוחר העיר בהגדרות ── */
  await setCity("טקסט ישן לבדיקה", null);
  const girl = await phone();
  await girl.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("duchan-live-quiet", "1"); } catch {} });
  await girl.goto(`${BASE}/login`);
  await verifyPhone(girl, "0501234567");
  await girl.waitForURL("**/dashboard", { timeout: 20000 });
  const openDetails = async () => {
    await girl.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
    await girl.waitForSelector("[data-testid=settings-hub]");
    if (!(await girl.locator("[data-testid=hub-details]").isVisible())) await girl.click("[data-testid=hub-more]");
    await girl.click("[data-testid=hub-details]");
    await girl.waitForSelector("[data-testid=city-input]");
  };
  const row = async () => (await db.query("select city, city_id from stores where id=$1", [store.id])).rows[0];
  const save = async () => {
    await girl.click("[data-testid=save-settings]");
    await girl.waitForSelector("[data-testid=save-settings]", { state: "detached", timeout: 10000 });
  };

  await openDetails();
  check("אין יותר שדה טקסט חופשי לעיר", (await girl.locator("input[aria-label='עיר בארץ']").count()) === 0);
  check("טקסט ישן שאינו יישוב לא נטען לשדה", (await girl.inputValue("[data-testid=city-input]")) === "");

  await girl.fill("[data-testid=city-input]", "נש");
  await girl.waitForSelector("[data-testid=city-option]");
  const opts = await girl.locator("[data-testid=city-option]").allTextContents();
  check("מקלידים 'נש' ומקבלים הצעות, 'נשר' ראשונה", opts[0] === "נשר" && opts.length > 1 && opts.length <= 6, opts.join(" · "));
  await girl.locator("[data-testid=city-option]").first().click();
  check("הבחירה ממלאת את השדה", (await girl.inputValue("[data-testid=city-input]")) === "נשר");
  await save();
  let r = await row();
  check("נשמר סמל היישוב (2500), והטקסט הישן לא נגעו בו", r.city_id === 2500 && r.city === "טקסט ישן לבדיקה", JSON.stringify(r));
  h = await header();
  check("הדוכן מציג את העיר שנבחרה", h.includes("נשר"));

  await openDetails();
  check("אחרי טעינה מחדש העיר בשדה", (await girl.inputValue("[data-testid=city-input]")) === "נשר");
  await girl.fill("[data-testid=city-input]", "0501234567");
  check("מספר טלפון: אין הצעות, ויש הסבר",
    (await girl.locator("[data-testid=city-option]").count()) === 0 && (await girl.locator("[data-testid=city-none]").count()) === 1);
  await girl.locator("input[aria-label='גיל']").click(); // יציאה מהשדה
  check("מה שלא ברשימה לא נשאר בשדה", (await girl.inputValue("[data-testid=city-input]")) === "נשר");
  check("ואין מה לשמור", (await girl.locator("[data-testid=save-settings]").count()) === 0);

  await girl.fill("[data-testid=city-input]", "באר שבע");
  await girl.locator("input[aria-label='גיל']").click();
  check("שם מלא ומדויק נבחר גם בלי ללחוץ על הרשימה", (await girl.inputValue("[data-testid=city-input]")) === "באר שבע");
  await save();
  r = await row();
  check("ונשמר (9000)", r.city_id === 9000, String(r.city_id));

  await openDetails();
  await girl.fill("[data-testid=city-input]", "");
  await girl.locator("input[aria-label='גיל']").click();
  await save();
  r = await row();
  check("מחיקת השדה מסירה את העיר", r.city_id === null);
  h = await header();
  check("והדוכן לא מציג עיר", !h.includes("באר שבע") && !h.includes("טקסט ישן"));
  await browser.close();

  /* ── 4. מה שהדפדפן לא יכול לכתוב ── */
  const asOwner = async (sql, params = []) => {
    const c = await db.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('app.uid', $1, true)`, [store.owner_id]);
      await c.query("set local role authenticated");
      const out = await c.query(sql, params);
      await c.query("commit");
      return { ok: true, out };
    } catch (e) {
      await c.query("rollback").catch(() => {});
      return { ok: false, error: e.message };
    } finally {
      c.release();
    }
  };
  await setCity("ערך ישן", null);
  const w1 = await asOwner("update stores set city='050-1112233', city_id=8600 where id=$1", [store.id]);
  r = await row();
  check("בעלת הדוכן כותבת מזהה, אבל לא טקסט חופשי", w1.ok && r.city_id === 8600 && r.city === "ערך ישן", JSON.stringify(r));
  const w2 = await asOwner("update stores set city_id=999999 where id=$1", [store.id]);
  check("מזהה שלא קיים ברשימה נדחה", !w2.ok && /foreign key|violates/i.test(w2.error ?? ""), (w2.error ?? "").slice(0, 80));

  /* ── 5. רשימת הבדיקה בחמ"ל ── */
  await db.query("update stores set city='יוקעם', city_id=null, city_reviewed_at=null where id=$1", [store.id]);
  const b2 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const admin = await (await b2.newContext({ viewport: { width: 720, height: 900 } })).newPage();
  await admin.goto(`${BASE}/login`);
  await verifyPhone(admin, "0509990000");
  await admin.waitForTimeout(1200);
  const anon = await fetch(`${BASE}/api/admin/cities`);
  check("רשימת הבדיקה סגורה למי שאינה מנהלת", anon.status === 403);
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await admin.waitForSelector("[data-testid=admin-cities]", { timeout: 15000 });
  const mine = admin.locator("[data-testid=admin-city-row]").filter({ has: admin.locator(`a[href='/s/${store.slug}']`) });
  check("דוכן עם טקסט שלא זוהה מופיע ברשימה, עם מה שנכתב במקור", (await mine.count()) === 1 && ((await mine.locator("[data-testid=admin-city-old]").textContent()) ?? "") === "יוקעם");
  check("בלי בחירה אי אפשר לשמור עיר", await mine.locator("[data-testid=admin-city-save]").isDisabled());
  await mine.locator("[data-testid=city-input]").fill("יקנע");
  await mine.locator("[data-testid=city-option]", { hasText: /^יקנעם עילית$/ }).click();
  await mine.locator("[data-testid=admin-city-save]").click();
  await admin.waitForFunction((slug) => !document.querySelector(`[data-testid=admin-city-row] a[href='/s/${slug}']`), store.slug, { timeout: 10000 });
  let rr = (await db.query("select city, city_id, city_reviewed_at from stores where id=$1", [store.id])).rows[0];
  check("המנהלת בחרה עיר: נשמר המזהה (240), והטקסט הישן לא נמחק", rr.city_id === 240 && rr.city === "יוקעם" && rr.city_reviewed_at !== null, JSON.stringify(rr));

  await db.query("update stores set city='חיפה נשר', city_id=null, city_reviewed_at=null where id=$1", [store.id]);
  await admin.reload({ waitUntil: "networkidle" });
  const again = admin.locator("[data-testid=admin-city-row]").filter({ has: admin.locator(`a[href='/s/${store.slug}']`) });
  await again.locator("[data-testid=admin-city-empty]").click();
  await admin.waitForFunction((slug) => !document.querySelector(`[data-testid=admin-city-row] a[href='/s/${slug}']`), store.slug, { timeout: 10000 });
  rr = (await db.query("select city, city_id, city_reviewed_at from stores where id=$1", [store.id])).rows[0];
  check("'להשאיר בלי עיר': יורד מהרשימה, בלי עיר, והטקסט הישן נשאר", rr.city_id === null && rr.city === "חיפה נשר" && rr.city_reviewed_at !== null);
  const w3 = await asOwner("update stores set city_reviewed_at=null where id=$1", [store.id]);
  rr = (await db.query("select city_reviewed_at from stores where id=$1", [store.id])).rows[0];
  check("בעלת דוכן לא משנה את סימון הבדיקה", w3.ok && rr.city_reviewed_at !== null);
  await b2.close();
} finally {
  await setCity(restore.city, restore.city_id);
  await db.query("update stores set city_reviewed_at=null where id=$1", [store.id]).catch(() => {});
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} city checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
