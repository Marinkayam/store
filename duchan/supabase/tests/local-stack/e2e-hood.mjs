// E2E: השוק של השכונה (0077). מרינה, 11.2026: "בוא נעשה בשכונה".
//
// החוזים:
//   1. דוכן בוחר עיר ושכונה. שכונה שאין ברשימה: ההורה כותב שם, והוא מחכה לחמ"ל.
//      טקסט חופשי לא יוצר שכונה.
//   2. בלי אישור הורה אין כניסה לשוק. לינק הורה בלי טוקן תקין לא מראה כלום.
//   3. בחמ"ל מאשרים שכונה חדשה, ורק אז נוצרת שורה ב-neighborhoods.
//   4. הזמנה משכן: הדף הציבורי לא מגלה את שם השכונה. אחרי כניסה השכונה
//      נבחרת מראש, וההורה מאשר. invited_by נשמר.
//   5. השוק נראה רק לחברים. דוכן אחר לא יכול לקרוא שוק של מישהו אחר.
//      בתשובה אין טלפון, שם הורה או כתובת.
//   6. אותה שכונה בכתיב אחר ("הדקלים" / "שכונת הדקלים") נכנסת לאותה שורה.
//   7. "לא עכשיו" של ההורה, ויציאה מהשוק.
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
const one = async (q, a) => (await db.query(q, a)).rows[0];
const A = await one("select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1");
const B = await one("select * from stores where contact_phone='972521110001' order by created_at limit 1");
const C = await one("select * from stores where contact_phone='972529998877' order by created_at limit 1");
const saved = await db.query("select id, city_id, activated_at from stores where id = any($1)", [[A.id, B.id, C.id]]);

