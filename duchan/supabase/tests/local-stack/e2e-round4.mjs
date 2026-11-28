// E2E: סבב רעיונות 4. מרינה, 11.2026: "כן תתחיל הכל".
//
// החוזים:
//   1. תשלום שמחכה: כשאין מכשיר עם פוש ואין טלגרם, התזכורת היומית יוצאת
//      גם בסמס למספר המנהלת (הפוש נכבה בפרודקשן ב-9.10, ו-8 דוכנים חיכו).
//   2. מצב חופשה: הדוכן נשאר גלוי עם המוצרים, עם "הדוכן בחופשה · חוזרים
//      ב-…", ואי אפשר להזמין (גם בשרת). חזרה לפתוח מחזירה הזמנות.
//   3. עזרה בתמחור: טווח מחירים של מוצרים דומים, רק כשיש 3 דוכנים לפחות.
//   4. משימת השבוע מופיעה גם במסך ההזמנות.
//   5. דוכן גדול: רק התמונות הראשונות נטענות מיד, השאר lazy.
//   6. "זו מתנה": נשמר על ההזמנה, הברכה בהערה, ובכרטיס "לארוז יפה".
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
const today = new Date().toISOString().slice(0, 10);

const { rows: [store] } = await db.query(
  "select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1"
);
const { rows: [prod] } = await db.query(
  `select id, name from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and (options is null or cardinality(options) = 0) order by sort_order, created_at limit 1`, [store.id]);
await db.query("update products set stock=50, track_stock=true, price=10 where id=$1", [prod.id]);
await db.query("update stores set status='active', away=null, away_until=null where id=$1", [store.id]);

