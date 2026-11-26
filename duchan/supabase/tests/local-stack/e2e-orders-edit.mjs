// E2E: הזמנות. "קיבלתם כסף?", עריכת הזמנה, וסיבת ביטול (מיגרציה 0073).
//
// מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור 2 ו-3). בנתונים: כמעט חצי
// מההזמנות בוטלו, הרבה מהן כדי "לתקן" הזמנה, ו-87 נשארו "חדשות" יותר משבוע.
//
// החוזים:
//   1. הזמנה חדשה בת יותר מ-3 ימים מופיעה בכרטיס "קיבלתם כסף?" בראש הרשימה.
//      "כן, שילמו" מסמן שולם. "לא שילמו" שואל שוב, ואז מבטל עם הסיבה unpaid.
//      "אחר כך" מסתיר את הכרטיס.
//   2. עריכה: מורידים כמות, רואים סכום חדש, שומרים. השרת שומר כמות וסכום
//      חדשים ומסמן edited_at, והכרטיס כותב "שונתה". אי אפשר להגדיל.
//   3. ביטול שואל למה. "רוצים לשנות משהו" פותח עריכה ולא מבטל. סיבה אחרת
//      מבטלת ונשמרת, והכרטיס מציג אותה.
//   4. בהזמנה ששולמה אין "רוצים לשנות" (אי אפשר לערוך אחרי תשלום).
//   5. הפונקציה בשרת לא נותנת לערוך הזמנה של דוכן אחר.
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

const { rows: [store] } = await db.query(
  "select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1"
);
if (!store) {
  console.error("צריך דוכן פעיל של 0501234567. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
const { rows: [prod] } = await db.query(
  `select id from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and (options is null or cardinality(options) = 0) order by sort_order, created_at limit 1`,
  [store.id]
);
await db.query("update products set price=10, stock=80, track_stock=true where id=$1", [prod.id]);
await db.query("update orders set deleted_at=now() where store_id=$1 and status='sent' and deleted_at is null", [store.id]);

const made = [];
async function order(qty, daysOld = 0) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: store.slug,
      items: [{ productId: prod.id, qty }],
      buyerName: "דנה",
      buyerPhone: "0527778899",
      payMethod: "cash",
    }),
  });
  const j = await r.json();
  if (!j.orderNumber) throw new Error("ההזמנה לא נוצרה: " + JSON.stringify(j));
  const { rows: [o] } = await db.query("select id from orders where store_id=$1 and order_number=$2", [store.id, j.orderNumber]);
  if (daysOld) await db.query("update orders set created_at = now() - ($2 || ' days')::interval where id=$1", [o.id, String(daysOld)]);
  made.push(o.id);
  return { id: o.id, num: j.orderNumber };
}
const row = async (id) => (await db.query("select status, cancel_reason, edited_at, total, items from orders where id=$1", [id])).rows[0];