await db.query("delete from neighborhood_members where store_id = any($1)", [[A.id, B.id, C.id]]);
await db.query("delete from neighborhoods where locality_id=$1", [YAVNE]);
await db.query("update stores set city_id=$1 where id=$2", [YAVNE, A.id]);
await db.query("update stores set activated_at=coalesce(activated_at, now()) where id = any($1)", [[B.id, C.id]]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const login = async (p, phone) => {
  await p.goto(`${BASE}/login`);
  await verifyPhone(p, phone);
  await p.waitForURL(/dashboard|onboarding|admin/, { timeout: 20000 });
};
const linkFromWa = (href) => decodeURIComponent(href ?? "").match(/https?:\/\/[^\s]*\/parent\/\S+/)?.[0] ?? "";

try {
  /* ── 1. A: עיר מהדוכן, אין שכונות → "להוסיף את השכונה שלנו" ── */
  const a = await page();
  await login(a, "0501234567");
  await a.goto(`${BASE}/dashboard/hood`, { waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=hood-choose]", { timeout: 15000 });
  await a.waitForSelector("[data-testid=hood-first]", { timeout: 15000 });
  check("עיר שאין בה שכונות: 'אתם הראשונים'", (await a.locator("[data-testid=hood-first]").innerText()).includes("יבנה"));
  await a.click("[data-testid=hood-other]");
  await a.click("[data-testid=hood-submit]");
  await a.waitForSelector("[data-testid=hood-wait-parent]", { timeout: 15000 });
  const parentA = linkFromWa(await a.getAttribute("[data-testid=hood-send-parent]", "href"));
  check("אחרי הבחירה: מחכים להורים, עם לינק אישי בוואטסאפ", parentA.includes(`/parent/${A.slug}/hood?t=`), parentA.slice(-50));
  check("בלי אישור הורה הדוכן לא בשוק", (await one("select status from neighborhood_members where store_id=$1", [A.id])).status === "parent");

  /* ── 2. לינק הורה בלי טוקן: כלום ── */
  const bad = await page();
  await bad.goto(`${BASE}/parent/${A.slug}/hood?t=xxxxxxxxxxxxxxxx`, { waitUntil: "networkidle" });
  check("לינק הורה עם טוקן לא נכון: לא מראה כלום", (await bad.locator("[data-testid=hood-parent-invalid]").count()) === 1 && (await bad.locator("[data-testid=hood-parent-ask]").count()) === 0);
  const forged = await (await fetch(`${BASE}/api/parent/hood`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: A.slug, t: "xxxxxxxxxxxxxxxx", approve: true, name: "זיוף" }) })).status;
  check("ואישור בלי טוקן נדחה", forged === 403, String(forged));

  /* ── 3. ההורה של A כותב שם → לבדיקה ── */
  const pa = await page();
  await pa.goto(parentA, { waitUntil: "networkidle" });
  const askText = await pa.locator("[data-testid=hood-parent-ask]").innerText();
  check("ההורה רואה מי יראה ומה לא נחשף", askText.includes("רק דוכנים מאותה שכונה") && askText.includes("שם פרטי, שם משפחה, טלפון, כתובת"));
  check("בלי שם: אי אפשר לאשר", await pa.locator("[data-testid=hood-parent-approve]").isDisabled());
  await pa.fill("[data-testid=hood-parent-name]", "שכונת הדקלים");
  await pa.click("[data-testid=hood-parent-approve]");
  await pa.waitForSelector("[data-testid=hood-parent-review]", { timeout: 15000 });
  const mA = await one("select * from neighborhood_members where store_id=$1", [A.id]);
  check("שם שההורה כתב לא יוצר שכונה: מחכה לחמ\"ל", mA.status === "review" && mA.requested_name === "שכונת הדקלים" && !mA.neighborhood_id);
  check("ואין עדיין שכונה ביבנה", Number((await one("select count(*) n from neighborhoods where locality_id=$1", [YAVNE])).n) === 0);
  await a.reload({ waitUntil: "networkidle" });
  check("אצל הילדים: 'ההורים אישרו!' ובודקים את השם", (await a.locator("[data-testid=hood-review]").count()) === 1);

  /* ── 4. חמ"ל ── */
  const adm = await page();
  await login(adm, "0509990000");
  await adm.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const row = adm.locator("[data-testid=admin-hood-row]").filter({ hasText: "שכונת הדקלים" });
  await row.waitFor({ timeout: 15000 });
  check("בחמ\"ל: 'שכונות לבדיקה' עם מה שההורה כתב", (await row.count()) === 1);
  await row.locator("[data-testid=admin-hood-create]").click();
  await adm.waitForFunction(() => !document.body.innerText.includes("שכונת הדקלים"), null, { timeout: 15000 }).catch(() => {});
  const hood = await one("select * from neighborhoods where locality_id=$1", [YAVNE]);
  check("אחרי אישור: שכונה אחת, עם מפתח בלי 'שכונת'", !!hood && hood.name === "שכונת הדקלים" && hood.name_key === "הדקלים", JSON.stringify(hood && { name: hood.name, key: hood.name_key }));
  check("והדוכן בשוק", (await one("select status from neighborhood_members where store_id=$1", [A.id])).status === "active");

  await a.reload({ waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=hood-stalls]", { timeout: 15000 });
  check("השוק: הכותרת היא שם השכונה", (await a.locator("[data-testid=hood-title]").innerText()) === "שכונת הדקלים");
  check("דוכן אחד, שלי, ו'אתם הראשונים בשוק!'", (await a.locator("[data-testid=hood-stall]").count()) === 1 && (await a.locator("[data-testid=hood-invite]").innerText()).includes("אתם הראשונים"));

  /* ── 5. B מוזמן ── */
  const invite = `${BASE}/hood?h=${hood.id}&from=${A.slug}`;
  const b = await page();
  await b.goto(invite, { waitUntil: "networkidle" });
  const pub = await b.locator("[data-testid=hood-invite-page]").innerText();
  check("דף ההזמנה הציבורי לא מגלה שכונה, עיר או דוכן", !pub.includes("הדקלים") && !pub.includes("יבנה") && !pub.includes(A.display_name));
  await login(b, "0521110001");
  await b.goto(`${BASE}/dashboard/hood`, { waitUntil: "networkidle" });
  const opt = b.locator("[data-testid=hood-option]").filter({ hasText: "הזמינו אתכם לכאן" });
  await opt.waitFor({ timeout: 15000 });
  check("אחרי כניסה: העיר והשכונה מההזמנה נבחרו מראש", (await opt.getAttribute("aria-checked")) === "true" && (await opt.innerText()).includes("שכונת הדקלים"));
  await b.click("[data-testid=hood-submit]");
  await b.waitForSelector("[data-testid=hood-wait-parent]", { timeout: 15000 });
  const parentB = linkFromWa(await b.getAttribute("[data-testid=hood-send-parent]", "href"));
  const pb = await page();
  await pb.goto(parentB, { waitUntil: "networkidle" });
  check("שכונה מהרשימה: ההורה לא צריך לכתוב שם", (await pb.locator("[data-testid=hood-parent-name]").count()) === 0 && (await pb.locator("[data-testid=hood-parent-ask]").innerText()).includes("שכונת הדקלים, יבנה"));
  await pb.click("[data-testid=hood-parent-approve]");
  await pb.waitForSelector("[data-testid=hood-parent-active]", { timeout: 15000 });
  const mB = await one("select * from neighborhood_members where store_id=$1", [B.id]);
  check("אחרי אישור ההורה: בשוק מיד, ונשמר מי הזמין", mB.status === "active" && mB.neighborhood_id === hood.id && mB.invited_by === A.id);

  await a.reload({ waitUntil: "networkidle" });
  await a.waitForSelector("[data-testid=hood-stalls]");
  check("A רואה עכשיו שני דוכנים, כולל של B", (await a.locator("[data-testid=hood-stall]").count()) === 2 && (await a.locator("[data-testid=hood-stalls]").innerText()).includes(B.display_name));
  const json = await a.evaluate(async (id) => await (await fetch(`/api/hood?storeId=${id}`)).text(), A.id);
  check("בתשובה של השוק אין טלפון, שם הורה או מייל", !json.includes("972") && !json.includes("parent_") && !json.includes("contact_phone") && !json.includes("@"));

  /* ── 6. C: לא בשוק, לא רואה, ואותה שכונה בכתיב אחר ── */
  const c = await page();
  await login(c, "0529998877");
  const peek = await c.evaluate(async (id) => (await fetch(`/api/hood?storeId=${id}`)).status, A.id);
  check("דוכן אחר לא יכול לקרוא את השוק של A", peek === 403, String(peek));
  const own = await c.evaluate(async (id) => await (await fetch(`/api/hood?storeId=${id}`)).json(), C.id);
  check("C, שלא בשוק: בלי דוכנים", own.state === "none" && !own.stalls);
  // C בוחר "לא ברשימה", ההורה כותב "הדקלים" — אותה שכונה
  await c.evaluate(async ({ id, city }) => fetch("/api/hood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: id, cityId: city, other: true }) }), { id: C.id, city: YAVNE });
  const st = await c.evaluate(async (id) => await (await fetch(`/api/hood?storeId=${id}`)).json(), C.id);
  const pc = await page();
  await pc.goto(`${BASE}${st.parentPath}`, { waitUntil: "networkidle" });
  await pc.fill("[data-testid=hood-parent-name]", "הדקלים");
  await pc.click("[data-testid=hood-parent-approve]");
  await pc.waitForSelector("[data-testid=hood-parent-active]", { timeout: 15000 });
  const mC = await one("select * from neighborhood_members where store_id=$1", [C.id]);
  check("'הדקלים' ו'שכונת הדקלים' הן אותה שכונה: בלי שורה חדשה", mC.neighborhood_id === hood.id && Number((await one("select count(*) n from neighborhoods where locality_id=$1", [YAVNE])).n) === 1);

  /* ── 7. יציאה, ו"לא עכשיו" ── */
  await c.goto(`${BASE}/dashboard/hood`, { waitUntil: "networkidle" });
  await c.click("[data-testid=hood-leave]");
  await c.click("[data-testid=hood-leave-yes]");
  await c.waitForSelector("[data-testid=hood-choose]", { timeout: 15000 });
  check("יוצאים מהשוק: חוזרים לבחירה", (await one("select status from neighborhood_members where store_id=$1", [C.id])).status === "left");
  await c.evaluate(async ({ id, hid }) => fetch("/api/hood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: id, cityId: 2660, neighborhoodId: hid }) }), { id: C.id, hid: hood.id });
  await pc.goto(`${BASE}${st.parentPath}`, { waitUntil: "networkidle" });
  await pc.click("[data-testid=hood-parent-decline]");
  await pc.waitForSelector("[data-testid=hood-parent-none]", { timeout: 15000 });
  check("'לא עכשיו' של ההורה: לא בשוק", (await one("select status from neighborhood_members where store_id=$1", [C.id])).status === "left");

  /* ── 8. כניסה ממסך ההזמנות ומההגדרות ── */
  await a.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const entry = a.locator("[data-testid=hood-entry-row]");
  check("במסך ההזמנות: שורה עם שם השכונה", await entry.waitFor({ timeout: 15000 }).then(async () => (await entry.innerText()).includes("שכונת הדקלים")).catch(() => false));
  await a.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  check("בהגדרות: 'השוק של השכונה'", (await a.locator("[data-testid=settings-hood-link]").count()) === 1);
} finally {
  await browser.close();
  await db.query("delete from neighborhood_members where store_id = any($1)", [[A.id, B.id, C.id]]);
  await db.query("delete from neighborhoods where locality_id=$1", [YAVNE]);
  for (const r of saved.rows) await db.query("update stores set city_id=$2, activated_at=$3 where id=$1", [r.id, r.city_id, r.activated_at]);
  await closeHelper?.();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
