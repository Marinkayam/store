// E2E: עולם דוכן — אב־טיפוס (app/world-lab).
//
// דף ניסוי עם נתוני דוגמה בלבד. הבדיקה מוודאת שמה שהדף מבטיח קורה בפועל:
//   1. מתחילים בחנות, יוצאים לחזית, מתרחקים לרחוב, לקניון, לבית הספר ולעיר, וחוזרים.
//   2. אותו עולם בכל הרמות: אותם דוכנים, רק בפחות פירוט ככל שמתרחקים.
//   3. הדוכן גדל (דוכן, דוכן מואר, חנות, חנות גדולה) לפי נקודות על שיתוף, הזמנות
//      ובניית הדוכן. מכירות לא נספרות, והנקודות עצמן נראות רק לבעלת הדוכן.
//   4. מקום פנוי הוא מקום פנוי. אין דוכן שלא קיים ברשימת החנויות.
//   5. השם הפרטי מופיע רק בתוך הקניון, לא בדף החנות.
//   6. הזמנת חברים: הקישור לא חושף חנויות, מצטרפים רק באישור הורה, ואפשר
//      להצטרף כדי לפתוח דוכן או רק כדי לבקר. הורה שלא אישר: שום דבר לא משתנה.
//   7. העולם גדל בשלבים: רמה שעוד אין בה מה לראות נעולה, ומסבירה מתי תיפתח.
//   8. קניונים של כיתות אחרות פתוחים לביקור: רואים דוכנים ומוצרים, לא שמות פרטיים.
//   9. אותו עולם מחזיק גם שכונה (כיכרות ושווקים) ולא רק בית ספר, ויש בו יום שוק.
//  10. הדף לא פונה לשרת או למסד, ובסביבת הפקה הוא לא קיים (404).
//  11. מקלדת, "פחות תנועה" ובדיקת נגישות אוטומטית.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const URL = `${BASE}/world-lab`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MY_STORE = "הסקווישים של נוני";
const MY_NAME = "נועה";
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const SHARP of [false, true]) {
const tag = SHARP ? "[חידוד מקרוב] " : "";
const ck = (n, ok, d = "") => check(tag + n, ok, d);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const pageErrors = [];
const dataCalls = [];
p.on("pageerror", (e) => pageErrors.push(e.message));
p.on("request", (r) => {
  const u = r.url();
  if (/\/api\/|:8000\/|:3001\/|supabase/i.test(u)) dataCalls.push(u);
});
await p.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("wl-whatsnew-seen", "1"); } catch {} });

