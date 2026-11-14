// E2E: עיצוב הקטגוריות (מיגרציה 0052).
//
// הבקשה: "אפשרות לעצב את הקטגוריות... גדול, קטן, רק טקסט, טקסט ואייקון...
// וגם להעלות תמונה משלך לקטגוריה. תכתוב באיזה גודל."
//
// החוזים:
//   1. בלי עיצוב — הקטגוריות נראות בדיוק כמו קודם (רק טקסט, בינוני).
//   2. העורך מציג תצוגה חיה, וכל בחירה משנה אותה מיד.
//   3. אמוג'י ותמונה לכל קטגוריה; התמונה נחתכת לריבוע 600×600.
//   4. גודל התמונה המומלץ כתוב במסך.
//   5. מה שנשמר מופיע לקונות, והסינון ממשיך לעבוד.
//   6. קטגוריה בלי אייקון מקבלת את תמונת המוצר הראשון שבה; בלי מוצר עם
//      תמונה — את האות הראשונה. אין משבצת ריקה.
//   7. "קטגוריות גדולות" בלחיצה אחת: כולן פרושות בראש הדוכן. בחירה מקפלת
//      אותן לשורה, "הכל" פורש מחדש.
//   8. הרבה קטגוריות: הראשונות מוצגות, השאר מאחורי "עוד קטגוריות".
//   9. סדר הקטגוריות נקבע בגרירה / "לראש", וזה הסדר שהקונים רואים.
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
const { rows: prods } = await db.query(
  `select id, name, categories, category from products
    where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
    order by sort_order, created_at limit 3`,
  [store.id]
);
if (prods.length < 3) {
  console.error("צריך לפחות 3 מוצרים בדוכן");
  process.exit(1);
}
const CATS = ["צמידים", "מחזיקים", "סקווישים"];
/* המוצר השלישי (סקווישים) צריך תמונה, כדי שהחוזה "קטגוריה בלי אייקון מקבלת
   את תמונת המוצר" ייבדק באמת ולא ייפול לענף של האות הראשונה. משאילים לו
   תמונה של מוצר אחר בדוכן, ומחזירים בניקוי. */
