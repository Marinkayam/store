// E2E: עולם דוכן — אב־טיפוס (app/world-lab).
//
// דף ניסוי עם נתוני דוגמה בלבד. הבדיקה מוודאת שמה שהדף מבטיח קורה בפועל:
//   1. מתחילים בחנות, יוצאים לחזית, מתרחקים לרחוב, לקניון, לבית הספר ולעיר, וחוזרים.
//   2. אותו עולם בכל הרמות: אותם דוכנים, רק בפחות פירוט ככל שמתרחקים.
//   3. רמת הבנייה של המשחק (שנגזרת ממכירות) לא מוצגת: כל הדוכנים באותו מבנה.
//   4. מקום פנוי הוא מקום פנוי. אין דוכן שלא קיים ברשימת החנויות.
//   5. השם הפרטי מופיע רק בתוך הקניון, לא בדף החנות.
//   6. הזמנת חברים: הקישור לא חושף חנויות, מצטרפים רק באישור הורה, ואפשר
//      להצטרף כדי לפתוח דוכן או רק כדי לבקר. הורה שלא אישר: שום דבר לא משתנה.
//   7. העולם גדל בשלבים: רמה שעוד אין בה מה לראות נעולה, ומסבירה מתי תיפתח.
//   8. הדף לא פונה לשרת או למסד, ובסביבת הפקה הוא לא קיים (404).
//   9. מקלדת, "פחות תנועה" ובדיקת נגישות אוטומטית.
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
await p.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });

const root = () => p.locator("[data-testid=wl-root]");
const level = async () => Number(await root().getAttribute("data-level"));
const settle = async () => {
  await p.waitForFunction(() => document.querySelector("[data-testid=wl-root]")?.getAttribute("data-moving") === "0", null, { timeout: 8000 });
  await p.waitForTimeout(120);
};
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
  ck("לוחיות של דוכנים שכנים לא עולות זו על זו", fit.widest <= fit.pitch, JSON.stringify(fit));
  ck("הצבע שבחרתי נשאר גם מרחוק", (await p.locator(".wl-plot[data-mine='1']").evaluate((el) => getComputedStyle(el).getPropertyValue("--aw").trim().toLowerCase())) === "#c9403a");
  await axe("הרחוב");

  await p.click("[data-testid=wl-out]");
  await settle();
  l = await lods();
  ck("קניון: כל הדוכנים בפירוט נמוך", (await level()) === 2 && (await place()).startsWith("הקניון של") && l.mid === 0 && l.near === 0 && l.far === l.stall, JSON.stringify(l));
  ck("בקניון כמה אזורי מסחר", (await p.locator("[data-testid^='wl-hit-zone-']").count()) === 4);

  await p.click("[data-testid=wl-out]");
  await settle();
  ck("בית ספר: הקניון של הכיתה הוא אחד מכמה", (await level()) === 1 && (await place()) === "בית ספר הדקל" && (await p.evaluate(() => location.hash)) === "#school", await place());
  ck("שתי שכבות ושש כיתות", (await p.locator(".wl-grade").count()) === 2 && (await p.locator("[data-testid^='wl-hit-class-']").count()) === 6);
  ck("הכיתה שלי מסומנת, עם מספר הדוכנים שלה", (await p.locator(".wl-class[data-mine='1']").count()) === 1 && (await text(".wl-class[data-mine='1']")).includes("11 דוכנים"), await text(".wl-class[data-mine='1']"));
  await p.click("[data-testid=wl-hit-class-h1]");
  await p.waitForSelector("[data-testid=wl-bubble]");
  ck("קניון של כיתה אחרת סגור למי שאינו מהכיתה", (await level()) === 1 && (await bubble()).includes("רק לילדים ולהורים מהכיתה"), await bubble());
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
  ck("מי שפתח את הקישור רואה מי הזמין ולאן", landing.includes(`${MY_NAME} מזמינה אותך`) && landing.includes("ה׳2"));
  ck("הקישור לא חושף אף חנות של הכיתה", others.length >= 7 && !others.some((n) => landing.includes(n)) && !landing.includes(MY_STORE));
  await p.waitForTimeout(450); // אחרי אנימציית הפתיחה, כדי למדוד את הצבעים הסופיים
  await axe("דף ההזמנה");
  await p.click("[data-testid=wl-join-store]");
  await p.fill("#wl-invitee-name", "גלי");
  await p.click("[data-testid=wl-join-next]");
  const parent = await text("[data-testid=wl-parent-view]");
  ck("ההורה רואה מה ייחשף ולמי לפני שהוא מאשר", parent.includes("גלי") && parent.includes("רוצה לפתוח דוכן") && parent.includes("בלי שם משפחה") && parent.includes("רק ילדים והורים מהכיתה"), parent);
  ck("עד שההורה אישר, לא נפתח דוכן", (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "empty");
  await p.click("[data-testid=wl-parent-yes]");
  await p.fill("#wl-invitee-store", "הצמידים של גלי");
  await p.click("[data-testid=wl-join-open]");
  await p.click("[data-testid=wl-join-done]");
  await settle();
  ck("אחרי האישור נפתח דוכן אמיתי במקום הפנוי, והמצלמה נוחתת עליו",
    (await level()) === 4 && (await place()) === "הצמידים של גלי" && (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "stall", await place());
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
  ck("מסלול ביקור: ההורה מתבקש לאשר ביקור, לא דוכן", (await text("[data-testid=wl-parent-view]")).includes("רוצה לבקר") && !(await text("[data-testid=wl-parent-view]")).includes("שם הדוכן"));
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
  ck("משפחה בלי חנות מצטרפת כמבקרת, והמקום נשאר פנוי", (await lods()).stall === stallsBefore && (await p.locator("[data-testid=wl-plot-B0]").getAttribute("data-kind")) === "empty");

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
  const n0 = await root().getAttribute("data-night");
  await p.click("[data-testid=wl-night]");
  await p.waitForFunction((v) => document.querySelector("[data-testid=wl-root]").getAttribute("data-night") !== v, n0, { timeout: 4000 });
  ck("יום ולילה מתחלפים", (await root().getAttribute("data-night")) !== n0);

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
  await q.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  await q.goto(URL, { waitUntil: "networkidle" });
  await q.click("[data-testid=wl-exit]");
  await q.waitForTimeout(400);
  const moving = await q.evaluate(() => [...document.querySelectorAll(".wl-plane *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
  ck("למי שביקש פחות תנועה: העולם עומד, והמעברים מיידיים", (await q.getAttribute("[data-testid=wl-root]", "data-calm")) === "1" && moving === 0, String(moving));
  await calmCtx.close();

await ctx.close();
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
