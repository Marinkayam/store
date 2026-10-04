// E2E: התראה לטלפון של הדוכן כשמגיעה הזמנה (0061).
//
// מרינה: "אגב אפשר לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה".
//
// שרת פוש אמיתי לא זמין מכאן, אז — כמו בבדיקת הפוש של החמ"ל — מרימים שרת
// דמה מקומי ורושמים אותו כ"מכשיר". web-push מצפין ושולח אליו בדיוק כמו
// לשרת אמיתי.
//
// החוזים:
//   1. ראש הדוכן רושם מכשיר; כתובת שאינה https נדחית; בלי כניסה — 401;
//      דוכן של מישהו אחר — 403.
//   2. הזמנה חדשה → פוש למכשיר, מוצפן, בדחיפות גבוהה.
//   3. התראת בדיקה — רק למכשיר הזה.
//   4. מכשיר שהדפדפן ביטל (410) מסומן כבוי ולא מקבל יותר.
//   5. כיבוי → הזמנה לא שולחת פוש.
//   6. מסך "החנות שלי ← אפליקציה והתראות" מציג את שני הצעדים.
import { chromium } from "playwright";
import pg from "pg";
import http from "http";
import crypto from "crypto";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const got = [];
const server = http.createServer((req, res) => {
  let size = 0;
  req.on("data", (c) => (size += c.length));
  req.on("end", () => {
    got.push({ path: req.url, size, urgency: req.headers.urgency, enc: req.headers["content-encoding"], auth: !!req.headers.authorization });
    res.statusCode = req.url.startsWith("/gone") ? 410 : 201;
    res.end();
  });
});
await new Promise((r) => server.listen(9202, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (pred()) return true; await sleep(150); }
  return false;
};
const fakeKeys = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
};

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!store?.activated_at) {
  console.error("צריך דוכן פעיל (seed.mjs ואז e2e-activation.mjs)");
  process.exit(1);
}
await db.query("update stores set status='active' where id=$1", [store.id]);
await db.query("delete from store_push_subscriptions where store_id=$1", [store.id]);
const { rows: [prod] } = await db.query(
  `select id from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and options is null and drop_at is null order by sort_order, created_at limit 1`, [store.id]);
await db.query("update products set track_stock=true, stock=greatest(stock,20) where id=$1", [prod.id]);

const order = () =>
  fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items: [{ productId: prod.id, qty: 2 }], buyerName: "בודקת", buyerPhone: "0521234567", wantsShipping: false }),
  });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

try {
  /* ── בלי כניסה ── */
  const anon = await fetch(`${BASE}/api/push?storeId=${store.id}`);
  check("בלי כניסה — 401", anon.status === 401, String(anon.status));

  await p.goto(`${BASE}/login`);
  await verifyPhone(p, "0501234567");
  await p.waitForURL("**/dashboard", { timeout: 20000 });

  /* ── הרשמה ── */
  const g = await (await p.request.get(`${BASE}/api/push?storeId=${store.id}`)).json();
  check("יש מפתח ציבורי", typeof g.publicKey === "string" && g.publicKey.length > 80 && g.available === true);
  const { rows: [other] } = await db.query("select id from stores where id<>$1 and owner_id<>$2 limit 1", [store.id, store.owner_id]);
  if (other) {
    const forb = await p.request.get(`${BASE}/api/push?storeId=${other.id}`);
    check("דוכן של מישהו אחר — 403", forb.status() === 403, String(forb.status()));
  }
  const ok = { endpoint: "http://localhost:9202/ok", keys: fakeKeys() };
  const r1 = await p.request.post(`${BASE}/api/push`, { data: { storeId: store.id, subscription: ok, device: "אייפון" } });
  check("רישום מכשיר", r1.ok(), String(r1.status()));
  const bad = await p.request.post(`${BASE}/api/push`, { data: { storeId: store.id, subscription: { endpoint: "http://evil.example/x", keys: fakeKeys() } } });
  check("כתובת שאינה https נדחית", bad.status() === 400, String(bad.status()));
  const g2 = await (await p.request.get(`${BASE}/api/push?storeId=${store.id}`)).json();
  check("המכשיר מופיע כרשום", g2.endpoints?.includes(ok.endpoint));

  /* ── הזמנה → פוש ── */
  got.length = 0;
  const o = await order();
  const oj = await o.json();
  check("ההזמנה עברה", o.ok && typeof oj.orderNumber === "number", JSON.stringify(oj).slice(0, 120));
  check("ההתראה הגיעה למכשיר", await waitFor(() => got.some((x) => x.path === "/ok")));
  const hit = got.find((x) => x.path === "/ok");
  check("מוצפנת וחתומה, בדחיפות גבוהה", hit?.enc === "aes128gcm" && hit?.auth && hit?.urgency === "high", JSON.stringify(hit));
  const { rows: [row] } = await db.query("select last_ok_at from store_push_subscriptions where store_id=$1 and endpoint=$2", [store.id, ok.endpoint]);
  check("נרשם שהמכשיר קיבל", !!row?.last_ok_at);

  /* ── התראת בדיקה — רק למכשיר הזה ── */
  const gone = { endpoint: "http://localhost:9202/gone", keys: fakeKeys() };
  await p.request.post(`${BASE}/api/push`, { data: { storeId: store.id, subscription: gone, device: "אנדרואיד" } });
  got.length = 0;
  const t = await (await p.request.post(`${BASE}/api/push`, { data: { storeId: store.id, test: true, endpoint: ok.endpoint } })).json();
  await waitFor(() => got.length >= 1);
  await sleep(500);
  check("בדיקה: יצאה למכשיר אחד בלבד", t.sent === 1 && got.length === 1 && got[0].path === "/ok", JSON.stringify({ t, got: got.map((x) => x.path) }));

  /* ── מכשיר שבוטל (410) ── */
  got.length = 0;
  await order();
  await waitFor(() => got.some((x) => x.path === "/gone"));
  await sleep(800);
  const { rows: [g410] } = await db.query("select disabled_at from store_push_subscriptions where store_id=$1 and endpoint=$2", [store.id, gone.endpoint]);
  check("מכשיר שעונה 410 מסומן כבוי", !!g410?.disabled_at);

  /* ── כיבוי ── */
  const off = await p.request.delete(`${BASE}/api/push`, { data: { storeId: store.id, endpoint: ok.endpoint } });
  check("כיבוי", off.ok());
  got.length = 0;
  await order();
  await sleep(2500);
  check("אחרי כיבוי — הזמנה לא שולחת פוש", got.length === 0, got.map((x) => x.path).join(","));

  /* ── המסך בהגדרות ── */
  await p.goto(`${BASE}/dashboard/settings`);
  await p.waitForSelector("[data-testid=settings-hub]", { timeout: 20000 });
  await p.click("[data-testid=hub-app]");
  await p.waitForSelector("[data-testid=order-alerts]", { timeout: 15000 });
  const txt = (await p.textContent("[data-testid=order-alerts]")) ?? "";
  check("'אפליקציה והתראות': שני הצעדים", txt.includes("לשמור את הדוכן במסך הבית") && txt.includes("להפעיל התראות"));
  check("עם כפתור הפעלה", await p.locator("[data-testid=alerts-enable]").isVisible());
  if (process.env.SHOTS) await p.locator("[data-testid=order-alerts]").screenshot({ path: `${process.env.SHOTS}/order-alerts.png` });
  check("בלי שגיאות בדפדפן", errs.length === 0, errs.join(" | "));
} finally {
  await db.query("delete from store_push_subscriptions where store_id=$1", [store.id]);
  await browser.close();
  await db.end();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
