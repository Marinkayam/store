// E2E: מחירים עם אגורות + סגנון ורקע לדוכן (מיגרציות 0049, 0050).
//
// הבקשות מהשטח:
//   • "שאפשר יהיה לכתוב את המחיר עם נקודה עשרונית, כמו 10.90"
//   • "להוסיף רקע שרוצים ולבחור עיצובים... או לחזור לבסיס"
//
// החוזים שנבדקים:
//   1. מחיר עשרוני נשמר מהעורך (גם עם פסיק), ומוצג ₪10.90 — לא 10.9.
//   2. הסה"כ של הזמנה מחושב באגורות: 10.90 × 3 = 32.70 ולא 32.699999.
//   3. מחיר שלם נשאר בלי ".00" — ₪15 ולא ₪15.00.
//   4. סגנון ורקע נשמרים ומשנים את הדוכן לקונות.
//   5. "חזרה לבסיס" מחזירה את הדוכן בדיוק למה שהיה.
//   6. תמונת רקע משלה נשמרת ומוצגת.
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
// הבדיקה הזו בודקת את תווית "אזל" בדוכן — מאז 0053 מוצר שאזל מוסתר,
// אלא אם החנות בחרה להציג אותו. מדליקים לה את זה, ומחזירים בסוף.
if (store) await db.query("update stores set show_sold_out=true where id=$1", [store.id]);
if (!store) {
  console.error("צריך דוכן פעיל. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
// מצב נקי: בלי סגנון, בלי רקע — ריצה קודמת לא משפיעה
await db.query("update stores set look=null, bg_pattern=null, bg_key=null where id=$1", [store.id]);
await db.query("delete from products where store_id=$1 and name in ('מחזיק מפתחות מנצנץ','סקוויש עגול')", [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });

/* ── 1. מחיר עם אגורות מהעורך ── */
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.click("button[aria-label='מוצר חדש']");
await girl.fill("input[aria-label='שם המוצר']", "מחזיק מפתחות מנצנץ");
// פסיק במקום נקודה — ככה מקלדת עברית בחלק מהטלפונים
await girl.fill("input[aria-label='מחיר']", "10,905");
check("השדה מקבל פסיק, הופך אותו לנקודה, ועוצר בשתי ספרות",
  (await girl.inputValue("input[aria-label='מחיר']")) === "10.90",
  await girl.inputValue("input[aria-label='מחיר']"));
await girl.click("button:has-text('שמירה')");
await girl.waitForTimeout(2500);

const { rows: [keychain] } = await db.query(
  "select * from products where store_id=$1 and name='מחזיק מפתחות מנצנץ' and deleted_at is null", [store.id]
);
check("המחיר נשמר עם אגורות", Number(keychain?.price) === 10.9, String(keychain?.price));
await db.query("update products set stock=20, track_stock=true, is_visible=true where id=$1", [keychain.id]);

// מוצר במחיר שלם, לבדוק שלא מופיע ".00"
await db.query(
  "insert into products (store_id, name, price, track_stock, stock, sort_order) values ($1,'סקוויש עגול',15,true,20,-1)",
  [store.id]
);

const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const page = (await buyer.textContent("body")) ?? "";
check("הקונה רואה ₪10.90 ולא ₪10.9", page.includes("₪10.90") && !/₪10\.9(?!0)/.test(page));
check("מחיר שלם נשאר ₪15, בלי .00", page.includes("₪15") && !page.includes("₪15.00"));

/* ── 2. הסה"כ מחושב באגורות ── */
const res = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: store.slug,
    items: [{ productId: keychain.id, qty: 3 }],
    buyerName: "נועה",
    buyerPhone: "0521112233",
    payMethod: "cash",
  }),
});
const order = await res.json();
check("הזמנה עם מחיר עשרוני עוברת", res.ok, JSON.stringify(order).slice(0, 160));
check("הסה\"כ בתשובה הוא 32.7 בדיוק", order.total === 32.7, String(order.total));
const { rows: [orderRow] } = await db.query(
  "select total, items from orders where store_id=$1 and order_number=$2", [store.id, order.orderNumber]
);
check("ובדאטהבייס 32.70", orderRow?.total === "32.70", String(orderRow?.total));
check("המחיר ליחידה נשמר ב-snapshot", orderRow?.items?.[0]?.price === 10.9, JSON.stringify(orderRow?.items));

