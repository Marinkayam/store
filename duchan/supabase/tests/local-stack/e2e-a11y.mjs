// E2E: נגישות — axe-core (WCAG 2.0/2.1 A+AA, הבסיס של ת"י 5568) על כל
// העמודים והגיליונות המרכזיים: ציבוריים, המוכרים, הדוכן לקונים והחמ"ל.
//
// נכשל על כל הפרה בדרגת serious/critical. הפרות moderate/minor מודפסות
// לתיקון, אבל לא מפילות — חלקן תלויות תוכן שהמשתמשים מעלים.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const VERBOSE = process.env.A11Y_VERBOSE === "1";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const { rows: [store] } = await db.query("select slug from stores where contact_phone='972501234567' order by created_at limit 1");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const all = []; // { page, id, impact, help, nodes }
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

async function audit(p, label, include) {
  await p.waitForTimeout(700); // אנימציות כניסה (fx-rise) — שיגיעו למצב הסופי
  let b = new AxeBuilder({ page: p }).withTags(TAGS);
  if (include) b = b.include(include);
  const r = await b.analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of r.violations) {
    all.push({ page: label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 4), html: v.nodes[0]?.html?.slice(0, 160) });
    if (VERBOSE && v.id === "color-contrast") {
      for (const n of v.nodes) console.log(`   [${label}] ${n.html.slice(0, 140)}\n      ${(n.any[0]?.message ?? "").slice(0, 170)}`);
    }
  }
  check(`${label}: בלי הפרות חמורות`, bad.length === 0, bad.map((v) => `${v.id}×${v.nodes.length}`).join(", "));
}

async function ctx(viewport = { width: 390, height: 844 }) {
  const c = await browser.newContext({ viewport });
  // בלי הודעת העוגיות — היא נבדקת בנפרד, ולא צריכה לכסות כל עמוד
  await c.addInitScript(() => { try { localStorage.setItem("duchan-cookies-ok", "1"); } catch {} });
  return c.newPage();
}

/* ── ציבורי ── */
const pub = await ctx();
for (const [path, label] of [
  ["/", "דף הבית"], ["/price", "מחיר"], ["/login", "כניסה"], ["/onboarding", "פתיחת דוכן"],
  ["/terms", "תנאי שימוש"], ["/privacy", "פרטיות"], ["/accessibility", "הצהרת נגישות"],
  [`/s/${store.slug}`, "הדוכן לקונים"], ["/s/nosuchstore", "דוכן שלא קיים"],
  ["/join/nosuchinvitetoken", "הצטרפות לדוכן (לינק שבור)"],
]) {
  await pub.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await audit(pub, label);
}
// גיליונות בדוכן
const { rows: [prod] } = await db.query(
  `select p.name from products p join stores s on s.id=p.store_id where s.slug=$1 and p.deleted_at is null
     and (p.is_visible is null or p.is_visible) and (not p.track_stock or p.stock > 0) and p.option_label is null
   order by p.sort_order, p.created_at limit 1`, [store.slug]);
await pub.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
if (prod) {
  await pub.click(`.s-look button[aria-label='${prod.name}']`);
  await pub.waitForTimeout(500);
  await audit(pub, "גיליון מוצר");
  await pub.click("[data-testid=product-close]").catch(() => {});
  await pub.locator(`button[aria-label='הוספה מהירה, ${prod.name}']`).click().catch(() => {});
  await pub.waitForTimeout(500);
  if (await pub.locator("[data-testid=cart-bar]").count()) {
    await pub.click("[data-testid=cart-bar]");
    await pub.waitForTimeout(500);
    await audit(pub, "סל וקופה");
  }
}

/* ── המוכרים ── */
const girl = await ctx();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
for (const [path, label] of [
  ["/dashboard", "הזמנות"], ["/dashboard/products", "מוצרים"], ["/dashboard/settings", "החנות שלי"],
  ["/activate", "פרסום"],
]) {
  await girl.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await audit(girl, label);
}
for (const s of ["design", "products", "promo", "coupons", "payment", "shipping", "order", "share", "app", "details", "team"]) {
  await girl.goto(`${BASE}/dashboard/settings#${s}`);
  await girl.reload({ waitUntil: "networkidle" });
  await girl.waitForSelector(`[data-testid=section-${s}]`, { timeout: 15000 });
  await audit(girl, `החנות שלי ← ${s}`);
}
await girl.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
await girl.click("button[aria-label='מוצר חדש']");
await girl.waitForSelector("[data-testid=editor-close]");
await audit(girl, "עורך מוצר");

/* ── החמ"ל ── */
const admin = await ctx({ width: 1024, height: 900 });
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await audit(admin, "חמ\"ל");

/* ── סיכום ── */
const byRule = new Map();
for (const v of all) {
  const k = `${v.impact} · ${v.id}`;
  const e = byRule.get(k) ?? { help: v.help, pages: new Set(), sample: v.nodes[0], html: v.html, n: 0 };
  e.pages.add(v.page);
  e.n += v.nodes.length;
  byRule.set(k, e);
}
console.log("\n── כל ההפרות לפי כלל ──");
for (const [k, e] of [...byRule].sort()) {
  console.log(`${k} (${e.n}) — ${e.help}\n   עמודים: ${[...e.pages].join(", ")}\n   דוגמה: ${e.sample}${VERBOSE ? `\n   ${e.html}` : ""}`);
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} a11y pages without serious violations`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
