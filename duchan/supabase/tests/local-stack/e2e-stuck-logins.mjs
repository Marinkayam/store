// E2E: "לא מצליחות להיכנס" בחמ"ל.
//
// הבקשה: "לראות אם יש אנשים שהזינו כמה פעמים טלפון ולא קיבלו סמס,
// לשלוח להם ישירות דרך וואטסאפ."
//
// החוזים:
//   1. מי שביקשה קוד 2+ פעמים ולא נכנסה — ברשימה, עם מספר הבקשות ושם הדוכן.
//   2. בקשה אחת בלבד, או מי שנכנסה אחרי הבקשות — לא ברשימה.
//   3. כפתור יוצר קישור כניסה, ושליחה בוואטסאפ למספר שלה עם הקישור.
//   4. אחרי יצירה — "כבר נוצר קישור"; אחרי שנכנסה בקישור — יורדת מהרשימה.
//   5. רק מנהלת.
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

const STUCK = "972521110005";   // בלי דוכן, 3 בקשות
const ONCE = "972521110006";    // בקשה אחת — עוד מוקדם לדאוג
const LATER = "972521110007";   // ביקשה פעמיים ואז נכנסה
const { rows: [store] } = await db.query(
  "select contact_phone, display_name from stores where activated_at is not null and owner_id is not null order by created_at limit 1");
const ALL = [STUCK, ONCE, LATER, store.contact_phone];

const reset = async () => {
  await db.query("delete from phone_otps where phone = any($1)", [ALL]);
  await db.query("delete from login_links where phone = any($1)", [ALL]);
  await db.query("delete from phone_accounts where phone = $1", [STUCK]);
  await db.query("delete from auth.users where email like $1", [`${STUCK}@%`]);
};
await reset();

const otp = (phone, minAgo, consumed = false, attempts = 0) =>
  db.query(
    `insert into phone_otps (phone, code_hash, expires_at, attempts, consumed_at, created_at)
     values ($1, 'x', now() + interval '10 minutes', $2, $3, now() - make_interval(mins => $4))`,
    [phone, attempts, consumed ? new Date(Date.now() - (minAgo - 1) * 60000) : null, minAgo]
  );
await otp(STUCK, 30); await otp(STUCK, 25, false, 1); await otp(STUCK, 20, false, 2);
await otp(ONCE, 5);
await otp(LATER, 40); await otp(LATER, 35); await otp(LATER, 30, true);
await otp(store.contact_phone, 15); await otp(store.contact_phone, 12);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const jsErrors = [];
admin.on("pageerror", (e) => jsErrors.push(e.message));
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("[data-testid=stuck-logins]", { timeout: 20000 });

const row = (p) => admin.locator(`[data-testid=stuck-row][data-phone='${p}']`);
check("מי שביקשה 3 פעמים — ברשימה", (await row(STUCK).count()) === 1);
const stuckText = (await row(STUCK).textContent()) ?? "";
check("עם מספר הבקשות והקודים השגויים", stuckText.includes("3 בקשות קוד") && stuckText.includes("3 קוד שגוי"), stuckText);
check("ו'עוד בלי דוכן'", stuckText.includes("עוד בלי דוכן"));
check("מספר בתצוגה מקומית", stuckText.includes("052-111-0005"));
check("בעלת דוכן — עם שם הדוכן", ((await row(store.contact_phone).textContent()) ?? "").includes(store.display_name));
check("בקשה אחת — לא ברשימה", (await row(ONCE).count()) === 0);
check("ביקשה ואז נכנסה — לא ברשימה", (await row(LATER).count()) === 0);

/* ── קישור + וואטסאפ ── */
await row(STUCK).locator("[data-testid=stuck-mint]").click();
await row(STUCK).locator("[data-testid=stuck-whatsapp]").waitFor({ timeout: 10000 });
const href = (await row(STUCK).locator("[data-testid=stuck-whatsapp]").getAttribute("href")) ?? "";
const text = decodeURIComponent(href.split("?text=")[1] ?? "");
check("וואטסאפ למספר שלה", href.startsWith(`https://wa.me/${STUCK}?`), href.slice(0, 40));
const linkUrl = text.match(/https?:\/\/\S+\/enter\/\S+/)?.[0] ?? "";
check("עם קישור כניסה לדוכן", /\/enter\/[\w-]{16,}\?to=store$/.test(linkUrl), linkUrl.replace(/enter\/[\w-]+/, "enter/…"));

await admin.reload();
await admin.waitForSelector("[data-testid=stuck-logins]", { timeout: 20000 });
check("אחרי רענון: 'כבר נוצר קישור'", (await row(STUCK).locator("[data-testid=stuck-link-sent]").count()) === 1);

/* ── נכנסה בקישור → יורדת מהרשימה ── */
const u = new URL(linkUrl);
const enter = await fetch(`${BASE}${u.pathname}${u.search}`, { method: "POST", redirect: "manual" });
check("הקישור עובד", enter.status === 303, `status=${enter.status} → ${enter.headers.get("location")}`);
await admin.reload();
await admin.waitForTimeout(2500);
check("אחרי שנכנסה — יורדת מהרשימה", (await row(STUCK).count()) === 0);
check("השאר עדיין שם", (await row(store.contact_phone).count()) === 1);

/* ── רק מנהלת ── */
const stranger = await fetch(`${BASE}/api/admin/stuck-logins`);
check("בלי התחברות — 403", stranger.status === 403, `status=${stranger.status}`);
check("אין שגיאות ג׳אווהסקריפט", jsErrors.length === 0, jsErrors.join(" | "));

await reset();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} stuck-login checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
