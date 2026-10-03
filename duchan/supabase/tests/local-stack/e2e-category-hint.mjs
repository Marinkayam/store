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
const rowText = (await girl.locator(`div.cursor-pointer:has-text('${prod.name}')`).first().textContent()) ?? "";
check("ובשורת המוצר כתוב א-קט", rowText.includes("א-קט"), rowText.slice(0, 80));

const buyer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
const bar = (await buyer.textContent("[data-testid=category-chips]").catch(() => "")) ?? "";
check("בדוכן: א-קט מופיעה, ב-קט (ריקה) לא", bar.includes("א-קט") && !bar.includes("ב-קט"), bar);

/* ── ניקוי ── */
await db.query("update stores set categories=$1 where id=$2", [orig.categories, store.id]);
for (const p of prodsBefore) await db.query("update products set categories=$1, category=$2 where id=$3", [p.categories, p.category, p.id]);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} category hint checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
