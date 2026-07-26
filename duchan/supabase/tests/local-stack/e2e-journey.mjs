// E2E: המסע שלי (ילדה + אדמין) + הפעלת פרימיום AI
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/journey-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [store] } = await db.query("select * from stores order by created_at limit 1");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* ── 1. הילדה רואה את המסע ── */
const girl = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
await girl.goto(`${BASE}/login`);
await girl.fill("input[type=email]", "tamar-e2e@test.com");
await girl.fill("input[type=password]", "sqsq123!");
await girl.click("button:has-text('כניסה')");
await girl.waitForURL("**/dashboard", { timeout: 15000 });
await girl.waitForSelector("text=הבא במסע", { timeout: 10000 });
const body = await girl.textContent("body");
check("journey card shows next milestone", body.includes("הבא במסע"));
await girl.screenshot({ path: `${shots}/30-journey-card.png` });

await girl.click("text=הבא במסע");
await girl.waitForSelector("text=המסע שלי");
const sheet = await girl.textContent("body");
check("journey sheet lists all 7 milestones", sheet.includes("המוצר הראשון") && sheet.includes("עשר הזמנות"));
check("reached milestone shows its lesson", sheet.includes("💡"));
check("locked milestone shows what to do", sheet.includes("מוסיפים מוצר") || sheet.includes("שולחים את הלינק"));
await girl.screenshot({ path: `${shots}/31-journey-sheet.png` });

/* ── 2. אין AI כשלא פרימיום ── */
await db.query("update stores set ai_enabled = false where id = $1", [store.id]);
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי");
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("text=מוצר חדש");
check("no AI button when AI is off for the store", !(await girl.textContent("body")).includes("כתבי לי תיאור"));

/* ── 3. אדמין מפעיל פרימיום ── */
const admin = await (await browser.newContext({ viewport: { width: 720, height: 900 } })).newPage();
await fetch("http://localhost:8000/auth/v1/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@duchan.test", password: "admin123!" }),
}); // no-op if it already exists
await admin.goto(`${BASE}/login`);
await admin.fill("input[type=email]", "admin@duchan.test");
await admin.fill("input[type=password]", "admin123!");
await admin.click("button:has-text('כניסה')");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("text=חמ\"ל");
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(600);
check("admin list shows journey progress", (await admin.textContent("body")).includes("🎯 מסע:"));
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("text=המסע שלה");
check("admin store file shows her journey", true);
await admin.screenshot({ path: `${shots}/32-admin-journey.png` });

await admin.click("button:has-text('הדלקה מחדש')");
await admin.waitForSelector("text=הופעלה");
await admin.waitForTimeout(800);
const { rows: [ai] } = await db.query("select ai_enabled, ai_credits from stores where id=$1", [store.id]);
check("admin re-enables AI with 50 credits", ai.ai_enabled === true && ai.ai_credits === 50, `credits=${ai.ai_credits}`);

/* ── 4. הילדה רואה עכשיו את הכפתור ── */
await girl.reload();
await girl.waitForSelector("text=המוצרים שלי");
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("text=מוצר חדש");
// הכפתור מופיע רק כשיש תמונה חדשה בעורך
const png = `${shots}/prod.png`;
await girl.screenshot({ path: png });
await girl.setInputFiles("input[type=file][accept='image/*']", png);
await girl.waitForTimeout(1500);
check("AI button appears once AI on + photo", (await girl.textContent("body")).includes("כתבי לי תיאור"));
await girl.screenshot({ path: `${shots}/33-ai-button.png` });

/* ── 5. קרדיטים: ניכוי אטומי ובדיקת בעלות ── */
const { rows: [r1] } = await db.query("select use_ai_credit($1) as ok", [store.id]);
const { rows: [c1] } = await db.query("select ai_credits from stores where id=$1", [store.id]);
check("use_ai_credit deducts one", r1.ok === true && c1.ai_credits === 49, `credits=${c1.ai_credits}`);

await db.query("update stores set ai_credits = 0 where id=$1", [store.id]);
const { rows: [r0] } = await db.query("select use_ai_credit($1) as ok", [store.id]);
check("use_ai_credit refuses at zero", r0.ok === false);

await db.query("update stores set ai_enabled = false, ai_credits = 10 where id=$1", [store.id]);
const { rows: [rOff] } = await db.query("select use_ai_credit($1) as ok", [store.id]);
check("use_ai_credit refuses when AI off", rOff.ok === false);

// ה-API דוחה כשאין פרימיום, גם עם בעלות תקינה
await db.query("update stores set ai_enabled = false where id=$1", [store.id]);
const apiOff = await girl.evaluate(async (sid) => {
  const r = await fetch("/api/ai/describe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: sid, imageBase64: "AAAA", mediaType: "image/webp" }),
  });
  return r.status;
}, store.id);
check("AI API returns 402 when AI off", apiOff === 402, `status=${apiOff}`);

// לא-בעלים נחסם
await db.query("update stores set ai_enabled = true, ai_credits = 10 where id=$1", [store.id]);
const apiForeign = await admin.evaluate(async (sid) => {
  const r = await fetch("/api/ai/describe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: sid, imageBase64: "AAAA", mediaType: "image/webp" }),
  });
  return r.status;
}, store.id);
check("AI API blocks non-owner", apiForeign === 403, `status=${apiForeign}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} journey+AI checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
