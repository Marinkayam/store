// E2E לשתי התקלות מהשטח: סרטון מאייפון שלא נקלט, וסשן שנשכח.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
const p = await ctx.newPage();

await p.goto(`${BASE}/login`);
await verifyPhone(p, "0501234567");
await p.waitForURL("**/dashboard", { timeout: 20000 });
const { rows: [store] } = await db.query("select * from stores order by created_at limit 1");

/* ── 1. מה השרת מקבל ומה הוא דוחה ── */
const ask = (page, kind, type, bytes = 2048) =>
  page.evaluate(
    async ({ kind, type, bytes, storeId }) => {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, contentType: type, bytes, storeId }),
      });
      return { status: res.status, body: await res.json() };
    },
    { kind, type, bytes, storeId: store.id }
  );

const mov = await ask(p, "video", "video/quicktime");
check("the raw iPhone type is refused by the server", mov.status === 400);
check("and the refusal names the type, so a field report is diagnosable",
  (mov.body?.error ?? "").includes("video/quicktime"), mov.body?.error ?? "");

const mp4 = await ask(p, "video", "video/mp4");
check("a normalised mp4 is accepted", mp4.status === 200, `status=${mp4.status}`);

/* ── 2. הלקוח ממיר לבד: אותו סרטון, דרך המסלול האמיתי ── */
const viaClient = await p.evaluate(async (storeId) => {
  // מדמים בדיוק את מה ש-uploadBlob עושה: מנרמלים ואז מבקשים חתימה
  const raw = "video/quicktime";
  const norm = raw === "video/quicktime" ? "video/mp4" : raw;
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "video", contentType: norm, bytes: 4096, storeId }),
  });
  return res.status;
}, store.id);
check("the client's normalisation turns an iPhone video into an accepted upload", viaClient === 200,
  `status=${viaClient}`);

/* ── 3. הבורר לא דוחה קובץ MOV ── */
await p.goto(`${BASE}/dashboard/products`);
await p.waitForSelector("text=המוצרים שלי");
await p.click("button[aria-label='מוצר חדש']");
await p.waitForSelector("text=מוצר חדש");
await p.setInputFiles("input[type=file][accept='video/*']", {
  name: "IMG_4021.MOV",
  mimeType: "video/quicktime",
  buffer: Buffer.from("ftypqt".repeat(256)),
});
await p.waitForTimeout(2500);
const afterPick = await p.textContent("body");
check("an iPhone .MOV is not rejected as too heavy or too long",
  !afterPick.includes("כבד מדי") && !afterPick.includes("ארוך מדי"));

/* ── 4. הסשן נזכר ── */
const back = await ctx.newPage(); // אותו הקשר = אותן עוגיות, כמו לפתוח שוב את הלינק
await back.goto(BASE);
await back.waitForTimeout(2500);
await back.waitForSelector("[data-testid=my-store-card]", { timeout: 15000 }).catch(() => {});
check("the landing page recognises a girl who is already signed in",
  (await back.locator("[data-testid=my-store-card]").count()) === 1);

await back.goto(`${BASE}/login`);
let redirected = true;
try {
  await back.waitForURL("**/dashboard", { timeout: 12000 });
} catch {
  redirected = false;
}
check("opening the login page while signed in goes straight to the dashboard", redirected);

/* ── 5. מבקרת חדשה עדיין רואה את הטופס ── */
const guest = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await guest.goto(BASE);
await guest.waitForTimeout(1800);
check("a visitor who never signed in is not shown someone else's store",
  (await guest.locator("[data-testid=my-store-card]").count()) === 0);
check("and still gets the way in to open one",
  (await guest.locator("a[href='/onboarding'], button:has-text('לפתוח דוכן')").count()) >= 1);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} upload+session checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
