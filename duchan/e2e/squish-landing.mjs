/**
 * חבילה 12 — מסך הפתיחה של סקוויש קלאב.
 *
 * המסך פוצל לשניים בבקשה מפורשת, ו**מסך אינו מקטע בגלילה**: בכל רגע
 * נתון רואים אחד בלבד, והשני מחליף אותו בלחיצה. זו ההחלטה שנבדקת כאן,
 * כי היא זו שקל לאבד — מספיק שמישהו יחזיר את שניהם לאותו דף ארוך
 * והפיצול מת בלי שאף בדיקה תצעק.
 *
 * הטקסט השיווקי לא נבדק מילה במילה — הוא ישתנה. מה שנבדק הוא
 * ההתנהגות: מה נמצא באיזה מסך, ולאן הכפתור לוקח.
 */
import { BASE, checker, closeHelper, launch } from "./helpers/index.mjs";

const { check, done } = checker("מסך הפתיחה");
const errs = [];
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on("pageerror", (e) => errs.push(e.message));

await p.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=squish-hero]", { timeout: 30000 });

/* ── 1. נוחתים על הראשון, והשני לא קיים בכלל ── */
check("נוחתים על מסך הפתיחה", (await p.locator("[data-testid=squish-hero]").count()) === 1);
check("והמסך השני לא מרונדר יחד איתו",
  (await p.locator("[data-testid=squish-preview]").count()) === 0);

const hero = await p.locator("[data-testid=squish-hero]").boundingBox();
const vh = p.viewportSize().height;
check("מסך הפתיחה תופס כמעט את כל הגובה", !!hero && hero.height >= vh * 0.75,
  `${Math.round(hero?.height ?? -1)} מתוך ${vh}`);
/* אין גלילה: אם יש, זה שוב דף ארוך ולא מסך */
const scrollable = await p.evaluate(() =>
  document.documentElement.scrollHeight - window.innerHeight);
check("ואין מה לגלול בו", scrollable <= 8, `${scrollable}px`);

/* ── 2. מה יש בראשון ── */
check("יש לוגו", (await p.locator("[data-testid=squish-logo]").count()) === 1);
const heroText = await p.textContent("[data-testid=squish-hero]");
check("ההזמנה מופיעה בו", heroText.includes("אוסף סקווישים מטורף"));
check("וגם מה עושים כאן", heroText.includes("טריידים"));

const cta = p.locator("[data-testid=hero-cta]");
check("הכפתור הראשי במסך הראשון", (await cta.count()) === 1);
check("והוא מוביל לבניית האוסף", (await cta.getAttribute("href")) === "/squish/new");

/* השלבים שייכים למסך השני, ולכן אסור שיהיו כאן */
for (const step of ["בונים גלריה", "מסמנים מה פתוח לטרייד", "מזמינים חברות"]) {
  check(`השלב "${step}" לא במסך הראשון`, !heroText.includes(step));
}

/* ── 3. מעבר למסך השני — הוא מחליף, לא נוסף ── */
await p.click("[data-testid=to-preview]");
await p.waitForSelector("[data-testid=squish-preview]", { timeout: 10000 });
check("לחיצה מעבירה למסך השני",
  (await p.locator("[data-testid=squish-preview]").count()) === 1);
check("והראשון נעלם, לא נשאר מעליו",
  (await p.locator("[data-testid=squish-hero]").count()) === 0);

/* ── 4. מה יש בשני ── */
const prevText = await p.textContent("[data-testid=squish-preview]");
for (const step of ["בונים גלריה", "מסמנים מה פתוח לטרייד", "מזמינים חברות"]) {
  check(`השלב "${step}" נמצא במסך השני`, prevText.includes(step));
}

const tiles = await p.locator("[data-testid=squish-preview] .squish-card").count();
check("יש מדף עם כרטיסים אמיתיים", tiles === 4, `${tiles}`);
check("הכרטיסים בשתי עמודות, כמו באוסף",
  (await p.locator("[data-testid=squish-preview] .grid-cols-2").count()) >= 1);
/* שם מתוך הרשימה, ולא שם מקודד: כשהחלפתי את פריטי ההדגמה לתמונות
   האמיתיות נשאר כאן "צפרדע ענקית" שלא קיים יותר, והבדיקה הפכה לשקר
   שממתין להתגלות. עכשיו נבדק שכל ארבעת השמות שבמסך באמת מוצגים. */
const DEMO_NAMES = ["באו גלקסי", "תות", "מדוזה", "גבינה"];
for (const n of DEMO_NAMES) {
  check(`לכרטיס יש שם מתחת לתמונה: ${n}`, prevText.includes(n));
}
check("ומסומן מה פתוח לטרייד", prevText.includes("פתוחים לטרייד"));
check("וגם כאן אפשר להתחיל",
  (await p.getAttribute("[data-testid=preview-cta]", "href")) === "/squish/new");

/* ── 5. הפלייסהולדר, לא ריבוע ריק ──
   התמונה עצמה עשויה עוד לא להיות בריפו. מה שנבדק הוא שיש *משהו*
   בכל ריבוע — קובץ או הצללית שמחליפה אותו — ולא ריבוע ריק. */
const filled = await p.evaluate(() =>
  [...document.querySelectorAll("[data-testid=squish-preview] .squish-card")]
    .filter((c) => c.querySelector("img, svg")).length);
check("בכל ריבוע יש פלייסהולדר", filled === 4, `${filled}/4`);

/* ── 6. אפשר לחזור ── */
await p.click("[data-testid=back-to-hero]");
await p.waitForSelector("[data-testid=squish-hero]", { timeout: 10000 });
check("חזרה מחזירה למסך הראשון",
  (await p.locator("[data-testid=squish-hero]").count()) === 1 &&
  (await p.locator("[data-testid=squish-preview]").count()) === 0);

/* ── 7. פרטיות: אוספים אינם ציבוריים ── */
const html = await (await fetch(`${BASE}/squish`)).text();
check("אין אינדוקס לדף", /noindex/i.test(html));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
process.exit(done());
