// E2E: "להוסיף את החנות כמו אפליקציה — לזהות אנדרואיד או אייפון ולפעול בהתאם".
//
// לכל טלפון/דפדפן — ההוראות שלו בדיוק:
//   אייפון ספארי · אייפון כרום · אינסטגרם (דפדפן פנימי) · אנדרואיד (עם ובלי
//   התקנה בלחיצה) · מחשב (לא מציגים) · כבר מותקן (לא מציגים).
// ו"לא עכשיו" מסתיר את ההצעה, אבל המקטע "אפליקציה בטלפון" תמיד שם.
import { chromium, devices } from "playwright";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const UA = {
  iosSafari: devices["iPhone 13"].userAgent,
  iosChrome: devices["iPhone 13"].userAgent.replace(/Version\/[\d.]+/, "CriOS/120.0.6099.119"),
  instagram: devices["iPhone 13"].userAgent + " Instagram 312.0.0.0 (iPhone14,5; iOS 17_0)",
  android: devices["Pixel 5"].userAgent,
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const jsErrors = [];
async function hubAs(ua, { standalone = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, hasTouch: true });
  if (standalone) {
    await ctx.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("standalone") ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q));
    });
  }
  const p = await ctx.newPage();
  p.on("pageerror", (e) => jsErrors.push(e.message));
  await p.goto(`${BASE}/login`);
  await verifyPhone(p, "0501234567");
  await p.waitForURL("**/dashboard", { timeout: 20000 });
  await p.goto(`${BASE}/dashboard/settings`);
  await p.waitForSelector("[data-testid=settings-hub]", { timeout: 20000 });
  await p.evaluate(() => localStorage.removeItem("duchan-install-dismissed"));
  await p.reload();
  await p.waitForSelector("[data-testid=settings-hub]", { timeout: 20000 });
  await p.waitForTimeout(600);
  return p;
}
const card = (p) => p.locator("[data-testid=settings-hub] [data-testid=install-card]");

