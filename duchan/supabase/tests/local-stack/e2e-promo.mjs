// E2E: ההודעה לקונות בדף הדוכן — "מבצע החודש".
//
// הבקשה מהשטח: מקום לכתוב "בקנייה מעל ₪50 מקבלים מתנה", שאפשר לעדכן
// ולכבות. שלושת החוזים שנבדקים כאן:
//
//   1. מה שנכתב מופיע לקונות — בין הכותרת למוצרים, לא מתחת לרשת.
//   2. כיבוי מסתיר, אבל **לא מוחק** את מה שנכתב.
//   3. אורך נאכף בדאטהבייס, לא רק במסך — באנר של חמש שורות דוחף את
//      המוצרים מתחת לקפל, וזה בדיוק מה שהוא אמור למכור.
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
await db.query("update stores set promo_on=false, promo_title=null, promo_text=null where id=$1", [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

const TITLE = "מבצע החודש";
const TEXT = "בקנייה מעל ₪50 מקבלים מחזיק מפתחות מתנה 🎁";

/* ── 1. לפני שכתבה משהו, אין באנר ── */
const buyer0 = await phone();
await buyer0.goto(fresh(), { waitUntil: "networkidle" });
check("בלי הודעה, אין באנר בדוכן",
  (await buyer0.locator("[data-testid=store-promo]").count()) === 0);

/* ── 2. היא כותבת ומפרסמת ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("input[aria-label='כותרת ההודעה']", { timeout: 20000 });

check("המתג כבוי כברירת מחדל",
  (await girl.getAttribute("[data-testid=promo-toggle]", "aria-pressed")) === "false");
check("ואין תצוגה מקדימה כשאין טקסט",
  (await girl.locator("[data-testid=promo-preview]").count()) === 0);

await girl.fill("input[aria-label='כותרת ההודעה']", TITLE);
await girl.fill("textarea[aria-label='תוכן ההודעה']", TEXT);
await girl.waitForTimeout(400);
check("תצוגה מקדימה מופיעה תוך כדי כתיבה",
  (await girl.locator("[data-testid=promo-preview]").count()) === 1);
check("והיא מראה את מה שנכתב",
  (await girl.textContent("[data-testid=promo-preview]")).includes(TEXT));
check("המסך מזהיר שההודעה עדיין כבויה",
  (await girl.textContent("body")).includes("ההודעה כבויה כרגע"));

await girl.click("[data-testid=promo-toggle]");
await girl.waitForTimeout(300);
check("הדלקת המתג נרשמת", (await girl.getAttribute("[data-testid=promo-toggle]", "aria-pressed")) === "true");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);

const { rows: [saved] } = await db.query("select promo_on, promo_title, promo_text from stores where id=$1", [store.id]);
check("ההודעה נשמרה", saved.promo_text === TEXT, String(saved.promo_text));
check("עם הכותרת", saved.promo_title === TITLE, String(saved.promo_title));
check("ודלוקה", saved.promo_on === true);

/* ── 3. הקונה רואה אותה, במקום הנכון ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
await buyer.waitForSelector("[data-testid=store-promo]", { timeout: 15000 });
const banner = await buyer.textContent("[data-testid=store-promo]");
check("הקונה רואה את ההודעה", banner.includes(TEXT));
check("ואת הכותרת", banner.includes(TITLE));

/* המיקום הוא כל העניין: מבצע שמופיע מתחת לרשת נקרא אחרי שכבר בחרו */
const promoBox = await buyer.locator("[data-testid=store-promo]").boundingBox();
const gridBox = await buyer.locator(".grid").first().boundingBox();
check("הבאנר יושב מעל המוצרים",
  !!promoBox && !!gridBox && promoBox.y < gridBox.y,
  `promo ${Math.round(promoBox?.y ?? -1)} · grid ${Math.round(gridBox?.y ?? -1)}`);

/* הרווח משני הצדדים נמדד ולא נסמך על כך שהקלאסים "נראים נכון": הריפוד
   מעל מגיע מגוש הכותרת ומתחת מהעטיפה של הבאנר, שני מקומות שונים בקוד.
   מספיק שאחד מהם ישתנה כדי שהבאנר ייצמד למוצרים או ירחף מתחת לכותרת. */
const gaps = await buyer.evaluate(() => {
  const el = document.querySelector("[data-testid=store-promo]");
  const headerLast = el.parentElement.previousElementSibling.lastElementChild;
  const grid = document.querySelector(".grid");
  const r = (e) => e.getBoundingClientRect();
  const b = r(el);
  return {
    above: Math.round(b.top - r(headerLast).bottom),
    below: Math.round(r(grid.firstElementChild).top - b.bottom),
    left: Math.round(b.left - r(grid).left),
    right: Math.round(r(grid).right - b.right),
    inTop: Math.round(r(el.children[0]).top - b.top),
    inBottom: Math.round(b.bottom - r(el.children[1]).bottom),
  };
});
check("הרווח מעל הבאנר ומתחתיו שווה",
  Math.abs(gaps.above - gaps.below) <= 1, `מעל ${gaps.above} · מתחת ${gaps.below}`);
check("ויש רווח בכלל, הבאנר לא נצמד",
  gaps.above >= 8 && gaps.below >= 8, `מעל ${gaps.above} · מתחת ${gaps.below}`);
check("והבאנר מיושר לקצוות הרשת",
  Math.abs(gaps.left) <= 1 && Math.abs(gaps.right) <= 1, `ימין ${gaps.right} · שמאל ${gaps.left}`);
check("גם בתוך הקופסה הרווח מאוזן",
  Math.abs(gaps.inTop - gaps.inBottom) <= 2, `מעל ${gaps.inTop} · מתחת ${gaps.inBottom}`);

/* ── 4. כיבוי מסתיר ולא מוחק ── */
await girl.click("[data-testid=promo-toggle]");
await girl.waitForTimeout(300);
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [off] } = await db.query("select promo_on, promo_text from stores where id=$1", [store.id]);
check("הכיבוי נשמר", off.promo_on === false);
check("אבל הטקסט לא נמחק", off.promo_text === TEXT, String(off.promo_text));

const buyer2 = await phone();
await buyer2.goto(fresh(), { waitUntil: "networkidle" });
check("והקונה כבר לא רואה אותה",
  (await buyer2.locator("[data-testid=store-promo]").count()) === 0);

/* ── 5. הודעה דלוקה בלי טקסט לא מציירת קופסה ריקה ── */
await db.query("update stores set promo_on=true, promo_text=null where id=$1", [store.id]);
const buyer3 = await phone();
await buyer3.goto(fresh(), { waitUntil: "networkidle" });
check("מתג דלוק בלי טקסט לא מייצר באנר ריק",
  (await buyer3.locator("[data-testid=store-promo]").count()) === 0);

/* ── 6. האורך נאכף בדאטהבייס ── */
let tooLong = "";
try {
  await db.query("update stores set promo_text=$1 where id=$2", ["א".repeat(200), store.id]);
} catch (e) { tooLong = e.message; }
check("טקסט מעל 180 תווים נדחה בדאטהבייס", tooLong !== "", tooLong.slice(0, 50));
let titleLong = "";
try {
  await db.query("update stores set promo_title=$1 where id=$2", ["א".repeat(50), store.id]);
} catch (e) { titleLong = e.message; }
check("וגם כותרת מעל 40", titleLong !== "", titleLong.slice(0, 50));

/* ── 7. לא דולף לקוד המקור למי שלא אמורה ── */
await db.query("update stores set promo_on=true, promo_title=$1, promo_text=$2 where id=$3", [TITLE, TEXT, store.id]);
const html = await (await fetch(fresh())).text();
check("ההודעה כן ב-HTML — היא ציבורית בכוונה", html.includes(TEXT));
check("אבל הטלפון עדיין לא", !html.includes(store.contact_phone));

await db.query("update stores set promo_on=false, promo_title=null, promo_text=null where id=$1", [store.id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} promo banner checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
