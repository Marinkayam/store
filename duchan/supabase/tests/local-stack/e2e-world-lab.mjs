// E2E: עולם דוכן — אב־טיפוס (app/world-lab).
//
// דף ניסוי עם נתוני דוגמה בלבד. הבדיקה מוודאת שמה שהדף מבטיח קורה בפועל:
//   1. מתחילים בחנות, יוצאים לחזית, מתרחקים לרחוב, לקניון ולעיר, וחוזרים.
//   2. אותו עולם בכל הרמות: אותם דוכנים, רק בפחות פירוט ככל שמתרחקים.
//   3. רמת הבנייה של המשחק (שנגזרת ממכירות) לא מוצגת: כל הדוכנים באותו מבנה.
//   4. מקום פנוי הוא מקום פנוי. אין דוכן שלא קיים ברשימת החנויות.
//   5. הדף לא פונה לשרת או למסד, ובסביבת הפקה הוא לא קיים (404).
//   6. מקלדת, "פחות תנועה" ובדיקת נגישות אוטומטית.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const URL = `${BASE}/world-lab`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
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
const lods = () => p.evaluate(() => {
  const out = { near: 0, mid: 0, far: 0, stall: 0, empty: 0 };
  for (const el of document.querySelectorAll(".wl-plot[data-kind]")) {
    const k = el.getAttribute("data-kind");
    if (k === "stall" || k === "empty") out[k]++;
    if (k === "stall") out[el.getAttribute("data-lod")]++;
  }
  return out;
});
const axe = async (label) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include(".wl-root").analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`נגישות, ${label}: בלי הפרות חמורות`, bad.length === 0, bad.map((v) => `${v.id}×${v.nodes.length} ${v.nodes[0]?.target?.join(" ")}`).join(" | "));
};

