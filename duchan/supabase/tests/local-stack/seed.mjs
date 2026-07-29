/**
 * זורע את הדוכן הראשון דרך האונבורדינג האמיתי.
 *
 * **למה זה קובץ נפרד ולא חלק מחבילה:** שרשרת הבדיקות של דוכן
 * (`e2e-activation` → `e2e-flow` → `e2e-badges` → …) מניחה שכבר קיים
 * דוכן אחד פעיל. עד היום התפקיד הזה נפל על `e2e.mjs`, שנכתב לפני
 * שהכניסה עברה לסמס ולפני שהאונבורדינג נהיה תלת-שלבי — ולכן על
 * דאטהבייס נקי אף בדיקת דוכן לא הצליחה להתחיל.
 *
 * הזריעה עוברת במסך ולא ב-SQL בכוונה: דוכן שנזרע ב-INSERT יכול להיות
 * במצב שהאונבורדינג לעולם לא מייצר, והשרשרת שמעליו הייתה בודקת מציאות
 * שלא קיימת.
 *
 *   node supabase/tests/local-stack/seed.mjs
 */
import { chromium } from "playwright";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const IMG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "e2e", "fixtures", "square.png");
const PHONE = "0501234567";
const E164 = "972501234567";

const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const { rows: [existing] } = await db.query("select slug from stores where contact_phone=$1", [E164]);
if (existing) {
  console.log(`יש כבר דוכן זרוע: /s/${existing.slug}`);
  await db.end();
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();

await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

/* שלב 1 — השם */
await page.fill("input[aria-label='שם הדוכן']", "החנות של תמר");
await page.click("button:has-text('הלאה, לעיצוב הדוכן')");
await page.waitForTimeout(900);

/* שלב 2 — מוצר ראשון וערכת צבעים */
await page.click("button:has-text('+ להוסיף מוצר')");
await page.waitForTimeout(600);
await page.setInputFiles("input[type=file] >> nth=1", IMG);
await page.waitForTimeout(1500);
await page.fill("input[aria-label='שם המוצר']", "סקוויש חד-קרן");
await page.fill("input[aria-label='מחיר המוצר']", "15");
await page.click("button:has-text('הוספה לדוכן')");
await page.waitForTimeout(900);
await page.click("button:has-text('הלאה ←')");
await page.waitForTimeout(1100);

/* שלב 3 — ההורים יודעים */
await page.check("input[aria-label='ההורים שלי יודעים']");
await page.click("button:has-text('הלאה, למספר הטלפון')");
await page.waitForTimeout(1100);

/* שלב 4 — אימות בסמס. זו גם ההרשמה: אין מייל ואין סיסמה. */
await verifyPhone(page, PHONE);
/* האונבארדינג לא מעביר לדשבורד אלא למסך "נפתח דוכן" — הדוכן כבר קיים,
   והמסך הזה הוא מה שמוכיח את זה. */
await page.waitForSelector("text=נפתח דוכן", { timeout: 40000 });
await page.waitForTimeout(800);

const { rows: [store] } = await db.query("select slug, contact_phone from stores where contact_phone=$1", [E164]);
if (!store) {
  console.error("האונבורדינג הסתיים אבל לא נוצר דוכן — שינוי במסך?");
  process.exit(1);
}

/* **הדוכן נשאר טיוטה בכוונה.** `e2e-activation.mjs` הוא זה שבודק את
   המסלול מטיוטה לפרסום, והוא מתחיל מ"הלינק עדיין נעול". זריעה שמפעילה
   את הדוכן הייתה מפילה אותו על מסכים שכבר לא מוצגים. */
console.log(`נזרע דוכן טיוטה: /s/${store.slug} · ${store.contact_phone}`);
console.log("הצעד הבא: node supabase/tests/local-stack/e2e-activation.mjs");

await browser.close();
await closeHelper();
await db.end();
