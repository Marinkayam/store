// E2E: השוק של העיר (0077). מרינה, 11.2026: "שיהיה עיר, ואז יהיה אחד ליד
// השני, ואז כשנגדל נוכל לסווג את זה בשכונות".
//
// החוזים:
//   1. בוחרים עיר מהרשימה. בלי אישור הורה אין כניסה לשוק.
//   2. לינק הורה בלי טוקן תקין לא מראה כלום, ואישור בלי טוקן נדחה.
//   3. ההורה רואה מי יראה ומה לא נחשף, ומאשר. הדוכן בשוק מיד.
//   4. הזמנה מחבר: הדף הציבורי לא מגלה עיר או דוכן. אחרי כניסה העיר
//      נבחרת מראש, וההורה מאשר. invited_by נשמר.
//   5. השוק נראה רק לחברים, ורק דוכנים מאותה עיר. דוכן אחר לא יכול לקרוא
//      שוק של מישהו אחר. בתשובה אין טלפון, שם הורה או מייל.
//   6. "לא עכשיו" של ההורה, ויציאה מהשוק.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const YAVNE = 2660;
const REHOVOT = 8400;
const one = async (q, a) => (await db.query(q, a)).rows[0];
const A = await one("select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1");
const B = await one("select * from stores where contact_phone='972521110001' order by created_at limit 1");
const C = await one("select * from stores where contact_phone='972529998877' order by created_at limit 1");
const saved = await db.query("select id, city_id, activated_at from stores where id = any($1)", [[A.id, B.id, C.id]]);

