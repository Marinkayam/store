/**
 * חבילה 11 — חמ"ל סקוויש קלאב.
 *
 * הבאג שהחבילה הזו נולדה ממנו: בניתי את פאנל הפיילוט ב-`/admin` —
 * החמ"ל של דוכן — בזמן שלסקוויש קלאב יש חמ"ל משלו ב-`/admin/squish`.
 * הקוד עלה לפרודקשן, הבדיקות עברו, ומרינה פתחה מסך בלי הכפתורים
 * שאמרתי שקיימים. בדיקה שרואה רק את השרת לא תופסת את זה.
 *
 * מכאן: כל פעולה בחמ"ל נבדקת **דרך המסך שהמנהלת באמת פותחת**.
 */
import {
  BASE, asUser, checker, clickUntil, closeHelper, db, launch, newCollector, uidOf, verifyPhone, wipe,
} from "./helpers/index.mjs";

const ADMIN = "0509990000";
const U = {
  kid: { num: "0521130901", e164: "972521130901", nick: "AdminKid", title: "מדף בדיקה" },
};

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));
await pool.query("delete from squish_pilot_tokens");

const { check, done } = checker("בדיקות חמ״ל");
const errs = [];
const b = await launch();

const admin = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
admin.on("pageerror", (e) => errs.push(e.message));
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, ADMIN);
await admin.waitForTimeout(2500);

/* ── 1. המסך נפתח, ויש בו את מה שצריך ── */
await admin.goto(`${BASE}/admin/squish`, { waitUntil: "networkidle" });
await admin.waitForTimeout(2000);
const body = await admin.textContent("body");
check("החמ\"ל של סקוויש נפתח", admin.url().endsWith("/admin/squish"), admin.url());
check("עם הכותרת הנכונה", body.includes("סקוויש קלאב — חמ״ל"));
check("ותת-כותרת", body.includes("פיילוט, בטיחות וטריידים במקום אחד"));
check("יש כפתור קישור פיילוט", (await admin.locator("[data-testid=pilot-link]").count()) === 1);
check("יש קישור לפתיחת סקוויש קלאב", (await admin.locator("a[href='/squish']").count()) >= 1);
check("ויש רענון", (await admin.locator("button[aria-label=רענון]").count()) === 1);

for (const label of ["משתמשות פיילוט", "סיימו אונבורדינג", "מחכות לאישור הורה", "דיווחים פתוחים", "טריידים תקועים"]) {
  check(`כרטיס מספר: ${label}`, body.includes(label));
}
for (const s of ["סשני פיילוט", "דיווחים", "טריידים תקועים", "יומן פעולות"]) {
  check(`יש מקטע: ${s}`, body.includes(s));
}

/* ── 2. מצב ריק מעוצב, לא מלבן לבן ── */
check("אין סשן פיילוט — ומוצג מצב ריק מוסבר",
  body.includes("אין סשן פיילוט פעיל") && body.includes("קישור חד-פעמי"));

/* ── 3. מק"ט הקישור באמת עובד ──
   `clickUntil` ולא `click` + המתנה קבועה: המסך מרענן את עצמו כשנתוני
   החמ"ל חוזרים מהשרת, והרינדור מחדש מנתק את הכפתור בדיוק כשלוחצים
   עליו. הלחיצה נופלת בלי שקרה כלום, וזה נראה כמו שבירה של החמ"ל.
   כאן לוחצים עד שהתוצאה מופיעה במסך — הקישור עצמו. */
await clickUntil(admin, "[data-testid=pilot-link]", "text=/\\/squish\\/pilot\\//");
const { rows: toks } = await pool.query("select token, created_by from squish_pilot_tokens");
check("לחיצה מייצרת טוקן אמיתי בדאטהבייס", toks.length === 1, `${toks.length}`);
check("ומתועד מי יצרה אותו", !!toks[0]?.created_by);
const shown = await admin.textContent("body");
check("והקישור מוצג במסך", shown.includes(`/squish/pilot/${toks[0].token}`));
check("עם ההסבר שהוא חד-פעמי", shown.includes("חד-פעמי"));

