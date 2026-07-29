/**
 * חבילה 9 — כתיבה שנכשלת אומרת את זה.
 *
 * הבאג שהחבילה הזו נולדה ממנו: קוד המדבקות עלה לפרודקשן 43 דקות לפני
 * שהעמודה נוצרה שם. ה-insert נכשל, ה-catch כתב לקונסולה והמשיך, והילדה
 * ראתה "האוסף נוצר" ונחתה על גלריה ריקה. שש שעות, בלי שאיש ידע.
 *
 * החוזה: **מסך הצלחה מופיע רק כשיש מזהה שורה מהדאטהבייס.** לא בהיעדר
 * חריגה, לא אחרי ניווט, ולא "כמעט".
 */
import {
  BASE, IMG, checker, closeHelper, db, launch, uidOf, verifyPhone, wipe,
} from "./helpers/index.mjs";

const U = { fay: { num: "0521130701", e164: "972521130701", nick: "FayW", title: "מדף כישלון" } };
const pool = db();
await wipe(pool, [U.fay.e164]);

const { check, done } = checker("בדיקות כשל כתיבה");
const errs = [];
const b = await launch();

const page = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
page.on("pageerror", (e) => errs.push(e.message));

/** בונה טיוטה של אוסף עד מסך השמירה, בלי לשמור. */
async function buildDraft(names) {
  await page.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.click("a[href='/squish/new']");
  await page.waitForURL("**/squish/new");
  for (const [i, name] of names.entries()) {
    await page.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
    await page.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
    await page.waitForTimeout(600);
    await page.fill("input[aria-label='שם הסקווישי']", name);
    await page.click("button:has-text('הלאה')");
    await page.waitForTimeout(250);
    await page.click("button:has-text('להוסיף לאוסף')");
    await page.waitForTimeout(400);
  }
  await page.fill("input[aria-label='שם האוסף']", U.fay.title);
  await page.click("button:has-text('לשמור את האוסף')");
  await page.fill("input[aria-label='כינוי']", U.fay.nick);
  await page.check("input[aria-label='ההורים שלי יודעים']");
  await page.waitForTimeout(300);
}

/* ── 1. כישלון כתיבה: אין מסך הצלחה, אין גלריה ריקה ── */
await buildDraft(["כ1", "כ2", "כ3"]);

/* מפילים את הכתיבה בשרת. זה מדמה בדיוק את מה שקרה בפרודקשן: הבקשה
   יוצאת, הדאטהבייס מסרב, והלקוח צריך להחליט מה להראות. */
let failNext = true;
await page.route("**/api/squish/items", async (route) => {
  if (!failNext) return route.continue();
  await route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: "לא הצלחנו לשמור את הסקווישי", reason: "schema_behind", cid: "test-cid-1" }),
  });
});

await verifyPhone(page, U.fay.num);
await page.waitForSelector("[data-testid=save-failed]", { timeout: 40000 });
const failBody = await page.textContent("body");

check("מסך הכישלון מוצג", await page.locator("[data-testid=save-failed]").isVisible());
check("ולא מוצג מסך הצלחה", !failBody.includes("האוסף נוצר"));
check("ולא עברנו לגלריה", !page.url().includes("/squish/collection"), page.url());
check("הנוסח אומר מה קרה", failBody.includes("לא הצלחנו לשמור את הסקווישי"));
check("ומבטיח שהפרטים נשמרו במסך", failBody.includes("הפרטים שלך נשמרו במסך"));
check("ואומר על איזה סקווישי נתקענו", failBody.includes("כ1"), failBody.slice(0, 0) || "כ1");
check("יש כפתור לנסות שוב", await page.locator("[data-testid=save-retry]").isEnabled());
check("ויש דרך לחזור ולבדוק", failBody.includes("לחזור ולבדוק את הפרטים"));
check("ומזהה המתאם מוצג, כדי שאפשר יהיה למצוא את זה בלוג", failBody.includes("test-cid-1"));

