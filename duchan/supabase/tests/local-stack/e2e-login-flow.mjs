// E2E: יומן כניסות וציר זמן בחמ"ל.
//
// מרינה: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין קשה לי לתת
// להם מענה כי אין לי פלואו רציף."
//
// החוזים:
//   1. כל שלב נרשם: מספר לא תקין (כפי שהוקלד), בקשת קוד, הסמס נשלח, המתנה
//      של דקה, קוד שגוי, קוד נכון.
//   2. הספק דוחה (שרת הדמה, מספרים 05000XXX99) → "הסמס לא יצא" עם הסיבה, ובקשת
//      הקוד לא נשארת בטבלה (לא סופרת למכסה ולא פותחת חלון המתנה).
//   3. אותה סיבה אצל שני מספרים → באנר "תקלה כללית בספק".
//   4. נכנסה ומיד ביקשה קוד שוב → "הסשן לא נשמר", עם רמז על דפדפן אפליקציה.
//   5. שורה ב"תקועות" מקבלת משפט "מה קרה" וכפתור "ציר זמן" שפותח את הציר.
//   6. רק מנהלת רואה את זה.
//   7. התווית של הדפדפן נרשמת — ולא ה-User-Agent הגולמי.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone, lastCode, closeHelper } from "../../../e2e/helpers/sms.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const WA_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.1.1";
const post = (path, body, ua = WA_UA) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": ua }, body: JSON.stringify(body) });

const OK_LOCAL = "0527771111", OK_E164 = "972527771111";
const FAIL1_LOCAL = "0500000099", FAIL1 = "972500000099";
const FAIL2_LOCAL = "0500001199", FAIL2 = "972500001199";
const BAD_TYPED = "0212345678";
const REENTRY = "972527772222";
const NOREC = "972527773333";

// נקי: אין שאריות מריצה קודמת
for (const p of [OK_E164, FAIL1, FAIL2, BAD_TYPED, "972212345678", REENTRY, NOREC]) {
  await db.query("delete from login_events where phone=$1", [p]);
  await db.query("delete from phone_otps where phone=$1", [p]);
}
await db.query("delete from phone_accounts where phone=$1", [OK_E164]);
await db.query("delete from auth.users where email like $1", [`${OK_E164}@%`]);

const kinds = async (phone) =>
  (await db.query("select kind, detail, client from login_events where phone=$1 order by at, id", [phone])).rows;

/* ── 1. רישום שלבים ── */
let r = await post("/api/auth/sms/start", { phone: BAD_TYPED });
check("מספר קווי נדחה מיד (סמס לא מגיע לקווי)", r.status === 400 && /נייד/.test((await r.json()).error));
let ev = await kinds(BAD_TYPED);
check("נרשם 'מספר לא תקין' עם מה שהוקלד", ev.length === 1 && ev[0].kind === "phone_invalid" && ev[0].detail === BAD_TYPED, JSON.stringify(ev));

r = await post("/api/auth/sms/start", { phone: OK_LOCAL });
check("בקשת קוד תקינה", r.ok);
ev = await kinds(OK_E164);
check("נרשמו: ביקשה קוד ← הסמס נשלח", ev.map((e) => e.kind).join(",") === "code_requested,sms_sent", ev.map((e) => e.kind).join(","));
check("התווית של הדפדפן נרשמה (וואטסאפ), לא ה-User-Agent", ev.every((e) => e.client === "וואטסאפ") &&
  !JSON.stringify(ev).includes("Mozilla"));

r = await post("/api/auth/sms/start", { phone: OK_LOCAL });
check("בקשה שנייה תוך דקה נדחית", r.status === 429);
ev = await kinds(OK_E164);
check("ונרשם 'המתנה של דקה'", ev.at(-1).kind === "resend_wait");

r = await post("/api/auth/sms/verify", { phone: OK_LOCAL, code: "000000" });
check("קוד שגוי נדחה", r.status === 400);
r = await post("/api/auth/sms/verify", { phone: OK_LOCAL, code: "12" });
check("קוד קצר נדחה", r.status === 400);
const code = await lastCode(OK_LOCAL);
r = await post("/api/auth/sms/verify", { phone: OK_LOCAL, code });
check("קוד נכון נכנס", r.ok);
ev = await kinds(OK_E164);
check("נרשמו שלבי ההקלדה: שגוי, לא שש ספרות, נכנסה",
  ["verify_wrong", "verify_format", "verify_ok"].every((k) => ev.some((e) => e.kind === k)), ev.map((e) => e.kind).join(","));
