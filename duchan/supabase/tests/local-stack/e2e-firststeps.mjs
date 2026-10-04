// E2E: הכניסה הראשונה — מרינה, 4.10.2026:
//   • "עוד שני פרטים — תעשה את זה ברור ממש לילדים ומוסבר"
//   • "המספר שלך — שיהיה ברור שמזינים טלפון ומחכים לקוד, ואם לא קיבלנו
//      קוד אחרי כמה דקות שילחצו על כפתור ואני אראה באדמין שלי"
//   • "פתחנו לך קופה! — צריך להוסיף איקס, והאיור בלי מסגרת"
//   • "הדף של ההזמנות הראשון לא ברור בכלל, צריך אונבורדינג ממש ברור"
//   • דף "מה מקבלים": חץ חזרה, מחשבון החזר, בלי "חולצות שקטנו"
//   • עוגיות: "ואי עוגיות, יאמי"
import { chromium } from "playwright";
import pg from "pg";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const LOCAL = "0507770002", E164 = "972507770002";
await db.query("delete from stores where contact_phone=$1", [E164]);
await db.query("delete from phone_otps where phone=$1", [E164]);
// התראות מריצות קודמות של אותו מספר — אחרת "לחיצה שנייה" סופרת גם אותן
await db.query("delete from admin_alerts where kind='login_stuck' and body like '%050-777-0002%'");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