const { rows: [orig3] } = await db.query("select image_key from products where id=$1", [prods[2].id]);
const { rows: [lender] } = await db.query(
  "select image_key from products where store_id=$1 and deleted_at is null and image_key is not null limit 1", [store.id]
);
if (!orig3.image_key && lender) await db.query("update products set image_key=$1 where id=$2", [lender.image_key, prods[2].id]);
await db.query(
  "update stores set categories=$1, category_layout=null, category_size=null, category_meta=null, look=null, bg_pattern=null where id=$2",
  [CATS, store.id]
);
for (let i = 0; i < 3; i++) {
  await db.query("update products set categories=$1, category=$2 where id=$3", [[CATS[i]], CATS[i], prods[i].id]);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;
const bar = "[data-testid=category-chips]";

/* ── 1. בלי עיצוב — כמו קודם ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("בלי עיצוב: רק טקסט, בינוני",
  (await buyer.getAttribute(bar, "data-layout")) === "text" && (await buyer.getAttribute(bar, "data-size")) === "md");
check("והקטגוריות מופיעות", ((await buyer.textContent(bar)) ?? "").includes("צמידים"));

/* ── 2. העורך ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("[data-testid=open-category-designer]", { timeout: 20000 });
await girl.click("[data-testid=open-category-designer]");
await girl.waitForSelector("[data-testid=category-designer]");
const prev = "[data-testid=category-preview] [data-testid=category-chips]";
check("העורך נפתח עם תצוגה חיה", (await girl.locator(prev).count()) === 1);
check("גודל התמונה המומלץ כתוב במסך",
  ((await girl.textContent("[data-testid=category-designer]")) ?? "").includes("600×600"));

await girl.click("button[aria-label='צורה: עיגולים']");
await girl.click("button[aria-label='גודל גדול']");
await girl.waitForTimeout(200);
check("בחירת צורה משנה את התצוגה מיד", (await girl.getAttribute(prev, "data-layout")) === "circle");
check("וגם הגודל", (await girl.getAttribute(prev, "data-size")) === "lg");
const circle = await girl.locator(`${prev} button[aria-label='צמידים'] > span`).first().boundingBox();
check("עיגול גדול: 84px", !!circle && Math.round(circle.width) === 84, `${circle?.width}`);

// אמוג'י לצמידים
await girl.click("button[aria-label='אמוג\\'י לצמידים']");
await girl.click("[data-testid=emoji-grid] button[aria-label='אמוג\\'י 💎']");
check("אמוג'י מופיע בתצוגה", ((await girl.textContent(`${prev} button[aria-label='צמידים']`)) ?? "").includes("💎"));

// תמונה למחזיקים — צילום לאורך, צריך לצאת ריבוע 600
const portrait = Buffer.from((await girl.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 500; c.height = 900;
  const x = c.getContext("2d");
  x.fillStyle = "#ff8fb8"; x.fillRect(0, 0, 500, 900);
  x.fillStyle = "#6ec6ff"; x.fillRect(100, 300, 300, 300);
  return c.toDataURL("image/png").split(",")[1];
})), "base64");
const [chooser] = await Promise.all([
  girl.waitForEvent("filechooser"),
  girl.click("button[aria-label='תמונה למחזיקים']"),
]);
await chooser.setFiles({ name: "cat.png", mimeType: "image/png", buffer: portrait });
await girl.waitForFunction(
  (sel) => !!document.querySelector(`${sel} button[aria-label='מחזיקים'] img`),
  prev, { timeout: 15000 }
);
check("תמונה מופיעה בתצוגה", true);

// סקווישים בלי כלום — תמונת המוצר הראשון שבה; בלי מוצר עם תמונה, האות הראשונה
const { rows: [p3] } = await db.query("select image_key, poster_key from products where id=$1", [prods[2].id]);
const autoKey = p3.poster_key ?? p3.image_key;
if (autoKey) {
  await girl.waitForSelector(`${prev} button[aria-label='סקווישים'] img`, { timeout: 10000 }).catch(() => {});
  const autoSrc = await girl.locator(`${prev} button[aria-label='סקווישים'] img`).getAttribute("src").catch(() => null);
  check("קטגוריה בלי אייקון מקבלת את תמונת המוצר הראשון שבה", (autoSrc ?? "").includes(autoKey), autoSrc ?? "—");
} else {
  check("קטגוריה בלי אייקון ובלי תמונת מוצר מקבלת את האות הראשונה",
    ((await girl.textContent(`${prev} button[aria-label='סקווישים']`)) ?? "").includes("ס"));
}
await girl.screenshot({ path: "/tmp/cat-designer.png" });

await girl.click("[data-testid=save-category-design]");
await girl.waitForSelector("[data-testid=category-designer]", { state: "detached", timeout: 10000 });
const { rows: [s1] } = await db.query("select category_layout, category_size, category_meta from stores where id=$1", [store.id]);
check("נשמר: עיגולים, גדול", s1.category_layout === "circle" && s1.category_size === "lg", `${s1.category_layout} · ${s1.category_size}`);
check("נשמר: האמוג'י", s1.category_meta?.["צמידים"]?.emoji === "💎", JSON.stringify(s1.category_meta));
const catKey = s1.category_meta?.["מחזיקים"]?.image ?? "";
check("נשמר: התמונה ב-cat/", /\/cat\/.+\.(webp|jpg|png)$/.test(catKey), catKey);

/* ── 3. הקונה ── */
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("הקונה רואה עיגולים גדולים",
  (await buyer.getAttribute(bar, "data-layout")) === "circle" && (await buyer.getAttribute(bar, "data-size")) === "lg");
const imgSrc = await buyer.locator(`${bar} button[aria-label='מחזיקים'] img`).getAttribute("src");
check("עם התמונה שהועלתה", (imgSrc ?? "").includes(catKey), imgSrc ?? "—");
const dims = await buyer.evaluate(async (src) => {
  const i = new Image(); i.src = src; await i.decode();
  return [i.naturalWidth, i.naturalHeight];
}, imgSrc);
check("התמונה נחתכה לריבוע 600×600", dims[0] === 600 && dims[1] === 600, dims.join("×"));
check("ועם האמוג'י", ((await buyer.textContent(`${bar} button[aria-label='צמידים']`)) ?? "").includes("💎"));

await buyer.click(`${bar} button[aria-label='צמידים']`);
await buyer.waitForTimeout(300);
check("לחיצה מסמנת את הקטגוריה", (await buyer.getAttribute(`${bar} button[aria-label='צמידים']`, "aria-pressed")) === "true");
const names = await buyer.locator("button[aria-label^='הוספה מהירה'], button[aria-label^='בחירת']").count();
const cards = await buyer.locator(".s-look .grid > div").count();
check("והסינון עובד — רק המוצר של צמידים", cards === 1, `${cards} כרטיסים (${names})`);
await buyer.screenshot({ path: "/tmp/cat-store-circle-lg.png" });

/* ── 4. כל הצורות נבנות בלי שגיאות ── */
const errors = [];
buyer.on("pageerror", (e) => errors.push(e.message));
for (const [layout, size] of [["icon", "sm"], ["square", "md"], ["card", "lg"], ["card", "sm"], ["text", "lg"]]) {
  await db.query("update stores set category_layout=$1, category_size=$2 where id=$3", [layout, size, store.id]);
  await buyer.goto(fresh(), { waitUntil: "networkidle" });
  const ok = (await buyer.getAttribute(bar, "data-layout")) === layout && (await buyer.getAttribute(bar, "data-size")) === size;
  const allTouch = await buyer.locator(`${bar} button`).evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 44));
  check(`צורה ${layout}/${size} נבנית, וכל כפתור לפחות 44px`, ok && allTouch);
  await buyer.screenshot({ path: `/tmp/cat-store-${layout}-${size}.png`, clip: { x: 0, y: 150, width: 390, height: 360 } });
}
check("בלי שגיאות JS בכל הצורות", errors.length === 0, errors[0] ?? "");