check("ביומן אין את תוכן הקוד", !JSON.stringify(await db.query("select * from login_events where phone=$1", [OK_E164]).then((x) => x.rows)).includes(code));

/* ── 2. הספק דוחה ── */
r = await post("/api/auth/sms/start", { phone: FAIL1_LOCAL });
check("הספק דוחה → 502", r.status === 502);
ev = await kinds(FAIL1);
check("נרשם 'הסמס לא יצא' עם הסיבה ועם הקוד", ev.some((e) => e.kind === "sms_failed" && /יתרת הודעות/.test(e.detail ?? "") && /-2/.test(e.detail ?? "")), JSON.stringify(ev.at(-1)));
const { rows: [{ n: leftover }] } = await db.query("select count(*)::int n from phone_otps where phone=$1", [FAIL1]);
check("ובקשת הקוד לא נשארה בטבלה (לא סופרת למכסה)", leftover === 0, String(leftover));
r = await post("/api/auth/sms/start", { phone: FAIL1_LOCAL });
check("ולכן אין חלון המתנה של דקה — היא מקבלת שוב את הסיבה האמיתית, לא 'כבר שלחנו'", r.status === 502, String(r.status));

/* ── 3. אותה תקלה אצל מספר שני = תקלה כללית ── */
await post("/api/auth/sms/start", { phone: FAIL2_LOCAL });

/* ── 4. נכנסה ומיד ביקשה קוד שוב (נתוני דמה בזמנים מדויקים) ── */
const t = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();
await db.query(
  `insert into login_events (phone, kind, at, client) values
   ($1,'code_requested',$2,'וואטסאפ'),($1,'sms_sent',$2,'וואטסאפ'),($1,'verify_ok',$3,'וואטסאפ'),($1,'code_requested',$4,'וואטסאפ')`,
  [REENTRY, t(8), t(6), t(3)]
);

/* ── 5. "תקועה": שתי בקשות קוד, בלי הקלדה ── */
await db.query(
  `insert into phone_otps (phone, code_hash, expires_at, created_at) values ($1,'x',$2,$3),($1,'x',$2,$4)`,
  [NOREC, new Date(Date.now() + 5 * 60_000).toISOString(), t(9), t(5)]
);
await db.query(
  `insert into login_events (phone, kind, at) values ($1,'code_requested',$2),($1,'sms_sent',$2),($1,'code_requested',$3),($1,'sms_sent',$3)`,
  [NOREC, t(9), t(5)]
);

/* ── המנהלת ── */
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
const api = async (q = "") => {
  const res = await admin.request.get(`${BASE}/api/admin/login-flow${q}`);
  return { status: res.status(), body: await res.json().catch(() => null) };
};

let a = await api(`?phone=${OK_LOCAL}`);
check("ציר זמן של מי שנכנסה: הכל בסדר", a.status === 200 && a.body.diagnosis.state === "ok" && /נכנסה בהצלחה/.test(a.body.diagnosis.headline), a.body?.diagnosis?.headline);
check("בציר יש את כל השלבים בעברית", ["ביקשה קוד", "הסמס נשלח לספק", "הקלידה קוד שגוי", "הקוד נכון, נכנסה"].every((l) => a.body.events.some((e) => e.label === l)));

a = await api(`?phone=${FAIL1_LOCAL}`);
check("אבחון: 'הסמס לא יצא' עם הסיבה", /הסמס לא יצא/.test(a.body.diagnosis.headline) && /יתרת הודעות/.test(a.body.diagnosis.headline), a.body.diagnosis.headline);
check("ומציע קישור כניסה", a.body.diagnosis.action === "link");

a = await api(`?phone=${BAD_TYPED}`);
check("חיפוש לפי מספר לא תקין שהוקלד", /מספר לא תקין/.test(a.body.diagnosis.headline) && a.body.diagnosis.headline.includes(BAD_TYPED), a.body.diagnosis.headline);
check("ורמז שזה טלפון קווי", /קווי/.test(a.body.diagnosis.hint));
a = await api(`?phone=2123456`);
check("חיפוש חלקי מוצא אותו", !!a.body.diagnosis && /מספר לא תקין/.test(a.body.diagnosis.headline ?? ""));

a = await api(`?phone=${REENTRY.replace(/^972/, "0")}`);
check("אבחון: נכנסה ובקשה קוד שוב → הסשן לא נשמר", /חזרה למסך הכניסה/.test(a.body.diagnosis.headline), a.body.diagnosis.headline);
check("עם רמז על הדפדפן של וואטסאפ", /וואטסאפ/.test(a.body.diagnosis.hint) && /Safari|Chrome/.test(a.body.diagnosis.hint));

