// E2E: שוליים אחידים בכל האפליקציה.
//
// מרינה, 11.2026: "מרווח זהה בין השוליים בכל סוגי המסכים… כרגע אני רואה
// מסכים שממש צמוד לשוליים וכאלו שפחות". הסטנדרט: 20px מהקצה עד התוכן
// (--spacing-gutter ב-globals.css, המחלקה px-gutter).
//
// הבדיקה מודדת איפה הדיו באמת נמצא — טקסט, כרטיסים עם מסגרת או רקע,
// תמונות ושדות — ולא את אזורי הלחיצה השקופים. מה שברוחב מלא בכוונה (רקע,
// פס) לא נמדד, אבל התוכן שבתוכו כן. שורות שגוללות לצד (צ'יפים) ואיורים
// (svg) לא נמדדים. בכל מסך:
//   1. שום דבר לא קרוב לקצה מ-20px
//   2. במסכים "רגילים" התוכן גם מגיע לקו — לא 24 פה ו-16 שם
//   3. הדף לא גולל לצדדים
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const GUTTER = 20;
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (name, ok, detail = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${name}") לא קיבל בוליאני`);
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const { rows: [seed] } = await db.query("select * from stores order by created_at limit 1");
const { rows: [prod] } = await db.query(
  "select name from products where store_id=$1 and deleted_at is null and (options is null or cardinality(options)=0) and (not track_stock or stock>0) order by sort_order limit 1",
  [seed.id]
);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  return c;
};

const measure = (scope) =>
  ((scopeSel) => {
    const W = window.innerWidth;
    const root = scopeSel ? document.querySelector(scopeSel) : document.body;
    if (!root) return null;
    const boxes = [];
    const skip = (el) => {
      if (!el) return true;
      if (el.closest("[data-gutter-ignore]")) return true;
      // בלי scope: מה שבתוך פס/גיליון קבוע (ניווט תחתון, גיליונות) לא נחשב כאן
      if (!scopeSel) {
        let p = el;
        while (p && p !== document.body) {
          const s = getComputedStyle(p);
          if (s.position === "fixed" || s.position === "sticky" && p.getBoundingClientRect().width >= W - 1 && p.tagName === "NAV") return true;
          p = p.parentElement;
        }
      }
      // גלילה אופקית מכוונת
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 2) return true;
        p = p.parentElement;
      }
      return false;
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity !== 0;
    };
    const push = (r, el, kind, txt) => {
      if (r.width < 2 || r.height < 2 || r.width >= W - 1) return;
      boxes.push({ left: Math.round(r.left), right: Math.round(W - r.right), tag: el.tagName.toLowerCase(), kind, cls: (el.getAttribute("class") || "").slice(0, 60), txt });
    };
    // טקסט — איפה שהדיו באמת נמצא
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || skip(el) || el.closest(".sr-only") || el.closest("svg")) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      // טקסט שנחתך ב-overflow — נמדד עד גבול הקופסה שחותכת אותו
      let clip = el; while (clip && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement;
      const cr = clip ? clip.getBoundingClientRect() : null;
      for (const r0 of rg.getClientRects()) {
        const r = cr ? { left: Math.max(r0.left, cr.left), right: Math.min(r0.right, cr.right), width: Math.min(r0.right, cr.right) - Math.max(r0.left, cr.left), height: r0.height } : r0;
        push(r, el, "text", n.textContent.trim().slice(0, 20));
      }
    }
    // קופסאות נראות: מסגרת/רקע, תמונות, שדות, אייקונים
    for (const el of root.querySelectorAll("*")) {
      if (!visible(el) || skip(el)) continue;
      const cs = getComputedStyle(el);
      const t = el.tagName;
      const media = ["IMG", "VIDEO", "INPUT", "TEXTAREA", "SELECT", "svg", "SVG"].includes(t) || t === "svg";
      const framed = parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 ||
        (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
      if (!media && !framed) continue;
      if (t.toLowerCase() === "svg" && el.parentElement?.closest("svg")) continue;
      push(el.getBoundingClientRect(), el, media ? "media" : "box", (el.textContent || "").trim().slice(0, 20));
    }
    if (!boxes.length) return null;
    const minL = Math.min(...boxes.map((o) => o.left)), minR = Math.min(...boxes.map((o) => o.right));
    const offenders = boxes.filter((o) => o.left < 20 || o.right < 20).slice(0, 6);
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return { minL, minR, n: boxes.length, offenders, overflow };
  })(scope);