try {
  /* ── דף המחיר ── */
  await p.goto(`${BASE}/price`);
  check("עוגיות: 'ואי עוגיות, יאמי!'", ((await p.textContent("[data-testid=cookie-note]")) ?? "").includes("ואי עוגיות, יאמי"));
  check("דף המחיר: יש חץ חזרה", await p.locator("[data-testid=price-back]").isVisible());
  const priceText = (await p.textContent("main")) ?? "";
  check("דף המחיר: בלי 'חולצות שקטנו'", !priceText.includes("חולצות"));
  for (const t of ["קופונים והנחות", "דרופים", "שקית הפתעה", "מטבעות, אותות ורמות", "חידות כסף שלא לומדים בבית ספר", "דוכן משותף"])
    check(`דף המחיר: '${t}'`, priceText.includes(t));
  const calc = p.locator("[data-testid=payback-calc]");
  check("מחשבון ההחזר מוצג", await calc.isVisible());
  const before = (await p.textContent("[data-testid=calc-math]")) ?? "";
  await p.click("[data-testid=calc-sold] button[aria-label^='יותר']");
  const after = (await p.textContent("[data-testid=calc-math]")) ?? "";
  check("לחיצה על + משנה את התרגיל", before !== after, after.replace(/\s+/g, " "));
  await p.click("[data-testid=calc-pick-2]");
  check("בחירת 'ציור' מחליפה מחיר ל-₪25", ((await p.textContent("[data-testid=calc-price]")) ?? "").includes("25"));
  const shine = await p.evaluate(() => {
    const el = document.querySelector(".fx-shine");
    return el ? getComputedStyle(el, "::after").content : "none";
  });
  check("בלי הפס המבהיק על הבאנרים", shine === "none" || shine === "normal" || shine === "", shine);

  /* ── אונבורדינג ── */
  await p.clock.install();
  await p.goto(`${BASE}/onboarding`);
  await p.fill("input[aria-label='שם הדוכן']", "הדוכן של שלב ראשון");
  await p.click("button:has-text('הלאה, לעיצוב הדוכן')");
  const tag = p.locator("textarea[aria-label='תיאור הדוכן']");
  check("'מה מוכרים כאן' ממורכז ובשורה אחת כשהוא ריק",
    (await tag.evaluate((e) => getComputedStyle(e).textAlign)) === "center" && (await tag.getAttribute("rows")) === "1");
  await p.click("button:has-text('הלאה ←')");
  const s3 = (await p.textContent("main")) ?? "";
  check("שלב 3: כותרת ברורה", s3.includes("עוד שני פרטים קטנים"));
  check("שלב 3: אומר בכנות שהפרטים לא מופיעים בדוכן", s3.includes("ולא מופיעים בדוכן"));
  check("שלב 3: מסביר למה ההורים", s3.includes("דוכן הוא עסק אמיתי"));
  check("שלב 3: 'מה קורה עכשיו?' בשלבים", s3.includes("מה קורה עכשיו?") && s3.includes("מאמתים מספר טלפון"));
  check("בלי סימון ההורים אי אפשר להמשיך", await p.locator("button:has-text('הלאה, למספר הטלפון')").isDisabled());
  await p.check("input[aria-label='ההורים שלי יודעים']");
  await p.click("button:has-text('הלאה, למספר הטלפון')");
  check("מסך הטלפון: שלושה שלבים ברורים", await p.locator("[data-testid=phone-how] li").count() === 3);
  await p.fill("input[aria-label='מספר טלפון']", LOCAL);
  await p.click("button:has-text('שלחו לי קוד')");
  await p.waitForSelector("input[aria-label='קוד אימות']");
  check("מסך הקוד: 'מחכים לקוד'", (await p.textContent("h1")) === "מחכים לקוד");
  check("לפני 2 דקות: אין כפתור עזרה", (await p.locator("[data-testid=code-help]").count()) === 0 && await p.locator("[data-testid=code-wait]").isVisible());
  await p.clock.runFor(125_000);
  await p.waitForSelector("[data-testid=code-help]");
  check("אחרי 2 דקות: 'לא קיבלתי קוד'", true);
  await p.click("[data-testid=code-help]");
  await p.waitForSelector("[data-testid=code-help-sent]");
  const { rows: [otp] } = await db.query("select help_requested_at from phone_otps where phone=$1 order by created_at desc limit 1", [E164]);
  check("הבקשה נשמרה בשביל החמ\"ל", !!otp?.help_requested_at);
  const { rows: [alert] } = await db.query("select title from admin_alerts where kind='login_stuck' and ref like 'help:%' order by created_at desc limit 1");
  check("והמנהלת קיבלה התראה", !!alert && alert.title.includes("לא קיבלו קוד"), alert?.title ?? "");
  // לחיצה שנייה (מכשיר אחר) לא מקפיצה עוד התראה
  const again = await p.evaluate(async (phone) => (await fetch("/api/auth/sms/help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) })).status, LOCAL);
  const { rows: [{ n }] } = await db.query("select count(*)::int n from admin_alerts where kind='login_stuck' and ref like 'help:%' and body like '%050-777-0002%'");
  check("לחיצה שנייה לא שולחת עוד התראה", again === 200 && n === 1, `n=${n}`);
  const noOtp = await p.evaluate(async () => (await fetch("/api/auth/sms/help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "0507770099" }) })).status);
  check("בלי קוד שנשלח — אין עזרה (לא מקפיצים התראות סתם)", noOtp === 404);

  const { rows: [m] } = await db.query("select msg from sms_outbox where recipient=$1 order by created_at desc limit 1", [LOCAL]);
  await p.fill("input[aria-label='קוד אימות']", m.msg.match(/\d{6}/)[0]);
  await p.waitForSelector("text=נפתח דוכן", { timeout: 40000 });

  /* ── מסך ההזמנות הראשון + חגיגת הקופה ── */
  await p.evaluate(() => localStorage.setItem("duchan-whatsnew-2026-09-looks", "1"));
  await p.goto(`${BASE}/dashboard`);
  const cele = p.locator("[data-testid=kupa-celebrate]");
  await cele.waitFor({ timeout: 15000 });
  check("'פתחנו לך קופה' מופיע עם איקס", await p.locator("[data-testid=kupa-x]").isVisible());
  const framed = await cele.locator("svg[role=img]").first().evaluate((svg) => {
    const box = svg.getBoundingClientRect(), sheet = svg.closest("[role=dialog]").getBoundingClientRect();
    return { w: Math.round(box.width), sw: Math.round(sheet.width), border: getComputedStyle(svg.parentElement).borderTopWidth };
  });
  check("האיור פרוס על כל רוחב החלון, בלי מסגרת", Math.abs(framed.w - framed.sw) <= 2 && framed.border === "0px", JSON.stringify(framed));
  await p.click("[data-testid=kupa-x]");
  check("האיקס סוגר", (await cele.count()) === 0);

  const steps = p.locator("[data-testid=orders-empty]");
  check("מסלול 'ככה הדוכן מתחיל לעבוד'", ((await steps.textContent()) ?? "").includes("ככה הדוכן מתחיל לעבוד"));
  check("צעד 1 'פתחת דוכן' מסומן כנעשה", (await p.getAttribute("[data-testid=first-step-open]", "data-state")) === "done");
  check("הצעד הנוכחי: מוצר ראשון", (await p.getAttribute("[data-testid=first-step-product]", "data-state")) === "current");
  check("עם כפתור אחד ברור", await p.locator("[data-testid=first-steps-product]").isVisible());
  check("בלי הבאנר השחור הכפול", (await p.locator("a[href='/activate'].bg-\\[var\\(--ink\\)\\]").count()) === 0);
  // מוצר ראשון → הצעד הבא הוא פרסום
  const { rows: [st] } = await db.query("select id from stores where contact_phone=$1", [E164]);
  await db.query("insert into products (store_id, name, price, stock) values ($1, 'סקוויש', 15, 3)", [st.id]);
  await p.reload();
  await p.waitForSelector("[data-testid=first-step-publish][data-state=current]", { timeout: 15000 });
  check("אחרי מוצר: הצעד הנוכחי הוא לפרסם", await p.locator("[data-testid=first-steps-publish]").isVisible());
  if (process.env.SHOTS) await p.locator("[data-testid=orders-empty]").screenshot({ path: `${process.env.SHOTS}/first-steps.png` });
  // המרווחים בין הסימנים שווים כשאין בשלב תוכן נוסף (מרינה: "הקווים והרווחים בכלל לא שווים")
  const gaps = await p.evaluate(() => {
    const ys = [...document.querySelectorAll("[data-testid=orders-empty] ol > li > span[aria-hidden]:not(.absolute)")].map((m) => m.getBoundingClientRect().top);
    return ys.slice(1).map((y, i) => Math.round(y - ys[i]));
  });
  check("הקו רציף: כל קטע מגיע בדיוק עד הסימן הבא", await p.evaluate(() => {
    const lis = [...document.querySelectorAll("[data-testid=orders-empty] ol > li")];
    return lis.slice(0, -1).every((li, i) => {
      const line = li.querySelector("span.absolute").getBoundingClientRect();
      const next = lis[i + 1].querySelector("span[aria-hidden]:not(.absolute)").getBoundingClientRect();
      return Math.abs(line.bottom - (next.top + next.height / 2)) <= 1;
    });
  }), gaps.join(","));
  check("store-state-banner עדיין קיים (מבחן ההפעלה)", await p.locator("[data-testid=store-state-banner]").isVisible());
  check("בלי שגיאות בדפדפן", errs.length === 0, errs.join(" | "));
} finally {
  await db.query("delete from stores where contact_phone=$1", [E164]);
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
