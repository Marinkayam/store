// E2E: להעלות מוצרים ולסדר אותם בקלות, ומלאי לכל צבע.
//
// מרינה, 11.2026: "להעלות מוצרים ולשנות להם את הסדר … סזיפי וידני",
// "להוסיף כמות שיש לכל קטגוריה ולסדר את זה יפה בשורה אחד ליד השני".
//
// החוזים:
//   1. כמה בבת אחת: בוחרים כמה תמונות ← כרטיס לכל אחת ← "מחיר לכולם" ←
//      שמירה של כולם. כל מוצר עם תמונה (שעברה בקנבס), מחיר, ובסוף הרשימה.
//   2. סידור: "לראש" בלחיצה אחת, גרירה בידית, ושמירה אחת — הדוכן בסדר החדש.
//   3. מלאי לכל צבע: בעורך כמות ליד כל צבע, הסך נספר לבד; בדוכן צ'יפים
//      בשורה עם "אזל"; השרת חוסם צבע שאזל או יותר ממה שיש; "שולם" מוריד
//      מהצבע ומהסך, "ביטול" מחזיר.
//   4. הכפתור "הוספה לסל" על רצועה אטומה — לא עולה על הכמות.
import { chromium, devices } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const SHOTS = process.env.SHOTS ?? "/tmp";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!store?.activated_at) {
  console.error("צריך דוכן פעיל (seed.mjs ואז e2e-activation.mjs)");
  process.exit(1);
}
await db.query("update stores set status='active' where id=$1", [store.id]);
const TAG = `ב${Date.now() % 100000}`;
const created = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "he-IL" });
await ctx.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
const jsErrors = [];
const girl = await ctx.newPage();
girl.on("pageerror", (e) => jsErrors.push(e.message));
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });

try {
  /* ── 1. כמה בבת אחת ── */
  await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  const { rows: [{ n: before }] } = await db.query("select count(*)::int n from products where store_id=$1 and deleted_at is null", [store.id]);
  // שלוש תמונות אמיתיות (מצוירות בקנבס), כמו מהגלריה
  const pngs = await girl.evaluate(() =>
    ["#E8A0BF", "#9FC5E8", "#B6D7A8"].map((c) => {
      const cv = document.createElement("canvas");
      cv.width = 640; cv.height = 480;
      const x = cv.getContext("2d");
      x.fillStyle = c; x.fillRect(0, 0, 640, 480);
      return cv.toDataURL("image/png").split(",")[1];
    })
  );
  await girl.setInputFiles("[data-testid=bulk-input]", pngs.map((b, i) => ({ name: `p${i}.png`, mimeType: "image/png", buffer: Buffer.from(b, "base64") })));
  await girl.waitForSelector("[data-testid=bulk-add]", { timeout: 10000 });
  await girl.waitForFunction(() => document.querySelectorAll("[data-testid=bulk-item]").length === 3, null, { timeout: 15000 });
  check("שלוש תמונות → שלושה כרטיסים", true);
  check("הכפתור אומר מה חסר", ((await girl.textContent("[data-testid=bulk-save]")) ?? "").includes("חסר שם או מחיר"));
  const names = [`כדור ${TAG}`, `צמיד ${TAG}`, `סקוויש ${TAG}`];
  for (const [i, n] of names.entries()) await girl.locator("[data-testid=bulk-name]").nth(i).fill(n);
  await girl.fill("[data-testid=bulk-all-price]", "12");
  await girl.click("[data-testid=bulk-fill-prices]");
  check("'מחיר לכולם' ממלא את כל המחירים", (await girl.locator("[data-testid=bulk-price]").evaluateAll((els) => els.map((e) => e.value))).every((v) => v === "12"));
  await girl.locator("[data-testid=bulk-item]").first().screenshot({ path: `${SHOTS}/bulk-item.png` });
  await girl.screenshot({ path: `${SHOTS}/bulk-sheet.png` });
  check("ועכשיו: 'לשמור את כל ה-3'", ((await girl.textContent("[data-testid=bulk-save]")) ?? "").includes("לשמור את כל ה-3"));
  await girl.click("[data-testid=bulk-save]");
  await girl.waitForSelector("[data-testid=bulk-add]", { state: "detached", timeout: 30000 });
  const { rows: newRows } = await db.query(
    "select id, name, price, image_key, sort_order, stock from products where store_id=$1 and deleted_at is null and name like $2 order by sort_order",
    [store.id, `%${TAG}`]);
  created.push(...newRows.map((r) => r.id));
  check("נשמרו 3 מוצרים, עם תמונה ומחיר ₪12", newRows.length === 3 && newRows.every((r) => r.image_key && Number(r.price) === 12), JSON.stringify(newRows.map((r) => [r.name, r.price, !!r.image_key])));
  check("בסוף הרשימה, לפי סדר התמונות", newRows.map((r) => r.name).join() === names.join() && newRows[0].sort_order >= before - 1, newRows.map((r) => r.sort_order).join());
  const { rows: [{ n: after }] } = await db.query("select count(*)::int n from products where store_id=$1 and deleted_at is null", [store.id]);
  check("ובדיוק 3 נוספו", after === before + 3, `${before} → ${after}`);

  /* ── 2. סידור ── */
  await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await girl.click("[data-testid=sort-toggle]");
  await girl.waitForSelector("[data-testid=sort-list]");
  const ids0 = await girl.locator("[data-testid=sort-row]").evaluateAll((els) => els.map((e) => e.dataset.id));
  const last = ids0[ids0.length - 1];
  await girl.locator(`[data-testid=sort-row][data-id='${last}'] [data-testid=sort-top]`).click();
  let ids1 = await girl.locator("[data-testid=sort-row]").evaluateAll((els) => els.map((e) => e.dataset.id));
  check("'לראש' — המוצר האחרון עובר ראשון בלחיצה אחת", ids1[0] === last);
  // גרירה: הראשון שני מקומות למטה
  const h = girl.locator("[data-testid=sort-row]").first().locator("[data-testid=sort-handle]");
  const box = await h.boundingBox();
  const rowH = (await girl.locator("[data-testid=sort-row]").first().boundingBox()).height + 8;
  await girl.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await girl.mouse.down();
  for (let k = 1; k <= 10; k++) await girl.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (rowH * 2 * k) / 10);
  await girl.mouse.up();
  const ids2 = await girl.locator("[data-testid=sort-row]").evaluateAll((els) => els.map((e) => e.dataset.id));
  check("גרירה בידית — שני מקומות למטה", ids2[2] === last && ids2[0] === ids1[1], ids2.slice(0, 3).join(","));
  await girl.screenshot({ path: `${SHOTS}/sort-mode.png` });
  check("לפני השמירה עוד לא נכתב כלום", (await db.query("select id from products where store_id=$1 and deleted_at is null order by sort_order, created_at", [store.id])).rows.map((r) => r.id).join() === ids0.join());
  await girl.click("[data-testid=sort-done]");
  await girl.waitForSelector("[data-testid=sort-list]", { state: "detached", timeout: 10000 });
  await girl.waitForTimeout(800);
  const dbOrder = (await db.query("select id from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible) order by sort_order, created_at", [store.id])).rows.map((r) => r.id);
  check("'שמירה' — הסדר נשמר בדאטהבייס", dbOrder.slice(0, 3).join() === ids2.slice(0, 3).join(), dbOrder.slice(0, 3).join());

  /* ── 3. מלאי לכל צבע ── */
  const pid = created[0];
  await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await girl.locator(`[data-testid=product-row]:has-text('${names[0]}')`).first().click();
  await girl.waitForSelector("[data-testid=editor-close]");
  if (!(await girl.locator("[data-testid=editor-more-panel]").isVisible())) await girl.click("[data-testid=editor-more]");
  await girl.click("button[aria-label='יש לזה כמה צבעים']");
  await girl.fill("input[aria-label='צבע 1']", "ורוד");
  await girl.click("button:has-text('+ עוד צבע')");
  await girl.fill("input[aria-label='צבע 2']", "כחול");
  await girl.click("button[aria-label='עוד ורוד']"); // 1 → 2
  await girl.click("button[aria-label='פחות כחול']"); // 1 → 0
  check("ליד כל צבע — כמות, באותה שורה", (await girl.locator("[data-testid=option-count]").count()) === 2);
  check("'כמה יש לך' נספר לבד מהצבעים: 2", ((await girl.textContent("[data-testid=editor-stock]")) ?? "").trim() === "2");
  await girl.locator("[data-testid=option-count]").first().scrollIntoViewIfNeeded();
  await girl.screenshot({ path: `${SHOTS}/option-stock-editor.png` });
  await girl.click("button:has-text('שמירה')");
  await girl.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
  const { rows: [ps] } = await db.query("select option_stock, stock, options from products where id=$1", [pid]);
  check("נשמר: ורוד 2, כחול 0, סה\"כ 2", ps.option_stock?.["ורוד"] === 2 && ps.option_stock?.["כחול"] === 0 && ps.stock === 2, JSON.stringify(ps));

  // הדוכן
  const buyer = await (await browser.newContext({ ...devices["iPhone 13"], locale: "he-IL" })).newPage();
  buyer.on("pageerror", (e) => jsErrors.push(e.message));
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  await buyer.click(`button[aria-label='${names[0]}']`);
  await buyer.waitForSelector("[data-testid=option-picker]");
  const chips = buyer.locator("[data-testid=option-chip]");
  check("בדוכן: הצבעים כצ'יפים בשורה אחת", (await chips.count()) === 2 &&
    Math.abs((await chips.nth(0).boundingBox()).y - (await chips.nth(1).boundingBox()).y) < 4);
  check("כחול — 'אזל' ולא נבחר", (await chips.nth(1).getAttribute("data-out")) === "1" && ((await chips.nth(1).textContent()) ?? "").includes("אזל"));
  await chips.nth(1).click({ force: true });
  check("לחיצה על צבע שאזל לא בוחרת אותו", (await chips.nth(1).getAttribute("aria-pressed")) === "false");
  check("ורוד — 'נשארו 2'", ((await chips.nth(0).textContent()) ?? "").includes("נשארו 2"));
  await chips.nth(0).click();
  await buyer.click("button[aria-label='עוד']"); // 1 → 2
  check("הכמות נעצרת ב-2 (כמה שיש בוורוד): ה-+ כבוי", await buyer.locator("button[aria-label='עוד']").isDisabled());
  // הכפתור על רצועה אטומה ולא עולה על הכמות
  const cta = buyer.locator("button[aria-label='הוספה לסל']");
  const ctaBox = await cta.boundingBox();
  const hit = await buyer.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), [ctaBox.x + 20, ctaBox.y + 5]);
  const bg = await cta.evaluate((e) => getComputedStyle(e.parentElement).backgroundColor);
  check("'הוספה לסל' על רצועה אטומה, ושום דבר לא עליו", hit === "הוספה לסל" && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent", `${hit} · ${bg}`);
  await buyer.screenshot({ path: `${SHOTS}/option-chips.png` });

  // השרת
  const order = (items) =>
    fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug, items, buyerName: "בודקת", buyerPhone: "0521234567", wantsShipping: false }),
    }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  let r = await order([{ productId: pid, qty: 1, option: "כחול" }]);
  check("השרת: כחול שאזל — נחסם", r.status === 409 && (r.error ?? "").includes("אזל"), `${r.status} ${r.error}`);
  r = await order([{ productId: pid, qty: 3, option: "ורוד" }]);
  check("השרת: 3 ורוד כשיש 2 — נחסם", r.status === 409 && (r.error ?? "").includes("נשארו רק 2"), `${r.status} ${r.error}`);
  r = await order([{ productId: pid, qty: 2, option: "ורוד" }]);
  check("השרת: 2 ורוד — עובר", r.status === 200, `${r.status} ${r.error ?? ""}`);
  const { rows: [o] } = await db.query("select id from orders where store_id=$1 and order_number=$2", [store.id, r.orderNumber]);
  const asOwner = async (fn) => {
    const c = await db.connect();
    try {
      await c.query("select set_config('app.uid', $1, false)", [store.owner_id]);
      await c.query(`select ${fn}($1)`, [o.id]);
    } finally {
      await c.query("select set_config('app.uid', '', false)");
      c.release();
    }
  };
  await asOwner("mark_order_paid");
  const { rows: [pp] } = await db.query("select option_stock, stock from products where id=$1", [pid]);
  check("'שולם' מוריד מהוורוד ומהסך", pp.option_stock?.["ורוד"] === 0 && pp.stock === 0, JSON.stringify(pp));
  await asOwner("cancel_order");
  const { rows: [pc] } = await db.query("select option_stock, stock from products where id=$1", [pid]);
  check("'ביטול' מחזיר לוורוד ולסך", pc.option_stock?.["ורוד"] === 2 && pc.stock === 2, JSON.stringify(pc));

  check("בלי שגיאות JS", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));
} finally {
  if (created.length) await db.query("update products set deleted_at=now() where id = any($1)", [created]);
  await browser.close();
  await db.end();
  const { closeHelper } = await import("./sms-helper.mjs");
  await closeHelper();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} products-easy checks passed`);
process.exit(failed.length ? 1 : 0);
