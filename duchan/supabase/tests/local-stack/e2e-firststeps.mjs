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
  await p.click("[data-testid=ob-next]");
  // מרינה, 10.2026: "איזה עמוס זה ולא מובן מה לעשות" — שאלה אחת בכל מסך
  check("שלב 2: רק המוצר הראשון", (await p.textContent("h1")) === "מה מוכרים ראשון?" &&
    (await p.locator("textarea[aria-label='תיאור הדוכן']").count()) === 0 && (await p.locator("button[aria-label^='ערכת']").count()) === 0);
  check("בלי שם ומחיר אי אפשר להמשיך", await p.locator("[data-testid=ob-next]").isDisabled());
  await p.fill("input[aria-label='שם המוצר']", "צמיד");
  check("שם בלי מחיר — עדיין לא", await p.locator("[data-testid=ob-next]").isDisabled());
  await p.fill("input[aria-label='מחיר המוצר']", "8");
  await p.click("[data-testid=ob-next]");
  check("שלב 3: רק צבע — שש ערכות", (await p.textContent("h1")) === "באיזה צבע הדוכן?" && (await p.locator("button[aria-label^='ערכת']").count()) === 6);
  await p.click("button[aria-label='ערכת לבנדר']");
  check("הדוכן משתנה מיד, עם המוצר שהוסיפו",
    (await p.getAttribute("button[aria-label='ערכת לבנדר']", "aria-checked")) === "true" && ((await p.textContent("[data-testid=ob-preview]")) ?? "").includes("צמיד"));
  await p.click("[data-testid=ob-next]");
  const s4 = (await p.textContent("main")) ?? "";
  check("שלב 4: ההורים, בלי גיל ועיר", s4.includes("ההורים יודעים?") && s4.includes("וכותבים לך בוואטסאפ") &&
    (await p.locator("input[aria-label='גיל'], input[aria-label='עיר']").count()) === 0);
  check("בלי סימון ההורים אי אפשר להמשיך", await p.locator("button:has-text('הלאה, למספר הטלפון')").isDisabled());
  await p.check("input[aria-label='ההורים שלי יודעים']");
  await p.click("button:has-text('הלאה, למספר הטלפון')");
  check("מסך הטלפון: בלי רשימת הסברים", await p.locator("[data-testid=phone-how]").count() === 0);
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

  /* ── מסך ההזמנות הראשון ──
     מרינה, 10.2026: "המסכים האלו עמוסים מאוד, לא ברורים" — בלי חגיגת
     קופה לפני הפרסום, ובמקום חמישה צעדים עם פסקאות: פס קצר וכרטיס אחד. */
  await p.evaluate(() => localStorage.setItem("duchan-whatsnew-2026-09-looks", "1"));
  await p.goto(`${BASE}/dashboard`);
  await p.waitForSelector("[data-testid=orders-empty]", { timeout: 15000 });
  await p.waitForTimeout(2000);
  check("לפני הפרסום: בלי 'פתחנו לך קופה'", (await p.locator("[data-testid=kupa-celebrate]").count()) === 0);
  check("בלי 'ואם יש זמן' לפני הפרסום", (await p.locator("[data-testid=store-missing]").count()) === 0);
  check("פס התקדמות של ארבע מילים", (await p.locator("[data-testid=orders-empty] ol > li").count()) === 4);
  const { rows: [st] } = await db.query("select id from stores where contact_phone=$1", [E164]);
  // המוצר מההקמה כבר קיים, אז הצעד הנוכחי הוא פרסום
  await p.waitForSelector("[data-testid=first-step-publish][data-state=current]", { timeout: 15000 });
  check("'דוכן' ו'מוצר' מסומנים כנעשו", (await p.getAttribute("[data-testid=first-step-open]", "data-state")) === "done" &&
    (await p.getAttribute("[data-testid=first-step-product]", "data-state")) === "done");
  check("כרטיס אחד, כפתור אחד: לפרסם", await p.locator("[data-testid=first-steps-publish]").isVisible() &&
    (await p.locator("[data-testid=orders-empty] a.btn, [data-testid=orders-empty] button.btn").count()) === 1);
  check("הכרטיס קצר — בלי פסקאות", ((await p.textContent("[data-testid=first-step-card]")) ?? "").length < 70,
    String(((await p.textContent("[data-testid=first-step-card]")) ?? "").length));
  if (process.env.SHOTS) await p.locator("[data-testid=orders-empty]").screenshot({ path: `${process.env.SHOTS}/first-steps.png` });
  // בלי מוצרים — הצעד הנוכחי הוא מוצר ראשון
  await db.query("update products set deleted_at=now() where store_id=$1", [st.id]);
  await p.reload();
  await p.waitForSelector("[data-testid=first-step-product][data-state=current]", { timeout: 15000 });
  check("בלי מוצר: הצעד הנוכחי הוא מוצר ראשון", await p.locator("[data-testid=first-steps-product]").isVisible());
  await db.query("update products set deleted_at=null where store_id=$1", [st.id]);
  await p.reload();
  await p.waitForSelector("[data-testid=first-step-publish][data-state=current]", { timeout: 15000 });
  check("store-state-banner עדיין קיים (מבחן ההפעלה)", await p.locator("[data-testid=store-state-banner]").isVisible());

  /* ── כל הצעדים נעשו: צעד 5 הוא ההמתנה, עם אפליקציה + התראות ──
     מרינה: "תכתוב ב5 ועכשיו מחכים להזמנה הראשונה שתופיע לכם פה! אגב אפשר
     לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה" */
  check("לפני שהכל נעשה — צעד 5 בלי כפתור ההתראות", (await p.locator("[data-testid=alerts-open]").count()) === 0);
  await db.query("update stores set activated_at=now() where id=$1", [st.id]);
  await p.evaluate((id) => localStorage.setItem(`duchan-shared-${id}`, "1"), st.id);
  await p.reload();
  await p.waitForSelector("[data-testid=alerts-open]", { timeout: 15000 });
  const s5 = (await p.textContent("[data-testid=first-step-order]")) ?? "";
  check("צעד 5: 'ועכשיו מחכים להזמנה הראשונה, שתופיע לכם פה!'", s5.includes("ועכשיו מחכים להזמנה הראשונה, שתופיע לכם פה!"));
  check("צעד 5: 'אגב, אפשר לשמור את הדוכן כמו אפליקציה'", s5.includes("אפשר לשמור את הדוכן כמו אפליקציה ולקבל התראה"));
  check("צעד 5: הכפתור 'לחצו כאן לשמור על מסך הבית ולהפעיל התראות'",
    ((await p.textContent("[data-testid=alerts-open]")) ?? "").includes("לחצו כאן לשמור על מסך הבית ולהפעיל התראות"));
  if (process.env.SHOTS) await p.locator("[data-testid=orders-empty]").screenshot({ path: `${process.env.SHOTS}/first-steps-5.png` });
  await p.click("[data-testid=alerts-open]");
  await p.waitForSelector("[data-testid=order-alerts]");
  check("לחיצה פותחת את שני הצעדים", (await p.locator("[data-testid=alerts-step-install]").count()) === 1 && (await p.locator("[data-testid=alerts-step-push]").count()) === 1);
  if (process.env.SHOTS) await p.locator("[data-testid=orders-empty]").screenshot({ path: `${process.env.SHOTS}/first-steps-5-open.png` });
  check("בלי שגיאות בדפדפן", errs.length === 0, errs.join(" | "));
} finally {
  await db.query("delete from stores where contact_phone=$1", [E164]);
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