// 0051: אף גרסה של place_order לא פתוחה לציבור — הזמנה נכנסת רק דרך השרת,
// שם נבדקים מחיר, מלאי ובחירה. גרסה פתוחה = הזמנה מזויפת בכל סכום.
const { rows: open } = await db.query(
  "select pronargs from pg_proc where proname='place_order' and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))"
);
check("place_order סגורה לציבור בכל הגרסאות", open.length === 0, open.map((r) => r.pronargs).join(","));

// בדשבורד ההזמנות הסכום מוצג עם אגורות
await girl.goto(`${BASE}/dashboard`);
await girl.waitForSelector("h1:has-text('הזמנות')", { timeout: 15000 });
await girl.waitForTimeout(1200);
const dash = (await girl.textContent("body")) ?? "";
check("בכרטיס ההזמנה: ₪32.70", dash.includes("₪32.70"));
check("ובשורת המוצר: × 3 · ₪32.70", dash.includes("× 3 · ₪32.70"));

/* ── 3. בסל של הקונה ── */
await buyer.click(`button[aria-label='הוספה מהירה, מחזיק מפתחות מנצנץ']`);
await buyer.waitForTimeout(400);
check("פס הסל מציג ₪10.90", ((await buyer.textContent("[data-testid=cart-bar]")) ?? "").includes("₪10.90"));

/* ── 4. סגנון ורקע ── */
await girl.goto(`${BASE}/dashboard/settings#design`);
await girl.waitForSelector("[data-testid=look-picker]", { timeout: 20000 });
check("אין 'חזרה לבסיס' כשעוד לא נבחר כלום",
  (await girl.locator("[data-testid=reset-design]").count()) === 0);
check("הבסיס מסומן כברירת מחדל",
  (await girl.getAttribute("button[aria-label='סגנון בסיס']", "aria-pressed")) === "true");

await girl.click("button[aria-label='סגנון עגלגל']");
await girl.click("button[aria-label='רקע לבבות']");
await girl.waitForTimeout(300);
check("הבחירה נרשמת", (await girl.getAttribute("button[aria-label='סגנון עגלגל']", "aria-pressed")) === "true");
// הדוכן הקטן צמוד למעלה: גם כשגוללים עד הרקעים, רואים את מה שבחרו
await girl.locator("[data-testid=bg-picker]").scrollIntoViewIfNeeded();
await girl.waitForTimeout(300);
/* הדוכן הקטן שצף ירד ("נתקע למעלה") — הדוכן לעריכה בראש המקטע הוא התצוגה */
check("הדוכן בראש המקטע כבר מראה את הלבבות",
  (await girl.locator("#identity").evaluate((el) => getComputedStyle(el).backgroundImage)).includes("svg"));
check("ואין יותר דוכן קטן שצף ונתקע למעלה", (await girl.locator("[data-testid=design-preview]").count()) === 0);
await girl.screenshot({ path: "/tmp/looks-settings.png", fullPage: true });
/* חזרה למסך הבית של "החנות שלי": הדוכן שבראשו כבר עם הרקע, עוד לפני שמירה */
await girl.click("[data-testid=section-back]");
await girl.waitForSelector("[data-testid=settings-hero]");
const previewBg = await girl.locator("[data-testid=settings-hero]").evaluate((el) => getComputedStyle(el).backgroundImage);
check("התצוגה המקדימה מקבלת את הרקע מיד", previewBg.includes("svg"), previewBg.slice(0, 60));
/* "חזרה" שומרת לבד — אין צורך בכפתור, ואין שינוי שנעלם */
await girl.waitForTimeout(1500);
check("חזרה למסך הבית שמרה את השינויים (בלי כפתור שמירה)", (await girl.locator("[data-testid=save-settings]").count()) === 0);
await girl.click("[data-testid=hub-design]");
await girl.waitForSelector("[data-testid=section-design]");
const { rows: [s1] } = await db.query("select look, bg_pattern from stores where id=$1", [store.id]);
check("הסגנון והרקע נשמרו", s1.look === "round" && s1.bg_pattern === "hearts", `${s1.look} · ${s1.bg_pattern}`);