/* ── 5. גם מהגדרות → עיצוב הדוכן ── */
await db.query("update stores set category_layout=null, category_size=null where id=$1", [store.id]);
await girl.goto(`${BASE}/dashboard/settings#design`);
await girl.waitForSelector("[data-testid=settings-categories]", { timeout: 20000 });
check("בעיצוב הדוכן יש שלב קטגוריות עם תצוגה", (await girl.locator("[data-testid=settings-categories] [data-testid=category-chips]").count()) === 1);
await girl.click("[data-testid=settings-open-category-designer]");
await girl.waitForSelector("[data-testid=category-designer]");
check("הכפתור בהגדרות פותח את עורך הקטגוריות", true);
await girl.click("button[aria-label='צורה: ריבועים']");
await girl.click("[data-testid=save-category-design]");
await girl.waitForSelector("[data-testid=category-designer]", { state: "detached", timeout: 10000 });
const { rows: [s2] } = await db.query("select category_layout from stores where id=$1", [store.id]);
check("שמירה מההגדרות נשמרת", s2.category_layout === "square", String(s2.category_layout));
check("והתצוגה בהגדרות מתעדכנת",
  (await girl.getAttribute("[data-testid=settings-categories] [data-testid=category-chips]", "data-layout")) === "square");
await girl.locator("[data-testid=settings-categories]").screenshot({ path: "/tmp/cat-settings-step.png" });

/* ── 6. תצוגה מוכנה: קטגוריות גדולות בראש הדוכן ── */
await db.query("update stores set category_layout=null, category_size=null, category_meta=null where id=$1", [store.id]);
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("[data-testid=open-category-designer]", { timeout: 20000 });
await girl.click("[data-testid=open-category-designer]");
await girl.waitForSelector("[data-testid=category-designer]");
await girl.click("button[aria-label='תצוגה מוכנה: קטגוריות גדולות']");
await girl.waitForTimeout(200);
check("תצוגה מוכנה: כרטיסים גדולים, פרושים",
  (await girl.getAttribute(prev, "data-layout")) === "card" &&
  (await girl.getAttribute(prev, "data-size")) === "lg" &&
  (await girl.getAttribute(prev, "data-arrange")) === "grid");
check("בפריסה אין 'הכל' — כל המוצרים ממילא מתחת", (await girl.locator(`${prev} button[aria-label='הכל']`).count()) === 0);
await girl.click("[data-testid=save-category-design]");
await girl.waitForSelector("[data-testid=category-designer]", { state: "detached", timeout: 10000 });
const { rows: [s3] } = await db.query("select category_layout, category_size from stores where id=$1", [store.id]);
check("נשמר: card+grid, גדול", s3.category_layout === "card+grid" && s3.category_size === "lg", `${s3.category_layout} · ${s3.category_size}`);