a = await api(`?phone=${NOREC.replace(/^972/, "0")}`);
check("אבחון: הסמס יצא ולא הוקלד קוד", /הסמס יצא/.test(a.body.diagnosis.headline) && /לא הוקלד שום קוד/.test(a.body.diagnosis.headline), a.body.diagnosis.headline);

a = await api("");
check("תמונת מצב: ניסו / נכנסו / הסמס נכשל", a.body.health.tried >= 4 && a.body.health.entered >= 1 && a.body.health.smsFailed >= 2, JSON.stringify(a.body.health));
check("אותה תקלה אצל שני מספרים = תקלה כללית בספק", !!a.body.outage && a.body.outage.phones >= 2 && /יתרת הודעות/.test(a.body.outage.reason), JSON.stringify(a.body.outage));
check("'צריכות עזרה' כולל את התקועות ואת מי שהסשן לא נשמר אצלה", [NOREC, REENTRY, FAIL1].every((p) => a.body.needHelp.some((n) => n.phone === p)));
check("ומי שנכנסה לא ברשימה", !a.body.needHelp.some((n) => n.phone === OK_E164));

// לא מנהלת
const anon = await fetch(`${BASE}/api/admin/login-flow?phone=${OK_LOCAL}`);
check("בלי כניסה אין גישה", anon.status === 403);

/* ── הממשק ── */
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("[data-testid=login-flow]", { timeout: 20000 });
await admin.waitForSelector("[data-testid=login-health]", { timeout: 15000 });
check("הכרטיס 'כניסות' מציג תמונת מצב", ((await admin.textContent("[data-testid=login-health]")) ?? "").includes("ניסו"));
check("ובאנר תקלה כללית בספק", await admin.locator("[data-testid=login-outage]").isVisible());
check("ורשימת 'צריכות עזרה'", (await admin.locator("[data-testid=login-needhelp-row]").count()) >= 3);

await admin.fill("[data-testid=login-search-input]", NOREC.replace(/^972/, "0"));
await admin.click("[data-testid=login-search]");
await admin.waitForSelector("[data-testid=login-diagnosis]", { timeout: 10000 });
const diag = (await admin.textContent("[data-testid=login-diagnosis]")) ?? "";
check("חיפוש במסך: משפט 'מה קרה' ו'מה עושים'", diag.includes("הסמס יצא") && diag.includes("קישור כניסה"), diag.slice(0, 80));
check("וציר זמן עם שעות", (await admin.locator("[data-testid=login-events] li").count()) === 4);
await admin.click("[data-testid=login-mint]");
await admin.waitForSelector("[data-testid=login-whatsapp]", { timeout: 10000 });
const wa = (await admin.getAttribute("[data-testid=login-whatsapp]", "href")) ?? "";
check("ואפשר ליצור קישור ולשלוח בוואטסאפ ישר משם", wa.startsWith("https://wa.me/972527773333?text="));
await admin.waitForTimeout(600);
const evAfter = await kinds(NOREC);
check("יצירת הקישור נרשמת בציר", evAfter.some((e) => e.kind === "link_minted"));

const row = admin.locator(`[data-testid=stuck-row][data-phone='${NOREC}']`);
await row.waitFor({ timeout: 15000 });
check("בשורה ב'לא מצליחים להיכנס' יש משפט 'מה קרה'", ((await row.locator("[data-testid=stuck-headline]").textContent()) ?? "").includes("הסמס יצא"));
await admin.fill("[data-testid=login-search-input]", "");
await row.locator("[data-testid=stuck-timeline]").click();
await admin.waitForFunction(
  (p) => document.querySelector("[data-testid=login-timeline]")?.textContent?.includes(p),
  "052-777-3333",
  { timeout: 10000 }
);
check("'ציר זמן' בשורה פותח את הציר של אותו מספר", true);
if (process.env.SHOTS) await admin.locator("[data-testid=login-flow]").screenshot({ path: `${process.env.SHOTS}/login-flow.png` });

await browser.close();
await closeHelper();
for (const p of [OK_E164, FAIL1, FAIL2, BAD_TYPED, REENTRY, NOREC]) {
  await db.query("delete from login_events where phone=$1", [p]);
  await db.query("delete from phone_otps where phone=$1", [p]);
}
await db.query("delete from login_links where phone=$1", [NOREC]);
await db.end();

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