const { rows: [none] } = await pool.query(
  "select count(*)::int c from squish_items i join squish_profiles p on p.id=i.profile_id" +
  " join phone_accounts a on a.user_id=p.user_id where a.phone=$1", [U.fay.e164]);
check("ושום פריט לא נכתב", none.c === 0, String(none.c));

/* ── 2. ניסיון חוזר יוצר בדיוק פריט אחד לכל אחד ── */
failNext = false;
await page.click("[data-testid=save-retry]");
await page.waitForURL("**/squish/collection", { timeout: 40000 });
await page.waitForTimeout(1200);

const fayId = await uidOf(pool, U.fay.e164);
const { rows: items } = await pool.query(
  "select name from squish_items where owner_user_id=$1 order by sort_order", [fayId]);
check("אחרי ניסיון חוזר נשמרו שלושה", items.length === 3, `${items.length}`);
check("בלי כפילויות", new Set(items.map((i) => i.name)).size === 3,
  items.map((i) => i.name).join(","));

/* ── 3. כישלון חלקי לא משכפל את מה שכבר נשמר ── */
await wipe(pool, [U.fay.e164]);
const page2 = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const saved = [];
let failOn = 2; // הפריט השלישי ייפול
await page2.route("**/api/squish/items", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  if (body.item?.sort_order === failOn) {
    return route.fulfill({
      status: 502, contentType: "application/json",
      body: JSON.stringify({ error: "נפילה", reason: "write_failed", cid: "test-cid-2" }),
    });
  }
  saved.push(body.item?.sort_order);
  return route.continue();
});

const orig = page;
// eslint-disable-next-line no-global-assign
await (async () => {
  const p = page2;
  await p.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p.click("a[href='/squish/new']");
  await p.waitForURL("**/squish/new");
  for (const [i, name] of ["ח1", "ח2", "ח3"].entries()) {
    await p.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
    await p.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
    await p.waitForTimeout(600);
    await p.fill("input[aria-label='שם הסקווישי']", name);
    await p.click("button:has-text('הלאה')");
    await p.waitForTimeout(250);
    await p.click("button:has-text('להוסיף לאוסף')");
    await p.waitForTimeout(400);
  }
  await p.fill("input[aria-label='שם האוסף']", "מדף חלקי");
  await p.click("button:has-text('לשמור את האוסף')");
  await p.fill("input[aria-label='כינוי']", U.fay.nick);
  await p.check("input[aria-label='ההורים שלי יודעים']");
  await p.waitForTimeout(300);
  await verifyPhone(p, U.fay.num);
})();

await page2.waitForSelector("[data-testid=save-failed]", { timeout: 40000 });
const partialBody = await page2.textContent("body");
check("כישלון בפריט השלישי עוצר, ולא מציג הצלחה כללית",
  !partialBody.includes("האוסף נוצר") && partialBody.includes("לא הצלחנו לשמור"));
check("והמסך אומר שהשניים הראשונים כבר נשמרו",
  partialBody.includes("2 כבר נשמרו"), partialBody.match(/\d+ כבר נשמרו/)?.[0] ?? "—");

const fay2 = await uidOf(pool, U.fay.e164);
const { rows: partial } = await pool.query(
  "select sort_order from squish_items where owner_user_id=$1 order by sort_order", [fay2]);
check("ובדאטהבייס יש בדיוק שניים", partial.length === 2, `${partial.length}`);

failOn = -1;
await page2.click("[data-testid=save-retry]");
await page2.waitForURL("**/squish/collection", { timeout: 40000 });
await page2.waitForTimeout(1200);
const { rows: after } = await pool.query(
  "select sort_order from squish_items where owner_user_id=$1 order by sort_order", [fay2]);
check("ניסיון חוזר משלים לשלושה ולא מכפיל", after.length === 3, `${after.length}`);
check("והסדר נשמר", after.map((r) => r.sort_order).join(",") === "0,1,2",
  after.map((r) => r.sort_order).join(","));

