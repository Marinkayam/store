// E2E: הדף להורה (/parent/[slug]?t=…) — מרינה, 11.2026: "הבעיה שילדים
// נתקעים עליה זה העברה של הכסף בביט".
//
// הילד/ה שולח/ת לינק אחד; ההורה רואה מה נבנה, על מה התשלום, איך משלמים
// בביט, ולוחץ/ת "שילמנו". זה מכניס את הדוכן לתור בחמ"ל — לא מפעיל אותו.
import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "fs";
import { createHmac } from "crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const env = readFileSync(join(HERE, "..", "..", "..", ".env.local"), "utf8");
const envVal = (k) => env.split("\n").find((l) => l.startsWith(`${k}=`))?.split("=").slice(1).join("=").trim();
const SECRET = envVal("PARENT_LINK_SECRET") || envVal("SUPABASE_SERVICE_ROLE_KEY");
const token = (id) => createHmac("sha256", SECRET).update(`parent:${id}`).digest("base64url").slice(0, 16);

const results = [];
const check = (name, ok, detail = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${name}") לא קיבל בוליאני`);
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [seed] } = await db.query("select * from stores order by created_at limit 1");
const orig = {
  activated_at: seed.activated_at, payment_claimed_at: seed.payment_claimed_at, payment_method: seed.payment_method,
  payment_ref: seed.payment_ref, parent_consent_at: seed.parent_consent_at, payment_amount: seed.payment_amount,
};
await db.query(
  "update stores set activated_at=null, payment_claimed_at=null, payment_method=null, payment_ref=null, parent_consent_at=null where id=$1",
  [seed.id]
);
const t = token(seed.id);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 } }).then((c) => c.newPage());