/* ── 1. סמס למנהלת ── */
{
  const { rows: [st2] } = await db.query("select id from stores where id<>$1 order by created_at limit 1", [store.id]);
  const { rows: [orig] } = await db.query("select activated_at, payment_claimed_at from stores where id=$1", [st2.id]);
  await db.query("update stores set activated_at=null, payment_claimed_at=now()-interval '2 days' where id=$1", [st2.id]);
  await db.query("update admin_push_subscriptions set disabled_at=now() where disabled_at is null");
  await db.query("delete from admin_alerts where kind='payment_reminder' and ref=$1", [today]);
  await db.query("insert into admin_phones (phone) values ('972509990000') on conflict do nothing").catch(() => {});
  const { rows: [{ n: before }] } = await db.query("select count(*)::int n from sms_outbox where msg like '%אישור תשלום%'");
  await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } });
  await new Promise((r) => setTimeout(r, 1500));
  const { rows: sms } = await db.query("select recipient, msg from sms_outbox where msg like '%אישור תשלום%' order by id desc limit 3");
  const { rows: [{ n: after1 }] } = await db.query("select count(*)::int n from sms_outbox where msg like '%אישור תשלום%'");
  check("פוש לא הגיע לאף מכשיר: התזכורת יצאה בסמס למנהלת", after1 > before && sms[0].msg.includes("/admin"), sms[0]?.msg?.slice(0, 80) ?? "");
  await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } });
  await new Promise((r) => setTimeout(r, 1000));
  const { rows: [{ n: after2 }] } = await db.query("select count(*)::int n from sms_outbox where msg like '%אישור תשלום%'");
  check("ופעם אחת ביום, לא בכל ריצה", after2 === after1, `${after1}→${after2}`);
  await db.query("update stores set activated_at=$2, payment_claimed_at=$3 where id=$1", [st2.id, orig.activated_at, orig.payment_claimed_at]);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const me = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await me.goto(`${BASE}/login`);
  await verifyPhone(me, "0501234567");
  await me.waitForURL("**/dashboard", { timeout: 20000 });

  /* ── 4. משימת השבוע ── */
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const peek = me.locator("[data-testid=week-quest-peek]");
  const hasPeek = await peek.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check("משימת השבוע במסך ההזמנות, עם מטבעות", hasPeek && ((await peek.textContent()) ?? "").includes("משימת השבוע"));

  /* ── 2. מצב חופשה ── */
  await me.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  await me.waitForSelector("[data-testid=away-card]", { timeout: 20000 });
  await me.click("[data-testid=store-open-off]");
  await me.waitForSelector("[data-testid=away-until]", { timeout: 10000 });
  const until = new Date(Date.now() + 5 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  await me.fill("[data-testid=away-until]", until);
  await me.waitForTimeout(1500);
  const { rows: [aw] } = await db.query("select away, away_until::text, status from stores where id=$1", [store.id]);
  check("בחופשה נשמר, עם תאריך חזרה, והדוכן עדיין active", aw.away === true && aw.away_until === until && aw.status === "active", JSON.stringify(aw));
  const buyer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  const banner = buyer.locator("[data-testid=away-banner]");
  const [, m, d] = until.split("-");
  check("בדוכן: 'הדוכן בחופשה · חוזרים ב-…'", ((await banner.textContent().catch(() => "")) ?? "").includes(`חוזרים ב-${Number(d)}.${Number(m)}`));
  check("והמוצרים עדיין מוצגים", (await buyer.locator(`button[aria-label='${prod.name}']`).count()) >= 1);
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items: [{ productId: prod.id, qty: 1 }], buyerName: "גל", buyerPhone: "0526667777", payMethod: "cash" }),
  });
  const rj = await r.json();
  check("בשרת: הזמנה נדחית בחופשה", r.status === 409 && (rj.error ?? "").includes("בחופשה"), `${r.status} ${rj.error ?? ""}`);
  await me.click("[data-testid=store-open-on]");
  await me.waitForTimeout(1500);
  const { rows: [aw2] } = await db.query("select away from stores where id=$1", [store.id]);
  check("חזרה לפתוח", aw2.away === false);

  /* ── 6. מתנה ── */
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  await buyer.click(`button[aria-label='${prod.name}']`);
  await buyer.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
  await buyer.click("button[aria-label='הוספה לסל']");
  await buyer.waitForTimeout(600);
  await buyer.click("[data-testid=cart-bar]");
  await buyer.waitForSelector("input[aria-label='מספר טלפון']", { timeout: 15000 });
  await buyer.fill("input[aria-label='השם שלכם'], input[aria-label='שם ושם משפחה']", "גל");
  await buyer.fill("input[aria-label='מספר טלפון']", "052-666-7777");
  const pickup = buyer.locator("button:has-text('איסוף מהדוכן')");
  if (await pickup.count()) await pickup.click();
  await buyer.check("[data-testid=gift-toggle] input");
  await buyer.fill("[data-testid=gift-note]", "מזל טוב!");
  await buyer.click("button:has-text('שליחת ההזמנה')");
  await buyer.locator("[data-testid=order-pay-first], [data-testid=order-confirmed]").first().waitFor({ timeout: 15000 });
  await buyer.waitForTimeout(1500);
  const { rows: [g] } = await db.query("select id, order_number, is_gift, buyer_note from orders where store_id=$1 and buyer_name='גל' order by created_at desc limit 1", [store.id]);
  check("מתנה: נשמר על ההזמנה, והברכה בהערה", g?.is_gift === true && (g.buyer_note ?? "").includes("מזל טוב"), JSON.stringify(g ?? {}));
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const card = me.locator("[data-testid=order-card]", { hasText: `#${g?.order_number}` }).first();
  check("ובכרטיס ההזמנה: 'זו מתנה: לארוז יפה'", ((await card.locator("[data-testid=order-gift]").textContent().catch(() => "")) ?? "").includes("לארוז יפה"));
  if (g) await db.query("update orders set deleted_at=now() where id=$1", [g.id]);

  /* ── 3. עזרה בתמחור ── */
  // הטווח מוצג רק כשיש לפחות 3 דוכנים פתוחים עם מוצר דומה: פותחים זמנית 4
  const { rows: others } = await db.query("select id, activated_at, status from stores order by created_at limit 4");
  await db.query("update stores set activated_at=coalesce(activated_at, now()), status='active' where id = any($1)", [others.map((o) => o.id)]);
  const made = [];
  for (const [i, s] of others.entries()) {
    for (const price of [8 + i, 12 + i]) {
      const { rows: [x] } = await db.query("insert into products (store_id, name, price, stock, track_stock) values ($1,$2,$3,5,true) returning id", [s.id, `זיגזג בדיקה ${i}`, price]);
      made.push(x.id);
    }
  }
  await me.goto(`${BASE}/dashboard/products?new=1&name=${encodeURIComponent("זיגזג חדש")}`, { waitUntil: "networkidle" });
  const hint = me.locator("[data-testid=price-hint]");
  const shown = await hint.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const ht = shown ? (await hint.textContent()) ?? "" : "";
  check("עזרה בתמחור: 'בדוכנים אחרים «זיגזג» עולה בדרך כלל ₪…'", shown && ht.includes("זיגזג") && /₪\d+/.test(ht), ht);
  const few = await me.evaluate(async () => (await (await fetch("/api/price-hint?name=" + encodeURIComponent("מוצרשאיןכמוהו"))).json()).hint);
  check("ובלי מספיק דוכנים: בלי טווח", few === null);
  await db.query("update products set deleted_at=now() where id = any($1)", [made]);
  for (const o of others) await db.query("update stores set activated_at=$2, status=$3 where id=$1", [o.id, o.activated_at, o.status]);

  /* ── 5. דוכן גדול ── */
  const { rows: [{ n }] } = await db.query("select count(*)::int n from products where store_id=$1 and deleted_at is null and coalesce(image_key,'')<>''", [store.id]);
  await buyer.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  const lazy = await buyer.evaluate(() => [...document.querySelectorAll(".grid img")].map((i) => i.loading));
  check("תמונות המוצרים: הראשונות מיד, השאר lazy", lazy.length === 0 || (lazy.slice(0, Math.min(6, lazy.length)).every((l) => l === "eager") && lazy.slice(6).every((l) => l === "lazy")), `${n} מוצרים עם תמונה · ${lazy.join(",").slice(0, 80)}`);

  /* ── 7. "לקבל התראה על כל הזמנה" (alerts-nudge.tsx) ── */
  {
    await db.query("update store_push_subscriptions set disabled_at=now() where store_id=$1 and disabled_at is null", [store.id]);
    await db.query("insert into orders (store_id, order_number, items, total, status, buyer_name) values ($1, 99990, '[{\"name\":\"x\",\"qty\":1,\"price\":5}]', 5, 'paid', 'בדיקת התראות') on conflict do nothing", [store.id]);
    await me.evaluate((id) => localStorage.removeItem("duchan-alerts-later-" + id), store.id);
    await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const nudge = me.locator("[data-testid=alerts-nudge]");
    const shown = await nudge.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check("בלי מכשיר עם התראות ויש הזמנות: 'לקבל התראה על כל הזמנה'", shown);
    if (shown) {
      await me.click("[data-testid=alerts-nudge-later]");
      await me.reload({ waitUntil: "networkidle" });
      await me.waitForTimeout(1200);
      check("'לא עכשיו' מסתיר", (await nudge.count()) === 0);
    }
    const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await admin.goto(`${BASE}/login`);
    await verifyPhone(admin, "0509990000");
    await admin.waitForURL(/admin|dashboard|onboarding/, { timeout: 20000 });
    await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const ov = await admin.evaluate(async () => (await (await fetch("/api/admin/overview")).json()).stores ?? []);
    const mine = ov.find((x) => x.id === store.id);
    check("בחמ\"ל: לכל דוכן מסומן אם יש התראות", mine && mine.push === false, JSON.stringify({ push: mine?.push }));
    await db.query("delete from orders where store_id=$1 and order_number=99990", [store.id]);
  }
} finally {
  await browser.close();
  await closeHelper();
  await db.query("update stores set away=null, away_until=null where id=$1", [store.id]);
}

await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
