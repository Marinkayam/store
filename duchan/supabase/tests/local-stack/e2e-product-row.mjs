// E2E: שורת מוצר ב"מוצרים" — ברורה גם במסך צר / מוגדל.
//
// מרינה: "מה מציגים מה רואים, למה הכפתורים לא אותו גודל, והכפתור של
// הקטגוריה נחתך בצדדים ולא רואים את הקו המקווקו". בטלפון עם תצוגה מוגדלת
// הרוחב בפועל הוא ~260px, ושם התגית של הדרופ נחתכה.
//
//   1. התגיות של מצב המוצר באותו גובה בדיוק (כולל המקווקווה)
//   2. שום דבר לא יוצא מהשורה — לא ב-390 ולא ב-260
//   3. קטגוריות הן טקסט "קטגוריה: ..." בשורה נפרדת, לא עוד תגית
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
const { rows: [a] } = await db.query("select * from products where store_id=$1 and name='תג-אלף' and deleted_at is null limit 1", [store.id]);
const { rows: [b] } = await db.query("select * from products where store_id=$1 and name='תג-בית' and deleted_at is null limit 1", [store.id]);
const keep = { cats: store.categories, a, b };
const CATS = ["יד שנייה", "גדול"];
await db.query("update stores set categories=$1 where id=$2", [CATS, store.id]);
// א: דרופ + אחרון במלאי, בלי קטגוריה. ב: שקית הפתעה עם שתי קטגוריות
await db.query("update products set drop_at=now()+interval '3 days', track_stock=true, stock=1, categories=null, category=null, is_mystery=null where id=$1", [a.id]);
await db.query("update products set drop_at=null, is_mystery=true, categories=$2, category=null where id=$1", [b.id, CATS]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const width of [390, 260]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await verifyPhone(p, "0501234567");
    await p.waitForURL("**/dashboard", { timeout: 20000 });
    await p.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
    const rowA = p.locator("[data-testid=product-row]:has-text('תג-אלף')");
    const rowB = p.locator("[data-testid=product-row]:has-text('תג-בית')");
    await rowA.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/product-row-${width}.png` });

    // 1. אותו גובה
    const hs = await rowA.locator("[data-testid=row-status] > span, [data-testid=row-add-category]")
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const single = await rowA.locator("[data-testid=row-status] > span:not([data-testid=row-drop]), [data-testid=row-add-category]")
      .evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
    check(`${width}: תגיות בשורה אחת — אותו גובה, כולל המקווקווה`, single.length === 1, hs.join(","));

    // 2. שום דבר לא יוצא מהשורה
    for (const [name, row] of [["א", rowA], ["ב", rowB]]) {
      const out = await row.evaluate((r) => {
        const box = r.getBoundingClientRect();
        return [...r.querySelectorAll("span, button, div")].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width && (b.left < box.left - 0.5 || b.right > box.right + 0.5 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible" && !e.classList.contains("truncate"));
        }).map((e) => e.textContent.slice(0, 30));
      });
      check(`${width}: שורה ${name} — שום דבר לא נחתך או יוצא החוצה`, out.length === 0, out.join(" | "));
    }
    const dashed = await rowA.locator("[data-testid=row-add-category]").evaluate((e) => getComputedStyle(e).borderTopStyle);
    check(`${width}: הקו המקווקו של '+ קטגוריה' נראה`, dashed === "dashed", dashed);

    // 3. ברור מה זה מה
    check(`${width}: דרופ — 'נפתח …' עם אייקון, בלי אימוג'י`,
      ((await rowA.locator("[data-testid=row-drop]").textContent()) ?? "").includes("נפתח") &&
        (await rowA.locator("[data-testid=row-drop] svg").count()) === 1);
    check(`${width}: מלאי 1 — 'נשאר אחרון' (לא 'נשארו 1')`, (await rowA.textContent()).includes("נשאר אחרון"));
    check(`${width}: הפתעה — 'שקית הפתעה'`, ((await rowB.locator("[data-testid=row-mystery]").textContent()) ?? "").includes("שקית הפתעה"));
    const catsText = (await rowB.locator("[data-testid=row-cats]").textContent()) ?? "";
    check(`${width}: קטגוריות כטקסט 'קטגוריה: יד שנייה · גדול'`, catsText.includes("קטגוריה:") && catsText.includes("יד שנייה · גדול"), catsText);
    check(`${width}: והקטגוריות לא בתוך שורת התגיות`, (await rowB.locator("[data-testid=row-status]").textContent()).includes("יד שנייה") === false);
    await ctx.close();
  }
} finally {
  await db.query("update stores set categories=$1 where id=$2", [keep.cats, store.id]);
  for (const r of [keep.a, keep.b]) {
    await db.query("update products set drop_at=$2, track_stock=$3, stock=$4, categories=$5, category=$6, is_mystery=$7 where id=$1",
      [r.id, r.drop_at, r.track_stock, r.stock, r.categories, r.category, r.is_mystery]);
  }
  await browser.close();
  await db.end();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