/* ── אייפון, ספארי ── */
let p = await hubAs(UA.iosSafari);
check("אייפון: ההצעה מופיעה ב'החנות שלי'", (await card(p).count()) === 1);
{
  const hubText = (await p.textContent("[data-testid=settings-hub]")) ?? "";
  check("אין קוד שדלף למסך (activated_at / null)", !/activated_at|null\s*:|\?\s*\(/.test(hubText), hubText.slice(0, 80));
  check("דוכן שכבר פורסם — בלי כרטיס 'לפתוח להזמנות'", (await p.locator("[data-testid=publish-cta]").count()) === 0);
}
check("ומזהה אייפון", ((await p.textContent("[data-testid=install-device]")) ?? "").includes("אייפון"));
check("ספארי: שיתוף בתחתית ← הוספה למסך הבית",
  (await p.getAttribute("[data-testid=install-ios-steps]", "data-browser")) === "safari" &&
  ((await p.textContent("[data-testid=install-ios-steps]")) ?? "").includes("הוספה למסך הבית"));
await p.screenshot({ path: "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/install-ios.png" });
// "לא עכשיו" — נעלם מהבית, נשאר במקטע
await card(p).locator("button[aria-label='לא עכשיו']").click();
check("'לא עכשיו' מסתיר את ההצעה", (await card(p).count()) === 0);
if (!(await p.locator("[data-testid=hub-app]").isVisible())) await p.click("[data-testid=hub-more]");
await p.click("[data-testid=hub-app]");
await p.waitForSelector("[data-testid=section-app] [data-testid=install-card]");
check("אבל 'אפליקציה בטלפון' תמיד זמין", (await p.locator("[data-testid=section-app] [data-testid=install-ios-steps]").count()) === 1);
await p.context().close();

/* ── אייפון, כרום ── */
p = await hubAs(UA.iosChrome);
check("אייפון כרום: השיתוף למעלה ליד הכתובת",
  (await p.getAttribute("[data-testid=install-ios-steps]", "data-browser")) === "chrome" &&
  ((await p.textContent("[data-testid=install-ios-steps]")) ?? "").includes("ליד הכתובת"));
await p.context().close();

/* ── אינסטגרם — קודם לצאת לספארי ── */
p = await hubAs(UA.instagram);
check("אינסטגרם: מזהה דפדפן פנימי", (await p.getAttribute("[data-testid=install-card]", "data-platform")) === "inapp");
check("ומסביר לפתוח בספארי, עם העתקת לינק",
  ((await p.textContent("[data-testid=install-inapp]")) ?? "").includes("ספארי") &&
  (await p.locator("[data-testid=install-inapp] button:has-text('להעתיק את הלינק')").count()) === 1);
await p.context().close();

/* ── אנדרואיד ── */
p = await hubAs(UA.android);
check("אנדרואיד: מזהה אנדרואיד", ((await p.textContent("[data-testid=install-device]")) ?? "").includes("אנדרואיד"));
check("בלי התקנה בלחיצה — צעדים לתפריט ⋮", ((await p.textContent("[data-testid=install-android-steps]")) ?? "").includes("⋮"));
// כרום מציע התקנה — כפתור אחד שמפעיל אותה
await p.evaluate(() => {
  const e = new Event("beforeinstallprompt");
  e.prompt = async () => { window.__prompted = true; };
  e.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(e);
});
await p.waitForSelector("[data-testid=install-now]", { timeout: 5000 });
check("כשכרום מציע — כפתור 'להוסיף למסך הבית'", true);
await p.click("[data-testid=install-now]");
await p.waitForTimeout(400);
check("והלחיצה מפעילה את ההתקנה של הטלפון", (await p.evaluate(() => window.__prompted === true)));
check("ואחרי התקנה — ההצעה נעלמת", (await card(p).count()) === 0);
await p.screenshot({ path: "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/install-android.png" });
await p.context().close();

/* ── מחשב — זה לטלפון ── */
p = await hubAs(UA.desktop);
check("מחשב: בלי הצעה בבית", (await card(p).count()) === 0);
if (!(await p.locator("[data-testid=hub-app]").isVisible())) await p.click("[data-testid=hub-more]");
await p.click("[data-testid=hub-app]");
await p.waitForSelector("[data-testid=install-desktop]");
check("ובמקטע: הסבר לפתוח בטלפון", ((await p.textContent("[data-testid=install-desktop]")) ?? "").includes("בטלפון"));
await p.context().close();

/* ── כבר מותקן ── */
p = await hubAs(UA.iosSafari, { standalone: true });
check("כבר במסך הבית: בלי הצעה", (await card(p).count()) === 0);
if (!(await p.locator("[data-testid=hub-app]").isVisible())) await p.click("[data-testid=hub-more]");
await p.click("[data-testid=hub-app]");
// המקטע הוא עכשיו "אפליקציה והתראות": צעד המסך הבית כבר מסומן ✓, והבא הוא התראות
await p.waitForSelector("[data-testid=alerts-step-install][data-state=done]");
check("ובמקטע: הצעד 'לשמור במסך הבית' כבר מסומן", true);
check("והצעד הבא הוא להפעיל התראות", (await p.getAttribute("[data-testid=alerts-step-push]", "data-state")) === "current");
await p.context().close();

/* ── הכפתור בתחתית עיצוב הקטגוריות לא נחתך ── */
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const q = await ctx.newPage();
await q.goto(`${BASE}/login`);
await verifyPhone(q, "0501234567");
await q.waitForURL("**/dashboard", { timeout: 20000 });
const vp = await q.evaluate(() => document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "");
check("viewport-fit=cover — כדי שהמרווח לפס הבית של האייפון יעבוד", vp.includes("viewport-fit=cover"), vp);
const nav = await q.locator("nav").first().boundingBox();
check("שורת הניווט בתוך המסך", !!nav && nav.y + nav.height <= 844 + 1, JSON.stringify(nav));
await ctx.close();

check("אין שגיאות ג׳אווהסקריפט", jsErrors.length === 0, jsErrors.join(" | "));
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} install checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
