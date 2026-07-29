// E2E לתגיות. הנקודה המרכזית: "הכי נמכר" נגזר ממכירות אמיתיות ולא ניתן
// להדבקה — זה מה שהופך אותו ללקח עסקי ולא למדבקה.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/badge-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
const slug = store.slug;
// /api/revalidate דורש שהמבקשת תהיה בעלת החנות, ולכן הוא לא זמין מכאן.
// הדף מוגש מקאש של 60 שניות — פרמטר משתנה נותן כתובת חדשה וקאש חדש.
let tick = 0;
const fresh = () => `${BASE}/s/${slug}?t=${Date.now()}-${tick++}`;
const bump = async () => {};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

// שלושה מוצרים נקיים, ותיקים מספיק כדי שלא יקבלו "חדש" סתם
await db.query("delete from products where name like 'תג-%'");
await db.query("delete from orders where store_id=$1 and status in ('paid','delivered')", [store.id]);
const mk = async (name, patch = {}) => {
  const { rows: [p] } = await db.query(
    `insert into products (store_id, name, price, track_stock, stock, created_at, badge)
     values ($1,$2,$3,true,$4, now() - interval '40 days', $5) returning *`,
    [store.id, name, 10, patch.stock ?? 5, patch.badge ?? null]
  );
  return p;
};
const a = await mk("תג-אלף");
const b = await mk("תג-בית");
const c = await mk("תג-גימל");
await bump();

const badgeOn = async (page, name) => {
  const card = page.locator("button", { hasText: name }).first();
  const chip = card.locator("span").filter({ hasText: /נדיר|חדש|הכי נמכר|מבצע|אחרון במלאי/ });
  return (await chip.count()) ? (await chip.first().textContent())?.trim() : null;
};

/* ── 1. בלי כלום — אין תגית ── */
let p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("an ordinary product gets no badge", (await badgeOn(p, "תג-אלף")) === null);

/* ── 2. מוצר חדש מקבל 🔥 לבד ── */
await db.query("update products set created_at = now() where id=$1", [a.id]);
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("a product added today is marked new by itself", (await badgeOn(p, "תג-אלף"))?.includes("חדש"));
await db.query("update products set created_at = now() - interval '40 days' where id=$1", [a.id]);

/* ── 3. "אחרון במלאי" — רק כשהוא באמת אומר משהו ──
   כמות 1 היא מצב הפתיחה הרגיל של רוב המוצרים כאן (חפץ יחיד יד שנייה),
   ולכן לבדה היא לא נדירות. התגית קופצת רק אחרי שנמכרה יחידה. */
await db.query("update products set stock=1, created_at=now() where id=$1", [b.id]);
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("a single unit that never sold is not called 'last in stock'",
  !(await badgeOn(p, "תג-בית"))?.includes("אחרון במלאי"));

const { rows: [seedN] } = await db.query(
  "select coalesce(max(order_number),0)+1 as n from orders where store_id=$1", [store.id]
);
await db.query(
  "insert into orders (store_id, order_number, items, total, status) values ($1,$2,$3::jsonb,$4,'paid')",
  [store.id, seedN.n, JSON.stringify([{ id: b.id, name: "תג-בית", qty: 1, price: 10 }]), 10]
);
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("once it has sold, the last unit is flagged and urgency beats novelty",
  (await badgeOn(p, "תג-בית"))?.includes("אחרון במלאי"));
await db.query("delete from orders where store_id=$1 and status='paid'", [store.id]);
await db.query("update products set stock=5, created_at = now() - interval '40 days' where id=$1", [b.id]);

/* ── 4. תגית שהילדה בוחרת ── */
await db.query("update products set badge='rare' where id=$1", [c.id]);
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("a badge she picked herself shows up", (await badgeOn(p, "תג-גימל"))?.includes("נדיר"));

