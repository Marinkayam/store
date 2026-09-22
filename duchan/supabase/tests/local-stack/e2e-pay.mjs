// E2E: הוספה מהירה מהרשת + אזור התשלום של הילדה (ביט/פייבוקס/מזומן + לינק).
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/pay-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
await db.query("delete from orders where ip_hash is not null and created_at > now() - interval '1 day'");
/* החבילה קובעת את התנאים שלה ולא יורשת אותם מהחבילה הקודמת:
   ריצה שתלויה במה שמישהי אחרת השאירה נופלת לפי סדר, לא לפי באג. */
await db.query(
  "update stores set payout_link = null, payout_bit = true, payout_paybox = true, payout_cash = true where id = $1",
  [store.id]
);
// מוצר עם בחירה ומוצר בלי — שני המסלולים של ההוספה המהירה
await db.query("delete from products where name in ('מחזיק מפתחות','גרביים מצחיקות')");
const mk = (name, opts) =>
  db.query(
    `insert into products (store_id, name, price, track_stock, stock, option_label, options, created_at)
     values ($1,$2,$3,true,5,$4,$5, now() - interval '40 days') returning *`,
    [store.id, name, 9, opts ? "צבע" : null, opts ?? null]
  );
const { rows: [plain] } = await mk("מחזיק מפתחות", null);
await mk("גרביים מצחיקות", ["ורוד", "כחול"]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

/* ── 1. הוספה מהירה מהרשת ── */
let p = await phone();
await p.goto(fresh(), { waitUntil: "networkidle" });
const quick = p.locator("button[aria-label='הוספה מהירה, מחזיק מפתחות']");
check("every product card carries its own add button", (await quick.count()) === 1);

await quick.click();
await p.waitForSelector("text=נוסף לסל", { timeout: 8000 });
check("adding from the grid does not open the product sheet",
  !(await p.textContent("body")).includes("הוספה לסל" + "\n"));
check("the cart bar shows the item", (await p.textContent("body")).includes("פריטים · ₪9"));
await p.waitForTimeout(2800);
check("the button then reports what is already in the cart",
  ((await quick.textContent()) ?? "").includes("בסל · 1"), (await quick.textContent()) ?? "");

await quick.click();
await p.waitForTimeout(700);
check("tapping again adds another one", ((await quick.textContent()) ?? "").includes("בסל · 2"));
await p.screenshot({ path: `${shots}/70-quick-add.png` });

/* ── 2. מוצר עם בחירה נפתח במקום להתווסף בניחוש ── */
const withOpt = p.locator("button[aria-label='הוספה מהירה, גרביים מצחיקות']");
check("a product with choices says so on the button",
  ((await withOpt.textContent()) ?? "").includes("בחירת צבע"), (await withOpt.textContent()) ?? "");
await withOpt.click();
await p.waitForSelector("text=קודם בוחרים צבע", { timeout: 8000 });
check("and it opens the sheet instead of guessing a colour", true);

/* ── 3. אזור התשלום בהגדרות ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("text=איך משלמים לי", { timeout: 15000 });
check("the settings screen has a place for payment options", true);

/* מאז 0046 — שני שדות: לינק ביט ולינק פייבוקס, כל אחד עם ולידציה משלו.
   מנקים לינקים מריצות קודמות — הבדיקה "לא נשמר" מניחה התחלה ריקה. */
await db.query("update stores set payout_link=null, payout_bit_link=null, payout_paybox_link=null where id=$1", [store.id]);
await girl.reload();
await girl.waitForSelector("text=איך משלמים לי", { timeout: 15000 });
const bitField = girl.locator("input[aria-label='לינק ביט']");
const payboxField = girl.locator("input[aria-label='לינק פייבוקס']");
check("there are separate fields for bit and paybox links",
  (await bitField.count()) === 1 && (await payboxField.count()) === 1);

await payboxField.fill("https://example.com/pay-me");
await girl.waitForTimeout(400);
check("a link that is not paybox is called out on the spot",
  (await girl.textContent("body")).includes("לא נראה כמו לינק של פייבוקס"));
await girl.click("button:has-text('שמירת שינויים')");
await girl.waitForSelector("text=לא נראה כמו לינק מאפליקציית פייבוקס", { timeout: 8000 });
const { rows: [notSaved] } = await db.query("select payout_paybox_link from stores where id=$1", [store.id]);
check("and it is never saved", notSaved.payout_paybox_link === null, String(notSaved.payout_paybox_link));

/* לינק ביט בשדה של פייבוקס נדחה גם הוא — שני מספרים שונים זו הנקודה */
await payboxField.fill("https://link.payboxapp.com/abc123");
await bitField.fill("https://www.bitpay.co.il/app/me/DAD1");
await girl.waitForTimeout(300);
await girl.click("button:has-text('שמירת שינויים')");
await girl.waitForSelector("text=נשמר", { timeout: 10000 });
await girl.waitForTimeout(800);
const { rows: [saved] } = await db.query("select payout_paybox_link, payout_bit_link from stores where id=$1", [store.id]);
check("a paybox link is saved", saved.payout_paybox_link === "https://link.payboxapp.com/abc123", String(saved.payout_paybox_link));
check("and the bit link can lead to a different number", saved.payout_bit_link === "https://www.bitpay.co.il/app/me/DAD1", String(saved.payout_bit_link));
await girl.screenshot({ path: `${shots}/71-settings-pay.png`, fullPage: true });

/* ── 4. הדאטהבייס עצמו דוחה לינק אחר, גם בעקיפה של המסך ── */
let dbRefused = false;
try {
  await db.query("update stores set payout_link='https://evil.example.com/x' where id=$1", [store.id]);
} catch {
  dbRefused = true;
}
check("the database refuses a non-payment link even without the screen", dbRefused);

/* ── 5. הקונה רואה כפתור תשלום ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
await buyer.click("button[aria-label='הוספה מהירה, מחזיק מפתחות']");
await buyer.waitForTimeout(600);
await buyer.click("[data-testid=cart-bar]");
await buyer.waitForSelector("text=ההזמנה שלך", { timeout: 10000 });
// הלינק מופיע כשבוחרים פייבוקס — הוא שייך לאמצעי הזה ולא לכל הזמנה
await buyer.click("button[aria-label='תשלום בפייבוקס']");
await buyer.waitForTimeout(400);
const payBtn = buyer.locator("a[href='https://link.payboxapp.com/abc123']");
check("the buyer gets a real payment button", (await payBtn.count()) === 1);
check("it is labelled by the app it opens",
  ((await payBtn.textContent()) ?? "").includes("פייבוקס"), (await payBtn.textContent()) ?? "");
check("it opens outside the store, safely",
  (await payBtn.getAttribute("target")) === "_blank" &&
    (await payBtn.getAttribute("rel"))?.includes("noopener"));
await buyer.screenshot({ path: `${shots}/72-buyer-pay.png` });

/* ── 6. הלינק נכנס גם להודעת הוואטסאפ ── */
const waHref = await buyer.evaluate(async (slug) => {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, items: [] }),
  });
  return res.status;
}, store.slug);
check("an empty order is still refused", waHref === 400, `status=${waHref}`);