const root = () => p.locator("[data-testid=wl-root]");
const level = async () => Number(await root().getAttribute("data-level"));
const settle = async () => {
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-root]")?.getAttribute("data-moving") === "0", null, { timeout: 8000 });
  await p.waitForTimeout(120);
};
const toLevel = async (n) => {
  await p.click(`[data-testid=wl-level-${n}]`);
  await p.waitForFunction((want) => document.querySelector("[data-testid=wl-root]")?.getAttribute("data-level") === String(want), n, { timeout: 15000 });
  for (let quiet = 0; quiet < 3;) { await p.waitForTimeout(260); quiet = (await root().getAttribute("data-moving")) === "0" && (await level()) === n ? quiet + 1 : 0; }
};
const lab = async (id) => { await p.click("[data-testid=wl-lab]"); await p.click(`[data-testid=${id}]`); await p.keyboard.press("Escape"); await p.waitForTimeout(350); };
const place = async () => ((await p.textContent("[data-testid=wl-place]")) ?? "").trim();
const bubble = async () => ((await p.locator("[data-testid=wl-bubble]").first().textContent().catch(() => "")) ?? "").trim();
const text = async (sel) => ((await p.textContent(sel)) ?? "").trim();
const lods = () => p.evaluate(() => {
  const out = { near: 0, mid: 0, far: 0, stall: 0, empty: 0 };
  for (const el of document.querySelectorAll(".wl-plot[data-kind]")) {
    const k = el.getAttribute("data-kind");
    if (k === "stall" || k === "empty") out[k]++;
    if (k === "stall") out[el.getAttribute("data-lod")]++;
  }
  return out;
});
const locked = () => p.evaluate(() => [0, 1, 2, 3, 4].filter((i) => document.querySelector(`[data-testid=wl-level-${i}]`)?.getAttribute("data-locked") === "1"));
const stage = async (n) => {
  await p.click("[data-testid=wl-lab]");
  await p.click(`[data-testid=wl-stage-${n}]`);
  await p.keyboard.press("Escape");
  await settle();
  await p.waitForTimeout(250);
  await settle();
};
const axe = async (label) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include(".wl-root").analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ck(`נגישות, ${label}: בלי הפרות חמורות`, bad.length === 0, bad.map((v) => `${v.id}×${v.nodes.length} ${v.nodes[0]?.target?.join(" ")}`).join(" | "));
};
/** מקום פנוי → הזמנה → הצד של מי שקיבל את הקישור */
const inviteTo = async (plot) => {
  // אם המקום מחוץ למסך, מיקוד מזיז אליו את המצלמה (כמו במקלדת)
  await p.locator(`[data-testid=wl-plot-${plot}]`).focus();
  await settle();
  await p.click(`[data-testid=wl-plot-${plot}]`);
  await settle();
  await p.waitForSelector("[data-testid=wl-invite]");
  await p.click("[data-testid=wl-invite]");
};

  await p.goto(URL, { waitUntil: "networkidle" });

  /* ── 1. מתחילים בחנות ── */
  ck("נפתח על החנות שלי", (await p.locator("[data-testid=wl-store] h1").textContent()) === MY_STORE);
  ck("הכתובת מציינת איפה נמצאים (#store)", (await p.evaluate(() => location.hash)) === "#store");
  ck("כתוב שזו הדמיה של דף החנות", (await p.locator("[data-testid=wl-store] .wl-sim-tag").count()) === 1);
  ck("בדף החנות אין את השם הפרטי של בעלת הדוכן", !(await text("[data-testid=wl-store]")).includes(MY_NAME));
  await axe("החנות");

  /* ── 2. החוצה אל החזית ── */
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.waitForTimeout(500);
  ck("יוצאים אל החזית של אותה חנות", (await level()) === 4 && (await place()) === MY_STORE, await place());
  const near = p.locator(".wl-plot[data-mine='1'] svg.wl-near");
  ck("החזית היא הדוכן האמיתי של המשחק (KupaStall)", (await near.count()) === 1 && ((await near.getAttribute("aria-label")) ?? "").startsWith("איור הדוכן"));
  ck("על השלט שם החנות", ((await near.textContent()) ?? "").includes("סקווישי נוני"));
  ck("על הדלפק שלושה מוצרים של החנות, בלי תוויות המחיר המצוירות", (await near.locator("[data-shelf] > g").count()) === 3 && !((await near.textContent()) ?? "").includes("₪"));
  ck("רק הדוכן שבמרכז מצויר בפירוט מלא", (await lods()).near === 1);
  ck("אין כפתור יום ולילה: האור הולך לפי השעה", (await p.locator("[data-testid=wl-night]").count()) === 0);
  // שאר הבדיקה רצה באור יום, כדי שהתוצאה לא תהיה תלויה בשעה שבה מריצים אותה
  await p.click("[data-testid=wl-lab]");
  await p.click("[data-testid=wl-time-day]");
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-root]").getAttribute("data-night") !== "1");
  await p.waitForTimeout(400);
  if (SHARP) {
    // אותה תמונה בשתי דרכי הציור: הדוכן נשאר באותו מקום ובאותו גודל
    const box = () => p.locator(".wl-plot[data-mine='1']").boundingBox();
    const off = await box();
    await p.click("[data-testid=wl-lab]");
    await p.click("[data-testid=wl-sharp]");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
    const on = await box();
    const same = (a, b) => ["x", "y", "width", "height"].every((k) => Math.abs(a[k] - b[k]) < 1.5);
    const zoom = await p.locator(".wl-plane").evaluate((el) => el.style.zoom);
    ck("חידוד מקרוב: הדוכן באותו מקום ובאותו גודל, והעולם מצויר בגודל האמיתי (zoom)", same(off, on) && Number(zoom) > 1, `${JSON.stringify(off)} ${JSON.stringify(on)} zoom=${zoom}`);
  }
  await axe("החזית");

  /* ── 3. עיצוב ── */
  await p.click("[data-testid=wl-decorate]");
  await p.click("[data-testid=wl-awning-melon]");
  const aw = await p.locator(".wl-plot[data-mine='1']").evaluate((el) => getComputedStyle(el).getPropertyValue("--aw").trim());
  ck("בחירת צבע סוכך משנה את הדוכן מיד", aw.toLowerCase() === "#c9403a", aw);
  await settle();
  const before = await p.locator(".wl-plot[data-mine='1'] [data-deco=open-sign]").count();
  await p.click("[data-testid=wl-deco-openSign]");
  ck("קישוט שנבחר מופיע על הדוכן", before === 0 && (await p.locator(".wl-plot[data-mine='1'] [data-deco=open-sign]").count()) === 1);
  await axe("גיליון העיצוב");
  await p.keyboard.press("Escape");

  /* ── 3ב. הדוכן גדל: ותיקות, מוצרים, שיתוף ── */
  const myTier = () => p.locator(".wl-plot[data-mine='1']").getAttribute("data-tier");
  ck("מתחילים מדוכן רגיל, עם הנקודות שלי על הכרטיס", (await myTier()) === "1" && (await text("[data-testid=wl-points]")).includes("60") && (await text("[data-testid=wl-points]")).includes("דוכן מואר"), await text("[data-testid=wl-points]"));
  await p.click("[data-testid=wl-points]");
  await p.waitForTimeout(450);
  const growText = await text("[data-testid=wl-sheet-grow]");
  ck("ההסבר: ארבע דרגות, שישה מקורות נקודות, ומכירות לא נספרות", (await p.locator(".wl-tiers li").count()) === 4 && (await p.locator(".wl-sources li").count()) === 6 && growText.includes("מכירות לא נספרות"));
  ck("רואים מאיפה הנקודות שלי: שלושה שבועות ושלושה מוצרים", (await text("[data-testid=wl-src-week]")).includes("3 × 10") && (await text("[data-testid=wl-src-product]")).includes("3 × 10") && (await text("[data-testid=wl-grow-now]")).includes("60"));
  await axe("גיליון הצמיחה");
  await p.click("[data-testid=wl-sim-visits]");
  ck("שיתוף בלי לעבור סף: נקודות עולות, הדוכן לא משתנה", (await myTier()) === "1" && (await text("[data-testid=wl-grow-msg]")).includes("קיבלתם 25 נקודות") && (await text("[data-testid=wl-grow-now]")).includes("85"), await text("[data-testid=wl-grow-now]"));
  await p.click("[data-testid=wl-sim-week]");
  await p.click("[data-testid=wl-sim-week]");
  await p.waitForSelector("[data-testid=wl-bubble]");
  ck("ותיקות: עוד שבועיים מעבירים את 100, והדוכן נהיה דוכן מואר", (await myTier()) === "2" && (await bubble()).includes("דוכן מואר") && (await p.locator("[data-testid=wl-sheet-grow]").count()) === 0, await bubble());
  await p.click("[data-testid=wl-points]");
  for (let i = 0; i < 7; i++) await p.click("[data-testid=wl-sim-product]");
  ck("מוצרים: עשרה מוצרים עם תמונה", (await text("[data-testid=wl-src-product]")).includes("10 × 10") && (await text("[data-testid=wl-grow-now]")).includes("175"), await text("[data-testid=wl-grow-now]"));
  await p.click("[data-testid=wl-sim-product]");
  ck("מוצר אחד-עשר לא מוסיף נקודות", (await text("[data-testid=wl-grow-msg]")).includes("כבר יש 10 מוצרים") && (await text("[data-testid=wl-grow-now]")).includes("175"));
  for (let i = 0; i < 3; i++) await p.click("[data-testid=wl-sim-visits]");
  await p.waitForSelector("[data-testid=wl-bubble]");
  await settle();
  ck("עוברים 250 נקודות: מאחורי הדוכן קם מבנה של חנות", (await myTier()) === "3" && (await p.locator(".wl-plot[data-mine='1'] .wl-shop-back[data-shop='3']").count()) === 1);
  ck("החנות נכנסת כולה למסך, מעל הכרטיס ומתחת לסרגל העליון", await p.evaluate(() => {
    const r = document.querySelector(".wl-plot[data-mine='1'] .wl-shop-back > g").getBoundingClientRect();
    const card = document.querySelector("[data-testid=wl-card]").getBoundingClientRect();
    return r.top >= 56 && r.bottom <= card.top + 4 && r.left >= 0 && r.right <= innerWidth;
  }));
  await p.click("[data-testid=wl-bubble-x]");
  ck("לבועה יש איקס שסוגר אותה", (await p.locator("[data-testid=wl-bubble]").count()) === 0);
  await p.click("[data-testid=wl-card-x]");
  ck("לכרטיס יש איקס שסוגר אותו", (await p.locator("[data-testid=wl-card]").count()) === 0);
  await p.click("[data-testid=wl-out]");
  await settle();
  await p.click(".wl-plot[data-mine='1']");
  await settle();
  ck("כשמתרחקים וחוזרים הכרטיס מופיע שוב", (await p.locator("[data-testid=wl-card]").count()) === 1);
  ck("הדוכן עצמו נשאר החזית: אותו שלט ואותם מוצרים", ((await near.textContent()) ?? "").includes("סקווישי נוני") && (await near.locator("[data-shelf] > g").count()) === 3);

  /* ── 4. מתרחקים: רחוב, קניון, בית ספר, עיר ── */
  await p.click("[data-testid=wl-out]");
  await settle();
  let l = await lods();
  ck("רחוב: אותם דוכנים בפירוט בינוני, ואף אחד בפירוט מלא", (await level()) === 3 && (await place()) === "רחוב הסוככים" && l.near === 0 && l.mid >= 3, JSON.stringify(l));
  ck("ברחוב שמונה דוכנים ומקום פנוי אחד ליד שלי", (await p.locator(".wl-plot[data-kind=stall][data-testid^='wl-plot-A']").count()) === 8 && (await p.locator("[data-testid=wl-plot-A4][data-kind=empty]").count()) === 1);
  const plates = await p.locator(".wl-plate").allTextContents();
  const storeNames = await p.locator(".wl-plate > span").allTextContents();
  ck("לכל דוכן לוחית עם השם, והשלי מסומן", plates.length === 11 && plates.some((t) => t.includes(MY_STORE) && t.includes("שלי")), String(plates.length));
  ck("בתוך הקניון רואים גם את השם הפרטי, כדי לזהות של מי הדוכן", plates.some((t) => t.includes(MY_STORE) && t.includes(MY_NAME)));
  const fit = await p.evaluate(() => {
    const r = [...document.querySelectorAll("[data-testid^='wl-plot-A'][data-kind=stall]")].map((el) => el.getBoundingClientRect().left).sort((a, b) => a - b);
    const pitch = r[1] - r[0];
    return { pitch, widest: Math.max(...[...document.querySelectorAll(".wl-plate")].map((el) => el.getBoundingClientRect().width)) };
  });
  // מקלדת: דוכן שמחוץ למסך מקבל מיקוד. העולם לא נגלל; המצלמה זזה אליו.
  await p.locator("[data-testid=wl-plot-A0]").focus();
  await settle();
  const focused = await p.evaluate(() => {
    const v = document.querySelector(".wl-view");
    const r = document.querySelector("[data-testid=wl-plot-A0]").getBoundingClientRect();
    return { sx: v.scrollLeft, sy: v.scrollTop, inView: r.left >= 0 && r.right <= innerWidth };
  });
  ck("דוכן מחוץ למסך שמקבל מיקוד: העולם לא נגלל, והמצלמה זזה אליו", focused.sx === 0 && focused.sy === 0 && focused.inView, JSON.stringify(focused));
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 15000 });
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.click("[data-testid=wl-out]");
  await settle();
  ck("לוחיות של דוכנים שכנים לא עולות זו על זו", fit.widest <= fit.pitch, JSON.stringify(fit));
  const tiers = await p.locator(".wl-plot[data-kind=stall]").evaluateAll((els) => els.map((el) => el.getAttribute("data-tier")));
  ck("בכיתה יש מבנים בכל הגדלים, מדוכן ועד חנות גדולה", ["1", "2", "3", "4"].every((t) => tiers.includes(t)), tiers.join(","));
  ck("הצבע שבחרתי נשאר גם מרחוק", (await p.locator(".wl-plot[data-mine='1']").evaluate((el) => getComputedStyle(el).getPropertyValue("--aw").trim().toLowerCase())) === "#c9403a");
  await axe("הרחוב");

  await p.click("[data-testid=wl-out]");
  await settle();
  l = await lods();
  ck("קניון: כל הדוכנים בפירוט נמוך", (await level()) === 2 && (await place()).startsWith("הקניון של") && l.mid === 0 && l.near === 0 && l.far === l.stall, JSON.stringify(l));
  ck("גם מרחוק רואים מי חנות ומי דוכן", (await p.locator(".wl-plot[data-mine='1'] .wl-shop-back").count()) === 1 && (await p.locator(".wl-plot[data-tier='1'] .wl-shop-back").count()) === 0);
  ck("בקניון כמה אזורי מסחר", (await p.locator("[data-testid^='wl-hit-zone-']").count()) === 4);

  await p.click("[data-testid=wl-out]");
  await settle();
  ck("בית ספר: הקניון של הכיתה הוא אחד מכמה", (await level()) === 1 && (await place()) === "בית ספר הדקל" && (await p.evaluate(() => location.hash)) === "#school", await place());
  ck("שתי שכבות ושש כיתות", (await p.locator(".wl-grade").count()) === 2 && (await p.locator("[data-testid^='wl-hit-class-']").count()) === 6);
  ck("הכיתה שלי מסומנת, עם מספר הדוכנים שלה", (await p.locator(".wl-class[data-mine='1']").count()) === 1 && (await text(".wl-class[data-mine='1']")).includes("11 דוכנים"), await text(".wl-class[data-mine='1']"));
  /* ── 4ב. ביקור בקניון של כיתה אחרת ── */
  await p.click("[data-testid=wl-hit-class-h1]");
  await settle();
  l = await lods();
  ck("נוגעים בכיתה אחרת ונכנסים לקניון שלה", (await level()) === 2 && (await place()) === "הקניון של ה׳1" && l.stall === 5, `${await place()} ${JSON.stringify(l)}`);
  ck("הדוכן שלי לא נמצא שם", (await p.locator(".wl-plot[data-mine='1']").count()) === 0);
  await p.click("[data-testid=wl-hit-zone-A]");
  await settle();
  const visitPlates = await p.locator(".wl-plate").allTextContents();
  ck("בביקור רואים שמות של דוכנים, לא שמות פרטיים של ילדים", visitPlates.length === 5 && (await p.locator(".wl-plate i").count()) === 0 && !visitPlates.some((t) => t.includes("שלי")), visitPlates.join(" | "));
  await p.click("[data-testid=wl-plot-A3]");
  await settle();
  await p.waitForSelector("[data-testid=wl-enter]");
  ck("בכרטיס של דוכן בכיתה אחרת: נכנסים לחנות, בלי נקודות ובלי עיצוב", (await p.locator("[data-testid=wl-points]").count()) === 0 && (await p.locator("[data-testid=wl-decorate]").count()) === 0);
  const visitName = await place();
  await p.click("[data-testid=wl-enter]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 15000 });
  ck("אפשר להיכנס לחנות ולראות מה מוכרים", (await p.locator("[data-testid=wl-store] h1").textContent()) === visitName && (await p.locator("[data-testid=wl-store] button").count()) >= 3, visitName);
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.click("[data-testid=wl-out]");
  await settle();
  await p.click("[data-testid=wl-plot-A4]");
  await settle();
  await p.waitForSelector("[data-testid=wl-card]");
  ck("מקום פנוי בכיתה אחרת: אי אפשר להזמין אליו", (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "empty" && (await p.locator("[data-testid=wl-invite]").count()) === 0);
  await axe("ביקור בכיתה אחרת");
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 20000 });
  ck("'הדוכן שלי' מחזיר מהביקור הביתה", (await p.locator("[data-testid=wl-store] h1").textContent()) === MY_STORE);
  await p.click("[data-testid=wl-exit]");
  await settle();
  ck("וחזרנו לקניון של הכיתה שלי", (await place()) === MY_STORE && (await p.locator(".wl-plot[data-mine='1']").count()) === 1);
  await toLevel(1);
  await p.click("[data-testid=wl-hit-class-h3]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-bubble]")?.textContent.includes("עוד אין דוכנים"));
  ck("כיתה בלי דוכנים היא מגרש ריק, לא קניון מדומה", (await text("[data-testid=wl-class-h3]")).includes("מקום פנוי"));
  await axe("בית הספר");

  await p.click("[data-testid=wl-out]");
  await settle();
  ck("עיר: בית הספר הוא חלק מעיר שלמה", (await level()) === 0 && (await place()) === "העיר" && (await p.evaluate(() => location.hash)) === "#city");
  ck("בעיר שני בתי ספר, כל אחד בשמו", (await p.locator(".wl-label[data-lv='0']").allTextContents()).filter((t) => t.startsWith("בית ספר")).length === 2);
  ck("בעיר אין כפתור להתרחק עוד", (await p.locator("[data-testid=wl-out]").count()) === 0);
  await axe("העיר");

  /* ── 5. חוזרים פנימה, וכפתור החזרה של הטלפון ── */
  await p.click("[data-testid=wl-hit-school]");
  await settle();
  await p.click("[data-testid=wl-hit-class-h2]");
  await settle();
  await p.click("[data-testid=wl-hit-zone-A]");
  await settle();
  ck("נגיעה בבית הספר, בכיתה ואז ברחוב מקרבת חזרה", (await level()) === 3);
  await p.goBack();
  await settle();
  ck("כפתור החזרה של הטלפון מרחיק רמה אחת", (await level()) === 2, String(await level()));

  /* ── 6. הפתעות ── */
  await p.click("[data-testid=wl-hit-zone-P]");
  await settle();
  await p.click("[data-testid=wl-surprise-fountain]");
  ck("נגיעה במזרקה: הפתעה נספרת", (await text("[data-testid=wl-found]")).includes("1/9") && (await p.locator("[data-testid=wl-bubble]").count()) === 1, await text("[data-testid=wl-found]"));

  /* ── 7. "הדוכן שלי" ── */
  await p.click("[data-testid=wl-level-2]");
  await settle();
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 15000 });
  ck("'הדוכן שלי' מחזיר ישר לחנות, מכל מקום", (await p.locator("[data-testid=wl-store] h1").textContent()) === MY_STORE);
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.click("[data-testid=wl-out]");
  await settle();

  /* ── 8. הזמנת חברים: פותחים דוכן ── */
  await inviteTo("A4");
  const inviteText = await text("[data-testid=wl-sheet-invite]");
  ck("ההזמנה מסבירה: קישור לאחד, לשבוע, באישור הורה, בלי לחשוף חנויות",
    inviteText.includes("אחת") && inviteText.includes("לשבוע") && inviteText.includes("הורה אישר") && inviteText.includes("לא את החנויות"));
  await p.waitForTimeout(450); // אחרי אנימציית הפתיחה, כדי למדוד את הצבעים הסופיים
  await axe("גיליון ההזמנה");
  await p.click("[data-testid=wl-invite-send]");
  ck("אחרי ההזמנה המקום מסומן, ונשאר מקום פנוי", (await text("[data-testid=wl-plot-A4]")).includes("הזמנה נשלחה") && (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "empty");
  await p.click("[data-testid=wl-invite-cancel]");
  ck("אפשר לבטל הזמנה שנשלחה", !(await text("[data-testid=wl-plot-A4]")).includes("הזמנה נשלחה"));
  await p.click("[data-testid=wl-invite]");
  await p.click("[data-testid=wl-invite-send]");

  await p.click("[data-testid=wl-invite-view]");
  const landing = await text("[data-testid=wl-invite-sim]");
  const others = storeNames.filter((n) => n && n !== MY_STORE);
  ck("מי שפתח את הקישור רואה מי הזמין ולאן", landing.includes(`${MY_NAME} מזמינה אתכם`) && landing.includes("ה׳2"));
  ck("הקישור לא חושף אף חנות של הכיתה", others.length >= 7 && !others.some((n) => landing.includes(n)) && !landing.includes(MY_STORE));
  await p.waitForTimeout(450); // אחרי אנימציית הפתיחה, כדי למדוד את הצבעים הסופיים
  await axe("דף ההזמנה");
  await p.click("[data-testid=wl-join-store]");
  await p.fill("#wl-invitee-name", "גלי");
  await p.click("[data-testid=wl-join-next]");
  const parent = await text("[data-testid=wl-parent-view]");
  ck("ההורה רואה מה ייחשף ולמי לפני שהוא מאשר", parent.includes("גלי") && parent.includes("רוצה לפתוח דוכן") && parent.includes("בלי שם משפחה") && parent.includes("ילדים והורים מבית הספר") && parent.includes("רק הכיתה") && parent.includes("לא רואה כלום"), parent);
  ck("עד שההורה אישר, לא נפתח דוכן", (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "empty");
  await p.click("[data-testid=wl-parent-yes]");
  await p.fill("#wl-invitee-store", "הצמידים של גלי");
  await p.click("[data-testid=wl-join-open]");
  await p.click("[data-testid=wl-join-done]");
  await settle();
  ck("אחרי האישור נפתח דוכן אמיתי במקום הפנוי, והמצלמה נוחתת עליו",
    (await level()) === 4 && (await place()) === "הצמידים של גלי" && (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "stall", await place());
  ck("על פתיחת דוכן בהזמנתי מקבלים נקודות", (await bubble()).includes("קיבלתם 60 נקודות"), await bubble());
  ck("הנקודות של אחרים לא מוצגות: בכרטיס של דוכן אחר אין נקודות", (await p.locator("[data-testid=wl-card]").count()) === 1 && (await p.locator("[data-testid=wl-points]").count()) === 0);
  await p.click("[data-testid=wl-out]");
  await settle();
  ck("הדוכן החדש מסומן 'חדש' ברחוב", (await p.locator(".wl-plate").allTextContents()).some((t) => t.includes("הצמידים של גלי") && t.includes("חדש")));
  ck("עכשיו תשעה דוכנים ברחוב, בלי מקום פנוי", (await p.locator(".wl-plot[data-kind=stall][data-testid^='wl-plot-A']").count()) === 9);

  /* ── 9. הזמנת חברים: הורה לא מאשר, ומשפחה שרק מבקרת ── */
  await p.click("[data-testid=wl-level-2]");
  await settle();
  await p.click("[data-testid=wl-hit-zone-B]");
  await settle();
  const stallsBefore = (await lods()).stall;
  await inviteTo("B0");
  await p.click("[data-testid=wl-invite-send]");
  await p.click("[data-testid=wl-invite-view]");
  await p.click("[data-testid=wl-join-visit]");
  await p.click("[data-testid=wl-join-next]");
  ck("מסלול ביקור: ההורה מתבקש לאשר ביקור, לא דוכן", (await text("[data-testid=wl-parent-view]")).includes("רוצה לבקר") && !(await text("[data-testid=wl-parent-view]")).includes("את הדוכן והמוצרים"));
  await p.click("[data-testid=wl-parent-no]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-bubble]")?.textContent.includes("לא אישר"));
  ck("הורה לא אישר: שום דבר לא נפתח, והמקום חוזר להיות פנוי",
    (await lods()).stall === stallsBefore && (await p.locator("[data-testid=wl-plot-B0]").getAttribute("data-kind")) === "empty" && !(await text("[data-testid=wl-plot-B0]")).includes("הזמנה נשלחה"));
  await p.waitForSelector("[data-testid=wl-invite]");
  await p.click("[data-testid=wl-invite]");
  await p.click("[data-testid=wl-invite-send]");
  await p.click("[data-testid=wl-invite-view]");
  await p.click("[data-testid=wl-join-visit]");
  await p.click("[data-testid=wl-join-next]");
  await p.click("[data-testid=wl-parent-yes]");
  await p.click("[data-testid=wl-join-done]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-bubble]")?.textContent.includes("מבקרת"));
  ck("גם על משפחה שהצטרפה לבקר מקבלים נקודות", (await bubble()).includes("קיבלתם 20 נקודות"), await bubble());
  ck("משפחה בלי חנות מצטרפת כמבקרת, והמקום נשאר פנוי", (await lods()).stall === stallsBefore && (await p.locator("[data-testid=wl-plot-B0]").getAttribute("data-kind")) === "empty");

  /* ── 9ב. יום שוק ── */
  const myPoints = async () => parseInt(await text("[data-testid=wl-points]"), 10);
  await toLevel(2);
  ck("יום שוק בקרוב: שלט בכיכר עם השם והמועד", (await text("[data-testid=wl-market-label]")).includes("יריד כיתתי") && (await text("[data-testid=wl-market-label]")).includes("יום שישי"), await text("[data-testid=wl-market-label]"));
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 20000 });
  await p.click("[data-testid=wl-exit]");
  await settle();
  ck("מהדוכן שלי אפשר להירשם ליום השוק", (await p.locator("[data-testid=wl-market-join]").count()) === 1 && (await p.locator(".wl-plot[data-mine='1']").getAttribute("data-fest")) === null);
  await p.click("[data-testid=wl-market-join]");
  ck("אחרי ההרשמה יש בלונים על הדוכן שלי", (await p.locator(".wl-plot[data-mine='1']").getAttribute("data-fest")) === "1" && (await p.locator(".wl-plot[data-mine='1'] .wl-fest").count()) === 1 && (await p.locator("[data-testid=wl-market-in]").count()) === 1);
  const ptsBefore = await myPoints();
  await lab("wl-market-on");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-bubble]")?.textContent.includes("30 נקודות"));
  ck("ביום השוק עצמו מקבלים 30 נקודות", (await myPoints()) === ptsBefore + 30, `${ptsBefore} → ${await myPoints()}`);
  await lab("wl-market-soon");
  await lab("wl-market-on");
  ck("והנקודות ניתנות פעם אחת", (await myPoints()) === ptsBefore + 30);
  await toLevel(2);
  const fest = await p.locator(".wl-plot[data-fest='1']").count();
  ck("יום שוק היום: הכיכר מקושטת, ויש בה עוד מבקרים", (await text("[data-testid=wl-market-label]")).includes("היום") && (await p.locator("[data-market-art]").count()) === 1 && (await p.locator("[data-market-crowd]").count()) === 1);
  ck("משתתפים רק הדוכנים שנרשמו", fest >= 2 && fest < (await lods()).stall, String(fest));
  await lab("wl-market-off");
  ck("בלי יום שוק: אין שלט ואין בלונים", (await p.locator("[data-testid=wl-market-label]").count()) === 0 && (await p.locator(".wl-plot[data-fest='1']").count()) === 0 && (await p.locator("[data-market-art]").count()) === 0);

  /* ── 9ג. אותו עולם כשכונה ── */
  await lab("wl-kind-hood");
  const ladder = (await p.locator("[data-testid^='wl-level-']").allTextContents()).map((t) => t.trim());
  ck("שכונה: הסולם הוא עיר, שכונה, שוק, רחוב, דוכן", ladder.join(",") === "עיר,שכונה,שוק,רחוב,דוכן", ladder.join(","));
  ck("הקניון של הכיתה הוא עכשיו השוק של הכיכר", (await place()) === "השוק של כיכר התמר", await place());
  await toLevel(1);
  ck("במקום בית ספר: שכונה עם כיכרות, בתים ומרכז קהילתי", (await place()) === "שכונת הדקלים" && (await text("[data-testid=wl-class-h1]")).includes("כיכר הרימון") && (await p.locator("[data-place=hood]").count()) === 1 && (await p.locator(".wl-grade").count()) === 0, await text("[data-testid=wl-class-h1]"));
  await p.click("[data-testid=wl-hit-class-v3]");
  await settle();
  ck("גם בשכונה מבקרים בשוק של כיכר אחרת", (await place()) === "השוק של כיכר השקד" && (await lods()).stall === 3, await place());
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 20000 });
  await p.click("[data-testid=wl-exit]");
  await settle();
  ck("אותו דוכן, אותה חזית, גם בשכונה", (await place()) === MY_STORE && ((await p.locator(".wl-plot[data-mine='1'] svg.wl-near").textContent()) ?? "").includes("סקווישי נוני"));
  await lab("wl-kind-class");
  ck("חוזרים לכיתה: הסולם חוזר לבית ספר ולקניון", (await p.locator("[data-testid^='wl-level-']").allTextContents()).map((t) => t.trim()).join(",") === "עיר,בית ספר,קניון,רחוב,דוכן");

  /* ── 10. העולם גדל בשלבים ── */
  await stage(1);
  l = await lods();
  ck("דוכן אחד: הדוכן שלי לבד, עם שני מקומות פנויים לידו", l.stall === 1 && l.empty === 2, JSON.stringify(l));
  ck("דוכן אחד: הקניון, בית הספר והעיר נעולים", (await level()) >= 3 && JSON.stringify(await locked()) === "[0,1,2]", `${await level()} ${JSON.stringify(await locked())}`);
  await p.click("[data-testid=wl-level-3]");
  await settle();
  ck("ברמה הכי רחוקה שפתוחה אין כפתור להתרחק", (await p.locator("[data-testid=wl-out]").count()) === 0);
  await p.click("[data-testid=wl-level-2]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-bubble]")?.textContent.includes("3 דוכנים"));
  ck("רמה נעולה מסבירה מתי תיפתח, ולא זזים אליה", (await level()) === 3);
  await p.keyboard.press("Escape");
  await settle();
  ck("גם במקלדת לא יוצאים מעבר למה שפתוח", (await level()) === 3);

  await stage(2);
  await p.click("[data-testid=wl-level-2]");
  await settle();
  l = await lods();
  ck("שלושה דוכנים: הקניון נפתח, עם שלושה דוכנים ושני מקומות פנויים", (await level()) === 2 && l.stall === 3 && l.empty === 2 && JSON.stringify(await locked()) === "[0,1]", JSON.stringify(l));
  ck("אין דוכן מדומה: כל השאר גינה, לא דוכן", (await p.locator(".wl-plot[data-kind=garden]").count()) === 9);
  ck("הסמטה נעולה ומסבירה מתי תיפתח", (await p.locator(".wl-label[data-lv='2']").allTextContents()).some((t) => t.includes("נפתחת ב־8 דוכנים")));

  await stage(5);
  await p.click("[data-testid=wl-level-1]");
  await settle();
  ck("עוד כיתות: בית הספר נפתח, והעיר עדיין נעולה", (await level()) === 1 && JSON.stringify(await locked()) === "[0]" && (await text("[data-testid=wl-class-h1]")).includes("5 דוכנים"), await text("[data-testid=wl-class-h1]"));
  await stage(6);
  ck("עוד בית ספר: הכול פתוח", JSON.stringify(await locked()) === "[]");

  /* ── 11. יום ולילה ── */
  await p.click("[data-testid=wl-lab]");
  await p.click("[data-testid=wl-time-night]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-root]").getAttribute("data-night") === "1", null, { timeout: 4000 });
  await p.click("[data-testid=wl-time-day]");
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-root]").getAttribute("data-night") !== "1", null, { timeout: 4000 });
  await p.keyboard.press("Escape");
  ck("מתוך 'ניסוי' אפשר לקבוע יום או לילה", true);
  for (const [when, want] of [["2026-07-10T12:00:00+03:00", "0"], ["2026-07-10T21:30:00+03:00", "1"], ["2026-12-10T17:30:00+02:00", "1"], ["2026-07-10T17:30:00+03:00", "0"]]) {
    const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Jerusalem" });
    const t = await tctx.newPage();
    await t.clock.setFixedTime(new Date(when));
    await t.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("wl-whatsnew-seen", "1"); } catch {} });
    await t.goto(URL, { waitUntil: "networkidle" });
    await t.waitForTimeout(500);
    ck(`לפי השעה: ${when.slice(5, 16).replace("T", " ")} הוא ${want === "1" ? "לילה" : "יום"}`, (await t.getAttribute("[data-testid=wl-root]", "data-night")) === want, String(await t.getAttribute("[data-testid=wl-root]", "data-night")));
    await tctx.close();
  }

  /* ── 12. מקלדת ── */
  await p.keyboard.press("Escape");
  await settle();
  ck("Escape מרחיק", (await level()) === 0);
  await p.locator("[data-testid=wl-hit-school]").focus();
  await p.keyboard.press("Enter");
  await settle();
  ck("אפשר להתקרב במקלדת (Tab ו-Enter)", (await level()) === 1);
  const tab = await p.evaluate(() => {
    const on = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.tabIndex === 0).length;
    return { classes: on("[data-testid^='wl-hit-class-']"), zones: on("[data-testid^='wl-hit-zone-']"), plots: on(".wl-plot"), school: on("[data-testid=wl-hit-school]") };
  });
  ck("רק מה ששייך לרמה הנוכחית מקבל מיקוד מקלדת", tab.classes === 6 && tab.zones === 0 && tab.plots === 0 && tab.school === 0, JSON.stringify(tab));

  ck("הדף לא פנה לשרת או למסד נתונים", dataCalls.length === 0, dataCalls.slice(0, 3).join(" "));
  ck("בלי שגיאות בדף", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  /* ── 13. פחות תנועה ── */
  const calmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const q = await calmCtx.newPage();
  await q.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("wl-whatsnew-seen", "1"); } catch {} });
  await q.goto(URL, { waitUntil: "networkidle" });
  await q.click("[data-testid=wl-exit]");
  await q.waitForTimeout(400);
  const moving = await q.evaluate(() => [...document.querySelectorAll(".wl-plane *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
  ck("למי שביקש פחות תנועה: העולם עומד, והמעברים מיידיים", (await q.getAttribute("[data-testid=wl-root]", "data-calm")) === "1" && moving === 0, String(moving));
  await calmCtx.close();

await ctx.close();
}

/* ── 13ב. "מה חדש": מה שרואה מי שכבר יש לה דוכן, בכניסה הראשונה ── */
{
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const n = await nctx.newPage();
  const nerr = [];
  n.on("pageerror", (e) => nerr.push(e.message));
  await n.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  await n.goto(URL, { waitUntil: "networkidle" });
  await n.waitForSelector("[data-testid=wl-new]", { timeout: 10000 });
  await n.waitForTimeout(450);
  const txt = async (sel) => ((await n.textContent(sel)) ?? "").trim();
  check("מה חדש: פופאפ בכניסה הראשונה, מעל דף הדוכן", (await txt("[data-testid=wl-new] h2")) === "הדוכן שלכם יוצא לעיר" && (await n.locator("[data-testid=wl-new]").getAttribute("aria-modal")) === "true" && (await n.locator(".wl-store[inert]").count()) === 1);
  check("בפופאפ הדוכן שלה עצמה: אותו שלט ואותם מוצרים", (await txt("[data-testid=wl-new-stage]")).includes("סקווישי נוני") && (await n.locator("[data-testid=wl-new-stage] [data-shelf] > g").count()) === 3);
  {
    const r = await new AxeBuilder({ page: n }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include(".wl-new").analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    check("מה חדש: נגישות בלי הפרות חמורות", bad.length === 0, bad.map((v) => `${v.id}×${v.nodes.length} ${v.nodes[0]?.target?.join(" ")}`).join(" | "));
  }
  await n.click("[data-testid=wl-new-next]");
  check("צעד שני: מתחילים מדוכן", (await txt("[data-testid=wl-new-tier]")).startsWith("דוכן") && (await n.locator("[data-testid=wl-new-stage] .wl-shop-back").count()) === 0);
  await n.locator("[data-testid=wl-new-range]").fill("4");
  check("גוררים את המחוון, והדוכן גדל עד חנות גדולה", (await txt("[data-testid=wl-new-tier]")).includes("חנות גדולה") && (await txt("[data-testid=wl-new-tier]")).includes("500") && (await n.locator("[data-testid=wl-new-stage] .wl-shop-back[data-shop='4']").count()) === 1, await txt("[data-testid=wl-new-tier]"));
  await n.click("[data-testid=wl-new-play]");
  const src = await n.getAttribute("[data-testid=wl-new-video]", "src");
  const head = await fetch(new globalThis.URL(src, BASE), { method: "HEAD" });
  check("כפתור הסרטון פותח סרטון שקיים בשרת", (src ?? "").endsWith("/video/whats-new-world.mp4") && head.status === 200 && (head.headers.get("content-type") ?? "").includes("video/mp4"), `${src} ${head.status} ${head.headers.get("content-type")}`);
  check("מהסרטון אפשר לצאת ישר לעיר", (await n.locator("[data-testid=wl-new-go]").count()) === 1);
  await n.click("[data-testid=wl-new-stop]");
  await n.click("[data-testid=wl-new-dot-2]");
  check("צעד שלישי: יום שוק, עם בלונים על הדוכן", (await txt("[data-testid=wl-new] h2")).includes("יום שוק") && (await n.locator("[data-testid=wl-new-stage] .wl-fest").count()) === 1);
  await n.click("[data-testid=wl-new-go]");
  await n.waitForFunction(() => !document.querySelector("[data-testid=wl-new]") && document.querySelector("[data-testid=wl-root]").getAttribute("data-moving") === "0" && document.querySelector(".wl-store").getAttribute("data-open") === "0", null, { timeout: 8000 });
  await n.waitForTimeout(500);
  check("'לצאת לעיר' סוגר את הפופאפ ומוציא אל הדוכן שלה בעולם", (await n.getAttribute("[data-testid=wl-root]", "data-level")) === "4" && (await txt("[data-testid=wl-place]")) === MY_STORE, await txt("[data-testid=wl-place]"));
  await n.reload({ waitUntil: "networkidle" });
  await n.waitForTimeout(600);
  check("בכניסה הבאה הפופאפ לא חוזר, וחוזרים ישר לדוכן בעולם", (await n.locator("[data-testid=wl-new]").count()) === 0 && (await n.getAttribute("[data-testid=wl-root]", "data-level")) === "4");
  await n.click("[data-testid=wl-lab]");
  await n.click("[data-testid=wl-news-again]");
  check("ואפשר לפתוח אותו שוב מתוך 'ניסוי'", (await n.locator("[data-testid=wl-new]").count()) === 1);
  await n.click("[data-testid=wl-new-x]");
  check("איקס סוגר אותו", (await n.locator("[data-testid=wl-new]").count()) === 0);
  check("מה חדש: בלי שגיאות בדף", nerr.length === 0, nerr.slice(0, 2).join(" | "));
  await nctx.close();
}

/* ── 13ג. "הדוכן נכנס לעיר": עיר, בית ספר וכיתה, שכונה, אישור הורה, וכפתור שיתוף ── */
{
  const wctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const w = await wctx.newPage();
  const werr = [];
  w.on("pageerror", (e) => werr.push(e.message));
  await w.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); localStorage.setItem("wl-whatsnew-seen", "1"); } catch {} });
  await w.goto(URL, { waitUntil: "networkidle" });
  await w.waitForTimeout(600);
  const txt = async (sel) => ((await w.textContent(sel)) ?? "").trim();
  const still = () => w.waitForFunction(() => document.querySelector("[data-testid=wl-root]").getAttribute("data-moving") === "0", null, { timeout: 8000 });
  const waxe = async (label) => {
    await w.waitForTimeout(450);
    const r = await new AxeBuilder({ page: w }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include(".wl-where").analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    check(`איפה הדוכן: נגישות, ${label}`, bad.length === 0, bad.map((v) => `${v.id}×${v.nodes.length} ${v.nodes[0]?.target?.join(" ")}`).join(" | "));
  };
  const open = async () => { await w.click("[data-testid=wl-lab]"); await w.click("[data-testid=wl-place-open]"); await w.waitForSelector("[data-testid=wl-where]"); };
  const lab2 = async (id) => { await w.click("[data-testid=wl-lab]"); await w.click(`[data-testid=${id}]`); await w.keyboard.press("Escape"); await w.waitForTimeout(500); };
  if ((await w.locator(".wl-store[data-open='1']").count()) === 1) { await w.click("[data-testid=wl-exit]"); await still(); await w.waitForTimeout(400); }

  // כפתור השיתוף בכרטיס של הדוכן שלי
  check("בכרטיס של הדוכן שלי יש כפתור 'להזמין'", (await w.locator("[data-testid=wl-card] [data-testid=wl-share]").count()) === 1 && (await txt("[data-testid=wl-share]")) === "להזמין");
  await w.click("[data-testid=wl-share]");
  check("הוא פותח את ההזמנה למקום פנוי", (await w.locator("[data-testid=wl-invite-send]").count()) === 1);
  await w.keyboard.press("Escape");
  await w.waitForTimeout(350);

  // עיר: שדה אחד, ורשימה שנפתחת כשמקלידים
  await open();
  check("מתחילים מהעיר, בלי לבחור איפה הדוכן ייראה", (await w.getAttribute("[data-testid=wl-where]", "data-step")) === "city" && (await txt("[data-testid=wl-where] h2")) === "באיזו עיר אתם גרים?" &&
    (await w.locator("[data-testid=wl-city-list]").count()) === 0 && await w.locator("[data-testid=wl-place-next]").isDisabled());
  await waxe("עיר, לפני הקלדה");
  await w.fill("[data-testid=wl-place-q]", "זזז");
  check("עיר: חיפוש בלי תוצאות אומר מה לעשות", (await txt("[data-testid=wl-city-none]")).includes("אפשר לנסות שם אחר") && await w.locator("[data-testid=wl-place-next]").isDisabled());
  await w.fill("[data-testid=wl-place-q]", "ר");
  const opts = await w.locator("[data-testid=wl-city-list] [role=option]").allTextContents();
  check("עיר: מקלידים אות, ונפתחת רשימה שמתחילה במה שהוקלד", opts.length > 1 && opts.length <= 6 && opts[0].startsWith("ר") && (await w.getAttribute("[data-testid=wl-place-q]", "aria-expanded")) === "true", opts.join(", "));
  check("עיר: להקליד בלי לבחור מהרשימה לא מספיק", await w.locator("[data-testid=wl-place-next]").isDisabled());
  await waxe("עיר, רשימה פתוחה");
  await w.fill("[data-testid=wl-place-q]", "יבנ");
  check("עיר: ההקלדה מצמצמת את הרשימה", (await w.locator("[data-testid=wl-city-list] [role=option]").count()) === 1);
  await w.click("[data-testid=wl-city-0]");
  check("עיר: בוחרים, הרשימה נסגרת והשדה מתמלא", (await w.inputValue("[data-testid=wl-place-q]")) === "יבנה" && (await w.locator("[data-testid=wl-city-list]").count()) === 0 && await w.locator("[data-testid=wl-place-next]").isEnabled());
  await w.click("[data-testid=wl-place-next]");

  // בית ספר וכיתה
  check("בית ספר: בוחרים מרשימה, בלי שדה טקסט", (await txt("[data-testid=wl-where] h2")) === "באיזה בית ספר?" && (await w.locator("[data-testid=wl-where] input").count()) === 0 &&
    (await txt("[data-testid=wl-school-0]")).includes("יבנה"));
  await w.click("[data-testid=wl-school-3]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-grade-ו]");
  check("כיתה: צריך גם שכבה וגם מספר", await w.locator("[data-testid=wl-place-next]").isDisabled());
  await w.click("[data-testid=wl-num-4]");
  check("כיתה: רואים מה נבחר", (await txt("[data-testid=wl-place-unit]")).includes("ו׳4") && (await txt("[data-testid=wl-place-unit]")).includes("בית ספר התמר"));
  await waxe("כיתה");
  await w.click("[data-testid=wl-place-back]");
  check("חזרה שומרת את מה שנבחר", (await w.getAttribute("[data-testid=wl-school-3]", "aria-checked")) === "true");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-place-next]");

  // שכונה: תמיד, אחרי הכיתה. בלי רחוב.
  check("שכונה: שואלים רק שכונה, ואומרים שלא שואלים רחוב", (await txt("[data-testid=wl-where] h2")) === "באיזו שכונה?" && (await txt("[data-testid=wl-where]")).includes("לא שואלים רחוב או בית") && (await w.locator("[data-testid=wl-where] input").count()) === 0);
  await w.click("[data-testid=wl-hood-2]");
  await waxe("שכונה");
  await w.click("[data-testid=wl-place-next]");
  const parent = await txt("[data-testid=wl-place-parent]");
  check("ההורה רואה את שלושת המקומות, מי יראה, ומה לא נחשף", parent.includes("בקניון של ו׳4, בית ספר התמר") && parent.includes("בשוק של כיכר התמר, שכונת נווה אילן") && parent.includes("על מפת העיר יבנה") &&
    parent.includes("בלי שם משפחה, בלי טלפון ובלי כתובת") && parent.includes("אפשר להוציא את הדוכן מהעיר"));
  await waxe("אישור הורה");
  await w.click("[data-testid=wl-place-yes]");
  const inList = await txt("[data-testid=wl-place-in]");
  check("סיום: הדוכן שלה בכל המקומות יחד, וכפתור שיתוף אחד", (await txt("[data-testid=wl-place-title]")) === "הדוכן שלכם בעיר" && (await txt("[data-testid=wl-place-art]")).includes("סקווישי נוני") &&
    (await w.locator("[data-testid=wl-place-art] .wl-new-stall").count()) === 3 && inList.includes("הקניון של ו׳4") && inList.includes("השוק של כיכר התמר") && inList.includes("מפת העיר") &&
    (await txt("[data-testid=wl-place-share]")) === "להזמין חברים");
  await waxe("סיום");
  await w.click("[data-testid=wl-place-share]");
  await w.waitForSelector("[data-testid=wl-invite-send]");
  check("כפתור השיתוף פותח את ההזמנה למקום הפנוי", (await w.locator("[data-testid=wl-where]").count()) === 0 && (await w.locator("[data-testid=wl-invite-send]").count()) === 1);
  await w.keyboard.press("Escape");
  await still();
  await w.click("[data-testid=wl-level-2]");
  await still();
  await w.waitForTimeout(300);
  check("בעולם: הקניון נקרא על שם הכיתה שנבחרה", (await txt("[data-testid=wl-place]")) === "הקניון של ו׳4", await txt("[data-testid=wl-place]"));
  await w.click("[data-testid=wl-level-1]");
  await still();
  await w.waitForTimeout(300);
  check("ובית הספר על שם מה שנבחר", (await txt("[data-testid=wl-place]")) === "בית ספר התמר", await txt("[data-testid=wl-place]"));
  await lab2("wl-kind-hood");
  check("אותו דוכן גם בשכונה שנבחרה, בלי למלא שוב", (await txt("[data-testid=wl-place]")) === "שכונת נווה אילן", await txt("[data-testid=wl-place]"));
  await lab2("wl-kind-class");

  // לא ברשימה, והורה שלא מאשר
  await open();
  await w.fill("[data-testid=wl-place-q]", "רחו");
  await w.click("[data-testid=wl-city-1]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-school-other]");
  check("בית ספר שלא ברשימה: מסבירים מה יקרה", (await txt("[data-testid=wl-school-other-note]")).includes("ההורה יכתוב לנו את השם"));
  await w.click("[data-testid=wl-place-next]");
  check("ואז מדלגים על הכיתה, ישר לשכונה", (await w.getAttribute("[data-testid=wl-where]", "data-step")) === "hood");
  await w.click("[data-testid=wl-hood-0]");
  await w.click("[data-testid=wl-place-next]");
  check("ההורה מתבקש לכתוב את שם בית הספר, והשכונה כבר שם", (await txt("[data-testid=wl-place-parent]")).includes("אחרי שתכתבו לנו את שם בית הספר") && (await txt("[data-testid=wl-place-parent]")).includes("שכונת הדקלים"));
  await w.click("[data-testid=wl-place-yes]");
  check("הדוכן נכנס לשוק מיד, והקניון מחכה לבדיקה", (await txt("[data-testid=wl-place-in]")).includes("בודקים את בית הספר") && (await w.locator("[data-testid=wl-place-see-class]").count()) === 0 && (await w.locator("[data-testid=wl-place-see-hood]").count()) === 1);
  await w.click("[data-testid=wl-place-see-hood]");
  await still();
  await w.waitForTimeout(300);
  check("'לראות את השוק' מוציא אל הדוכן שלה, בעולם של שכונה", (await w.locator("[data-testid=wl-where]").count()) === 0 && (await w.getAttribute("[data-testid=wl-root]", "data-level")) === "4" &&
    (await txt("[data-testid=wl-level-1]")).includes("שכונה"));
  await open();
  await w.fill("[data-testid=wl-place-q]", "חיפ");
  await w.click("[data-testid=wl-city-7]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-school-0]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-grade-ה]");
  await w.click("[data-testid=wl-num-1]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-hood-1]");
  await w.click("[data-testid=wl-place-next]");
  await w.click("[data-testid=wl-place-no]");
  check("הורה שלא מאשר: הדוכן נשאר רק עם הלינק, בלי לחץ", (await txt("[data-testid=wl-where] h2")) === "הדוכן נשאר רק עם הלינק" && (await txt("[data-testid=wl-where]")).includes("שום דבר לא מופיע בעיר"));
  await w.click("[data-testid=wl-place-ok]");
  check("וסוגרים", (await w.locator("[data-testid=wl-where]").count()) === 0);
  check("איפה הדוכן: בלי שגיאות בדף", werr.length === 0, werr.slice(0, 2).join(" | "));
  await wctx.close();
}

try {
  /* ── 14. באתר החי הדף לא קיים ── */
  const prod = spawn("npx", ["next", "start", "-p", "3991"], { cwd: ROOT, env: { ...process.env, VERCEL_ENV: "production" }, stdio: "ignore", detached: true });
  let status = 0;
  for (let i = 0; i < 40 && status === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { status = (await fetch("http://localhost:3991/world-lab")).status; } catch {}
  }
  try { process.kill(-prod.pid); } catch {}
  check("בסביבת הפקה (VERCEL_ENV=production) הדף מחזיר 404", status === 404, String(status));
} finally {
  await browser.close();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} world-lab checks passed`);
process.exit(failed.length ? 1 : 0);