await db.query("delete from community_members where store_id = any($1)", [[A.id, B.id, C.id]]);
await db.query("update stores set city_id=$1 where id=$2", [YAVNE, A.id]);
await db.query("update stores set city_id=null where id=$1", [B.id]);
await db.query("update stores set activated_at=coalesce(activated_at, now()) where id = any($1)", [[B.id, C.id]]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const login = async (p, phone) => {
  await p.goto(`${BASE}/login`);
  await verifyPhone(p, phone);
  await p.waitForURL(/dashboard|onboarding|admin/, { timeout: 20000 });
};
const parentLinkOf = (href) => decodeURIComponent(href ?? "").match(/https?:\/\/[^\s]*\/parent\/\S+/)?.[0] ?? "";

try {
  /* ── 1. A: העיר מהדוכן כבר בחורה ── */
  const a = await page();
  await login(a, "0501234567");
  await a.goto(`${BASE}/dashboard/market`, { waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=market-choose]", { timeout: 15000 });
  check("העיר של הדוכן נבחרת מראש", (await a.inputValue("[data-testid=market-choose] input")) === "יבנה");
  await a.click("[data-testid=market-submit]");
  await a.waitForSelector("[data-testid=market-wait-parent]", { timeout: 15000 });
  const parentA = parentLinkOf(await a.getAttribute("[data-testid=market-send-parent]", "href"));
  check("אחרי הבחירה: מחכים להורים, עם לינק אישי בוואטסאפ", parentA.includes(`/parent/${A.slug}/market?t=`), parentA.slice(-45));
  check("בלי אישור הורה הדוכן לא בשוק", (await one("select status from community_members where store_id=$1", [A.id])).status === "parent");

  /* ── 2. לינק הורה בלי טוקן ── */
  const bad = await page();
  await bad.goto(`${BASE}/parent/${A.slug}/market?t=xxxxxxxxxxxxxxxx`, { waitUntil: "networkidle" });
  check("לינק הורה עם טוקן לא נכון: לא מראה כלום", (await bad.locator("[data-testid=market-parent-invalid]").count()) === 1 && (await bad.locator("[data-testid=market-parent-ask]").count()) === 0);
  const forged = (await fetch(`${BASE}/api/parent/market`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: A.slug, t: "xxxxxxxxxxxxxxxx", approve: true }) })).status;
  check("ואישור בלי טוקן נדחה", forged === 403, String(forged));

  /* ── 3. ההורה של A מאשר ── */
  const pa = await page();
  await pa.goto(parentA, { waitUntil: "networkidle" });
  const ask = await pa.locator("[data-testid=market-parent-ask]").innerText();
  check("ההורה רואה לאיזו עיר, מי יראה ומה לא נחשף", ask.includes("לשוק של יבנה") && ask.includes("רק דוכנים מיבנה") && ask.includes("שם פרטי, שם משפחה, טלפון, כתובת"));
  await pa.click("[data-testid=market-parent-approve]");
  await pa.waitForSelector("[data-testid=market-parent-active]", { timeout: 15000 });
  const mA = await one("select * from community_members where store_id=$1", [A.id]);
  check("אחרי אישור ההורה: בשוק", mA.status === "active" && !!mA.parent_approved_at && mA.locality_id === YAVNE);

  await a.reload({ waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=market-stalls]", { timeout: 15000 });
  check("השוק: 'השוק של יבנה'", (await a.locator("[data-testid=market-title]").innerText()) === "השוק של יבנה");
  check("דוכן אחד, שלי, ו'אתם הראשונים בשוק!'", (await a.locator("[data-testid=market-stall]").count()) === 1 && (await a.locator("[data-testid=market-invite]").innerText()).includes("אתם הראשונים"));

  /* ── 4. B מוזמן ── */
  const b = await page();
  await b.goto(`${BASE}/market?c=${YAVNE}&from=${A.slug}`, { waitUntil: "networkidle" });
  const pub = await b.locator("[data-testid=market-invite-page]").innerText();
  check("דף ההזמנה הציבורי לא מגלה עיר או דוכן", !pub.includes("יבנה") && !pub.includes(A.display_name));
  await login(b, "0521110001");
  await b.goto(`${BASE}/dashboard/market`, { waitUntil: "networkidle" });
  await b.waitForSelector("[data-testid=market-invited]", { timeout: 15000 });
  check("אחרי כניסה: העיר מההזמנה נבחרה מראש", (await b.inputValue("[data-testid=market-choose] input")) === "יבנה");
  await b.click("[data-testid=market-submit]");
  await b.waitForSelector("[data-testid=market-wait-parent]", { timeout: 15000 });
  const pb = await page();
  await pb.goto(parentLinkOf(await b.getAttribute("[data-testid=market-send-parent]", "href")), { waitUntil: "networkidle" });
  await pb.click("[data-testid=market-parent-approve]");
  await pb.waitForSelector("[data-testid=market-parent-active]", { timeout: 15000 });
  const mB = await one("select * from community_members where store_id=$1", [B.id]);
  check("B בשוק, ונשמר מי הזמין", mB.status === "active" && mB.locality_id === YAVNE && mB.invited_by === A.id);
  check("דוכן בלי עיר קיבל את העיר שבחר", (await one("select city_id from stores where id=$1", [B.id])).city_id === YAVNE);

  await a.reload({ waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=market-stalls]");
  check("A רואה עכשיו שני דוכנים, כולל של B", (await a.locator("[data-testid=market-stall]").count()) === 2 && (await a.locator("[data-testid=market-stalls]").innerText()).includes(B.display_name));
  const json = await a.evaluate(async (id) => await (await fetch(`/api/market?storeId=${id}`)).text(), A.id);
  check("בתשובה של השוק אין טלפון, שם הורה או מייל", !json.includes("972") && !json.includes("parent_") && !json.includes("contact_phone") && !json.includes("@"));

  /* ── 5. C: עיר אחרת, ולא רואה את השוק של A ── */
  const c = await page();
  await login(c, "0529998877");
  const peek = await c.evaluate(async (id) => (await fetch(`/api/market?storeId=${id}`)).status, A.id);
  check("דוכן אחר לא יכול לקרוא את השוק של A", peek === 403, String(peek));
  await c.evaluate(async ({ id, city }) => fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: id, cityId: city }) }), { id: C.id, city: REHOVOT });
  const st = await c.evaluate(async (id) => await (await fetch(`/api/market?storeId=${id}`)).json(), C.id);
  check("C מחכה להורים, בלי דוכנים", st.state === "parent" && !st.stalls);
  const pc = await page();
  await pc.goto(`${BASE}${st.parentPath}`, { waitUntil: "networkidle" });
  await pc.click("[data-testid=market-parent-approve]");
  await pc.waitForSelector("[data-testid=market-parent-active]", { timeout: 15000 });
  const cm = await c.evaluate(async (id) => await (await fetch(`/api/market?storeId=${id}`)).json(), C.id);
  check("C ברחובות רואה רק את רחובות: לא את A ו-B מיבנה", cm.state === "active" && cm.stalls.length === 1 && cm.stalls[0].mine === true);

  /* ── 6. יציאה, ו"לא עכשיו" ── */
  await c.goto(`${BASE}/dashboard/market`, { waitUntil: "networkidle" });
  await c.click("[data-testid=market-leave]");
  await c.click("[data-testid=market-leave-yes]");
  await c.waitForSelector("[data-testid=market-choose]", { timeout: 15000 });
  check("יוצאים מהשוק: חוזרים לבחירה", (await one("select status from community_members where store_id=$1", [C.id])).status === "left");
  await c.evaluate(async ({ id, city }) => fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: id, cityId: city }) }), { id: C.id, city: REHOVOT });
  await pc.goto(`${BASE}${st.parentPath}`, { waitUntil: "networkidle" });
  await pc.click("[data-testid=market-parent-decline]");
  await pc.waitForSelector("[data-testid=market-parent-none]", { timeout: 15000 });
  check("'לא עכשיו' של ההורה: לא בשוק", (await one("select status from community_members where store_id=$1", [C.id])).status === "left");

  /* ── 7. כניסה ממסך ההזמנות ומההגדרות ── */
  await a.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const entry = a.locator("[data-testid=market-entry-row]");
  check("במסך ההזמנות: 'השוק של יבנה'", await entry.waitFor({ timeout: 15000 }).then(async () => (await entry.innerText()).includes("השוק של יבנה")).catch(() => false));
  await a.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  check("בהגדרות: 'השוק של העיר'", (await a.locator("[data-testid=settings-market-link]").count()) === 1);
} finally {
  await browser.close();
  await db.query("delete from community_members where store_id = any($1)", [[A.id, B.id, C.id]]);
  for (const r of saved.rows) await db.query("update stores set city_id=$2, activated_at=$3 where id=$1", [r.id, r.city_id, r.activated_at]);
  await closeHelper?.();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
