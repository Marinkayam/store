/**
 * חבילה 12 — מסך הפתיחה של סקוויש קלאב.
 *
 * המסך הזה פוצל לשניים בבקשה מפורשת: ראשון לוגו והזמנה, שני ההוכחה
 * — גלריה שנראית כמו הפרופיל האמיתי, ומתחתיה השלבים. הפיצול הוא
 * ההחלטה, ולכן הוא מה שנבדק: שהראשון תופס מסך, שהשני מתחתיו, ושהשלבים
 * ירדו לשני ולא נשארו בראשון.
 *
 * הטקסט השיווקי עצמו לא נבדק מילה במילה — הוא ישתנה. מה שנבדק הוא
 * ההתנהגות: מה נמצא איפה, ולאן הכפתור לוקח.
 */
import { BASE, checker, closeHelper, launch } from "./helpers/index.mjs";

const { check, done } = checker("מסך הפתיחה");
const errs = [];
const b = await launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on("pageerror", (e) => errs.push(e.message));

await p.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=squish-hero]", { timeout: 30000 });

/* ── 1. שני מסכים, בסדר הנכון ── */
const hero = await p.locator("[data-testid=squish-hero]").boundingBox();
const prev = await p.locator("[data-testid=squish-preview]").boundingBox();
check("יש מסך פתיחה", !!hero);
check("ויש מסך שני", !!prev);
check("השני מתחת לראשון", !!hero && !!prev && prev.y >= hero.y + hero.height - 2,
  `hero ${Math.round(hero?.height ?? -1)} · preview y ${Math.round(prev?.y ?? -1)}`);

/* מסך פתיחה שלא תופס מסך אינו מסך פתיחה — הוא כותרת */
const vh = p.viewportSize().height;
check("מסך הפתיחה תופס כמעט את כל הגובה", !!hero && hero.height >= vh * 0.75,
  `${Math.round(hero?.height ?? -1)} מתוך ${vh}`);

/* ── 2. מה יש בכל אחד ── */
check("יש לוגו במסך הראשון", (await p.locator("[data-testid=squish-logo]").count()) === 1);
const heroText = await p.textContent("[data-testid=squish-hero]");
check("ההזמנה מופיעה בו", heroText.includes("אוסף סקווישים מטורף"));
check("וגם מה עושים כאן", heroText.includes("טריידים"));

const cta = p.locator("[data-testid=hero-cta]");
check("יש כפתור אחד ברור", (await cta.count()) === 1);
check("והוא מוביל לבניית האוסף", (await cta.getAttribute("href")) === "/squish/new");

/* ── 3. השלבים ירדו למסך השני ── */
const prevText = await p.textContent("[data-testid=squish-preview]");
for (const step of ["בונים גלריה", "מסמנים מה פתוח לטרייד", "מזמינים חברות"]) {
  check(`השלב "${step}" נמצא במסך השני`, prevText.includes(step));
  check(`והוא כבר לא במסך הראשון: ${step}`, !heroText.includes(step));
}

/* ── 4. הגלריה נראית כמו גלריה אמיתית ── */
const tiles = await p.locator("[data-testid=squish-preview] .squish-card").count();
check("יש מדף עם כרטיסים אמיתיים", tiles === 6, `${tiles}`);
check("הכרטיסים בשתי עמודות, כמו באוסף",
  (await p.locator("[data-testid=squish-preview] .grid-cols-2").count()) >= 1);
check("ולכרטיס יש שם מתחת לתמונה", prevText.includes("צפרדע ענקית"));
check("ומסומן מה פתוח לטרייד", prevText.includes("פתוחים לטרייד"));

/* ── 5. הפלייסהולדר, לא ריבוע ריק ──
   התמונה עצמה עשויה עוד לא להיות בריפו. מה שנבדק הוא שיש *משהו*
   בכל ריבוע — קובץ או הצללית שמחליפה אותו — ולא ריבוע ריק. */
const filled = await p.evaluate(() =>
  [...document.querySelectorAll("[data-testid=squish-preview] .squish-card")]
    .filter((c) => c.querySelector("img, svg")).length);
check("בכל ריבוע יש פלייסהולדר", filled === 6, `${filled}/6`);

/* ── 6. פרטיות: אוספים אינם ציבוריים ── */
const html = await (await fetch(`${BASE}/squish`)).text();
check("אין אינדוקס לדף", /noindex/i.test(html));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
process.exit(done());
