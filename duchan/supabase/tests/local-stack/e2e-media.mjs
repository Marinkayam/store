// E2E למדיה: כישלון בקריאת תמונה חייב להיראות על המסך, לא להיעלם בשקט.
// זה מה שלקוחה דיווחה: "לא מצליחה לצלם או להעלות" — הכפתור פשוט לא עשה כלום.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, writeFileSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/media-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

// קובץ שנראה כמו תמונה לפי הסיומת אבל אינו תמונה — בדיוק מה שקורה כשדפדפן
// מקבל HEIC שהוא לא יודע לפענח: הבחירה מצליחה, הפענוח נופל.
const brokenJpg = `${shots}/not-really-an-image.jpg`;
writeFileSync(brokenJpg, "זה טקסט, לא תמונה. createImageBitmap ייפול עליו.");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

/* ── התמונות חיות בדשבורד; האונבורדינג לא מבקש אף תמונה ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/products`);
await girl.waitForSelector("text=המוצרים שלי", { timeout: 15000 });
await girl.click("button[aria-label='מוצר חדש']");

const photoInput = girl.locator("input[type=file][accept='image/*']");
check("the photo input does not force the camera", (await photoInput.getAttribute("capture")) === null);

await photoInput.setInputFiles(brokenJpg);
await girl.waitForSelector("text=לא הצלחנו לקרוא את התמונה", { timeout: 10000 });
check("a photo that cannot be decoded shows a message instead of nothing", true);

// ואחרי הכישלון עדיין אפשר להמשיך עם תמונה תקינה
const realJpg = `${shots}/real.png`;
await girl.screenshot({ path: realJpg });
await photoInput.setInputFiles(realJpg);
await girl.waitForTimeout(1500);
check("a good photo still works right after a failed one", true);
await girl.screenshot({ path: `${shots}/71-dashboard-photo-error.png` });

/* ── 3. העלאה חסומה מדווחת, לא נבלעת ── */
// חוסמים את ה-PUT ל-R2 כדי לדמות CORS שגוי — זה כישלון שזורק ולא מחזיר סטטוס
await girl.route("**/duchan-media/**", (r) => r.abort("failed"));
const realPng = `${shots}/real2.png`;
await girl.screenshot({ path: realPng });
await girl.locator("input[type=file][accept='image/*']").setInputFiles(realPng);
await girl.waitForTimeout(1500);
await girl.fill("input[aria-label='שם המוצר']", "מוצר בדיקה");
await girl.fill("input[aria-label='מחיר']", "10");
await girl.click("button:text-is('שמירה')");
// ממתינים להופעת ההודעה ולא ישנים ואז קוראים: ה-toast נעלם אחרי 2.6 שניות,
// והבדיקה הישנה הצליחה או נכשלה לפי מהירות המכונה.
let blockedMsg = "";
try {
  const toast = girl.locator("text=/נחסמה|ההעלאה נכשלה/").first();
  await toast.waitFor({ timeout: 15000 });
  blockedMsg = (await toast.textContent()) ?? "";
} catch {}
check("a blocked upload tells her something is wrong", !!blockedMsg, blockedMsg || "שום הודעה");
await girl.screenshot({ path: `${shots}/72-upload-blocked.png` });

const { rows } = await db.query("select id from products where name='מוצר בדיקה' and deleted_at is null");
check("a product is not created when its photo failed to upload", rows.length === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} media checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
