// E2E: "כל האפליקציה הזו צריכה להיות בלי פינות מעוגלות" (מרינה, 10.2026).
// סורק כל אלמנט נראה בעמודים המרכזיים — ציבוריים ומסכי הניהול — ונכשל על
// כל border-radius. חריגים מכוונים: איורים (SVG), וסגנון שהדוכן עצמו בחר
// (.s-look, למשל "עגלגל") — זו בחירה של הילדים, לא של הממשק.
import { chromium } from "playwright";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();

async function scan(path) {
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  const found = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      // איורים (svg, וגם מכשיר מצויר בדף הבית — data-art) הם חלק מהאיור ולא מהממשק
      if (el.closest("svg") || el.closest(".s-look") || el.closest("[data-art]")) continue;
      const cs = getComputedStyle(el);
      const r = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"].some((k) => parseFloat(cs[k]) > 0);
      if (r && el.getClientRects().length && cs.visibility !== "hidden" && cs.display !== "none")
        out.push(`${el.tagName.toLowerCase()}[${(el.getAttribute("data-testid") ?? el.className?.toString() ?? "").slice(0, 40)}] r=${cs.borderTopLeftRadius}`);
    }
    return out;
  });
  check(`${path}: בלי פינות מעוגלות`, found.length === 0, found.slice(0, 4).join(" · "));
}

try {
  for (const u of ["/", "/story", "/price", "/login", "/onboarding", "/terms", "/privacy", "/accessibility"]) await scan(u);
  await p.goto(`${BASE}/login`);
  await verifyPhone(p, "0501234567");
  await p.waitForURL("**/dashboard", { timeout: 20000 });
  for (const u of ["/dashboard", "/dashboard/products", "/dashboard/settings", "/dashboard/kupa", "/dashboard/kupa?tab=riddles", "/dashboard/kupa?tab=shop"]) await scan(u);
} finally {
  await browser.close();
  await closeHelper();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
