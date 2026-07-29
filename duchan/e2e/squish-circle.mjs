/**
 * חבילה 2 — המעגל וההזמנות.
 *
 * החוזים: קשר ישיר סימטרי · חסימה גוברת על קישור תקף · חשבון מושהה
 * לא מרחיב מעגל ולא מקבל מצטרפות · קישור פג, מתבטל ומתמלא · קישור ישן
 * נשאר תקף · מזהי משתמש וטלפונים לא יוצאים ללקוח.
 */
import {
  BASE, asUser, checker, closeHelper, db, joinCircle, launch, makeInvite, newCollector, uidOf, wipe,
} from "./helpers/index.mjs";

const U = {
  noya: { num: "0521130201", e164: "972521130201", nick: "NoyaR", title: "מדף נועה" },
  maya: { num: "0521130202", e164: "972521130202", nick: "MayaR", title: "מדף מאיה" },
  lia:  { num: "0521130203", e164: "972521130203", nick: "LiaR2", title: "מדף ליה" },
};
const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות מעגל");
const errs = [];
const b = await launch();

const noya = await newCollector(b, U.noya, ["נ1", "נ2", "נ3"], errs);
const maya = await newCollector(b, U.maya, ["מ1", "מ2", "מ3"], errs);
const lia  = await newCollector(b, U.lia,  ["ל1", "ל2", "ל3"], errs);
const noyaId = await uidOf(pool, U.noya.e164);
const mayaId = await uidOf(pool, U.maya.e164);
const liaId  = await uidOf(pool, U.lia.e164);

/* ── 1. יצירת קישור ── */
const code = await makeInvite(noya, pool, noyaId, "חוג ריקוד");
const { rows: [inv] } = await pool.query("select * from squish_invites where code=$1", [code]);
check("הקישור נוצר עם שם", inv.label === "חוג ריקוד", String(inv.label));
check("עם תוקף של 30 יום",
  Math.round((new Date(inv.expires_at) - Date.now()) / 86400000) === 30);
check("ועם תקרה של 10", inv.max_uses === 10, String(inv.max_uses));
check("ומתחיל בלי שימושים ובלי לחיצות", inv.uses === 0 && inv.clicks === 0);

/* ── 2. לחיצה נספרת, והצטרפות יוצרת קשר סימטרי ── */
await maya.goto(`${BASE}/squish/join/${code}`, { waitUntil: "networkidle" });
await maya.waitForTimeout(1200);
const { rows: [clicked] } = await pool.query("select clicks from squish_invites where code=$1", [code]);
check("לחיצה על הקישור נספרת", clicked.clicks >= 1, String(clicked.clicks));

await maya.click("button:has-text('להצטרף למעגל')");
await maya.waitForTimeout(1800);
const { rows: conns } = await pool.query(
  "select user_id, connected_user_id, connection_type, status, invited_by_user_id from squish_connections where user_id in ($1,$2)",
  [noyaId, mayaId]);
check("נוצרו שתי שורות קשר", conns.length === 2, `${conns.length}`);
check("הקשר סימטרי", conns.every((c) => c.status === "active" && c.connection_type === "direct_friend"));
check("ושתיהן זוכרות מי הזמינה", conns.every((c) => c.invited_by_user_id === noyaId));

const { rows: [a] } = await pool.query("select squish_can_view($1,$2) v", [mayaId, noyaId]);
const { rows: [c2] } = await pool.query("select squish_can_view($1,$2) v", [noyaId, mayaId]);
check("שתיהן רואות זו את זו", a.v === true && c2.v === true);

const friends = await maya.evaluate(() => fetch("/api/squish/friends").then((r) => r.json()));
check("החברה מופיעה ברשימת החברות", JSON.stringify(friends).includes("NoyaR"));
check("וללא מזהה משתמש", !JSON.stringify(friends).includes(noyaId));
check("וללא מספר טלפון", !JSON.stringify(friends).includes(U.noya.e164));

/* ── 3. הצטרפות כפולה לא צורכת שימוש נוסף ── */
const { rows: [u1] } = await pool.query("select uses from squish_invites where code=$1", [code]);
await joinCircle(maya, code);
const { rows: [u2] } = await pool.query("select uses from squish_invites where code=$1", [code]);
check("הצטרפות חוזרת לא שורפת שימוש", u1.uses === 1 && u2.uses === 1, `${u1.uses}→${u2.uses}`);
const { rows: [dup] } = await pool.query(
  "select count(*)::int c from squish_connections where user_id=$1 and connected_user_id=$2", [mayaId, noyaId]);
check("ולא יוצרת שורה כפולה", dup.c === 1, String(dup.c));

