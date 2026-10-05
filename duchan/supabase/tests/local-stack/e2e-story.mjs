// E2E: אתר השיווק /story — הסיפור של "מה זה דוכן", בגלילה.
//
// מרינה: "אתר בסגנון של awwards עם גלילה שמספרת סיפור של מה זה בעצם דוכן,
// בשפה הגרפית של האפליקציה… אפשרות לפתוח דוכן… מותאם מובייל", ואחר כך:
// "אני רוצה אתר מרקטינג, לא אתר שיחליף את מה שיש" — לכן זה דף נפרד, ודף
// הבית (/) נשאר כמו שהוא.
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  /* ── הסיפור בגלילה (מרינה: "אתר בסגנון awwards עם גלילה שמספרת סיפור") ── */
  const story = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const storyErrs = [];
  story.on("pageerror", (e) => storyErrs.push(e.message));
  await story.goto(BASE + "/story", { waitUntil: "networkidle" });
  check("פרק 1: 'לנועה יש מגירה'", ((await story.textContent("[data-testid=scene-hero]")) ?? "").includes("לנועה יש מגירה"));
  check("לסיפור יש שני קולות: הערות להורים", (await story.locator("[data-testid=parent-note]").count()) >= 6, String(await story.locator("[data-testid=parent-note]").count()));
  { const n = story.locator("[data-testid=scene-hero] [data-testid=parent-note]"); const t = await n.textContent(); check("פרק 1: מגירה / ארון / חדר, בלי הכותרת להורים", t.includes("מגירה / ארון / חדר מפוצץ עם הרבה אוצרות") && !t.includes("להורים"), t); }
  check("כפתור 'לפתוח דוכן' גלוי כבר במסך הראשון", await story.locator("[data-testid=home-header-start]").isVisible());
  check("בלי גלילה הצידה (390)", await story.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("הכפתור הדביק למטה מוסתר בהתחלה", (await story.getAttribute("[data-testid=home-sticky-start]", "tabindex")) === "-1");
  const scrollTo = (id, k) => story.evaluate(([id, k]) => {
    const el = document.querySelector(`[data-testid=${id}]`);
    window.scrollTo(0, el.offsetTop + (el.offsetHeight - innerHeight) * k);
  }, [id, k]);
  await scrollTo("scene-hero", 0.75);
  await story.waitForTimeout(500);
  check("גוללים: 'עסק!!!'", await story.locator("[data-testid=scene-hero] .home-huge").evaluate((e) => Number(getComputedStyle(e.parentElement).opacity) > 0.9));
  await scrollTo("scene-build", 0.02);
  await story.waitForTimeout(400);
  const lv0 = Number(await story.getAttribute("[data-testid=scene-build] [data-level]", "data-level"));
  await scrollTo("scene-build", 0.98);
  await story.waitForTimeout(400);
  const lv5 = Number(await story.getAttribute("[data-testid=scene-build] [data-level]", "data-level"));
  check("מעגלה לדוכן: הדוכן גדל עם הגלילה (0 → 5)", lv0 === 0 && lv5 === 5, `${lv0} → ${lv5}`);
  check("והכפתור הדביק הופיע", (await story.getAttribute("[data-testid=home-sticky-start]", "tabindex")) === "0");
  await scrollTo("scene-how", 0.8);
  await story.waitForTimeout(500);
  check("איך זה עובד: שלב 3, שולחים לינק", ((await story.textContent("[data-testid=scene-how]")) ?? "").includes("שולחים לינק"));
  await scrollTo("scene-ding", 0.9);
  await story.waitForTimeout(500);
  check("דינג: הזמנה ראשונה", ((await story.textContent("[data-testid=scene-ding]")) ?? "").includes("איזו התרגשות"));
  // פרק 3: משחק התמחור
  await story.locator("[data-testid=game-slider]").scrollIntoViewIfNeeded();
  await story.locator("[data-testid=game-slider]").fill("40");
  const expensive = (await story.textContent("[data-testid=game-say]")) ?? "";
  await story.locator("[data-testid=game-slider]").fill("20");
  const sweet = (await story.textContent("[data-testid=game-say]")) ?? "";
  check("משחק התמחור: יקר מדי → מחיר מעולה", expensive.includes("יקר מדי") && sweet.includes("מחיר מעולה"), `${expensive} / ${sweet}`);
  check("והחשבון מוצג: רווח ₪112 ב-₪20", ((await story.textContent("[data-testid=game-profit]")) ?? "").includes("112"));
  await story.locator("[data-testid=home-riddle]").scrollIntoViewIfNeeded();
  await story.click("[data-testid=home-riddle] button:has-text('₪30')");
  check("חידה: תשובה נכונה מקבלת כוכב", ((await story.textContent("[data-testid=home-riddle-answer]")) ?? "").includes("נכון"));
  for (const id of ["home-month", "home-price-game", "home-safety", "home-price"]) check(`קטע ${id} קיים`, (await story.locator(`[data-testid=${id}]`).count()) === 1);
  await story.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await story.waitForTimeout(500);
  check("בסוף: הכפתור הדביק נעלם (יש כפתור גדול בעמוד)", (await story.getAttribute("[data-testid=home-sticky-start]", "tabindex")) === "-1");
  check("בסוף: 'לשלוח את הסיפור להורים' בוואטסאפ", ((await story.getAttribute("[data-testid=home-send-parents]", "href")) ?? "").startsWith("https://wa.me/?text="));
  await story.click("[data-testid=home-start]");
  await story.waitForURL("**/onboarding", { timeout: 15000 });
  check("'קדימה, בואו נקים את הדוכן' פותח את ההקמה", true);
  check("בלי שגיאות בסיפור", storyErrs.length === 0, storyErrs.join(" | "));
  // מסך צר מאוד ומחשב
  const narrow = await (await browser.newContext({ viewport: { width: 320, height: 640 } })).newPage();
  await narrow.goto(BASE + "/story", { waitUntil: "networkidle" });
  check("בלי גלילה הצידה גם ב-320", await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desk.goto(BASE + "/story", { waitUntil: "networkidle" });
  await desk.evaluate(() => window.scrollTo(0, innerHeight * 4));
  await desk.waitForTimeout(400);
  check("במחשב: בלי הפס הדביק למטה", !(await desk.locator("[data-testid=home-sticky-start]").isVisible()));
  // בלי תנועה: הכל גלוי, בלי לחכות להופעות
  const still = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
  await still.goto(BASE + "/story", { waitUntil: "networkidle" });
  check("בלי תנועה: הקטעים גלויים מיד", await still.locator("[data-testid=home-safety] .home-reveal").first().evaluate((e) => getComputedStyle(e).opacity === "1"));

  /* דף הבית לא הוחלף */
  const home = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await home.goto(BASE + "/", { waitUntil: "networkidle" });
  check("דף הבית (/) נשאר כמו שהיה — בלי הסיפור", (await home.locator("[data-testid=scene-hero]").count()) === 0 && (await home.locator("[data-testid=stall-hero]").count()) === 1);
  const meta = await (await fetch(BASE + "/story")).text();
  check("לאתר יש כותרת ותיאור לשיתוף", meta.includes("העסק הראשון מתחיל בדוכן") && meta.includes("og:description"));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
