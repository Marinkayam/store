// E2E: שמירה מוגבלת בזמן של פרטי קונים (מיגרציה 0071).
//
// העיקרון שנבדק: ההזמנה נשארת (מה נמכר, כמה, הסכום), המידע האישי של
// הקונה נמחק אחרי זמן קצוב. ושום דבר לא נמחק בלי שמדליקים את זה במפורש.
//
//   1. הרצה "על יבש" סופרת נכון ולא משנה דבר.
//   2. הרצה אמיתית מוחקת בדיוק את מה שצריך: כתובת אחרי 30 יום, פרטי קונה
//      אחרי 90, הזמנה פתוחה אחרי 180. חריג (מחלוקת) לא נוגעים בו.
//   3. closed_at נקבע כשההזמנה נסגרת ומתאפס כשהיא נפתחת.
//   4. הדפדפן לא יכול לסמן חריג, לבטל מחיקה או להקליד מחדש פרטים שנמחקו.
//   5. הפונקציה והמתג של השרת בלבד, והקרון היומי מריץ על יבש כברירת מחדל.
//
// המחיקה האמיתית רצה כאן בתוך טרנזקציה שמתבטלת, כדי לא לגעת בהזמנות
// שחבילות אחרות נשענות עליהן.
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
  "select id, slug, owner_id from stores where contact_phone='972501234567' order by created_at limit 1");
const NUM0 = 990000;
const clean = () => db.query("delete from orders where store_id=$1 and order_number >= $2", [store.id, NUM0]);
await clean();
await db.query("delete from app_settings where key in ('order_retention_enforce','order_retention_last')");

const dry = async (c = db) => (await c.query("select purge_buyer_data() as r")).rows[0].r;
const before = await dry();

/** הזמנה לבדיקה. ago = לפני כמה ימים; closed = לפני כמה ימים נסגרה (null = לא ידוע) */
let n = NUM0;
async function order(tag, { status, created, closed = null, deleted = null, address = false, hold = null }) {
  const days = (d) => (d == null ? null : new Date(Date.now() - d * 86400_000).toISOString());
  const { rows: [o] } = await db.query(
    `insert into orders (store_id, order_number, items, total, status, created_at, buyer_name, buyer_phone, buyer_note, owner_note,
                         ip_hash, ship_address, ship_city, ship_details, wants_shipping)
     values ($1, $2, $3, 24, $4, $5, $6, '972521234567', 'בלי בוטנים בבקשה', 'של יעל מהחוג', 'iphash',
             $7, $8, $9, $10) returning id`,
    [store.id, n++, JSON.stringify([{ name: "צמיד קשת", qty: 2, price: 12 }]), status, days(created), `קונה ${tag}`,
     address ? "הרצל 12, דירה 4" : null, address ? "יבנה" : null,
     address ? JSON.stringify({ street: "הרצל 12", homeType: "building", apartment: "4" }) : null, address]);
  // אחרי ההכנסה קובעים את השדות ישירות: הטריגר נוגע ב-closed_at רק כשהסטטוס משתנה
  await db.query(
    "update orders set closed_at=$2, deleted_at=$3, retention_hold_reason=$4, retention_hold_at=case when $4::text is null then null else now() end where id=$1",
    [o.id, days(closed), days(deleted), hold]);
  return o.id;
}

const A = await order("A", { status: "delivered", created: 110, closed: 100, address: true });   // פרטים + כתובת
const B = await order("B", { status: "delivered", created: 45, closed: 40, address: true });     // רק כתובת
const C = await order("C", { status: "delivered", created: 12, closed: 10, address: true });     // עוד לא
const D = await order("D", { status: "cancelled", created: 120, closed: null });                 // נסגרה לפני 0071
const E = await order("E", { status: "sent", created: 200 });                                    // פתוחה ונטושה
const F = await order("F", { status: "paid", created: 40 });                                     // פתוחה, רק התראה
const G = await order("G", { status: "delivered", created: 110, closed: 100, address: true, hold: "מחלוקת פתוחה" });
const H = await order("H", { status: "sent", created: 110, deleted: 100 });                      // הורדה מהרשימה
const get = async (id, c = db) => (await c.query("select * from orders where id=$1", [id])).rows[0];

