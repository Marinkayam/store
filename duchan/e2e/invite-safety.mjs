// שלב א': בטיחות ההזמנה וההצטרפות.
//
// כל בדיקה כאן מכוונת לחור שהיה פתוח בפועל, ולא להתנהגות תיאורטית:
//   · נחסמת שנכנסה שוב דרך אותו קישור קיבלה קשר פעיל בחזרה
//   · מושהית יכלה להצטרף ולהרחיב מעגל
//   · קישור הזמנה היה דלת פתוחה לנצח
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, writeFileSync } from "fs";
import { clickUntil, verifyPhone, closeHelper } from "./helpers/index.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const OUT = process.env.E2E_OUT ?? "/tmp/e2e-invite";
mkdirSync(OUT, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const U = {
  noya: { num: "0521119901", e164: "972521119901", nick: "NoyaI", title: "מדף א" },
  maya: { num: "0521119902", e164: "972521119902", nick: "MayaI", title: "מדף ב" },
  lia:  { num: "0521119903", e164: "972521119903", nick: "LiaI",  title: "מדף ג" },
};
const uidSql = "(select a.user_id from phone_accounts a where a.phone=$1)";
for (const u of Object.values(U)) {
  await db.query(`delete from squish_trade_proposals where sender_user_id in ${uidSql} or receiver_user_id in ${uidSql}`, [u.e164]);
  await db.query(`delete from squish_blocks where blocker_user_id in ${uidSql} or blocked_user_id in ${uidSql}`, [u.e164]);
  await db.query(`delete from squish_items where owner_user_id in ${uidSql}`, [u.e164]);
  await db.query(`delete from squish_profiles where user_id in ${uidSql}`, [u.e164]);
  await db.query(`delete from squish_connections where user_id in ${uidSql} or connected_user_id in ${uidSql}`, [u.e164]);
  await db.query(`delete from squish_invites where inviter_user_id in ${uidSql}`, [u.e164]);
  await db.query("delete from phone_otps where phone=$1", [u.e164]);
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAMklEQVR42u3OMQEAAAgDoC251a3g" +
  "LwrQk525VwEBAQEBAQEBAQEBAQEBAQEBAQEBAY8FDlUAAV6vE0IAAAAASUVORK5CYII=", "base64");
const IMG = `${OUT}/sq.png`;
writeFileSync(IMG, PNG);

const r = []; const check = (n, ok, d = "") => { r.push(ok); console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];

async function newUser(user, names) {
  const page = await (await b.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" })).newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.click("a[href='/squish/new']");
  await page.waitForURL("**/squish/new");
  for (const [i, nm] of names.entries()) {
    await page.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
    await page.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
    await page.waitForTimeout(600);
    await page.fill("input[aria-label='שם הסקווישי']", nm);
    await page.click("button:has-text('הלאה')");
    await page.waitForTimeout(200);
    await page.click("button:has-text('להוסיף לאוסף')");
    await page.waitForTimeout(400);
  }
  await page.fill("input[aria-label='שם האוסף']", user.title);
  await page.click("button:has-text('לשמור את האוסף')");
  await page.fill("input[aria-label='כינוי']", user.nick);
  await page.check("input[aria-label='ההורים שלי יודעים']");
  await page.waitForTimeout(300);
  await verifyPhone(page, user.num);
  await page.waitForURL("**/squish/collection", { timeout: 40000 });
  await page.waitForTimeout(900);
  return page;
}
const uid = async (e164) =>
  (await db.query("select user_id from phone_accounts where phone=$1", [e164])).rows[0].user_id;

/** מריץ בזהות של משתמשת מסוימת, כמו שה-RLS רואה אותה. */
async function asUser(user, sql, params) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [user]);
    await c.query("set local role authenticated");
    const res = await c.query(sql, params);
    await c.query("commit");
    return res;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

const noya = await newUser(U.noya, ["פריט א1", "פריט א2", "פריט א3"]);
const maya = await newUser(U.maya, ["פריט ב1", "פריט ב2", "פריט ב3"]);
const lia  = await newUser(U.lia,  ["פריט ג1", "פריט ג2", "פריט ג3"]);
const noyaId = await uid(U.noya.e164), mayaId = await uid(U.maya.e164), liaId = await uid(U.lia.e164);
check("שלוש אספניות נוצרו", !!noyaId && !!mayaId && !!liaId);

/* ══════ 1. יצירת קישור: שם, תוקף ותקרה ══════ */
await noya.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
await noya.waitForTimeout(800);
check("יש שדה לשם הקישור", (await noya.locator("input[aria-label='שם לקישור']").count()) === 1);
const before = await noya.textContent("body");
check("והמסך אומר מראש מה הגבולות",
  before.includes("30 יום") && before.includes("10 חברות"), "");
await noya.fill("input[aria-label='שם לקישור']", "חוג ריקוד");
await noya.click("button:has-text('ליצור קישור הזמנה')");
await noya.waitForTimeout(1500);

const { rows: [inv] } = await db.query(
  "select * from squish_invites where inviter_user_id=$1", [noyaId]);
check("הקישור נשמר עם השם", inv?.label === "חוג ריקוד", String(inv?.label));
check("ועם תקרה של עשרה", inv?.max_uses === 10, String(inv?.max_uses));
check("ועם תוקף של שלושים יום",
  inv?.expires_at && Math.round((new Date(inv.expires_at) - Date.now()) / 86400000) === 30,
  String(inv?.expires_at));
const shown = await noya.textContent("body");
check("והמסך מציג את השם ואת מספר המצטרפות", shown.includes("חוג ריקוד") && shown.includes("הצטרפו 0 מתוך 10"));

/* ══════ 2. הצטרפות רגילה סופרת שימוש אחד ══════ */
await maya.goto(`${BASE}/squish/join/${inv.code}`, { waitUntil: "networkidle" });
await maya.waitForTimeout(800);
await maya.click("button:has-text('להצטרף למעגל')");
await maya.waitForTimeout(1800);
const { rows: [used] } = await db.query("select uses, joined_user_id from squish_invites where id=$1", [inv.id]);
check("הצטרפות סופרת שימוש", used.uses === 1, String(used.uses));

// כניסה חוזרת של אותה אחת לא שורפת שימוש נוסף
await maya.goto(`${BASE}/squish/join/${inv.code}`, { waitUntil: "networkidle" });
await maya.waitForTimeout(800);
await maya.click("button:has-text('להצטרף למעגל')");
await maya.waitForTimeout(1800);
const { rows: [again] } = await db.query("select uses from squish_invites where id=$1", [inv.id]);
check("כניסה חוזרת של אותה חברה לא שורפת שימוש", again.uses === 1, String(again.uses));
check("והמסך אומר שהן כבר באותו מעגל",
  (await maya.textContent("body")).includes("אתן כבר באותו מעגל"));

/* ══════ 3. חסימה — החור המרכזי ══════ */
// מאיה חוסמת את נועה, ואז מנסה להצטרף שוב דרך אותו קישור
const { rows: [noyaCode] } = await db.query(
  "select collection_code from squish_profiles where user_id=$1", [noyaId]);
await maya.goto(`${BASE}/squish/c/${noyaCode.collection_code}`, { waitUntil: "networkidle" });
await maya.waitForTimeout(900);
/* clickUntil ולא click+waitForSelector: הכפתור קיים ב-HTML לפני
   ש-React חיבר אליו מאזין, ולחיצה בחלון הזה נופלת על סימון מת בלי
   שום שגיאה. המתנה ארוכה יותר רק מסתירה את המרוץ. */
await clickUntil(maya, "[data-testid=safety-open]", "[data-testid=safety-block]");
await clickUntil(maya, "[data-testid=safety-block]", "[data-testid=safety-confirm]");
await maya.click("[data-testid=safety-confirm]");
/* מחכים לאות שהאפליקציה עצמה נותנת — היא מעבירה לאוסף רק אחרי
   שהחסימה חזרה בהצלחה מהשרת. המתנה של כמה שניות נראתה מספיקה, אבל
   מסלול API שמתקמפל בפעם הראשונה לוקח יותר, והבדיקה הייתה קוראת את
   הדאטהבייס בזמן שהבקשה עוד באוויר. אז זה נראה כמו "החסימה לא עבדה". */
await maya.waitForURL("**/squish/collection", { timeout: 30000 });
await maya.waitForTimeout(500);

const { rows: [blocked] } = await db.query(
  "select status from squish_connections where user_id=$1 and connected_user_id=$2", [mayaId, noyaId]);
check("החסימה כיבתה את הקשר", blocked?.status === "blocked", String(blocked?.status));

let joinErr = "";
try {
  await asUser(mayaId, "select squish_join($1)", [inv.code]);
} catch (e) { joinErr = e.message; }
check("נחסמת לא יכולה להצטרף שוב דרך אותו קישור", /blocked/.test(joinErr), joinErr.slice(0, 60));

const { rows: [still] } = await db.query(
  "select status from squish_connections where user_id=$1 and connected_user_id=$2", [mayaId, noyaId]);
check("והקשר לא קם לתחייה", still?.status === "blocked", String(still?.status));

const friends = await maya.evaluate(() => fetch("/api/squish/friends").then((r) => r.json()));
check("והיא לא חוזרת לרשימת החברות", !JSON.stringify(friends).includes("NoyaI"));

/* ══════ 4. השהיה ══════ */
await db.query("select squish_admin_suspend($1,'בדיקה','tester')", [liaId]);
let suspErr = "";
try {
  await asUser(liaId, "select squish_join($1)", [inv.code]);
} catch (e) { suspErr = e.message; }
check("מושהית לא יכולה להצטרף", /account suspended/.test(suspErr), suspErr.slice(0, 50));
await db.query("select squish_admin_restore($1,'tester')", [liaId]);

// והצד השני: מזמינה מושהית
await db.query("select squish_admin_suspend($1,'בדיקה','tester')", [noyaId]);
let hostErr = "";
try {
  await asUser(liaId, "select squish_join($1)", [inv.code]);
} catch (e) { hostErr = e.message; }
check("אי אפשר להצטרף למעגל של חשבון מושהה", /invite unavailable/.test(hostErr), hostErr.slice(0, 50));
check("וההודעה לא מגלה שהחשבון מושהה", !/suspend/.test(hostErr.replace("invite unavailable", "")));
await db.query("select squish_admin_restore($1,'tester')", [noyaId]);

/* ══════ 5. תוקף ══════ */
await db.query("update squish_invites set expires_at = now() - interval '1 day' where id=$1", [inv.id]);
check("המצב מדווח כפג תוקף",
  (await db.query("select squish_invite_state($1) s", [inv.code])).rows[0].s === "expired");
let expErr = "";
try { await asUser(liaId, "select squish_join($1)", [inv.code]); } catch (e) { expErr = e.message; }
check("קישור שפג לא מצרף", /invite expired/.test(expErr), expErr.slice(0, 40));

await lia.goto(`${BASE}/squish/join/${inv.code}`, { waitUntil: "networkidle" });
await lia.waitForTimeout(1200);
check("והמסך מסביר מה קרה", (await lia.textContent("body")).includes("הקישור הזה פג"));
check("ומציע מה לעשות", (await lia.textContent("body")).includes("קישור חדש"));
await lia.screenshot({ path: `${OUT}/01-expired.png`, fullPage: true });
await db.query("update squish_invites set expires_at = now() + interval '30 days' where id=$1", [inv.id]);

/* ══════ 6. תקרת שימושים ══════ */
await db.query("update squish_invites set uses = max_uses where id=$1", [inv.id]);
check("המצב מדווח כמוצה",
  (await db.query("select squish_invite_state($1) s", [inv.code])).rows[0].s === "exhausted");
let exhErr = "";
try { await asUser(liaId, "select squish_join($1)", [inv.code]); } catch (e) { exhErr = e.message; }
check("קישור שמוצה לא מצרף", /invite exhausted/.test(exhErr), exhErr.slice(0, 40));
await db.query("update squish_invites set uses = 1 where id=$1", [inv.id]);

/* ══════ 7. ביטול ══════ */
await noya.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
await noya.waitForTimeout(1200);
await noya.click("button:has-text('לבטל את הקישור')");
await noya.waitForTimeout(1800);
const { rows: [revoked] } = await db.query("select revoked_at from squish_invites where id=$1", [inv.id]);
check("הביטול נרשם", !!revoked?.revoked_at);
let revErr = "";
try { await asUser(liaId, "select squish_join($1)", [inv.code]); } catch (e) { revErr = e.message; }
check("קישור מבוטל לא מצרף", /invite revoked/.test(revErr), revErr.slice(0, 40));
// ביטול נוגע בקישור בלבד: שורות הקשר שכבר נוצרו דרכו לא נמחקות
check("וביטול לא מוחק קשרים שכבר נוצרו דרכו",
  (await db.query(
    "select count(*)::int c from squish_connections where user_id=$1 and connected_user_id=$2",
    [noyaId, mayaId])).rows[0].c === 1,
  "הקשר עם מאיה נעלם");
const after = await noya.textContent("body");
check("והמסך חוזר להציע ליצור קישור חדש", after.includes("ליצור קישור הזמנה"));

// רק היוצרת יכולה לבטל
await db.query("update squish_invites set revoked_at = null where id=$1", [inv.id]);
await asUser(liaId, "select squish_revoke_invite($1)", [inv.code]);
const { rows: [notMine] } = await db.query("select revoked_at from squish_invites where id=$1", [inv.id]);
check("מי שלא יצרה את הקישור לא יכולה לבטל אותו", notMine.revoked_at === null);

/* ══════ 8. group_only ירד ══════ */
await noya.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
await noya.waitForTimeout(1000);
const vis = await noya.textContent("body");
check('"קבוצות פרטיות" ירד מההגדרות', !vis.includes("קבוצות פרטיות"));
check("ובמקומו המעגל המורחב", vis.includes("גם המעגל המורחב"));

await db.query("update squish_profiles set collection_visibility='group_only' where user_id=$1", [liaId]);
await db.query(
  "update squish_profiles set collection_visibility='direct_friends' where collection_visibility='group_only'");
const { rows: [moved] } = await db.query(
  "select collection_visibility from squish_profiles where user_id=$1", [liaId]);
check("ומי שהייתה עליו עוברת לחברות ישירות", moved.collection_visibility === "direct_friends");

/* ══════ 9. קישור ישן נשאר תקף ══════ */
const { rows: [old] } = await db.query(
  `insert into squish_invites (code, inviter_user_id, expires_at, max_uses)
   values ('legacyold', $1, null, null) returning *`, [noyaId]);
check("קישור ישן בלי תוקף ובלי תקרה נשאר תקין",
  (await db.query("select squish_invite_state($1) s", ["legacyold"])).rows[0].s === "ok");
await db.query("delete from squish_invites where id=$1", [old.id]);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

const bad = r.filter((x) => !x).length;
console.log(`\n${r.length - bad}/${r.length} עברו`);
await b.close(); await closeHelper(); await db.end();
process.exit(bad ? 1 : 0);