/* ── 4. הצטרפות לקישור של עצמך ── */
let selfErr = "";
try { await asUser(pool, noyaId, "select squish_join($1)", [code]); } catch (e) { selfErr = e.message; }
check("אי אפשר להצטרף לקישור של עצמך", /own circle/.test(selfErr), selfErr.slice(0, 40));

/* ── 5. הסרת קשר ── */
await joinCircle(lia, code);
await asUser(pool, liaId, "select squish_remove_connection($1)", [noyaId]);
const { rows: [gone] } = await pool.query(
  "select count(*)::int c from squish_connections where (user_id=$1 and connected_user_id=$2) or (user_id=$2 and connected_user_id=$1)",
  [liaId, noyaId]);
check("הסרת קשר מוחקת את שתי השורות", gone.c === 0, String(gone.c));
const { rows: [noView] } = await pool.query("select squish_can_view($1,$2) v", [liaId, noyaId]);
check("והצפייה נופלת מיד", noView.v === false);
await joinCircle(lia, code);

/* ── 6. חסימה ── */
await asUser(pool, liaId, "select squish_block_user($1)", [noyaId]);
const { rows: [bothWays] } = await pool.query(
  "select squish_can_view($1,$2) a, squish_can_view($2,$1) b", [liaId, noyaId]);
check("חסימה מפילה צפייה לשני הכיוונים", bothWays.a === false && bothWays.b === false);

let blockedJoin = "";
try { await asUser(pool, liaId, "select squish_join($1)", [code]); } catch (e) { blockedJoin = e.message; }
check("נחסמת לא יכולה להצטרף שוב דרך הקישור", /blocked/.test(blockedJoin), blockedJoin.slice(0, 40));
const { rows: [stillBlocked] } = await pool.query(
  "select status from squish_connections where user_id=$1 and connected_user_id=$2", [liaId, noyaId]);
check("והקשר נשאר חסום", stillBlocked?.status === "blocked", String(stillBlocked?.status));

const liaFriends = await lia.evaluate(() => fetch("/api/squish/friends").then((r) => r.json()));
check("והחסומה לא מופיעה ברשימת החברות", !JSON.stringify(liaFriends).includes("NoyaR"));

/* ── 7. השהיה, שני הכיוונים ── */
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [mayaId]);
let suspJoin = "";
try { await asUser(pool, mayaId, "select squish_join($1)", [code]); } catch (e) { suspJoin = e.message; }
check("מושהית לא מצטרפת", /account suspended/.test(suspJoin), suspJoin.slice(0, 40));
await pool.query("select squish_admin_restore($1,'tester')", [mayaId]);

await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [noyaId]);
let suspHost = "";
try { await asUser(pool, mayaId, "select squish_join($1)", [code]); } catch (e) { suspHost = e.message; }
check("ואי אפשר להצטרף למעגל של מושהית", /invite unavailable/.test(suspHost), suspHost.slice(0, 40));
const { rows: [hiddenSusp] } = await pool.query("select squish_can_view($1,$2) v", [mayaId, noyaId]);
check("ומושהית נעלמת מהחברות שלה", hiddenSusp.v === false);
await pool.query("select squish_admin_restore($1,'tester')", [noyaId]);

/* ── 8. תוקף, תקרה וביטול ── */
await pool.query("update squish_invites set expires_at = now() - interval '1 hour' where code=$1", [code]);
check("מצב: פג תוקף",
  (await pool.query("select squish_invite_state($1) s", [code])).rows[0].s === "expired");
await pool.query("update squish_invites set expires_at = now() + interval '30 days', uses = max_uses where code=$1", [code]);
check("מצב: מוצה",
  (await pool.query("select squish_invite_state($1) s", [code])).rows[0].s === "exhausted");
await pool.query("update squish_invites set uses = 1 where code=$1", [code]);
await asUser(pool, noyaId, "select squish_revoke_invite($1)", [code]);
check("מצב: בוטל",
  (await pool.query("select squish_invite_state($1) s", [code])).rows[0].s === "revoked");
check("קוד שלא קיים מדווח כלא נמצא",
  (await pool.query("select squish_invite_state($1) s", ["nosuchcode"])).rows[0].s === "not_found");

/* ── 9. קישור ישן ללא תוקף ── */
await pool.query(
  "insert into squish_invites (code, inviter_user_id, expires_at, max_uses) values ('legacy0001',$1,null,null)",
  [noyaId]);
check("קישור ישן בלי תוקף ובלי תקרה נשאר תקף",
  (await pool.query("select squish_invite_state($1) s", ["legacy0001"])).rows[0].s === "ok");

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
