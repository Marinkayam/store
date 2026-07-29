// סמוק: כל מסלול באתר נטען בלי 500, ובלי שגיאת דפדפן.
//
// זו הבדיקה שהייתה תופסת את התקלה של היום — דף שנטען "בהצלחה" אבל מציג
// מסך שגיאה. לכן היא בודקת גם סטטוס, גם תוכן, וגם מה שנרשם בקונסול.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [live] } = await db.query(
  "select slug from stores where activated_at is not null order by created_at limit 1"
);
const { rows: [draft] } = await db.query(
  "select slug from stores where activated_at is null order by created_at limit 1"
);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });

/** נכנסת פעם אחת — חלק מהמסלולים מוגנים */
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await verifyPhone(page, "0501234567");
await page.waitForURL("**/dashboard", { timeout: 20000 });

const PATHS = [
  ["/", "דף הבית"],
  ["/login", "כניסה"],
  ["/onboarding", "פתיחת דוכן"],
  ["/price", "מחיר"],
  ["/terms", "תנאי שימוש"],
  ["/privacy", "פרטיות"],
  ["/dashboard", "הזמנות"],
  ["/dashboard/products", "מוצרים"],
  ["/dashboard/share", "להפיץ"],
  ["/dashboard/settings", "החנות שלי"],
  ["/activate", "פרסום"],
  [`/s/${live.slug}`, "חנות פעילה"],
  ...(draft ? [[`/s/${draft.slug}`, "חנות בתצוגה מקדימה"]] : []),
  ["/s/nosuchstore", "לינק שלא קיים"],
  ["/claim/nosuchtoken", "טוקן שלא קיים"],
];

// שגיאות שאין להן משמעות לבדיקה: תמונות חסרות בסביבה המקומית
// fonts.googleapis חסום בסביבת הבדיקה בלבד; בפרודקשן הוא נטען, ובכל מקרה
// כשל בפונט נופל לפונט המערכת ולא שובר שום דבר
const IGNORE = /favicon|manifest|_next\/image|duchan-media|ERR_ABORTED|fonts\.googleapis|ERR_TUNNEL/i;

for (const [path, label] of PATHS) {
  const errors = [];
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("console", (m) => m.type() === "error" && !IGNORE.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
  await page.waitForTimeout(600);
  const body = (await page.textContent("body")) ?? "";

  const status = res?.status() ?? 0;
  const broken =
    status >= 500 ||
    body.includes("Application error") ||
    body.includes("Unhandled Runtime Error") ||
    body.includes("This page could not be found") === false && status === 404 && !path.includes("nosuch");

  check(`${label} (${path}) loads`, !broken, `status=${status}`);
  check(`${label} — no javascript errors`, errors.length === 0, errors[0]?.slice(0, 90) ?? "");
}

/* מסלולי API שאסור להם להתפוצץ גם עם קלט שגוי */
const apiChecks = [
  ["POST", "/api/orders", { }],
  ["POST", "/api/orders", { slug: "nope", items: [] }],
  ["POST", "/api/upload", { kind: "bad" }],
  ["POST", "/api/track", { }],
  ["POST", "/api/track/ref", { slug: "%%%" }],
  ["POST", "/api/auth/sms/start", { phone: "not-a-phone" }],
  ["POST", "/api/auth/sms/verify", { phone: "0500000000", code: "x" }],
  ["POST", "/api/revalidate", { slug: "nope" }],
];
for (const [method, path, body] of apiChecks) {
  const status = await page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.status;
    },
    { method, path, body }
  );
  check(`${path} answers a bad request without crashing`, status < 500, `status=${status}`);
}

/* גוף לא תקין בכלל — לא JSON */
const rawStatus = await page.evaluate(async () => {
  const r = await fetch("/api/orders", { method: "POST", body: "not json at all" });
  return r.status;
});
check("a non-json body is refused, not crashed on", rawStatus < 500, `status=${rawStatus}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