try {
  /* ── 1. על יבש ── */
  const d = await dry();
  const delta = (path) => path.split(".").reduce((o, k) => o[k], d) - path.split(".").reduce((o, k) => o[k], before);
  check("על יבש: 4 הזמנות למחיקת פרטי קונה (סגורה, ישנה, נטושה, שהורדה)", delta("pii.orders") === 4, String(delta("pii.orders")));
  check("מתוכן אחת פתוחה ונטושה", delta("pii.of_which_stale_open") === 1);
  check("כתובת אחת למחיקה מוקדמת (30 יום)", delta("address.orders") === 1, String(delta("address.orders")));
  check("חריג אחד, והוא לא נספר למחיקה", delta("on_hold") === 1);
  check("שתי הזמנות פתוחות מעל 30 יום (להתראה)", delta("open_older_than_30_days") === 2, String(delta("open_older_than_30_days")));
  check("הדוח אומר שלא בוצע דבר", d.enforced === false && d.done === undefined);
  const a0 = await get(A);
  check("ושום דבר לא השתנה", a0.buyer_name === "קונה A" && a0.ship_address !== null && a0.pii_purged_at === null);

  /* ── 2. מחיקה אמיתית, בטרנזקציה שמתבטלת ── */
  const c = await db.connect();
  try {
    await c.query("begin");
    const { rows: [{ r: done }] } = await c.query("select purge_buyer_data(true) as r");
    check("הדוח של המחיקה תואם את הדוח על יבש",
      done.enforced === true && done.pii.orders === d.pii.orders && done.done.pii_rows === d.pii.orders, JSON.stringify(done.done));
    const a = await get(A, c);
    check("A (סגורה 100 יום): שם, טלפון, הערות, כתובת ומזהה רשת נמחקו",
      a.buyer_name === null && a.buyer_phone === null && a.buyer_note === null && a.owner_note === null &&
      a.ship_address === null && a.ship_details === null && a.ip_hash === null && a.pii_purged_at !== null);
    check("A: ההזמנה עצמה נשארה (פריטים, סכום, סטטוס, מספר)",
      a.items[0].name === "צמיד קשת" && Number(a.total) === 24 && a.status === "delivered" && a.order_number === NUM0);
    const b = await get(B, c);
    check("B (סגורה 40 יום): רק הכתובת נמחקה, השם והטלפון נשארו",
      b.ship_address === null && b.ship_details === null && b.address_purged_at !== null && b.buyer_name === "קונה B" && b.pii_purged_at === null);
    check("B: העיר של המשלוח נשארת (לא מזהה)", b.ship_city === "יבנה");
    const cc = await get(C, c);
    check("C (סגורה 10 ימים): לא נגעו בה", cc.buyer_name === "קונה C" && cc.ship_address !== null && cc.address_purged_at === null);
    check("D (בוטלה לפני 0071, נוצרה לפני 120 יום): נמחקה לפי יום היצירה", (await get(D, c)).pii_purged_at !== null);
    check("E (פתוחה 200 יום): נמחקה כנטושה", (await get(E, c)).buyer_name === null);
    check("F (פתוחה 40 יום): לא נגעו בה", (await get(F, c)).buyer_name === "קונה F");
    const g = await get(G, c);
    check("G (חריג): לא נגעו בה", g.buyer_name === "קונה G" && g.ship_address !== null && g.pii_purged_at === null);
    check("H (הורדה מהרשימה לפני 100 יום): נמחקה", (await get(H, c)).buyer_phone === null);
    const again = (await c.query("select purge_buyer_data(true) as r")).rows[0].r;
    check("הרצה שנייה לא מוצאת מה למחוק", again.done.pii_rows === 0 && again.done.address_rows === 0);
  } finally {
    await c.query("rollback");
    c.release();
  }
  check("אחרי ביטול הטרנזקציה הכול חזר", (await get(A)).buyer_name === "קונה A");

  /* ── 3. closed_at ── */
  const asOwner = async (sql, params = []) => {
    const k = await db.connect();
    try {
      await k.query("begin");
      await k.query(`select set_config('app.uid', $1, true)`, [store.owner_id]);
      await k.query("set local role authenticated");
      await k.query(sql, params);
      await k.query("commit");
      return true;
    } catch (e) {
      await k.query("rollback").catch(() => {});
      console.log("   asOwner:", e.message);
      return false;
    } finally {
      k.release();
    }
  };
  await asOwner("update orders set status='delivered' where id=$1", [F]);
  let f = await get(F);
  check("בעלת הדוכן מסמנת 'נמסרה' — closed_at נקבע לעכשיו", f.status === "delivered" && f.closed_at !== null && Date.now() - new Date(f.closed_at).getTime() < 60_000);
  await asOwner("update orders set status='paid' where id=$1", [F]);
  f = await get(F);
  check("פותחת מחדש — closed_at מתאפס", f.status === "paid" && f.closed_at === null);

  /* ── 4. מה שהדפדפן לא יכול ── */
  await asOwner("update orders set retention_hold_reason='רוצה לשמור', pii_purged_at=now(), closed_at=now() - interval '5 years' where id=$1", [C]);
  const c2 = await get(C);
  check("בעלת דוכן לא מסמנת חריג, לא מסמנת מחיקה ולא מזיזה את השעון",
    c2.retention_hold_reason === null && c2.pii_purged_at === null && Math.abs(Date.now() - 10 * 86400_000 - new Date(c2.closed_at).getTime()) < 3600_000);
  await db.query("update orders set buyer_name=null, buyer_phone=null, buyer_note=null, owner_note=null, ship_address=null, ship_details=null, pii_purged_at=now(), address_purged_at=now() where id=$1", [A]);
  await asOwner("update orders set buyer_name='יעל כהן', buyer_phone='972500000000', owner_note='הטלפון שלה 050' where id=$1", [A]);
  const a2 = await get(A);
  check("אחרי מחיקה אי אפשר להקליד מחדש את פרטי הקונה", a2.buyer_name === null && a2.buyer_phone === null && a2.owner_note === null);
  await asOwner("update orders set pii_purged_at=null where id=$1", [A]);
  check("ואי אפשר לבטל את סימון המחיקה", (await get(A)).pii_purged_at !== null);

  /* ── 5. של השרת בלבד ── */
  const { rows: [p] } = await db.query(
    `select has_function_privilege('anon', 'purge_buyer_data(boolean,integer,integer,integer)', 'execute') as anon,
            has_function_privilege('authenticated', 'purge_buyer_data(boolean,integer,integer,integer)', 'execute') as auth,
            has_table_privilege('authenticated', 'app_settings', 'select') as settings_read,
            has_table_privilege('authenticated', 'app_settings', 'insert') as settings_write`);
  check("דפדפן לא יכול להריץ את המחיקה ולא לגעת במתג", !p.anon && !p.auth && !p.settings_read && !p.settings_write, JSON.stringify(p));

  const cron = await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer test-cron-secret" } });
  const cj = await cron.json();
  check("הקרון היומי מריץ את הניקוי על יבש כברירת מחדל", cron.status === 200 && cj.retention?.enforced === false && cj.retention?.pii?.orders >= 3,
    JSON.stringify(cj.retention ?? {}).slice(0, 120));
  check("ולא מחק דבר", (await get(E)).buyer_name === "קונה E");
  const { rows: [last] } = await db.query("select value from app_settings where key='order_retention_last'");
  check("והדוח נשמר, כדי שאפשר יהיה לראות מה היה נמחק", !!last && JSON.parse(last.value).enforced === false);

  /* ── 6. מסך ההזמנות ── */
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("duchan-live-quiet", "1"); } catch {} });
  await page.goto(`${BASE}/login`);
  await verifyPhone(page, "0501234567");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  await page.waitForSelector(`text=#${NUM0}`, { timeout: 15000 });
  const card = page.locator("article, li, section, div").filter({ hasText: `#${NUM0}` }).filter({ has: page.locator("[data-testid=order-purged]") }).last();
  const text = (await card.textContent()) ?? "";
  check("הזמנה שפרטיה נמחקו: מוצג הסבר, נשארים הפריטים והסכום, ואין בקשה להוסיף שם",
    text.includes("פרטי הקונה נמחקו") && text.includes("צמיד קשת") && !text.includes("להוסיף את שם הקונה"), text.replace(/\s+/g, " ").slice(0, 110));
  await browser.close();
} finally {
  await clean();
  await db.query("delete from app_settings where key in ('order_retention_enforce','order_retention_last')");
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} retention checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