try {
  /* ── 1: הילד/ה שולח/ת את הלינק האישי ── */
  const kid = await phone();
  await kid.goto(`${BASE}/login`);
  await verifyPhone(kid, "0" + seed.contact_phone.slice(3));
  await kid.waitForTimeout(1200);
  await kid.goto(`${BASE}/activate`);
  await kid.waitForSelector("[data-testid=send-parent]", { timeout: 20000 });
  await kid.waitForFunction(() => decodeURIComponent(document.querySelector("[data-testid=send-parent]")?.getAttribute("href") ?? "").includes("/parent/"), null, { timeout: 10000 }).catch(() => {});
  const msg = decodeURIComponent((await kid.getAttribute("[data-testid=send-parent]", "href")) ?? "");
  check("ההודעה להורה כוללת את הלינק האישי עם הטוקן", msg.includes(`/parent/${seed.slug}?t=${t}`), msg.slice(-80));
  check("ואומרת: פעם אחת, בלי מנוי, והכסף מהמכירות נשאר אצלם", msg.includes("תשלום אחד") && msg.includes("בלי מנוי") && msg.includes("נשאר אצלי"));
  check("ושם הדוכן בהודעה", msg.includes(seed.display_name));

  /* ── 2: לינק בלי טוקן / עם טוקן שגוי ── */
  const bad = await phone();
  await bad.goto(`${BASE}/parent/${seed.slug}?t=xxxxxxxxxxxxxxxx`);
  check("טוקן שגוי: 'הלינק לא שלם', בלי שם הדוכן ובלי כפתור תשלום",
    (await bad.locator("[data-testid=parent-invalid]").count()) === 1 &&
    !((await bad.textContent("body")) ?? "").includes(seed.display_name) &&
    (await bad.locator("[data-testid=parent-paid]").count()) === 0);
  const forged = await fetch(`${BASE}/api/parent/claim`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: seed.slug, t: "xxxxxxxxxxxxxxxx", method: "bit" }),
  });
  const { rows: [afterForged] } = await db.query("select payment_claimed_at from stores where id=$1", [seed.id]);
  check("וקריאה ישירה עם טוקן שגוי נדחית ולא נוגעת בדוכן", forged.status === 403 && afterForged.payment_claimed_at === null, `http=${forged.status}`);

  /* ── 3: הדף עצמו ── */
  const parent = await phone();
  const html = await (await fetch(`${BASE}/parent/${seed.slug}?t=${t}`)).text();
  check("הטלפון של הדוכן לא מופיע בדף", !html.includes(seed.contact_phone) && !html.includes("0" + seed.contact_phone.slice(3)));
  check("noindex", html.includes("noindex"));
  await parent.goto(`${BASE}/parent/${seed.slug}?t=${t}`);
  await parent.waitForSelector("[data-testid=parent-pay]", { timeout: 15000 });
  const body = (await parent.textContent("body")) ?? "";
  check("כותרת להורים עם שם הדוכן", body.includes("נבנה אצלכם דוכן") && body.includes(seed.display_name));
  const why = (await parent.textContent("[data-testid=parent-why]")) ?? "";
  check("'על מה הכסף': פעם אחת, בלי מנוי, נשאר פתוח, ועל מה זה הולך",
    why.includes("פעם אחת") && why.includes("בלי מנוי") && why.includes("נשאר פתוח") && why.includes("אחסון"));
  check("יזמות ובטיחות", body.includes("להיות יזמים") && (await parent.locator("[data-testid=learns]").count()) === 1 && (await parent.locator("[data-testid=safety]").count()) === 1);
  check("שלושה צעדים לביט, עם שם הדוכן להעתקה", (await parent.locator("[data-testid=parent-pay] ol > li").count()) === 3 &&
    (await parent.locator("[data-testid=parent-copy-name]").count()) === 1);

  /* ── 4: "שילמנו" ── */
  await parent.fill("[data-testid=parent-ref]", "אבא של תמר");
  await parent.click("[data-testid=parent-paid]");
  await parent.waitForSelector("[data-testid=parent-pending]", { timeout: 15000 });
  const { rows: [claimed] } = await db.query("select * from stores where id=$1", [seed.id]);
  check("'שילמנו' רושם הצהרה + אישור הורים, ולא מפעיל",
    !!claimed.payment_claimed_at && !!claimed.parent_consent_at && claimed.payment_method === "bit" && claimed.payment_ref === "אבא של תמר" && claimed.activated_at === null);
  await parent.waitForTimeout(800);
  const { rows: alerts } = await db.query(
    "select title from admin_alerts where kind='payment_claimed' and ref = $1 and body like '%הורה סימן%'",
    [`${seed.id}:${new Date(claimed.payment_claimed_at).toISOString()}`]
  );
  check("ומגיעה התראה לחמ\"ל: 'הורה סימן ששילם'", alerts.length === 1, alerts.map((a) => a.title).join(" | "));
  await kid.goto(`${BASE}/activate`);
  check("והילד/ה רואה 'התשלום בבדיקה'", (await kid.waitForSelector("[data-testid=payment-pending]", { timeout: 15000 }).then(() => true).catch(() => false)));

  /* ── 5: דוכן שכבר פתוח ── */
  await db.query("update stores set activated_at=now() where id=$1", [seed.id]);
  await parent.goto(`${BASE}/parent/${seed.slug}?t=${t}`);
  check("דוכן פתוח: 'הדוכן פתוח!' ובלי כפתור תשלום",
    (await parent.locator("[data-testid=parent-live]").count()) === 1 && (await parent.locator("[data-testid=parent-paid]").count()) === 0);
} finally {
  await db.query(
    "update stores set activated_at=$2, payment_claimed_at=$3, payment_method=$4, payment_ref=$5, parent_consent_at=$6, payment_amount=$7 where id=$1",
    [seed.id, orig.activated_at, orig.payment_claimed_at, orig.payment_method, orig.payment_ref, orig.parent_consent_at, orig.payment_amount]
  );
  await browser.close();
  await closeHelper();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} parent-page checks passed`);
process.exit(failed.length ? 1 : 0);
