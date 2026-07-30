/**
 * חבילה 13 — סקוויש קלאב כאפליקציה על מסך הבית.
 *
 * ה"התקנה" ב-iOS היא צירוף של שלושה דברים שקל לשבור בנפרד ואף אחד
 * לא שם לב: המניפסט (standalone, scope), אייקון המגע של אפל, והמדריך
 * במסך "שלי" — כי באייפון אין הצעת התקנה אוטומטית, ומדריך שנעלם
 * שקול לפיצ'ר שנעלם.
 */
import { BASE, checker, closeHelper, db, launch, newCollector, wipe } from "./helpers/index.mjs";

const U = { num: "0521150001", e164: "972521150001", nick: "PwaGirl", title: "מדף בדיקה" };

const pool = db();
await wipe(pool, [U.e164]);

const { check, done } = checker("אפליקציה על מסך הבית");

/* ── 1. המניפסט — החוזה מול מערכת ההפעלה ── */
const mres = await fetch(`${BASE}/squish-manifest.json`);
check("המניפסט נטען", mres.status === 200, `${mres.status}`);
const manifest = await mres.json();
check("נפתח כאפליקציה, בלי דפדפן מסביב", manifest.display === "standalone");
check("התחום הוא סקוויש בלבד", manifest.scope === "/squish");
check("ונקודת הפתיחה בתוכו", manifest.start_url.startsWith("/squish"), manifest.start_url);
check("עברית מימין לשמאל", manifest.dir === "rtl" && manifest.lang === "he");

/* ── 2. האייקונים באמת קיימים ── */
for (const icon of manifest.icons) {
  const r = await fetch(`${BASE}${icon.src}`);
  const len = Number(r.headers.get("content-length") ?? 0);
  check(`אייקון ${icon.sizes} נטען ואינו ריק`, r.status === 200 && len > 1000, `${r.status} · ${len}b`);
}
const touch = await fetch(`${BASE}/squish-touch-icon.png`);
check("אייקון המגע של אפל קיים", touch.status === 200);

/* ── 3. הדף מכריז על עצמו ── */
const html = await (await fetch(`${BASE}/squish`)).text();
check("הדף מפנה למניפסט", html.includes("squish-manifest.json"));
check("ולאייקון של אפל", html.includes("squish-touch-icon.png"));

/* ── 4. המדריך במסך "שלי" ── */
const b = await launch();
const errs = [];
const page = await newCollector(b, U, ["פ1", "פ2", "פ3"], errs);
await page.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
check("יש מקטע 'כמו אפליקציה'", (await page.textContent("body")).includes("סקוויש קלאב כמו אפליקציה"));
await page.click("button:has-text('איך מוסיפים למסך הבית?')");
await page.waitForTimeout(500);
const sheet = await page.textContent("body");
check("המדריך נפתח עם הוראות לאייפון", sheet.includes("באייפון") && sheet.includes("כפתור השיתוף"));
check("וגם לאנדרואיד", sheet.includes("באנדרואיד"));
await page.click("button:has-text('הבנתי')");
await page.waitForTimeout(400);
check("והוא נסגר", !(await page.textContent("body")).includes("כפתור השיתוף"));
/* ── 5. ההחלטה של מרינה: הזמנה לדוכן, לא קישור למסך ריק ── */
const meBody = await page.textContent("body");
check("למי שאין דוכן — הזמנה לפתוח אחד", meBody.includes("פותחים דוכן"));
check("ולא קישור לדשבורד ריק", !meBody.includes("לדוכן שלי"));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
