// E2E: שלושת השלבים של החזון — פותחים דוכן, מוסיפים מוצר, משתפים.
// כולל: אין מסע ואין דרגות, שיתוף נעול עד מוצר ראשון, מסך החגיגה,
// ותצוגה מקדימה שחברה באמת רואה. בסוף — פרימיום AI (נשאר מהסוויטה הקודמת).
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/flow-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

// תמר = החנות הראשונה (יש בה מוצר). נועה = החנות שנפתחה מההפניה, בלי מוצרים.
const { rows: [tamar] } = await db.query("select * from stores order by created_at limit 1");
const { rows: [noa] } = await db.query("select * from stores where contact_phone='972529998877'");
if (!tamar || !noa) {
  console.error("צריך להריץ קודם את e2e.mjs ואת e2e-activation.mjs");
  process.exit(1);
}

// הסוויטה מוסיפה מוצר לחנות של נועה, ולכן היא גם מרוקנת אותה — אחרת ריצה
// שנייה מתחילה בחנות שכבר יש בה מוצר, ומסך הנעילה לא מופיע
await db.query("delete from products where store_id=$1", [noa.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

/* ── 1. אין מסע, אין דרגות, אין הישגים ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 15000 });
await girl.waitForSelector("text=היי תמר", { timeout: 15000 });
const dash = await girl.textContent("body");
check("the dashboard has no journey card", !dash.includes("הבא במסע") && !dash.includes("המסע שלי"));
check("the dashboard has no levels or achievements", !dash.includes("דרגה") && !dash.includes("הישגים"));
await girl.screenshot({ path: `${shots}/50-dashboard.png` });

/* ── 2. שיתוף נעול עד שיש מוצר אחד ── */
const empty = await phone();
await empty.goto(`${BASE}/login`);
await verifyPhone(empty, "0529998877");
await empty.waitForURL("**/dashboard", { timeout: 15000 });
await empty.goto(`${BASE}/dashboard/share`);
await empty.waitForSelector("text=רגע לפני ששולחים", { timeout: 15000 });
const gate = await empty.textContent("body");
check("sharing is blocked while the store has no products", gate.includes("עוד אין מוצרים"));
check("the block offers the one thing that unblocks it",
  (await empty.locator("a[href='/dashboard/products?new=1']").count()) === 1);
check("no ready-made message is shown yet", (await empty.locator("textarea").count()) === 0);
await empty.screenshot({ path: `${shots}/51-share-locked.png` });

/* ── 3. המוצר הראשון פותח את החגיגה ── */
await empty.click("a[href='/dashboard/products?new=1']");
await empty.waitForURL("**/dashboard/products?new=1");
await empty.waitForSelector("input[aria-label='שם המוצר']", { timeout: 15000 });
check("the share screen's CTA opens straight into a new product form",
  (await empty.locator("input[aria-label='שם המוצר']").count()) === 1);
await empty.fill("input[aria-label='שם המוצר']", "צמיד חוטים");
await empty.fill("input[aria-label='מחיר']", "12");
await empty.locator("button:text-is('שמירה')").click();

await empty.waitForSelector("[data-testid=first-product-celebration]", { timeout: 25000 });
check("the first product is celebrated, not toasted",
  await empty.locator("[data-testid=first-product-celebration]").isVisible());
check("and the celebration's main button leads to sharing",
  (await empty.locator("[data-testid=first-product-celebration] a[href='/dashboard/share']").count()) === 1);
await empty.screenshot({ path: `${shots}/52-celebration.png` });

/* ── 4. ומשם ישר להפצה ── */
await empty.click("[data-testid=first-product-celebration] a[href='/dashboard/share']");
await empty.waitForURL("**/dashboard/share");
await empty.waitForSelector("textarea", { timeout: 15000 });
check("share opens for real once a product exists",
  (await empty.locator("textarea").count()) >= 1);
const shareBox = await empty.locator("textarea").first().inputValue();
check("and the ready-made message carries the store link",
  shareBox.includes(`/s/${noa.slug}`), shareBox.slice(0, 60));
await empty.screenshot({ path: `${shots}/53-share-open.png`, fullPage: true });

/* ── 5. חברה נכנסת לתצוגה מקדימה ורואה חנות אמיתית ── */
const friend = await phone();
await friend.goto(`${BASE}/s/${noa.slug}`);
await friend.waitForSelector("text=צמיד חוטים", { timeout: 15000 });
const seen = await friend.textContent("body");
check("a friend sees the real products before publishing", seen.includes("₪12"));
check("and is told plainly that orders aren't open yet", seen.includes("עוד לא נפתח להזמנות"));
check("and a preview banner says so, without her having to guess",
  await friend.locator("[data-testid=preview-banner]").isVisible());
await friend.click("button[aria-label='צמיד חוטים']");
await friend.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
check("the add-to-cart button is disabled in a preview",
  await friend.locator("button[aria-label='הוספה לסל']").isDisabled());
await friend.screenshot({ path: `${shots}/54-preview-friend.png` });

/* ── 6. הבעלים רואה בתצוגה המקדימה את הדרך לפרסום ── */
const ownerView = await phone();
await ownerView.goto(`${BASE}/login`);
await verifyPhone(ownerView, "0529998877");
await ownerView.waitForURL("**/dashboard", { timeout: 15000 });
await ownerView.goto(`${BASE}/s/${noa.slug}`);
/* זהות הבעלים נקבעת אחרי ההידרציה, ולכן מחכים לגרסת-הבעלים של הרצועה
   ולא רק לרצועה עצמה. */
const ownerPublish = "[data-testid=preview-banner] a[href='/activate']";
await ownerView.waitForSelector(ownerPublish, { timeout: 20000 }).catch(() => {});
check("the owner gets a route to publishing on her own preview",
  (await ownerView.locator(ownerPublish).count()) === 1);
await ownerView.screenshot({ path: `${shots}/55-preview-owner.png` });

/* ── 7. פרימיום AI ── */
await db.query("update stores set ai_enabled = false where id = $1", [tamar.id]);
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי");
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("text=מוצר חדש");
check("no AI button when AI is off for the store", !(await girl.textContent("body")).includes("כתבי לי תיאור"));

const admin = await (await browser.newContext({ viewport: { width: 720, height: 900 } })).newPage();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("text=חמ\"ל");
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(600);
check("admin list still shows each store's progress", (await admin.textContent("body")).includes("📈 התקדמות:"));
await admin.locator("button", { hasText: tamar.display_name }).first().click();
await admin.waitForSelector("text=ההתקדמות שלה");
check("admin store file shows her progress", true);

await admin.click("button:has-text('הדלקה מחדש')");
await admin.waitForSelector("text=הופעלה");
await admin.waitForTimeout(800);
const { rows: [ai] } = await db.query("select ai_enabled, ai_credits from stores where id=$1", [tamar.id]);
check("admin re-enables AI with 50 credits", ai.ai_enabled === true && ai.ai_credits === 50, `credits=${ai.ai_credits}`);

await girl.reload();
await girl.waitForSelector("text=המוצרים שלי");
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("text=מוצר חדש");
const png = `${shots}/prod.png`;
await girl.screenshot({ path: png });
await girl.setInputFiles("input[type=file][accept='image/*']", png);
await girl.waitForTimeout(1500);
await girl.waitForSelector("[data-testid=ai-describe]", { timeout: 15000 }).catch(() => {});
check("AI button appears once AI on + photo",
  (await girl.locator("[data-testid=ai-describe]").count()) === 1);

/* ── 8. עריכה של מוצר קיים: אותה תמונה, בלי לצלם מחדש ── */
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=סקוויש חד-קרן");
check("a product row says out loud that it opens for editing",
  (await girl.textContent("body")).includes("עריכה"));
await girl.click("text=סקוויש חד-קרן");
await girl.waitForSelector("input[aria-label='שם המוצר']");
check("editing an existing product can still ask for a description",
  (await girl.locator("[data-testid=ai-describe]").count()) === 1);
await girl.keyboard.press("Escape").catch(() => {});
await girl.goto(`${BASE}/dashboard/products`);

const { rows: [r1] } = await db.query("select use_ai_credit($1) as ok", [tamar.id]);
const { rows: [c1] } = await db.query("select ai_credits from stores where id=$1", [tamar.id]);
check("use_ai_credit deducts one", r1.ok === true && c1.ai_credits === 49, `credits=${c1.ai_credits}`);

await db.query("update stores set ai_credits = 0 where id=$1", [tamar.id]);
const { rows: [r0] } = await db.query("select use_ai_credit($1) as ok", [tamar.id]);
check("use_ai_credit refuses at zero", r0.ok === false);

await db.query("update stores set ai_enabled = false, ai_credits = 10 where id=$1", [tamar.id]);
const { rows: [rOff] } = await db.query("select use_ai_credit($1) as ok", [tamar.id]);
check("use_ai_credit refuses when AI off", rOff.ok === false);

const apiOff = await girl.evaluate(async (sid) => {
  const r = await fetch("/api/ai/describe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: sid, imageBase64: "AAAA", mediaType: "image/webp" }),
  });
  return r.status;
}, tamar.id);
check("AI API returns 402 when AI off", apiOff === 402, `status=${apiOff}`);

await db.query("update stores set ai_enabled = true, ai_credits = 10 where id=$1", [tamar.id]);
const apiForeign = await admin.evaluate(async (sid) => {
  const r = await fetch("/api/ai/describe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: sid, imageBase64: "AAAA", mediaType: "image/webp" }),
  });
  return r.status;
}, tamar.id);
check("AI API blocks non-owner", apiForeign === 403, `status=${apiForeign}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} flow+AI checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