/** centered = מסך שכולו עמודה צרה ממורכזת (404 וכד') — שם רק "לא קרוב מ-20" */
async function m(page, name, { scope = null, centered = false } = {}) {
  await page.waitForTimeout(600);
  const r = await page.evaluate(measure, scope);
  if (!r) return check(`${name}: יש תוכן למדוד`, false);
  const off = r.offenders.slice(0, 3).map((o) => `${o.left}/${o.right} ${o.tag} "${o.txt}"`).join(" · ");
  check(`${name}: לא קרוב לקצה מ-${GUTTER}px`, r.minL >= GUTTER && r.minR >= GUTTER, `${r.minL}/${r.minR}${off ? " · " + off : ""}`);
  if (!centered) check(`${name}: התוכן יושב על קו השוליים`, Math.min(r.minL, r.minR) <= GUTTER + 1, `${r.minL}/${r.minR}`);
  if (!scope) check(`${name}: לא גולל לצדדים`, r.overflow <= 0, `+${r.overflow}px`);
}
const step = async (label, fn) => {
  try { await fn(); } catch (e) { check(`${label}: נטען`, false, e.message.split("\n")[0]); }
};

try {
  /* ── ציבורי ── */
  const g = await (await ctx()).newPage();
  for (const [p, n, c] of [
    ["/", "דף הבית"], ["/story", "אתר השיווק"], ["/price", "מחיר"], ["/privacy", "פרטיות"], ["/terms", "תנאים"],
    ["/accessibility", "נגישות", true], ["/no-such-page", "404", true], ["/onboarding", "פתיחת דוכן"], ["/login", "כניסה"],
    [`/s/${seed.slug}`, "הדוכן"], ["/s/qqqqq", "דוכן סגור", true],
  ]) {
    await step(n, async () => { await g.goto(BASE + p, { waitUntil: "networkidle" }); await m(g, n, { centered: !!c }); });
  }
  await step("גיליון מוצר", async () => {
    await g.goto(`${BASE}/s/${seed.slug}`, { waitUntil: "networkidle" });
    await g.click(`button[aria-label='${prod.name}']`);
    await g.waitForSelector("button[aria-label='הוספה לסל']");
    await m(g, "גיליון מוצר", { scope: ".s-sheet.z-50" });
    await g.click("button[aria-label='הוספה לסל']");
    await g.waitForTimeout(500);
    await g.click("[data-testid=cart-bar]");
    await g.waitForTimeout(600);
    await m(g, "הסל", { scope: ".s-sheet.z-50" });
  });

  /* ── ניהול הדוכן ── */
  const o = await (await ctx()).newPage();
  await o.goto(`${BASE}/login`);
  await verifyPhone(o, "0" + seed.contact_phone.slice(3));
  await o.waitForTimeout(1500);
  for (const [p, n] of [
    ["/dashboard", "הזמנות"], ["/dashboard/products", "מוצרים"], ["/dashboard/settings", "הדוכן שלי"],
    ["/dashboard/share", "שיתוף"], ["/dashboard/stats", "מי מסתכל"], ["/dashboard/kupa", "הקופה"],
    ["/dashboard/settings#payment", "הגדרות: תשלום"], ["/dashboard/settings#team", "הגדרות: צוות"], ["/activate", "פרסום"],
  ]) {
    await step(n, async () => { await o.goto(BASE + p, { waitUntil: "networkidle" }); await m(o, n); });
  }
  await step("עורך מוצר", async () => {
    await o.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
    await o.click(`text=${prod.name}`);
    await o.waitForSelector("input[aria-label='שם המוצר']");
    await m(o, "עורך מוצר", { scope: "[role=dialog]" });
  });

  /* ── חמ"ל ── */
  const a = await (await ctx()).newPage();
  await a.goto(`${BASE}/login`);
  await verifyPhone(a, "0509990000");
  await a.waitForTimeout(1500);
  for (const t of ["overview", "stores", "logins", "network", "news"]) {
    await step(`חמ"ל ${t}`, async () => {
      await a.goto(`${BASE}/admin#${t}`, { waitUntil: "networkidle" });
      if (await a.locator(`[data-testid=admin-tab-${t}]`).count()) await a.click(`[data-testid=admin-tab-${t}]`);
      await m(a, `חמ"ל ${t}`);
    });
  }
} finally {
  await browser.close();
  await closeHelper();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} gutter checks passed`);
process.exit(failed.length ? 1 : 0);
