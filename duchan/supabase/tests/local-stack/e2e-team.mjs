// E2E: דוכן משותף (מיגרציה 0057) — הזמנה, הצטרפות, הרשאות, העברת ראשות,
// הוצאה ויציאה. כולל ניסיונות עקיפה ישירות מול ה-REST של הדאטהבייס עם
// הטוקן של השותף/ה — מה שנחסם צריך להיחסם גם בלי המסך.
import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const SHOTS = process.env.SHOTS ?? "/tmp";
const env = Object.fromEntries(
  readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const OWNER = "0501234567", P1 = "0521110010", P2 = "0521110011", STRANGER = "0521110012", P3 = "0521110013";
const e164 = (l) => "972" + l.slice(1);

const { rows: [store] } = await db.query("select * from stores where contact_phone='972501234567' or owner_id=(select user_id from phone_accounts where phone='972501234567') order by created_at limit 1");
const ownerId = (await db.query("select user_id from phone_accounts where phone='972501234567'")).rows[0]?.user_id;
if (!store || !ownerId) {
  console.error("צריך את דוכן הבדיקה של 0501234567 (seed.mjs)");
  process.exit(1);
}
// מצב התחלתי נקי
async function reset() {
  await db.query("delete from store_members where store_id=$1", [store.id]);
  await db.query("delete from store_invites where store_id=$1", [store.id]);
  await db.query("update stores set owner_id=$2, contact_phone='972501234567', transfer_to=null, transfer_requested_at=null, status='active' where id=$1", [store.id, ownerId]);
}
await reset();
const extraStores = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function session(phone, { login = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("duchan-cookies-ok", "1");
      localStorage.setItem("duchan-whatsnew-2026-09-looks", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  if (login) {
    await page.goto(`${BASE}/login`);
    await verifyPhone(page, phone);
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  }
  return { ctx, page };
}
/** הטוקן מתוך עוגיית הסשן — כדי לדבר ישירות עם ה-REST, בלי המסך */
async function tokenOf(ctx) {
  const parts = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
  const raw = decodeURIComponent(parts).replace(/^base64-/, "");
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  return json.access_token;
}
const rest = (token, path, init = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
const api = (page, body) =>
  page.evaluate(async (b) => {
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, body);
async function openTeam(page) {
  await page.goto(`${BASE}/dashboard/settings#team`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=team-section]", { timeout: 15000 });
}

/* ── 1. ראש הדוכן מזמין ── */
const owner = await session(OWNER);
await openTeam(owner.page);
check("צוות הדוכן: ראש הדוכן לבד, עם 👑 וטלפון ההזמנות", (await owner.page.locator("[data-testid=team-person-owner]").count()) === 1 &&
  (await owner.page.locator("[data-testid=orders-phone-badge]").count()) === 1);
await owner.page.fill("input[aria-label='הטלפון של השותף/ה']", OWNER);
await owner.page.click("[data-testid=team-invite]");
await owner.page.waitForTimeout(600);
check("להזמין את המספר של עצמי — נחסם", ((await owner.page.textContent("body")) ?? "").includes("זה המספר שלך"));
await owner.page.fill("input[aria-label='הטלפון של השותף/ה']", "052-111-0010");
await owner.page.click("[data-testid=team-invite]");
await owner.page.waitForSelector("[data-testid=team-invite-row]");
const { rows: [inv1] } = await db.query("select * from store_invites where store_id=$1 and phone=$2", [store.id, e164(P1)]);
check("הזמנה נוצרה למספר המנורמל, ל-7 ימים", !!inv1 && Math.round((new Date(inv1.expires_at) - Date.now()) / 86400_000) === 7);
check("ויש 'לשלוח בוואטסאפ' ו'העתקת הלינק'", (await owner.page.locator("[data-testid=invite-whatsapp]").count()) === 1 && (await owner.page.locator("[data-testid=invite-copy]").count()) === 1);
await owner.page.click("[data-testid=invite-copy]");
await owner.page.waitForTimeout(300);
const joinUrl = await owner.page.evaluate(() => navigator.clipboard.readText());
check("הלינק להצטרפות הוא /join/<טוקן>", joinUrl.endsWith(`/join/${inv1.token}`), joinUrl);
await owner.page.screenshot({ path: `${SHOTS}/team-owner.png`, fullPage: true });
const again = await api(owner.page, { action: "invite", storeId: store.id, phone: P1 });
check("הזמנה שנייה לאותו מספר — אותה הזמנה, מחודשת", again.status === 200 && again.body.token === inv1.token && again.body.renewed === true);

/* ── 2. לינק שהגיע למספר אחר ── */
const stranger = await session(STRANGER);
await stranger.page.goto(joinUrl, { waitUntil: "networkidle" });
check("עמוד ההצטרפות: שם הדוכן", ((await stranger.page.textContent("[data-testid=join-store]")) ?? "").includes(store.display_name));
await stranger.page.check("[data-testid=join-consent]");
await stranger.page.click("[data-testid=join-submit]");
await stranger.page.waitForSelector("[data-testid=join-error]");
check("מספר אחר עם הלינק — לא נכנס, ואומרים לאיזה מספר", ((await stranger.page.textContent("[data-testid=join-error]")) ?? "").includes("נשלחה למספר") &&
  (await stranger.page.locator("[data-testid=join-switch]").count()) === 1);
check("ובדאטהבייס — לא נוסף", (await db.query("select count(*)::int n from store_members where store_id=$1", [store.id])).rows[0].n === 0);

/* ── 3. השותף/ה: מהלינק, בלי חשבון → כניסה → הצטרפות ── */
const p1 = await session(P1, { login: false });
await p1.page.goto(joinUrl, { waitUntil: "networkidle" });
await p1.page.waitForSelector("[data-testid=join-login]");
check("לא מחובר/ת: 'כניסה עם הטלפון' ולאיזה מספר", ((await p1.page.textContent("[data-testid=join-page]")) ?? "").includes("052-•••-0010"));
await p1.page.click("[data-testid=join-login]");
await verifyPhone(p1.page, P1);
await p1.page.waitForURL(`**/join/${inv1.token}`, { timeout: 20000 });
check("אחרי הכניסה חוזרים לבד לעמוד ההצטרפות", true);
await p1.page.waitForSelector("[data-testid=join-submit]");
await p1.page.click("[data-testid=join-submit]");
check("בלי לסמן שההורים יודעים — לא מצטרפים", ((await p1.page.textContent("[data-testid=join-error]").catch(() => "")) ?? "").includes("ההורים"));
await p1.page.check("[data-testid=join-consent]");
await p1.page.click("[data-testid=join-submit]");
await p1.page.waitForURL("**/dashboard", { timeout: 20000 });
const p1Id = (await db.query("select user_id from phone_accounts where phone=$1", [e164(P1)])).rows[0].user_id;
const { rows: [m1] } = await db.query("select * from store_members where store_id=$1 and user_id=$2", [store.id, p1Id]);
check("הצטרפות: שותף/ה בצוות, עם אישור הורים", !!m1 && !!m1.parent_consent_at && m1.phone === e164(P1));
check("וההזמנה סומנה כמנוצלת", !!(await db.query("select accepted_at from store_invites where id=$1", [inv1.id])).rows[0].accepted_at);

/* ── 4. השותף/ה עובד/ת בדוכן ── */
await p1.page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
const { rows: [{ n: prodCount }] } = await db.query("select count(*)::int n from products where store_id=$1 and deleted_at is null", [store.id]);
check("השותף/ה רואה את המוצרים של הדוכן", (await p1.page.locator("[data-testid=product-row]").count()) === prodCount, String(prodCount));
const { rows: [prodX] } = await db.query("select id, name from products where store_id=$1 and deleted_at is null and options is null and (not track_stock or stock > 2) order by sort_order limit 1", [store.id]);
await p1.page.locator(`[data-testid=product-row]:has-text('${prodX.name}')`).first().click();
await p1.page.waitForSelector("[data-testid=editor-close]");
await p1.page.fill("input[aria-label='שם המוצר']", `${prodX.name} ✓`);
await p1.page.click("button:has-text('שמירה')");
await p1.page.waitForSelector("[data-testid=editor-close]", { state: "detached", timeout: 15000 });
const renamed = (await db.query("select name from products where id=$1", [prodX.id])).rows[0].name;
check("השותף/ה עורך/ת מוצר ושומר/ת", renamed === `${prodX.name} ✓`, renamed);
await db.query("update products set name=$2 where id=$1", [prodX.id, prodX.name]);

// הזמנה חדשה → השותף/ה מסמן/ת "שולם"
const ordRes = await fetch(`${BASE}/api/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug: store.slug, items: [{ productId: prodX.id, qty: 1 }], buyerName: "קונה", buyerPhone: "0527776655", wantsShipping: false }),
});
const ord = await ordRes.json();
check("הזמנה בדוכן המשותף עוברת", ordRes.status === 200, JSON.stringify(ord).slice(0, 80));
await p1.page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await p1.page.locator(`div:has-text('#${ord.orderNumber}') >> button:has-text('שולם')`).first().click();
await p1.page.waitForTimeout(1200);
check("השותף/ה מסמן/ת 'שולם'", (await db.query("select status from orders where store_id=$1 and order_number=$2", [store.id, ord.orderNumber])).rows[0].status === "paid");

// מה נעול לשותף/ה
await p1.page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
const hubPay = (await p1.page.textContent("[data-testid=hub-payment]")) ?? "";
check("ב'הדוכן שלי': 'איך משלמים לי' נעול עם הסבר", hubPay.includes("רק ראש הדוכן"), hubPay);
await p1.page.goto(`${BASE}/dashboard/settings#payment`);
await p1.page.reload({ waitUntil: "networkidle" });
check("וגם בכניסה ישירה — 'רק ראש הדוכן משנה את זה'", (await p1.page.locator("[data-testid=owner-only]").count()) === 1);
await p1.page.goto(`${BASE}/dashboard/settings#design`);
await p1.page.reload({ waitUntil: "networkidle" });
await p1.page.waitForSelector("input[aria-label='שם הדוכן']");
await p1.page.fill("input[aria-label='שם הדוכן']", "דוכן משותף ✓");
await p1.page.click("button[aria-label='חזרה לדוכן שלי']");
await p1.page.waitForTimeout(1500);
const s1 = (await db.query("select display_name, contact_phone from stores where id=$1", [store.id])).rows[0];
check("השותף/ה משנה עיצוב ושם — נשמר (בלי לגעת בטלפון ההזמנות)", s1.display_name === "דוכן משותף ✓" && s1.contact_phone === "972501234567", JSON.stringify(s1));
await db.query("update stores set display_name=$2 where id=$1", [store.id, store.display_name]);
await p1.page.goto(`${BASE}/activate`, { waitUntil: "networkidle" });
check("/activate לשותף/ה: 'את הפרסום עושה ראש הדוכן' (אם לא פורסם) או הדוכן באוויר",
  (await p1.page.locator("[data-testid=activate-partner], [data-testid=store-live]").count()) === 1);

/* ── 5. עקיפה ישירה מול הדאטהבייס, עם הטוקן של השותף/ה ── */
const t1 = await tokenOf(p1.ctx);
const tamper = async (patch) => (await rest(t1, `stores?id=eq.${store.id}`, { method: "PATCH", body: JSON.stringify(patch) })).status;
const after = async () => (await db.query("select owner_id, contact_phone, payout_bit_link, status, slug from stores where id=$1", [store.id])).rows[0];
let st = await tamper({ contact_phone: e164(P1) });
check("REST: שותף/ה משנה טלפון הזמנות — נדחה", st >= 400 && (await after()).contact_phone === "972501234567", String(st));
st = await tamper({ owner_id: p1Id });
check("REST: שותף/ה משתלט/ת על הבעלות — נדחה", st >= 400 && (await after()).owner_id === ownerId, String(st));
st = await tamper({ payout_bit_link: "https://www.bitpay.co.il/app/me/AAAA" });
check("REST: שותף/ה משנה לינק תשלום — נדחה", st >= 400, String(st));
st = await tamper({ status: "blocked" });
check("REST: לחסום את הדוכן — נדחה", st >= 400 && (await after()).status === "active", String(st));
st = await tamper({ slug: "zzzzz" });
check("REST: לשנות slug — נדחה", st >= 400 && (await after()).slug === store.slug, String(st));
st = await tamper({ tagline: "שותפים 🤝" });
check("REST: שותף/ה משנה תיאור — מותר", st < 300, String(st));
await db.query("update stores set tagline=$2 where id=$1", [store.id, store.tagline]);
st = (await rest(t1, "store_members", { method: "POST", body: JSON.stringify({ store_id: store.id, user_id: p1Id, phone: "972500000000" }) })).status;
check("REST: לכתוב לטבלת הצוות — נדחה", st >= 400, String(st));
const invRead = await rest(t1, `store_invites?store_id=eq.${store.id}`);
check("REST: לקרוא את ההזמנות (והטוקנים) — נדחה", invRead.status >= 400 || (await invRead.json()).length === 0, String(invRead.status));
const tS = await tokenOf(stranger.ctx);
const strangerProducts = await (await rest(tS, `products?store_id=eq.${store.id}&select=id`)).json();
const strangerStore = await (await rest(tS, `stores?id=eq.${store.id}&select=id`)).json();
check("REST: זר/ה לא רואה את המוצרים או את הדוכן", Array.isArray(strangerProducts) && strangerProducts.length === 0 && strangerStore.length === 0);
const tO = await tokenOf(owner.ctx);
st = (await rest(tO, `stores?id=eq.${store.id}`, { method: "PATCH", body: JSON.stringify({ owner_id: p1Id }) })).status;
check("REST: גם ראש הדוכן לא מעביר בעלות מהדפדפן (רק דרך השרת)", st >= 400 && (await after()).owner_id === ownerId, String(st));

/* ── 6. שותף/ה לא מבצע/ת פעולות של ראש הדוכן ── */
const pInvite = await api(p1.page, { action: "invite", storeId: store.id, phone: P3 });
check("API: שותף/ה מזמין/ה — 403", pInvite.status === 403);
const pRemove = await api(p1.page, { action: "remove", storeId: store.id, userId: ownerId });
check("API: שותף/ה מוציא/ה את ראש הדוכן — 403", pRemove.status === 403);
const sGet = await stranger.page.evaluate(async (id) => (await fetch(`/api/team?storeId=${id}`)).status, store.id);
check("API: זר/ה לא רואה את הצוות — 403", sGet === 403);

/* ── 7. צוות מלא ── */
// "רק 2 גג": ראש הדוכן ושותף/ה אחד/ת
const i3 = await api(owner.page, { action: "invite", storeId: store.id, phone: P2 });
check("שותף/ה שני/ה — 'עד 2: ראש הדוכן ושותף/ה אחד/ת'", i3.status === 409 && i3.body.error.includes("עד 2"), i3.body.error);
const capDb = await db.query("insert into store_members (store_id, user_id, phone) select $1, user_id, phone from phone_accounts where phone=$2 returning 1", [store.id, "972501234567"]).then(() => "inserted", (e) => e.message);
check("וגם הדאטהבייס עצמו לא מכניס שותף/ה שני/ה", capDb.includes("team_full"), capDb);
await openTeam(owner.page);
check("במסך: 'הצוות מלא'", (await owner.page.locator("[data-testid=team-full]").count()) === 1);

/* ── 9. לאן מגיעות ההזמנות ── */
const op = await api(owner.page, { action: "orders_phone", storeId: store.id, userId: p1Id });
check("ראש הדוכן: ההזמנות יגיעו לטלפון של השותף/ה", op.status === 200 && (await after()).contact_phone === e164(P1));
const ord2 = await (await fetch(`${BASE}/api/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug: store.slug, items: [{ productId: prodX.id, qty: 1 }], buyerName: "קונה", buyerPhone: "0527776655", wantsShipping: false }),
})).json();
check("ובהזמנה הבאה הקונה מקבל/ת את הטלפון של השותף/ה", ord2.phone === e164(P1));
const opBad = await api(owner.page, { action: "orders_phone", storeId: store.id, userId: "00000000-0000-0000-0000-000000000000" });
check("טלפון של מישהו/י מחוץ לצוות — נדחה", opBad.status === 400);

/* ── 10. העברת ראשות ── */
await openTeam(owner.page);
await owner.page.click("[data-testid=transfer-start]");
await owner.page.waitForSelector("[data-testid=transfer-pending]");
check("בקשת ראשות: מחכה לאישור, ובינתיים שום דבר לא משתנה", (await after()).owner_id === ownerId);
await openTeam(p1.page);
await p1.page.waitForSelector("[data-testid=transfer-ask]");
await p1.page.screenshot({ path: `${SHOTS}/team-transfer-ask.png`, fullPage: true });
// מכסה: לשותף/ה כבר 3 דוכנים משלו/ה → לא יכול/ה לקבל ראשות
for (let k = 0; k < 3; k++) {
  const { rows: [ns] } = await db.query(
    `insert into stores (owner_id, slug, display_name, contact_phone, parent_name, parent_phone, parent_email)
     values ($1, $2, 'דוכן נוסף', $3, 'הורה', $3, $4) returning id`,
    [p1Id, `t${Date.now().toString(36).slice(-3)}${k}x`.slice(0, 5), e164(P1), `p1-${k}-${Date.now()}@x.test`]);
  extraStores.push(ns.id);
}
const full = await api(p1.page, { action: "accept_transfer", storeId: store.id });
check("מי שכבר ראש של 3 דוכנים — לא מקבל/ת עוד ראשות", full.status === 409 && full.body.error.includes("3"), full.body.error);
await db.query("delete from stores where id = any($1)", [extraStores.slice(1)]);
const keepExtra = extraStores[0];
await p1.page.click("[data-testid=transfer-accept]");
await p1.page.waitForTimeout(1500);
const t = await after();
check("השותף/ה אישר/ה — עכשיו ראש הדוכן", t.owner_id === p1Id);
check("וראש הדוכן הקודם/ת נשאר/ה בצוות כשותף/ה", (await db.query("select count(*)::int n from store_members where store_id=$1 and user_id=$2", [store.id, ownerId])).rows[0].n === 1);
await owner.page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
// לראש הקודם/ת אין דוכן משלו/ה מלבד זה — בלי בורר. אצל P1 (שני דוכנים) — עם בורר.
check("ראש הדוכן הקודם/ת: עכשיו 'איך משלמים' נעול גם אצלו/ה", ((await owner.page.textContent("[data-testid=hub-payment]").catch(() => "")) ?? "").includes("רק ראש הדוכן"));
// מחזירים: P1 מעביר/ה בחזרה, והראש המקורי/ת מאשר/ת
await api(p1.page, { action: "transfer", storeId: store.id, userId: ownerId });
const back = await api(owner.page, { action: "accept_transfer", storeId: store.id });
check("והעברה בחזרה עובדת", back.status === 200 && (await after()).owner_id === ownerId);

/* ── 11. בחירת דוכן (דוכן משלי + שותפות) ── */
await p1.page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
await p1.page.waitForSelector("[data-testid=store-switcher]");
const opts = await p1.page.locator("#store-pick option").allTextContents();
check("שני דוכנים → בורר בראש הדשבורד, עם 👑 שלי / 🤝 שותפות", opts.length === 2 && opts.some((o) => o.includes("שלי")) && opts.some((o) => o.includes("שותפות")), opts.join(" | "));
await p1.page.selectOption("#store-pick", keepExtra);
await p1.page.waitForLoadState("networkidle");
await p1.page.waitForTimeout(800);
check("בחירה בדוכן השני — המוצרים מתחלפים (דוכן ריק)", (await p1.page.locator("[data-testid=product-row]").count()) === 0);
await p1.page.selectOption("#store-pick", store.id);
await p1.page.waitForLoadState("networkidle");
await p1.page.waitForTimeout(800);
check("וחזרה לדוכן המשותף", (await p1.page.locator("[data-testid=product-row]").count()) === prodCount);
await db.query("delete from stores where id=$1", [keepExtra]);

/* ── 12. הוצאה מהצוות ── */
await api(owner.page, { action: "remove", storeId: store.id, userId: p1Id });
const r1 = await after();
check("ראש הדוכן מוציא/ה — השותף/ה כבר לא בצוות", (await db.query("select count(*)::int n from store_members where store_id=$1 and user_id=$2", [store.id, p1Id])).rows[0].n === 0);
check("וההזמנות שהגיעו לטלפון שלו/ה חוזרות לראש הדוכן", r1.contact_phone === "972501234567", r1.contact_phone);
const tGone = await (await rest(t1, `products?store_id=eq.${store.id}&select=id`)).json();
check("והגישה נסגרת מיד (גם ב-REST)", Array.isArray(tGone) && tGone.length === 0);

/* ── 12ב. כניסה עם הזמנה פתוחה → ישר לעמוד ההצטרפות ── */
// אחרי שהשותף/ה יצא/ה יש מקום — ראש הדוכן מזמין/ה את P2
const i2 = await api(owner.page, { action: "invite", storeId: store.id, phone: P2 });
check("אחרי שהצוות התפנה — אפשר להזמין שוב", i2.status === 200);
await openTeam(owner.page);
const p2 = await session(P2, { login: false });
await p2.page.goto(`${BASE}/login`);
await verifyPhone(p2.page, P2);
await p2.page.waitForURL("**/join/**", { timeout: 20000 });
check("מי שמחכה לו/ה הזמנה ונכנס/ת — מגיע/ה לעמוד ההצטרפות, לא לפתיחת דוכן", p2.page.url().includes("/join/"));
// ההזמנה בוטלה בינתיים
await owner.page.locator("[data-testid=invite-cancel]").first().click();
await owner.page.waitForTimeout(800);
await p2.page.reload({ waitUntil: "networkidle" });
check("ראש הדוכן ביטל/ה — 'ההזמנה בוטלה'", ((await p2.page.textContent("[data-testid=join-closed]").catch(() => "")) ?? "").includes("בוטלה"));
const i2b = await api(owner.page, { action: "invite", storeId: store.id, phone: P2 });
await db.query("update store_invites set expires_at=now() - interval '1 minute' where token=$1", [i2b.body.token]);
await p2.page.goto(`${BASE}/join/${i2b.body.token}`, { waitUntil: "networkidle" });
check("הזמנה שפג תוקפה — 'פג התוקף'", ((await p2.page.textContent("[data-testid=join-closed]").catch(() => "")) ?? "").includes("פג התוקף"));
const i2c = await api(owner.page, { action: "invite", storeId: store.id, phone: P2 });
check("והזמנה חדשה לאותו מספר אחרי שפגה — עובדת", i2c.status === 200 && i2c.body.token !== i2b.body.token);
await api(owner.page, { action: "cancel_invite", storeId: store.id, inviteId: (await db.query("select id from store_invites where token=$1", [i2c.body.token])).rows[0].id });

/* ── 13. יציאה ── */
const i4 = await api(owner.page, { action: "invite", storeId: store.id, phone: P1 });
await p1.page.goto(`${BASE}/join/${i4.body.token}`, { waitUntil: "networkidle" });
await p1.page.check("[data-testid=join-consent]");
await p1.page.click("[data-testid=join-submit]");
await p1.page.waitForURL("**/dashboard", { timeout: 20000 });
await openTeam(p1.page);
await p1.page.click("[data-testid=team-leave]");
await p1.page.waitForTimeout(1500);
check("שותף/ה יוצא/ת מהדוכן בעצמו/ה", (await db.query("select count(*)::int n from store_members where store_id=$1", [store.id])).rows[0].n === 0);
const ownerLeave = await api(owner.page, { action: "leave", storeId: store.id });
check("ראש הדוכן לא יכול/ה לצאת בלי להעביר ראשות", ownerLeave.status === 400);

/* ── 14. החמ"ל ── */
const i5 = await api(owner.page, { action: "invite", storeId: store.id, phone: P1 });
await p1.page.goto(`${BASE}/join/${i5.body.token}`, { waitUntil: "networkidle" });
await p1.page.check("[data-testid=join-consent]");
await p1.page.click("[data-testid=join-submit]");
await p1.page.waitForURL("**/dashboard", { timeout: 20000 });
const admin = await session("0509990000");
const adm = await admin.page.evaluate(async (id) => (await (await fetch(`/api/admin/store?id=${id}`)).json()).team, store.id);
check("חמ\"ל: תיק הדוכן מראה את הצוות", Array.isArray(adm) && adm.length === 1 && adm[0].phone === e164(P1));
const mh = await admin.page.evaluate(async ({ id, u }) => (await fetch("/api/admin/store", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make_head", storeId: id, userId: u }),
})).status, { id: store.id, u: p1Id });
check("חמ\"ל: מחליף ראש דוכן", mh === 200 && (await after()).owner_id === p1Id);
await admin.page.evaluate(async ({ id, u }) => fetch("/api/admin/store", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make_head", storeId: id, userId: u }),
}), { id: store.id, u: ownerId });
check("ובחזרה", (await after()).owner_id === ownerId);
const alert = await db.query("select count(*)::int n from admin_alerts where kind='partner_joined' and ref like $1", [`${store.id}:%`]);
check("ופוש למנהלת כששותף/ה מצטרף/ת", alert.rows[0].n >= 1);

/* ── ניקוי ── */
await reset();
await db.query("update stores set display_name=$2, tagline=$3 where id=$1", [store.id, store.display_name, store.tagline]);
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} shared stall checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