await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("הקונה רואה את הקטגוריות פרושות", (await buyer.getAttribute(bar, "data-arrange")) === "grid");
if (autoKey) {
  const src = await buyer.locator(`${bar} button[aria-label='סקווישים'] img`).getAttribute("src").catch(() => null);
  check("קטגוריה בלי תמונה מציגה לקונה את המוצר הראשון שבה", (src ?? "").includes(autoKey), src ?? "—");
}
const wide = await buyer.locator(`${bar} button[aria-label='צמידים']`).boundingBox();
check("ריבועים גדולים: שניים בשורה", !!wide && wide.width > 150 && Math.abs(wide.width - wide.height) < 2, `${wide?.width}×${wide?.height}`);
await buyer.click(`${bar} button[aria-label='צמידים']`);
await buyer.waitForTimeout(300);
check("בחירה מקפלת לשורה, עם 'הכל'",
  (await buyer.getAttribute(bar, "data-arrange")) === "row" && (await buyer.locator(`${bar} button[aria-label='הכל']`).count()) === 1);
check("והסינון עובד גם מהפריסה", (await buyer.locator(".s-look .grid > div").count()) === 1);
await buyer.click(`${bar} button[aria-label='הכל']`);
await buyer.waitForTimeout(300);
check("'הכל' פורש מחדש", (await buyer.getAttribute(bar, "data-arrange")) === "grid");

/* ── 7. הרבה קטגוריות: הראשונות, והשאר מאחורי "עוד קטגוריות" ── */
const MANY = ["חנוכה", "פורים", "קיץ", "חורף", "מתנות", "מבצעים", "חדש", "אהובים"];
await db.query("update stores set categories=$1 where id=$2", [MANY, store.id]);
await db.query("update products set categories=$1 where id=$2", [MANY, prods[0].id]);
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const tiles = () => buyer.locator(`${bar} button:not([data-testid=category-more])`).count();
check("8 קטגוריות: 6 מוצגות", (await tiles()) === 6, String(await tiles()));
check("והכפתור אומר כמה עוד יש", ((await buyer.textContent("[data-testid=category-more]")) ?? "").includes("עוד 2 קטגוריות"));
await buyer.click("[data-testid=category-more]");
check("לחיצה מציגה את כולן", (await tiles()) === 8, String(await tiles()));

/* ── 8. סדר הקטגוריות ── */
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("[data-testid=open-category-sort]", { timeout: 20000 });
await girl.click("[data-testid=open-category-sort]");
await girl.waitForSelector("[data-testid=category-sort-row]");
await girl.locator("[data-testid=category-sort-row]:has-text('אהובים') [data-testid=category-sort-top]").click();
await girl.click("[data-testid=category-sort-done]");
await girl.waitForSelector("[data-testid=category-sort]", { state: "detached", timeout: 10000 });
const { rows: [s4] } = await db.query("select categories from stores where id=$1", [store.id]);
check("'לראש' ושמירה: אהובים ראשונה", s4.categories[0] === "אהובים" && s4.categories.length === 8, s4.categories.join(","));
await buyer.goto(fresh(), { waitUntil: "networkidle" });
check("וזה הסדר שהקונה רואה",
  (await buyer.locator(`${bar} button`).first().getAttribute("aria-label")) === "אהובים");
await girl.click("[data-testid=open-category-sort]");
await girl.locator("[data-testid=category-sort-row]:has-text('חנוכה') [data-testid=category-sort-top]").click();
await girl.click("[data-testid=category-sort-cancel]");
const { rows: [s5] } = await db.query("select categories from stores where id=$1", [store.id]);
check("ביטול לא שומר", s5.categories[0] === "אהובים");

/* ── ניקוי ── */
await db.query(
  "update stores set categories=$1, category_layout=null, category_size=null, category_meta=null where id=$2",
  [store.categories, store.id]
);
for (const p of prods) {
  await db.query("update products set categories=$1, category=$2 where id=$3", [p.categories, p.category, p.id]);
}
await db.query("update products set image_key=$1 where id=$2", [orig3.image_key, prods[2].id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} category design checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