/* ── 5. "הכי נמכר" — רק ממכירות ששולמו ── */
const order = async (productId, name, qty, status) => {
  const { rows: [n] } = await db.query(
    "select coalesce(max(order_number),0)+1 as n from orders where store_id=$1", [store.id]
  );
  await db.query(
    "insert into orders (store_id, order_number, items, total, status) values ($1,$2,$3::jsonb,$4,$5)",
    [store.id, n.n, JSON.stringify([{ id: productId, name, qty, price: 10 }]), qty * 10, status]
  );
};

// חמש יחידות שנשלחו אבל לא שולמו — כוונה, לא מכירה
await order(a.id, "תג-אלף", 5, "sent");
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("orders that were only sent do not earn the star",
  !(await badgeOn(p, "תג-אלף"))?.includes("הכי נמכר"));

// תיקו לא מייצר מנצח — כוכב שנקבע לפי סדר שורות הוא מקריות
await order(a.id, "תג-אלף", 2, "paid");
await order(b.id, "תג-בית", 2, "paid");
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("a tie earns nobody the star",
  !(await badgeOn(p, "תג-אלף"))?.includes("הכי נמכר") &&
  !(await badgeOn(p, "תג-בית"))?.includes("הכי נמכר"));

// שובר שוויון — עכשיו יש מנצחת אחת ברורה
await order(b.id, "תג-בית", 1, "paid");
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("two paid units earn the star", (await badgeOn(p, "תג-בית"))?.includes("הכי נמכר"));
await p.screenshot({ path: `${shots}/90-badges.png`, fullPage: true });

// והוא עובר למי שמכר יותר
await order(c.id, "תג-גימל", 9, "paid");
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("the star moves to whoever actually sold more",
  (await badgeOn(p, "תג-גימל"))?.includes("הכי נמכר") &&
  !(await badgeOn(p, "תג-בית"))?.includes("הכי נמכר"));
check("the star outranks a badge she picked herself",
  !(await badgeOn(p, "תג-גימל"))?.includes("נדיר"));
await p.screenshot({ path: `${shots}/91-best-seller-moved.png`, fullPage: true });

/* ── 6. מוצר שאזל לא מקבל תגית — יש לו רצועה ── */
await db.query("update products set stock=0 where id=$1", [c.id]);
await bump();
p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
check("a sold-out product shows the band, not a badge", (await badgeOn(p, "תג-גימל")) === null);
await db.query("update products set stock=5 where id=$1", [c.id]);
await bump();

/* ── 7. הילדה בוחרת תגית מהעורך ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.locator("div", { hasText: "תג-אלף" }).last().click();
await girl.waitForSelector("input[aria-label='שם המוצר']");
const editorBody = await girl.textContent("body");
// האימוג'ים הוחלפו באייקונים משלנו, ולכן מזהים לפי הטקסט בלבד
const pickable = await girl.locator("[data-testid^='badge-']").count();
check("the editor offers exactly the two she can pick", pickable === 2, `${pickable} כפתורים`);
check("the editor explains which badges are automatic",
  editorBody.includes("מופיעות לבד"));
const sale = girl.locator("[data-testid='badge-sale']");
check("no badge is picked before she taps one",
  (await sale.getAttribute("aria-pressed")) === "false");
await sale.click();
await girl.waitForTimeout(300);
check("and tapping it marks it as pressed",
  (await sale.getAttribute("aria-pressed")) === "true");
await girl.locator("button:text-is('שמירה')").click();
await girl.waitForTimeout(2500);
const { rows: [saved] } = await db.query("select badge from products where id=$1", [a.id]);
check("the picked badge is saved", saved.badge === "sale", String(saved.badge));
await girl.screenshot({ path: `${shots}/92-editor.png`, fullPage: true });

/* ── 8. אי אפשר להדביק "הכי נמכר" דרך ה-API ── */
const { rows: [bad] } = await db.query(
  "select count(*)::int as n from information_schema.check_constraints where constraint_name='products_badge_check'"
);
check("the database itself refuses any badge outside the two", bad.n === 1);
let rejected = false;
try {
  await db.query("update products set badge='best' where id=$1", [a.id]);
} catch {
  rejected = true;
}
check("writing 'best' straight into the table is rejected", rejected);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} badge checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