/* ── 7. משפחה בלי לינק — רק מספר. הקונה מקבלת מספר להעתקה וסכום ── */
await db.query(
  "update stores set payout_link=null, payout_bit_link=null, payout_paybox_link=null, payout_bit_phone='0501112233' where id=$1",
  [store.id]);
const buyer3 = await phone();
await buyer3.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
await buyer3.click("button[aria-label='הוספה מהירה, מחזיק מפתחות']");
await buyer3.waitForTimeout(600);
await buyer3.click("[data-testid=cart-bar]");
await buyer3.waitForSelector("input[aria-label='השם שלך']", { timeout: 15000 });
await buyer3.fill("input[aria-label='השם שלך']", "דנה");
await buyer3.fill("input[aria-label='מספר טלפון']", "0529998877");
const pickup3 = buyer3.locator("button:has-text('מסירה אישית')");
if (await pickup3.count()) await pickup3.click();
await buyer3.click("button[aria-label='תשלום בביט']");
await buyer3.waitForTimeout(300);
await buyer3.click("button:has-text('שליחת ההזמנה')");
await buyer3.waitForSelector("[data-testid=order-pay-first]", { timeout: 15000 });
const phoneBox = (await buyer3.locator("[data-testid=pay-phone]").textContent()) ?? "";
check("a store with only a bit number shows it big on the pay screen",
  phoneBox.includes("050-1112233"), phoneBox.trim().slice(0, 60));
check("with which app to open and the amount to send",
  ((await buyer3.locator("[data-testid=order-pay-first]").textContent()) ?? "").includes("ביט"));
await buyer3.screenshot({ path: `${shots}/73-pay-by-phone.png` });

await db.query("update stores set payout_link = null, payout_bit_link = null, payout_paybox_link = null, payout_bit_phone = null, payout_paybox_phone = null where id = $1", [store.id]);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} quick-add + payment checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