const b2 = await phone();
await b2.goto(fresh(), { waitUntil: "networkidle" });
const rootBg = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).backgroundImage);
check("הדוכן לקונות מקבל את הרקע", rootBg.includes("svg"), rootBg.slice(0, 60));
const coverBg = await b2.locator("[data-testid=store-cover]").evaluate((el) => getComputedStyle(el).backgroundImage);
// מרינה, 10.2026: "לא רואים את הבאנר" — הפס בראש הדוכן מוצג גם מעל רקע
const coverFill = await b2.locator("[data-testid=store-cover]").evaluate((el) => { const cs = getComputedStyle(el); return cs.backgroundImage + " " + cs.backgroundColor; });
check("הפס בראש הדוכן (קאבר) נראה גם כשיש רקע", !/^none rgba\(0, 0, 0, 0\)$/.test(coverFill), coverFill.slice(0, 60));
const card = b2.locator(".s-look .s-r.relative").first();
const radius = await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
check("כרטיסי המוצרים עגולים (22px)", radius === "22px", radius);
const font = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).fontFamily);
check("והגופן מתחלף", font.includes("Varela Round"), font);
const plateBg = await b2.locator("[data-testid=store-header]").evaluate((el) => getComputedStyle(el).backgroundColor);
check("על רקע, השם והתיאור יושבים על לוח קריא", /^rgba?\(255, 255, 255/.test(plateBg), plateBg);
const credit = b2.locator("text=נבנה בדוכן").locator("xpath=..");
check("וגם הקרדיט בתחתית", /^rgba?\(255, 255, 255/.test(await credit.evaluate((el) => getComputedStyle(el).backgroundColor)));
/* הלוח (עם טשטוש) יוצר שכבה משלו — בלי z על התמונה העגולה הוא מכסה את חציה */
const avatarOnTop = await b2.evaluate(() => {
  const h = document.querySelector("[data-testid=store-header]").getBoundingClientRect();
  const el = document.elementFromPoint(window.innerWidth / 2, h.top + 6);
  return !!el?.closest(".s-r.absolute");
});
check("תמונת הדוכן מעל הלוח, לא חצויה", avatarOnTop);
await b2.screenshot({ path: "/tmp/looks-store-round-hearts.png" });

// סגנון שני, לראות שהוא לא תקוע על הראשון
await db.query("update stores set look='pop', bg_pattern='stars' where id=$1", [store.id]);
await b2.goto(fresh(), { waitUntil: "networkidle" });
const popShadow = await b2.locator(".s-look .s-r.relative").first().evaluate((el) => getComputedStyle(el).boxShadow);
check("פופ: צל חד", /3px 3px 0px/.test(popShadow), popShadow);
await b2.screenshot({ path: "/tmp/looks-store-pop-stars.png" });

/* ── 5. חזרה לבסיס ── */
await girl.reload();
await girl.waitForSelector("[data-testid=reset-design]", { timeout: 20000 });
await girl.click("[data-testid=reset-design]");
await girl.waitForTimeout(300);
check("חזרה לבסיס מסמנת את הבסיס",
  (await girl.getAttribute("button[aria-label='סגנון בסיס']", "aria-pressed")) === "true" &&
  (await girl.getAttribute("button[aria-label='בלי רקע']", "aria-pressed")) === "true");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2200);
const { rows: [s2] } = await db.query("select look, bg_pattern, theme from stores where id=$1", [store.id]);
check("בדאטהבייס: בלי סגנון ובלי רקע", s2.look === null && s2.bg_pattern === null, `${s2.look} · ${s2.bg_pattern}`);
check("והצבעים לא נגעו", s2.theme === store.theme, `${s2.theme} / ${store.theme}`);

await b2.goto(fresh(), { waitUntil: "networkidle" });
const baseBg = await b2.locator(".s-look").first().evaluate((el) => getComputedStyle(el).backgroundImage);
const baseRadius = await b2.locator(".s-look .s-r.relative").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
check("הדוכן חזר לבסיס: בלי רקע ובלי עיגול", baseBg === "none" && baseRadius === "0px", `${baseBg} · ${baseRadius}`);
const basePlate = await b2.locator("[data-testid=store-header]").evaluate((el) => getComputedStyle(el).backgroundColor);
check("ובלי לוח מסביב לשם — בדיוק כמו קודם", basePlate === "rgba(0, 0, 0, 0)", basePlate);

/* ── 6. תמונת רקע משלה ── */
await girl.reload();
await girl.waitForSelector("[data-testid=look-picker]", { timeout: 20000 });
check("כפתור העלאה בולט, לא אריח חבוי", await girl.locator("button[aria-label='העלאת תמונת רקע']").isVisible());
// צילום לאורך (400×800), כמו רוב הצילומים מטלפון — לבדוק שלא נחתך לריבוע
const portrait = Buffer.from((await girl.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 400; c.height = 800;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 800);
  g.addColorStop(0, "#ff5fa2"); g.addColorStop(1, "#5fb4ff");
  x.fillStyle = g; x.fillRect(0, 0, 400, 800);
  return c.toDataURL("image/png").split(",")[1];
})), "base64");
await girl.locator("[data-testid=bg-upload-input]")
  .setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: portrait });
