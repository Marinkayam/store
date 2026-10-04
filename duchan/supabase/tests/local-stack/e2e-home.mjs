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