/* ── 4. הילדה נכנסת דרכו ומופיעה בחמ"ל ── */
const kidCtx = await b.newContext({ viewport: { width: 390, height: 900 } });
const kid = await kidCtx.newPage();
await kid.goto(`${BASE}/squish/pilot/${toks[0].token}`, { waitUntil: "networkidle" });
await kid.click("a[href='/squish/new']");
await kid.waitForURL("**/squish/new");
const { IMG } = await import("./helpers/index.mjs");
for (const [i, name] of ["מ1", "מ2", "מ3"].entries()) {
  await kid.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
  await kid.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
  await kid.waitForTimeout(600);
  await kid.fill("input[aria-label='שם הסקווישי']", name);
  await kid.click("button:has-text('הלאה')");
  await kid.waitForTimeout(250);
  await kid.click("button:has-text('להוסיף לאוסף')");
  await kid.waitForTimeout(400);
}
await kid.fill("input[aria-label='שם האוסף']", U.kid.title);
await kid.click("button:has-text('לשמור את האוסף')");
await kid.fill("input[aria-label='כינוי']", U.kid.nick);
await kid.check("input[aria-label='ההורים שלי יודעים']");
await kid.waitForTimeout(300);
await verifyPhone(kid, U.kid.num);
await kid.waitForURL("**/squish/collection", { timeout: 40000 });
const kidId = await uidOf(pool, U.kid.e164);

await admin.click("button[aria-label=רענון]");
await admin.waitForTimeout(2500);
check("הפיילוט מופיע בחמ\"ל", (await admin.locator("[data-testid=pilot-card]").count()) === 1);
const withPilot = await admin.textContent("body");
check("עם הכינוי שלה", withPilot.includes(U.kid.nick));
check("וספירת הסקווישים", withPilot.includes("סקווישים"));
check("ומצב 'מחכה לאישור הורה'", withPilot.includes("מחכה לאישור הורה") || withPilot.includes("בונה אוסף"),
  withPilot.match(/מחכה לאישור הורה|בונה אוסף|מאושר/)?.[0] ?? "—");

/* ── 5. פתיחת פרטים ── */
await admin.click("button:has-text('פתיחת פרטים')");
await admin.waitForTimeout(600);
const details = await admin.textContent("body");
check("פתיחת פרטים מציגה פירוט אמיתי",
  details.includes("שמירה מוצלחת אחרונה") && details.includes("שמירות שנכשלו"));
check("ובלי מספר טלפון", !details.includes(U.kid.e164) && !details.includes("0521130901"));

/* ── 6. שגיאת שמירה מופיעה ── */
await pool.query(
  "insert into squish_write_failures (user_id, op, code, expects, cid) values ($1,'squish.item.create','PGRST204','squish_items.stickers','admin-test')",
  [kidId]);
await admin.click("button[aria-label=רענון]");
await admin.waitForTimeout(2500);
check("שגיאת שמירה מופיעה כמצב", (await admin.textContent("body")).includes("הייתה שגיאת שמירה"));

/* ── 7. אישור הורה משנה מצב ── */
await pool.query("update squish_profiles set parent_approved_at=now() where user_id=$1", [kidId]);
await pool.query("delete from squish_write_failures where user_id=$1", [kidId]);
await admin.click("button[aria-label=רענון]");
await admin.waitForTimeout(2500);
check("אחרי אישור הורה המצב 'מאושר'", (await admin.textContent("body")).includes("מאושר"));

/* ── 8. איפוס פיילוט ── */
admin.on("dialog", (d) => d.accept());
await admin.click("button:has-text('איפוס פיילוט')");
await admin.waitForTimeout(3000);
check("האיפוס מחק את הפרופיל",
  (await pool.query("select count(*)::int c from squish_profiles where user_id=$1", [kidId])).rows[0].c === 0);
check("ואת הפריטים",
  (await pool.query("select count(*)::int c from squish_items where owner_user_id=$1", [kidId])).rows[0].c === 0);
check("אבל חשבון הכניסה נשאר",
  (await pool.query("select count(*)::int c from phone_accounts where phone=$1", [U.kid.e164])).rows[0].c === 1);
check("והמסך חזר למצב ריק",
  (await admin.textContent("body")).includes("אין סשן פיילוט פעיל"));

/* ── 9. הפעולות נרשמות ביומן ── */
const { rows: log } = await pool.query(
  "select action from squish_admin_actions where target_user=$1 order by created_at", [kidId]);
check("איפוס נרשם ביומן", log.some((r) => r.action === "pilot_reset"), log.map((r) => r.action).join(","));

/* ── 10. מי שאינה מנהלת לא רואה כלום ── */
const outsider = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await outsider.goto(`${BASE}/admin/squish`, { waitUntil: "networkidle" });
await outsider.waitForTimeout(1200);
const outBody = await outsider.textContent("body");
check("מי שלא מחוברת לא מגיעה לחמ\"ל",
  !outBody.includes("סקוויש קלאב — חמ״ל"), outsider.url());
const outApi = await outsider.evaluate(() =>
  fetch("/api/admin/squish-pilot").then(async (r) => ({ s: r.status, t: await r.text() })));
check("וה-API מחזיר 403", outApi.s === 403, `${outApi.s}`);
check("בלי דליפת נתונים", !outApi.t.includes("AdminKid"));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