/* ── 4. השרת עצמו: נפילה חוזרת בטוחה, ולוג בלי אנשים ── */
const api = (payload) => page2.evaluate((p) =>
  fetch("/api/squish/items", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  }).then(async (r) => ({ s: r.status, b: await r.json() })), payload);

const { rows: [prof] } = await pool.query("select id from squish_profiles where user_id=$1", [fay2]);
const okRes = await api({ profileId: prof.id, item: { name: "דרך השרת", image_key: "k/1.webp", sort_order: 9 } });
check("כתיבה דרך השרת מחזירה מזהה", okRes.s === 200 && !!okRes.b.id, `${okRes.s}`);
check("ובלי שדות שירדו כשהסכמה מלאה",
  Array.isArray(okRes.b.dropped) && okRes.b.dropped.length === 0, JSON.stringify(okRes.b.dropped));

const noMedia = await api({ profileId: prof.id, item: { name: "בלי מדיה", sort_order: 10 } });
check("סקווישי בלי תמונה ובלי סרטון נדחה", noMedia.s === 400, `${noMedia.s}`);
check("ושדה חובה לא מוסר כדי 'להצליח'",
  (await pool.query("select count(*)::int c from squish_items where name='בלי מדיה'")).rows[0].c === 0);

const foreign = await api({ profileId: "00000000-0000-0000-0000-000000000000", item: { name: "זר", image_key: "k/2.webp" } });
check("אי אפשר לכתוב לאוסף של מישהי אחרת", foreign.s === 404, `${foreign.s}`);

const anon = await (await b.newContext()).newPage();
await anon.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
const anonRes = await anon.evaluate(() =>
  fetch("/api/squish/items", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: "x", item: { name: "x" } }),
  }).then(async (r) => ({ s: r.status, t: await r.text() })));
check("ומי שלא מחוברת בכלל מקבלת 401", anonRes.s === 401, `${anonRes.s}`);
check("ובלי דליפת פרטים בתשובה", !anonRes.t.includes(U.fay.e164));

/* ── 5. פרוב הסכמה ── */
const pre = await page2.evaluate(() => fetch("/api/squish/preflight").then((r) => r.json()));
check("פרוב הסכמה עונה שהכל קיים",
  pre.ok === true && pre.missingColumns.length === 0 && pre.missingFunctions.length === 0,
  JSON.stringify(pre).slice(0, 80));

/* מפילים עמודה אופציונלית ומוודאים שהפרוב תופס — זו כל מטרתו */
await pool.query("alter table squish_items drop column if exists series");
await pool.query("notify pgrst, 'reload schema'");
await page2.waitForTimeout(1200);
const preBad = await page2.evaluate(() => fetch("/api/squish/preflight").then((r) => r.json()));
check("וכשעמודה חסרה הוא אומר בדיוק איזו",
  preBad.ok === false && preBad.missingColumns.includes("squish_items.series"),
  JSON.stringify(preBad.missingColumns ?? []));

/* ובאותו מצב, כתיבה עדיין מצליחה — ומדווחת מה ירד */
const degraded = await api({
  profileId: prof.id,
  item: { name: "בלי סדרה", image_key: "k/3.webp", series: "סדרה", sort_order: 11 },
});
check("כתיבה נופלת חזרה על שדה אופציונלי חסר ומצליחה",
  degraded.s === 200 && !!degraded.b.id, `${degraded.s}`);
check("ומדווחת במפורש מה ירד, בלי לבלוע",
  (degraded.b.dropped ?? []).includes("series"), JSON.stringify(degraded.b.dropped));

await pool.query("alter table squish_items add column if not exists series text");
await pool.query("notify pgrst, 'reload schema'");
await page2.waitForTimeout(1200);
check("ואחרי שהעמודה חוזרת הפרוב שוב שקט",
  (await page2.evaluate(() => fetch("/api/squish/preflight").then((r) => r.json()))).ok === true);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await orig.context().close().catch(() => {});
await b.close();
await closeHelper();
await pool.end();
process.exit(done());