try {
  await p.goto(URL, { waitUntil: "networkidle" });
  if ((await root().getAttribute("data-night")) === "1") { await p.evaluate(() => 0); }

  /* ── 1. מתחילים בחנות ── */
  check("נפתח על החנות שלי", (await p.locator("[data-testid=wl-store] h1").textContent()) === "הסקווישים של נועה");
  check("הכתובת מציינת איפה נמצאים (#store)", (await p.evaluate(() => location.hash)) === "#store");
  check("כתוב שזו הדמיה של דף החנות", (await p.locator(".wl-sim-tag").count()) === 1);
  await axe("החנות");

  /* ── 2. החוצה אל החזית ── */
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.waitForTimeout(500);
  check("יוצאים אל החזית של אותה חנות", (await level()) === 3 && (await place()) === "הסקווישים של נועה", await place());
  const near = p.locator(".wl-plot[data-mine='1'] svg.wl-near");
  check("החזית היא הדוכן האמיתי של המשחק (KupaStall)", (await near.count()) === 1 && ((await near.getAttribute("aria-label")) ?? "").startsWith("איור הדוכן"));
  check("על השלט שם החנות", ((await near.textContent()) ?? "").includes("סקווישי נועה"));
  check("על הדלפק שלושה מוצרים של החנות, בלי תוויות המחיר המצוירות", (await near.locator("[data-shelf] > g").count()) === 3 && !((await near.textContent()) ?? "").includes("₪"));
  check("רק הדוכן שבמרכז מצויר בפירוט מלא", (await lods()).near === 1);
  await axe("החזית");

  /* ── 3. עיצוב ── */
  await p.click("[data-testid=wl-decorate]");
  await p.click("[data-testid=wl-awning-melon]");
  const aw = await p.locator(".wl-plot[data-mine='1']").evaluate((el) => getComputedStyle(el).getPropertyValue("--aw").trim());
  check("בחירת צבע סוכך משנה את הדוכן מיד", aw.toLowerCase() === "#c9403a", aw);
  await settle();
  const before = await p.locator(".wl-plot[data-mine='1'] [data-deco=open-sign]").count();
  await p.click("[data-testid=wl-deco-openSign]");
  check("קישוט שנבחר מופיע על הדוכן", before === 0 && (await p.locator(".wl-plot[data-mine='1'] [data-deco=open-sign]").count()) === 1);
  await axe("גיליון העיצוב");
  await p.keyboard.press("Escape");

  /* ── 4. מתרחקים: רחוב, קניון, עיר ── */
  await p.click("[data-testid=wl-out]");
  await settle();
  let l = await lods();
  check("רחוב: אותם דוכנים בפירוט בינוני, ואף אחד בפירוט מלא", (await level()) === 2 && (await place()) === "רחוב הסוככים" && l.near === 0 && l.mid >= 3, JSON.stringify(l));
  check("ברחוב שמונה דוכנים ומקום פנוי אחד ליד שלי", (await p.locator(".wl-plot[data-kind=stall][data-testid^='wl-plot-A']").count()) === 8 && (await p.locator("[data-testid=wl-plot-A4][data-kind=empty]").count()) === 1);
  const plates = await p.locator(".wl-plate").allTextContents();
  check("לכל דוכן לוחית עם השם, והשלי מסומן", plates.length === 8 && plates.some((t) => t.includes("הסקווישים של נועה") && t.includes("שלי")));
  check("הצבע שבחרתי נשאר גם מרחוק", (await p.locator(".wl-plot[data-mine='1']").evaluate((el) => getComputedStyle(el).getPropertyValue("--aw").trim().toLowerCase())) === "#c9403a");
  await axe("הרחוב");

  await p.click("[data-testid=wl-out]");
  await settle();
  l = await lods();
  check("קניון: כל הדוכנים בפירוט נמוך", (await level()) === 1 && (await place()).startsWith("הקניון של") && l.mid === 0 && l.near === 0 && l.far === l.stall, JSON.stringify(l));
  check("בקניון כמה אזורי מסחר", (await p.locator("[data-testid^='wl-hit-zone-']").count()) === 4);

  await p.click("[data-testid=wl-out]");
  await settle();
  check("עיר: הקניון הוא חלק מעיר שלמה", (await level()) === 0 && (await place()) === "העיר" && (await p.evaluate(() => location.hash)) === "#city");
  check("בעיר אין כפתור להתרחק עוד", (await p.locator("[data-testid=wl-out]").count()) === 0);
  await axe("העיר");

  /* ── 5. חוזרים פנימה, וכפתור החזרה של הטלפון ── */
  await p.click("[data-testid=wl-hit-mall]");
  await settle();
  await p.click("[data-testid=wl-hit-zone-A]");
  await settle();
  check("נגיעה בקניון ואז ברחוב מקרבת חזרה", (await level()) === 2);
  await p.goBack();
  await settle();
  check("כפתור החזרה של הטלפון מרחיק רמה אחת", (await level()) === 1, String(await level()));

  /* ── 6. הפתעות ── */
  await p.click("[data-testid=wl-hit-zone-P]");
  await settle();
  await p.click("[data-testid=wl-surprise-fountain]");
  check("נגיעה במזרקה: הפתעה נספרת", ((await p.textContent("[data-testid=wl-found]")) ?? "").includes("1/8") && (await p.locator("[data-testid=wl-bubble]").count()) === 1);

  /* ── 7. מקום פנוי והזמנה ── */
  await p.click("[data-testid=wl-level-2]");
  await settle();
  await p.click("[data-testid=wl-home]");
  await p.waitForSelector(".wl-store[data-open='1']", { timeout: 15000 });
  check("'הדוכן שלי' מחזיר ישר לחנות, מכל מקום", (await p.locator("[data-testid=wl-store] h1").textContent()) === "הסקווישים של נועה");
  await p.click("[data-testid=wl-exit]");
  await settle();
  await p.click("[data-testid=wl-out]");
  await settle();
  await p.click("[data-testid=wl-plot-A4]");
  await settle();
  await p.waitForSelector("[data-testid=wl-invite]");
  await p.click("[data-testid=wl-invite]");
  const inviteText = (await p.textContent("[data-testid=wl-sheet-invite]")) ?? "";
  check("ההזמנה מסבירה: הצטרפות באישור הורה, בלי לחשוף חנויות", inviteText.includes("אישור הורה") && inviteText.includes("לא מציג"));
  await p.click("[data-testid=wl-invite-send]");
  check("אחרי ההזמנה המקום מסומן, ונשאר מקום פנוי", ((await p.locator("[data-testid=wl-plot-A4]").textContent()) ?? "").includes("הזמנה נשלחה") && (await p.locator("[data-testid=wl-plot-A4]").getAttribute("data-kind")) === "empty");

  /* ── 8. כיתה עם שלושה דוכנים ── */
  await p.click("[data-testid=wl-lab]");
  await p.click("[data-testid=wl-size-3]");
  await p.keyboard.press("Escape");
  await p.click("[data-testid=wl-level-1]");
  await settle();
  l = await lods();
  check("שלושה דוכנים: שלושה דוכנים בדיוק, ושני מקומות פנויים", l.stall === 3 && l.empty === 2, JSON.stringify(l));
  check("אין דוכן מדומה: כל השאר גינה, לא דוכן", (await p.locator(".wl-plot[data-kind=garden]").count()) === 9);
  check("הסמטה נעולה ומסבירה מתי תיפתח", (await p.locator(".wl-label[data-lv='1']").allTextContents()).some((t) => t.includes("נפתחת ב־8 דוכנים")));

  /* ── 9. יום ולילה ── */
  const n0 = await root().getAttribute("data-night");
  await p.click("[data-testid=wl-night]");
  await p.waitForFunction((v) => document.querySelector("[data-testid=wl-root]").getAttribute("data-night") !== v, n0, { timeout: 4000 });
  check("יום ולילה מתחלפים", (await root().getAttribute("data-night")) !== n0);

  /* ── 10. מקלדת ── */
  await p.keyboard.press("Escape");
  await settle();
  check("Escape מרחיק", (await level()) === 0);
  await p.locator("[data-testid=wl-hit-mall]").focus();
  await p.keyboard.press("Enter");
  await settle();
  check("אפשר להתקרב במקלדת (Tab ו-Enter)", (await level()) === 1);
  const tab = await p.evaluate(() => {
    const on = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.tabIndex === 0).length;
    return { zones: on("[data-testid^='wl-hit-zone-']"), plots: on(".wl-plot"), mall: on("[data-testid=wl-hit-mall]") };
  });
  check("רק מה ששייך לרמה הנוכחית מקבל מיקוד מקלדת", tab.zones === 4 && tab.plots === 0 && tab.mall === 0, JSON.stringify(tab));

  check("הדף לא פנה לשרת או למסד נתונים", dataCalls.length === 0, dataCalls.slice(0, 3).join(" "));
  check("בלי שגיאות בדף", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  /* ── 11. פחות תנועה ── */
  const calmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const q = await calmCtx.newPage();
  await q.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  await q.goto(URL, { waitUntil: "networkidle" });
  await q.click("[data-testid=wl-exit]");
  await q.waitForTimeout(400);
  const moving = await q.evaluate(() => [...document.querySelectorAll(".wl-plane *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
  check("למי שביקש פחות תנועה: העולם עומד, והמעברים מיידיים", (await q.getAttribute("[data-testid=wl-root]", "data-calm")) === "1" && moving === 0, String(moving));
  await calmCtx.close();

  /* ── 12. באתר החי הדף לא קיים ── */
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
