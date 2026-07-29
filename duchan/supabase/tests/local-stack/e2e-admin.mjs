// E2E לחמ"ל: כניסות נספרות → סקירה → תיק חנות → וואטסאפ → עדכונים מגיעים לבנות
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/admin-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [store] } = await db.query("select * from stores where slug is not null order by created_at limit 1");
const slug = store.slug;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* ── 1. כניסות נספרות ── */
await db.query("delete from store_views where store_id=$1", [store.id]);
for (let i = 0; i < 3; i++) {
  const visitor = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
  await visitor.goto(`${BASE}/s/${slug}`, { waitUntil: "networkidle" });
  await visitor.waitForTimeout(300);
  await visitor.close(); // סגירה מיידית — sendBeacon אמור לשרוד
}
await new Promise((r) => setTimeout(r, 1200));
const { rows: [v] } = await db.query("select coalesce(sum(views),0)::int as total from store_views where store_id=$1", [store.id]);
check("3 visits counted (one per browser session)", v.total === 3, `views=${v.total}`);

/* ── 2. אדמין: הרשמה, סקירה ── */
const admin = await (await browser.newContext({ viewport: { width: 720, height: 900 } })).newPage();
// יצירת חשבון אדמין דרך השים
await admin.goto(`${BASE}/login`);
await fetch("http://localhost:8000/auth/v1/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@duchan.test", password: "admin123!" }),
});
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);

await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("text=חמ\"ל", { timeout: 15000 });
await admin.waitForSelector("text=כניסות · 7 ימים");
const overviewText = await admin.textContent("body");
check("overview loads with live stats", overviewText.includes("כניסות"));
check("overview counts our 3 views", overviewText.includes("3"));
await admin.screenshot({ path: `${shots}/20-overview.png` });

/* ── 3. תיק חנות: וואטסאפ + ארכיון מוצרים ── */
await admin.click("button:has-text('חנויות')");
await admin.waitForTimeout(500);
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("text=וואטסאפ לבעלי הדוכן");
const waHref = await admin.getAttribute("a:has-text('וואטסאפ לבעלי הדוכן')", "href");
check("one-click WhatsApp to store owner", waHref?.includes(`wa.me/${store.contact_phone}`), waHref ?? "");
check("visits chart in store file", (await admin.textContent("body")).includes("14 ימים"));

// מוצר מחוק לפני שנה — עדיין נראה לאדמין וניתן לשחזור
const { rows: [oldDeleted] } = await db.query(
  `insert into products (store_id, name, price, deleted_at, created_at)
   values ($1, 'מוצר עתיק שנמחק', 5, now() - interval '400 days', now() - interval '400 days')
   returning id`, [store.id]);
await admin.click("button[aria-label='סגירה']");
await admin.waitForTimeout(400);
await admin.locator("button", { hasText: store.display_name }).first().click();
await admin.waitForSelector("text=מוצר עתיק שנמחק");
check("products deleted long ago still visible to admin (nothing is ever lost)", true);
await admin.screenshot({ path: `${shots}/21-store-file.png` });
/* מכוונים לכפתור של המוצר הזה בדיוק, ולא ל"אחרון ברשימה": סדר הרשימה
   הוא פרט תצוגה, ובדיקה שנשענת עליו נשברת מכל שינוי מיון. */
await admin.click(`[data-testid='restore-product-${oldDeleted.id}']`);
await admin.waitForTimeout(1500);
const { rows: [restored] } = await db.query("select deleted_at from products where id=$1", [oldDeleted.id]);
check("admin restores product with no 30-day limit", restored.deleted_at === null);
await db.query("delete from products where id=$1", [oldDeleted.id]); // ניקוי בדיקה

/* ── 4. עדכונים: פרסום מהחמ"ל → מגיע לדשבורד של הילדה ── */
// ריצה קודמת השאירה עדכון, והמונה היה מראה 2 במקום 1
await db.query("delete from announcements");
await admin.click("button[aria-label='סגירה']");
await admin.waitForTimeout(400);
await admin.click("button:has-text('עדכונים')");
await admin.fill("input[placeholder*='כותרת']", "אפשר להעלות וידאו!");
await admin.fill("textarea", "מהיום אפשר לצלם סרטון של 5 שניות לכל מוצר 🎬");
await admin.click("button:has-text('פרסום לכל הדשבורדים')");
await admin.waitForSelector("text=פורסם");
check("announcement published from console", true);
await admin.screenshot({ path: `${shots}/22-news.png` });

// הילדה (בעלת החנות) רואה את זה
const girl = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 15000 });
await girl.waitForSelector("button[aria-label='מה חדש']");
const badge = await girl.textContent("button[aria-label='מה חדש']");
check("girl's dashboard shows unread badge", badge.includes("1"), `badge=${badge.trim()}`);
await girl.click("button[aria-label='מה חדש']");
await girl.waitForSelector("text=אפשר להעלות וידאו!");
check("announcement content reaches the girl", true);
await girl.screenshot({ path: `${shots}/23-girl-news.png` });

/* ── 5. לא-אדמין לא נכנס לחמ"ל ── */
await girl.goto(`${BASE}/admin`);
await girl.waitForTimeout(1000);
check("non-admin blocked from console", (await girl.textContent("body")).includes("אין כאן כלום"));
const apiAsGirl = await girl.evaluate(async () => (await fetch("/api/admin/overview")).status);
check("admin API returns 403 for non-admin", apiAsGirl === 403);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} admin checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