await girl.waitForTimeout(3500);
const { rows: [s3] } = await db.query("select bg_pattern, bg_key from stores where id=$1", [store.id]);
check("תמונת רקע נשמרת מיד", s3.bg_pattern === "photo" && /\/bg\/.+\.webp$/.test(s3.bg_key ?? ""), `${s3.bg_pattern} · ${s3.bg_key}`);
check("ובהגדרות מופיעה שורת התמונה עם החלפה והסרה",
  (await girl.locator("[data-testid=bg-photo-row]").count()) === 1 &&
  (await girl.getAttribute("button[aria-label='רקע תמונה שלי']", "aria-pressed")) === "true");

await b2.goto(fresh(), { waitUntil: "networkidle" });
const layer = b2.locator("[data-testid=store-bg-photo]");
const photoBg = await layer.evaluate((el) => getComputedStyle(el).backgroundImage);
check("והדוכן מציג אותה", photoBg.includes(s3.bg_key ?? "@@"), photoBg.slice(0, 120));
check("כמו שהיא — בלי שכבת צבע מעליה", !photoBg.includes("gradient"), photoBg.slice(0, 60));
const dims = await b2.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}, /url\("([^"]+)"\)/.exec(photoBg)?.[1] ?? "");
check("ובפרופורציות המקוריות, לא חתוכה לריבוע", dims.w * 2 === dims.h, `${dims.w}×${dims.h}`);
/* השכבה בגובה המסך ולא בגובה הדף — אחרת בדוכן ארוך התמונה מתנפחת */
const box = await layer.boundingBox();
check("התמונה בגובה המסך, לא מתוחה על כל הדף", !!box && Math.abs(box.height - 900) < 2, `${box?.height}`);
await b2.mouse.wheel(0, 1500);
await b2.waitForTimeout(300);
const box2 = await layer.boundingBox();
check("ונשארת במקום בגלילה", !!box2 && Math.abs(box2.y) < 2, `${box2?.y}`);
check("השם קריא גם על תמונה",
  /^rgba?\(255, 255, 255/.test(await b2.locator("[data-testid=store-header]").evaluate((el) => getComputedStyle(el).backgroundColor)));
// מוצר אזל על תמונה: הכרטיס אטום, רק התוכן דוהה
await db.query("update products set stock=0, track_stock=true where id=$1", [keychain.id]);
await b2.goto(fresh(), { waitUntil: "networkidle" });
const outCard = b2.locator(".s-look .s-r.relative", { hasText: "מחזיק מפתחות מנצנץ" });
check("כרטיס של מוצר שאזל לא שקוף על הרקע",
  (await outCard.evaluate((el) => getComputedStyle(el).opacity)) === "1");
await b2.screenshot({ path: "/tmp/looks-store-photo.png" });
await b2.evaluate(() => window.scrollTo(0, 0));

// הסרה מחזירה לבלי רקע ולא משאירה תמונה תקועה
await girl.click("button:has-text('הסרה')");
await girl.waitForTimeout(1500);
const { rows: [s4] } = await db.query("select bg_pattern, bg_key from stores where id=$1", [store.id]);
check("הסרה: בלי תמונה ובלי רקע", s4.bg_pattern === null && s4.bg_key === null, `${s4.bg_pattern} · ${s4.bg_key}`);

/* ── ניקוי: הבדיקות שאחריי מצפות לדוכן בסיס ── */
await db.query("update stores set look=null, bg_pattern=null, bg_key=null where id=$1", [store.id]);
await db.query("delete from products where store_id=$1 and name in ('מחזיק מפתחות מנצנץ','סקוויש עגול')", [store.id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} prices + looks checks passed`);
await db.query("update stores set show_sold_out=null where id=$1", [store.id]);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
