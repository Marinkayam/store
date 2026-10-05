// E2E: מסך הפתיחה — מרינה, 10.2026:
//   • "הדוכן לא יפה בתוך המסגרת", "קווים יותר דקים", "להדליק את האור"
//   • "אפשר להוריד את המילה דוכן"
//   • "אם כבר פתחתי דוכן אז אתה יודע — אל תכתוב 'כבר פתחת דוכן?'"
import { chromium } from "playwright";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  /* אורחת */
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await guest.goto(BASE + "/", { waitUntil: "networkidle" });
  const hero = guest.locator("[data-testid=stall-hero]");
  check("הדוכן על כל רוחב המסך", Math.round((await hero.boundingBox()).width) === 390);
  check("בלי ריבוע שמיים מאחורי הדוכן (בלי מסגרת)", (await hero.locator("svg rect.kp-sky").count()) === 0);
  await guest.click("[data-testid=stall-light]");
  await guest.waitForTimeout(900);
  check("להדליק את האור: לילה", (await hero.getAttribute("data-night")) === "1" && (await hero.locator("svg[data-night='1']").count()) === 1);
  check("השמיים מחשיכים על כל הרוחב", (await hero.evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(46, 49, 80)");
  await guest.click("[data-testid=stall-light]");
  check("ולכבות: חזרה ליום", (await hero.getAttribute("data-night")) === "0");
  const h1 = guest.locator("h1");
  check("המילה 'דוכן' לא מוצגת מתחת לאיור (נשארת לקוראי מסך)", (await h1.textContent()) === "דוכן" && (await h1.evaluate((e) => getComputedStyle(e).position)) === "absolute");
  // עוגיות: למטה ודביק (מרינה), ולא מכסה את "עזרה?"
  const cn = await guest.locator("[data-testid=cookie-note]").boundingBox();
  check("הודעת העוגיות למטה, דביקה", Math.abs(cn.y + cn.height - 844) <= 1, `${Math.round(cn.y)}+${Math.round(cn.height)}`);
  await guest.mouse.wheel(0, 600); await guest.waitForTimeout(300);
  const cn2 = await guest.locator("[data-testid=cookie-note]").boundingBox();
  check("ונשארת במקום כשגוללים", Math.abs(cn2.y - cn.y) <= 1);
  // בדוכן: כשנפתח גיליון מוצר, הבאנר מתחבא ולא מכסה את "הוספה לסל"
  await guest.goto(BASE + "/s/qkubk", { waitUntil: "networkidle" });
  await guest.locator(".grid button[aria-label]").first().click();
  await guest.waitForSelector("button[aria-label='הוספה לסל']", { timeout: 15000 });
  await guest.waitForTimeout(500);
  check("גיליון מוצר פתוח: באנר העוגיות מתחבא", (await guest.getAttribute("[data-testid=cookie-note]", "data-covered")) === "1");
  await guest.click("button[aria-label='הוספה לסל']", { timeout: 5000 });
  check("ו'הוספה לסל' לחיץ", true);
  await guest.goto(BASE + "/", { waitUntil: "networkidle" });
  check("אורחת רואה 'כבר פתחת דוכן?'", await guest.locator("a[href='/login']:has-text('כבר פתחת דוכן')").isVisible());

  /* ── הסיפור בגלילה (מרינה: "אתר בסגנון awwards עם גלילה שמספרת סיפור") ── */
  const story = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const storyErrs = [];
  story.on("pageerror", (e) => storyErrs.push(e.message));
  await story.goto(BASE + "/", { waitUntil: "networkidle" });
  check("הוק: 'לכל אחד יש טונות של…'", ((await story.textContent("[data-testid=scene-hero]")) ?? "").includes("לכל אחד יש"));
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
  await story.locator("[data-testid=home-riddle]").scrollIntoViewIfNeeded();
  await story.click("[data-testid=home-riddle] button:has-text('₪30')");
  check("חידה: תשובה נכונה מקבלת כוכב", ((await story.textContent("[data-testid=home-riddle-answer]")) ?? "").includes("נכון"));
  for (const id of ["home-learn", "home-kupa", "home-safety", "home-price"]) check(`קטע ${id} קיים`, (await story.locator(`[data-testid=${id}]`).count()) === 1);
  await story.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await story.waitForTimeout(500);
  check("בסוף: הכפתור הדביק נעלם (יש כפתור גדול בעמוד)", (await story.getAttribute("[data-testid=home-sticky-start]", "tabindex")) === "-1");
  await story.click("[data-testid=home-start]");
  await story.waitForURL("**/onboarding", { timeout: 15000 });
  check("'קדימה, בואו נקים את הדוכן' פותח את ההקמה", true);
  check("בלי שגיאות בסיפור", storyErrs.length === 0, storyErrs.join(" | "));
  // מסך צר מאוד ומחשב
  const narrow = await (await browser.newContext({ viewport: { width: 320, height: 640 } })).newPage();
  await narrow.goto(BASE + "/", { waitUntil: "networkidle" });
  check("בלי גלילה הצידה גם ב-320", await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desk.goto(BASE + "/", { waitUntil: "networkidle" });
  await desk.evaluate(() => window.scrollTo(0, innerHeight * 4));
  await desk.waitForTimeout(400);
  check("במחשב: בלי הפס הדביק למטה", !(await desk.locator("[data-testid=home-sticky-start]").isVisible()));
  // בלי תנועה: הכל גלוי, בלי לחכות להופעות
  const still = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
  await still.goto(BASE + "/", { waitUntil: "networkidle" });
  check("בלי תנועה: הקטעים גלויים מיד", await still.locator("[data-testid=home-safety] .home-reveal").first().evaluate((e) => getComputedStyle(e).opacity === "1"));

  /* מי שכבר יש לה דוכן */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const me = await ctx.newPage();
  await me.goto(BASE + "/login");
  await verifyPhone(me, "0501234567");
  await me.waitForURL("**/dashboard", { timeout: 20000 });
  // בודקים כל רגע בטעינה, לא רק בסוף — גם הבזק של השאלה הוא באג
  const seen = [];
  await me.exposeFunction("__seen", (v) => seen.push(v));
  await me.addInitScript(() => {
    const tick = () => {
      const a = [...document.querySelectorAll("a[href='/login']")].some((x) => x.textContent.includes("כבר פתחת דוכן"));
      if (a) window.__seen?.(true);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await me.goto(BASE + "/", { waitUntil: "networkidle" });
  await me.waitForSelector("[data-testid=my-store-card]", { timeout: 15000 });
  check("עם דוכן: כרטיס 'כבר יש לך דוכן'", await me.locator("[data-testid=my-store-card]").isVisible());
  // בדשבורד: העוגיות יושבות מעל שורת הניווט, לא עליה
  await me.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await me.waitForTimeout(900);
  const nav = await me.locator("nav[data-bottom-bar]").boundingBox();
  const note = await me.locator("[data-testid=cookie-note]").boundingBox();
  check("בדשבורד: העוגיות מעל שורת הניווט", !!note && !!nav && Math.abs(note.y + note.height - nav.y) <= 2, note && nav ? `${Math.round(note.y + note.height)} / ${Math.round(nav.y)}` : "חסר");
  await me.click("nav[data-bottom-bar] >> text=מוצרים");
  await me.waitForURL("**/dashboard/products");
  check("ושורת הניווט לחיצה (לא מכוסה)", true);
  await me.click("[data-testid=cookie-ok]");
  check("'הבנתי' סוגר", (await me.locator("[data-testid=cookie-note]").count()) === 0);
  check("ו'כבר פתחת דוכן?' לא מופיע אפילו לרגע", seen.length === 0, `${seen.length} פריימים`);
} finally {
  await browser.close();
  await closeHelper();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
