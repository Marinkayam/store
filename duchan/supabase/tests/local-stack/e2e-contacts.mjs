// E2E: פרטי קשר לא מוצגים בטקסט ציבורי של דוכן (lib/public-text.ts).
//
// בעלי דוכן כותבים טקסט חופשי, ולפעמים מקלידים בו מספר טלפון. המספר של
// ילד/ה לא אמור להופיע לכל מי שנכנס לדוכן: הקונים מקבלים אותו רק אחרי
// ההזמנה. כאן בודקים ש:
//   1. טלפון, מייל, קישור ושם משתמש לא מגיעים לדף הציבורי — לא בטקסט ולא בקוד.
//   2. שאר הטקסט נשאר, ומחירים וכמויות לא נחשבים מספר טלפון.
//   3. במסד לא נמחק דבר.
//   4. בעלי הדוכן מקבלים הסבר כשהם מקלידים מספר.
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
  `select id, slug, tagline, about, promo_on, promo_title, promo_text, shipping_note, ships, order_intro
     from stores where contact_phone='972501234567' order by created_at limit 1`);
const { rows: [prod] } = await db.query(
  `select id, name, description from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
    order by sort_order, created_at limit 1`, [store.id]);
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;
const SECRETS = ["054-765-4321", "0547654321", "054 76 54 321", "+972 54 765 4321", "972547654321", "noa.kid@gmail.com", "wa.me/972547654321", "https://instagram.com/noa_kid", "@noa_kid12", "7654321", "765 4321", "noa_kid"];

try {
  await db.query(
    `update stores set
       tagline = 'צמידים בעבודת יד. להזמנות: 054-765-4321',
       about = 'שלחו לי מייל noa.kid@gmail.com או בוואטסאפ wa.me/972547654321',
       promo_on = true, promo_title = 'מבצע! 0547654321', promo_text = 'עקבו אחריי https://instagram.com/noa_kid וגם @noa_kid12',
       ships = true, shipping_note = 'שולחת בדואר. לתיאום 054 76 54 321', order_intro = 'היי! +972 54 765 4321'
     where id=$1`, [store.id]);
  await db.query("update products set name=$2, description=$3 where id=$1",
    [prod.id, "צמיד קשת 3 צבעים", "רק ₪12, יש 20 במלאי, מידה 16. מגיל 2026? לא: מגיל 6. טלפון 972547654321"]);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const buyer = await phone();
  await buyer.goto(fresh(), { waitUntil: "networkidle" });
  const html = await buyer.content();
  const text = (await buyer.textContent("body")) ?? "";

  const leaked = SECRETS.filter((s) => html.includes(s));
  check("אף פרט קשר לא מגיע לדף הציבורי, גם לא בקוד שלו", leaked.length === 0, leaked.join(" · "));
  check("התיאור נשאר, בלי המספר ובלי נקודתיים תלויות", text.includes("צמידים בעבודת יד. להזמנות") && !text.includes("להזמנות:"));
  check("ההודעה לקונים נשארת, בלי המספר", text.includes("מבצע!"));
  check("פרטי המשלוח נשארים, בלי המספר", text.includes("שולחת בדואר. לתיאום"));

  await buyer.click(`.s-look button[aria-label='צמיד קשת 3 צבעים']`);
  await buyer.waitForSelector("[data-testid=product-close]");
  const sheet = (await buyer.textContent("body")) ?? "";
  check("תיאור מוצר: מחיר, מלאי, מידה ושנה נשארים", ["₪12", "20 במלאי", "מידה 16", "2026", "מגיל 6"].every((w) => sheet.includes(w)),
    sheet.slice(sheet.indexOf("רק ₪12"), sheet.indexOf("רק ₪12") + 70));
  check("והטלפון שבתיאור המוצר לא מוצג", !sheet.includes("972547654321") && !(await buyer.content()).includes("972547654321"));

  const { rows: [kept] } = await db.query("select tagline, about from stores where id=$1", [store.id]);
  check("במסד לא נמחק דבר", kept.tagline.includes("054-765-4321") && kept.about.includes("noa.kid@gmail.com"));

  /* ── בעלי הדוכן: הסבר כשמקלידים מספר ── */
  const girl = await phone();
  await girl.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("duchan-live-quiet", "1"); } catch {} });
  await girl.goto(`${BASE}/login`);
  await verifyPhone(girl, "0501234567");
  await girl.waitForURL("**/dashboard", { timeout: 20000 });
  await girl.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await girl.waitForSelector("[data-testid=settings-hub]");
  await girl.click("[data-testid=hub-design]");
  await girl.waitForSelector("textarea[aria-label='תיאור הדוכן']");
  check("בהגדרות: הסבר שהמספר לא יופיע בדוכן", (await girl.locator("[data-testid=contact-note]").count()) === 1);
  check("והטקסט שלה נשאר בשדה כמו שכתבה", (await girl.inputValue("textarea[aria-label='תיאור הדוכן']")).includes("054-765-4321"));
  await girl.fill("textarea[aria-label='תיאור הדוכן']", "צמידים בעבודת יד, 3 ב-₪25, עד 10 ליום");
  check("טקסט עם מחירים וכמויות: אין הסבר", (await girl.locator("[data-testid=contact-note]").count()) === 0);
  await browser.close();
} finally {
  await db.query(
    "update stores set tagline=$2, about=$3, promo_on=$4, promo_title=$5, promo_text=$6, shipping_note=$7, ships=$8, order_intro=$9 where id=$1",
    [store.id, store.tagline, store.about, store.promo_on, store.promo_title, store.promo_text, store.shipping_note, store.ships, store.order_intro]);
  await db.query("update products set name=$2, description=$3 where id=$1", [prod.id, prod.name, prod.description]);
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} contact checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
