// E2E: כניסה בלי סמס מהחמ"ל של דוכן.
//
// הבקשה: "אולי יש לו בקרת הורים או ספאם — תן לי לייצר לו קוד."
// הסמס לא מגיע, אז המנהלת מייצרת קישור חד-פעמי ושולחת בוואטסאפ.
//
// החוזים:
//   1. הכרטיס גלוי בראש החמ"ל, ובתיק חנות עם המספר כבר ממולא.
//   2. הקישור נוחת בדשבורד של הדוכן — לא בסקוויש — ולא מסמן פיילוט סקוויש.
//   3. GET (תצוגה מקדימה של וואטסאפ) לא שורף אותו; הלחיצה כן.
//   4. פעם אחת בלבד.
//   5. מי שאינה מנהלת לא יכולה לייצר קישור.
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
  "select id, slug, display_name, contact_phone, owner_id from stores where activated_at is not null and owner_id is not null order by created_at limit 1"
);
if (!store) {
  console.error("צריך דוכן פעיל. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
const local = "0" + store.contact_phone.slice(3);
const { rows: [{ n: pilotsBefore }] } = await db.query("select count(*)::int as n from squish_pilot_tokens");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

/* ── 1. המנהלת ── */
const admin = await phone();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("[data-testid=no-sms-login]", { timeout: 20000 });
check("הכרטיס גלוי בראש החמ\"ל", true);

await admin.fill("input[aria-label='מספר טלפון לכניסה בלי סמס']", local);
await admin.click("[data-testid=no-sms-mint]");
await admin.waitForSelector("[data-testid=no-sms-result]", { timeout: 10000 });
const url = ((await admin.textContent("[data-testid=no-sms-result] [dir=ltr]")) ?? "").trim();
check("נוצר קישור לדוכן", /\/enter\/[\w-]{16,}\?to=store$/.test(url), url.replace(/enter\/[\w-]+/, "enter/…"));
const { rows: [{ n: pilotsAfter }] } = await db.query("select count(*)::int as n from squish_pilot_tokens");
check("בלי טוקן פיילוט של סקוויש", pilotsAfter === pilotsBefore, `${pilotsBefore} → ${pilotsAfter}`);

// בתיק החנות — מקוצר, עם המספר ממולא
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(500);
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("[data-testid=no-sms-open]", { timeout: 15000 });
await admin.click("[data-testid=no-sms-open]");
const pre = await admin.locator("[data-testid=no-sms-login] input").last().inputValue();
check("בתיק חנות המספר כבר ממולא", pre.replace(/\D/g, "") === local, pre);

/* ── 2. תצוגה מקדימה של וואטסאפ לא שורפת ── */
const path = new URL(url).pathname + new URL(url).search;
const peek = await fetch(`${BASE}${path}`);
const peekHtml = await peek.text();
check("GET מציג כפתור ולא שורף", peek.status === 200 && peekHtml.includes("להיכנס"), `status=${peek.status}`);
check("ומסך הכניסה של דוכן, לא של סקוויש", peekHtml.includes("🛍️") && !peekHtml.includes("🧸"));
const token = new URL(url).pathname.split("/").pop();
const { rows: [l1] } = await db.query("select used_at from login_links where token=$1", [token]);
check("הקישור עדיין לא נוצל", l1.used_at === null);

/* ── 3. הלחיצה: נכנסים לדשבורד של הדוכן ── */
const girl = await phone();
await girl.goto(`${BASE}${path}`);
await girl.click("button:has-text('להיכנס')");
await girl.waitForURL("**/dashboard**", { timeout: 20000 }).catch(() => {});
check("נחתה בדשבורד של הדוכן", new URL(girl.url()).pathname === "/dashboard", girl.url());
const { rows: [l2] } = await db.query("select used_at from login_links where token=$1", [token]);
check("הקישור נשרף", l2.used_at !== null);
const { rows: [prof] } = await db.query(
  "select count(*)::int as n from squish_profiles where user_id=$1", [store.owner_id]);
check("לא נפתח לה פרופיל סקוויש", prof.n === 0);

/* ── 4. פעם אחת ── */
const again = await phone();
await again.goto(`${BASE}${path}`);
const againBody = (await again.textContent("body")) ?? "";
check("פעם שנייה — 'כבר נוצל'", againBody.includes("כבר נוצל"));

/* ── 5. רק מנהלת ── */
const stranger = await fetch(`${BASE}/api/admin/login-link`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: local, for: "store" }),
});
check("בלי התחברות כמנהלת — 403", stranger.status === 403, `status=${stranger.status}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} no-sms login checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
