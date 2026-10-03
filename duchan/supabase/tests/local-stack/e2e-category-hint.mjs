// E2E: "קבעתי קטגוריות ואני לא רואה אותן" — קטגוריה מופיעה בדוכן רק כשיש
// בה מוצר. המסך צריך להגיד את זה, להראות כמה מוצרים בכל קטגוריה, ולתת
// דרך קצרה לשייך: "+ קטגוריה" בשורת המוצר פותח את העורך ישר על הבחירה.
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

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
const orig = { categories: store.categories };
const { rows: prodsBefore } = await db.query("select id, categories, category from products where store_id=$1", [store.id]);
const CATS = ["א-קט", "ב-קט"];
await db.query("update stores set categories=$1, status='active' where id=$2", [CATS, store.id]);
await db.query("update products set categories=null, category=null where store_id=$1", [store.id]);
const { rows: [prod] } = await db.query(
  `select id, name from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and (not track_stock or stock > 0) order by sort_order, created_at limit 1`, [store.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const girl = await ctx.newPage();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });

/* ── אף מוצר לא משויך ── */
const hint = (await girl.textContent("[data-testid=categories-hint]").catch(() => "")) ?? "";
check("ההסבר מופיע: 'הקטגוריות עוד לא מופיעות בדוכן'", hint.includes("הקטגוריות עוד לא מופיעות בדוכן"), hint);
check("ואומר איך: לוחצים על מוצר ובוחרים לו קטגוריה", hint.includes("לוחצים על מוצר") && hint.includes("בוחרים לו קטגוריה"));
const chips = await girl.locator("[data-testid=category-chip]").allTextContents();
check("ליד כל קטגוריה כמה מוצרים יש בה (0)", chips.length === 2 && chips.every((c) => c.includes("· 0")), chips.join(" | "));
check("לכל מוצר יש '+ קטגוריה'", (await girl.locator("[data-testid=row-add-category]").count()) >= 1);
await girl.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/cat-hint.png` });

/* ── "+ קטגוריה" פותח את העורך על הבחירה ── */
await girl.locator("[data-testid=row-add-category]").first().click();
await girl.waitForSelector("[data-testid=editor-close]");
await girl.waitForTimeout(900);
const inView = await girl.evaluate(() => {
  const r = document.getElementById("editor-categories")?.getBoundingClientRect();
  return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
});
check("העורך נפתח וגולל ישר לבחירת הקטגוריה", inView);
const label = (await girl.textContent("#editor-categories")) ?? "";
check("והכותרת ברורה: 'באיזו קטגוריה המוצר יופיע בדוכן?'", label.includes("באיזו קטגוריה המוצר יופיע בדוכן"), label);
await girl.click("button[aria-label='קטגוריה א-קט']");
await girl.click("button:has-text('שמירה')");
await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
await girl.waitForTimeout(800);

/* ── אחרי שיוך ── */
const hint2 = (await girl.textContent("[data-testid=categories-hint]").catch(() => "")) ?? "";
check("עכשיו: רק 'ב-קט עוד ריקה'", hint2.includes("ב-קט עוד ריקה") && !hint2.includes("א-קט"), hint2);
const chips2 = await girl.locator("[data-testid=category-chip]").allTextContents();
check("והמונה עלה: א-קט · 1", chips2.some((c) => c.includes("א-קט") && c.includes("· 1")), chips2.join(" | "));
const rowText = (await girl.locator(`[data-testid=product-row]:has-text('${prod.name}')`).first().textContent()) ?? "";
check("ובשורת המוצר כתוב א-קט", rowText.includes("א-קט"), rowText.slice(0, 80));

const buyer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
const bar = (await buyer.textContent("[data-testid=category-chips]").catch(() => "")) ?? "";
check("בדוכן: א-קט מופיעה, ב-קט (ריקה) לא", bar.includes("א-קט") && !bar.includes("ב-קט"), bar);

/* ── שורת מוצר נקייה: בלי + / − בצד; ▲▼ רק במצב "לשנות סדר" ── */
const row = girl.locator(`[data-testid=product-row]:has-text('${prod.name}')`).first();
check("בשורת המוצר אין יותר + / − של מלאי", (await row.locator("button[aria-label='הוספה למלאי'], button[aria-label='הורדה מהמלאי']").count()) === 0);
check("וגם אין חצי סידור כל הזמן", (await girl.locator("button[aria-label='להזיז למטה']").count()) === 0);
await girl.click("[data-testid=sort-toggle]");
check("'לשנות סדר' מראה את החצים", (await girl.locator("button[aria-label='להזיז למטה']").count()) > 0);
await girl.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/rows-sorting.png` });
const order0 = await girl.locator("[data-testid=product-row]").allTextContents();
await girl.locator("button[aria-label='להזיז למטה']").first().click();
await girl.waitForTimeout(900);
const order1 = await girl.locator("[data-testid=product-row]").allTextContents();
check("והסידור עובד", order1[0] === order0[1] && order1[1] === order0[0]);
await girl.locator("button[aria-label='להזיז למעלה']").nth(1).click(); // מחזירים
await girl.waitForTimeout(900);
await girl.click("[data-testid=sort-toggle]");
check("'סיימתי לסדר' מחביא אותם שוב", (await girl.locator("button[aria-label='להזיז למטה']").count()) === 0);
await girl.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/rows-clean.png` });
await row.click();
await girl.waitForSelector("[data-testid=editor-close]");
check("והמלאי נערך בתוך המוצר", (await girl.locator("[data-testid=editor-stock]").count()) === 1);
// "כמה יש לי כאלה" מעל הבחירה אם לספור
const stockAbove = await girl.evaluate(() => {
  const a = document.querySelector("[data-testid=editor-stock]");
  const b = document.querySelector("[data-testid=track-stock-choice]");
  return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
});
check("בעורך: הכמות מופיעה מעל 'לספור?'", stockAbove);
await girl.click("[data-testid=track-stock-choice-off]");
check("'בלי הגבלה' מחליף את הכמות", (await girl.locator("[data-testid=editor-stock-unlimited]").count()) === 1 && (await girl.locator("[data-testid=editor-stock]").count()) === 0);
await girl.click("[data-testid=track-stock-choice-on]");
const visOn = (await girl.textContent("[data-testid=visible-help]")) ?? "";
check("'רואים אותו בדוכן?' מוסבר: מוצג = הקונים רואים", visOn.includes("הקונים רואים"), visOn);
await girl.click("[data-testid=visible-choice-off]");
const visOff = (await girl.textContent("[data-testid=visible-help]")) ?? "";
check("ומוסתר = נשאר שמור, לא רואים, אפשר להחזיר", visOff.includes("לא רואים") && visOff.includes("להחזיר"), visOff);
// קטגוריה חדשה ישר מהעורך — נשמרת לדוכן ונבחרת למוצר
await girl.click("[data-testid=visible-choice-on]");
await girl.click("[data-testid=editor-new-category]");
await girl.fill("input[aria-label='שם הקטגוריה החדשה']", "ג-קט");
await girl.click("[data-testid=editor-new-category-add]");
await girl.waitForTimeout(800);
const { rows: [sc] } = await db.query("select categories from stores where id=$1", [store.id]);
check("'+ קטגוריה חדשה' בעורך: נשמרת לדוכן", (sc.categories ?? []).includes("ג-קט"), String(sc.categories));
check("ונבחרת למוצר מיד", (await girl.getAttribute("button[aria-label='קטגוריה ג-קט']", "aria-pressed")) === "true");
await girl.locator("#editor-categories").scrollIntoViewIfNeeded();
await girl.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/editor-newcat.png` });
await girl.locator("[data-testid=visible-help]").scrollIntoViewIfNeeded();
await girl.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/editor-stock.png` });
await girl.click("[data-testid=editor-close]");

/* ── ניקוי ── */
await db.query("update stores set categories=$1 where id=$2", [orig.categories, store.id]);
for (const p of prodsBefore) await db.query("update products set categories=$1, category=$2 where id=$3", [p.categories, p.category, p.id]);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} category hint checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