const staleA = await order(1, 5);
const staleB = await order(1, 6);
const fresh = await order(3);
const fresh2 = await order(2);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const me = await ctx.newPage();
  await me.goto(`${BASE}/login`);
  await verifyPhone(me, "0501234567");
  await me.waitForURL("**/dashboard", { timeout: 20000 });
  await me.evaluate(() => { try { localStorage.removeItem("duchan-stale-later"); localStorage.setItem("duchan-cookies", "1"); } catch {} });
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const card = (num) => me.locator("[data-testid=order-card]", { hasText: `#${num}` }).first();

  /* ── 1. קיבלתם כסף? ── */
  const stale = me.locator("[data-testid=stale-orders]");
  await stale.waitFor({ timeout: 15000 });
  check("כרטיס 'קיבלתם כסף?' מופיע עם שתי ההזמנות הוותיקות", (await stale.locator("[data-testid=stale-row]").count()) === 2);
  check("והזמנה חדשה מהיום לא בו", !((await stale.textContent()) ?? "").includes(`#${fresh.num}`));
  // הוותיקה ביותר ראשונה (staleB, לפני 6 ימים)
  await stale.locator("[data-testid=stale-row]").first().locator("[data-testid=stale-paid]").click();
  await me.waitForTimeout(1200);
  check("'כן, שילמו' מסמן שולם", (await row(staleB.id)).status === "paid");
  await stale.locator("[data-testid=stale-row]").first().locator("[data-testid=stale-unpaid]").click();
  check("'לא שילמו' שואל לפני שמבטלים", await stale.locator("[data-testid=stale-unpaid-yes]").isVisible() && (await row(staleA.id)).status === "sent");
  await stale.locator("[data-testid=stale-unpaid-yes]").click();
  await me.waitForTimeout(1200);
  { const r = await row(staleA.id); check("ואז מבטל עם הסיבה 'לא שילמו'", r.status === "cancelled" && r.cancel_reason === "unpaid", `${r.status}/${r.cancel_reason}`); }
  check("כשאין יותר ותיקות, הכרטיס נעלם", (await stale.count()) === 0);

  /* ── 2. עריכה ── */
  const c1 = card(fresh.num);
  await c1.locator("[data-testid=order-edit]").click();
  const panel = c1.locator("[data-testid=order-edit-panel]");
  check("עריכה: נפתח פאנל עם כמות", await panel.isVisible());
  const plus = panel.getByRole("button", { name: /^עוד / });
  check("אי אפשר להגדיל מעבר למה שהוזמן", await plus.isDisabled());
  await panel.getByRole("button", { name: /^פחות / }).click();
  check("הסכום החדש מתעדכן לפני השמירה", ((await panel.locator("[data-testid=edit-sum]").textContent()) ?? "").includes("20"));
  await panel.locator("[data-testid=edit-save]").click();
  await me.waitForTimeout(1200);
  { const r = await row(fresh.id); check("נשמר: כמות 2, סכום ₪20, ומתי נערך", r.items[0].qty === 2 && Number(r.total) === 20 && !!r.edited_at && r.status === "sent", `${r.items[0].qty}/${r.total}`); }
  check("והכרטיס כותב 'שונתה'", (await c1.locator("[data-testid=order-edited]").count()) === 1);
  check("והסכום בכרטיס התעדכן", ((await c1.textContent()) ?? "").includes("₪20"));
  // כל הכמויות ל-0: אי אפשר לשמור, מבטלים במקום
  await c1.locator("[data-testid=order-edit]").click();
  await panel.getByRole("button", { name: /^פחות / }).click();
  await panel.getByRole("button", { name: /^פחות / }).click();
  check("להוריד הכול: השמירה כבויה, ויש הסבר לבטל", (await panel.locator("[data-testid=edit-save]").isDisabled()) && ((await panel.textContent()) ?? "").includes("מבטלים"));
  await panel.getByRole("button", { name: "בלי שינוי" }).click();

  /* ── 3. ביטול עם סיבה ── */
  const c2 = card(fresh2.num);
  await c2.locator("[data-testid=order-cancel]").click();
  const reasons = c2.locator("[data-testid=cancel-reasons]");
  check("ביטול שואל 'למה מבטלים?'", await reasons.isVisible() && (await reasons.locator("button[data-testid^=cancel-]").count()) === 5);
  await reasons.locator("[data-testid=cancel-changed]").click();
  check("'רוצים לשנות' פותח עריכה ולא מבטל", (await c2.locator("[data-testid=order-edit-panel]").isVisible()) && (await row(fresh2.id)).status === "sent");
  await c2.getByRole("button", { name: "בלי שינוי" }).click();
  await c2.locator("[data-testid=order-cancel]").click();
  await c2.locator("[data-testid=cancel-sold_out]").click();
  await me.waitForTimeout(1200);
  { const r = await row(fresh2.id); check("סיבה אחרת מבטלת ונשמרת", r.status === "cancelled" && r.cancel_reason === "sold_out"); }
  check("והכרטיס מציג את הסיבה", ((await card(fresh2.num).locator("[data-testid=order-cancel-reason]").textContent()) ?? "").includes("המוצר נגמר"));

  /* ── 4. הזמנה ששולמה ── */
  const c3 = card(staleB.num);
  check("בהזמנה ששולמה אין כפתור עריכה", (await c3.locator("[data-testid=order-edit]").count()) === 0);
  await c3.locator("[data-testid=order-cancel]").click();
  check("ובביטול שלה אין 'רוצים לשנות'", (await c3.locator("[data-testid=cancel-changed]").count()) === 0 && (await c3.locator("[data-testid=cancel-other]").count()) === 1);

  /* ── 1ב. אחר כך ── */
  await order(1, 4);
  await me.reload({ waitUntil: "networkidle" });
  await stale.waitFor({ timeout: 15000 });
  await me.locator("[data-testid=stale-later]").click();
  await me.reload({ waitUntil: "networkidle" });
  await me.waitForTimeout(800);
  check("'אחר כך' מסתיר את הכרטיס גם אחרי רענון", (await stale.count()) === 0);
} finally {
  await browser.close();
  await closeHelper();
}

/* ── 5. השרת: לא עורכים הזמנה של אחרים ── */
{
  let refused = false;
  try {
    await db.query("select edit_order_items($1, '[1]'::jsonb)", [made[2]]);
  } catch (e) {
    refused = /not allowed/.test(e.message);
  }
  check("edit_order_items בלי בעלות על הדוכן: נחסם", refused);
}

await db.query("update orders set deleted_at=now() where id = any($1)", [made]);
await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
