/**
 * חבילה 5 — בטיחות ומודרציה.
 *
 * החוזה המרכזי כאן הוא **יציאה**: ילדה שנתקעה באמצע טרייד עם מישהי
 * שמפחידה אותה חייבת להיות מסוגלת לצאת, ולקבל את הסקווישים שלה בחזרה
 * בדיוק כמו שהיו. חסימה, השהיה, ביטול מנהלת ומחיקת חשבון — כולן עוברות
 * דרך אותו pre_reserve_status, ואף אחת מהן לא הופכת פריט פרטי לפתוח.
 *
 * והחוזה השני: **דיווח הוא של מי שדיווחה.** לא של מי שדווח עליה, ולא
 * של מי שבמקרה במעגל.
 */
import {
  asUser, checker, closeHelper, db, joinCircle, launch, makeInvite, newCollector, uidOf, wipe,
} from "./helpers/index.mjs";

const U = {
  ada: { num: "0521130501", e164: "972521130501", nick: "AdaS", title: "מדף עדה" },
  bea: { num: "0521130502", e164: "972521130502", nick: "BeaS", title: "מדף בר" },
  cal: { num: "0521130503", e164: "972521130503", nick: "CalS", title: "מדף כל" },
};

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות בטיחות");
const errs = [];
const b = await launch();

const ada = await newCollector(b, U.ada, [
  { name: "ע1 פתוח" }, { name: "ע2 פתוח" }, { name: "ע3 פתוח" }, { name: "ע4 פתוח" },
], errs);
const bea = await newCollector(b, U.bea, [
  { name: "ב1 פתוח" }, { name: "ב2 שמור", keep: true }, { name: "ב3 פתוח" },
], errs);
const cal = await newCollector(b, U.cal, [
  { name: "כ1 פתוח" }, { name: "כ2 שמור", keep: true }, { name: "כ3 פתוח" }, { name: "כ4 פתוח" },
], errs);

const adaId = await uidOf(pool, U.ada.e164);
const beaId = await uidOf(pool, U.bea.e164);
const calId = await uidOf(pool, U.cal.e164);

const code = await makeInvite(ada, pool, adaId, "בטיחות");
await joinCircle(bea, code);
await joinCircle(cal, code);

const itemsOf = async (uid) => (await pool.query(
  "select id, name, trade_status, pre_reserve_status from squish_items where owner_user_id=$1 order by sort_order",
  [uid])).rows;
const byName = (rows, n) => rows.find((r) => r.name === n);
const statusOf = async (id) =>
  (await pool.query("select trade_status from squish_items where id=$1", [id])).rows[0]?.trade_status ?? null;
const prop = async (id) =>
  (await pool.query("select * from squish_trade_proposals where id=$1", [id])).rows[0];
const fails = async (uid, sql, params) => {
  try { await asUser(pool, uid, sql, params); return ""; } catch (e) { return e.message; }
};
const send = "select squish_send_proposal($1, $2::uuid[]) id";

/** מביא טרייד שמור בין שתי אספניות, ומחזיר את המזהה. */
async function reservedTrade(senderId, receiverId, requestedId, offered) {
  const { rows: [{ id }] } = await asUser(pool, senderId, send, [requestedId, offered]);
  const v = (await prop(id)).current_version_id;
  await asUser(pool, receiverId, "select squish_approve_version($1,$2)", [id, v]);
  await asUser(pool, receiverId, "select squish_accept_and_reserve_trade($1)", [id]);
  return id;
}

const A = await itemsOf(adaId), B = await itemsOf(beaId), C = await itemsOf(calId);
const a1 = byName(A, "ע1 פתוח"), a2 = byName(A, "ע2 פתוח");
const a3 = byName(A, "ע3 פתוח"), a4 = byName(A, "ע4 פתוח");
const b1 = byName(B, "ב1 פתוח"), b2 = byName(B, "ב2 שמור");
const c1 = byName(C, "כ1 פתוח"), c2 = byName(C, "כ2 שמור");
const c3 = byName(C, "כ3 פתוח"), c4 = byName(C, "כ4 פתוח");

/* ── 1. חסימה עוצרת טרייד חי ומחזירה את הפריטים ── */
const pBlock = await reservedTrade(beaId, adaId, a1.id, [b1.id, b2.id]);
await asUser(pool, beaId,
  "insert into squish_interests (item_id, user_id) values ($1,$2)", [a2.id, beaId]);
check("לפני החסימה הטרייד שמור", (await prop(pBlock)).status === "ready_for_whatsapp");
check("והפריטים נעולים", (await statusOf(b2.id)) === "reserved" && (await statusOf(a1.id)) === "reserved");

await asUser(pool, beaId, "select squish_block_user($1)", [adaId]);
const blocked = await prop(pBlock);
check("חסימה מבטלת את הטרייד", blocked.status === "cancelled", blocked.status);
check("עם סיבה שאומרת בדיוק מה קרה", blocked.cancel_reason === "blocked", String(blocked.cancel_reason));
check("פריט פתוח חוזר להיות פתוח", (await statusOf(b1.id)) === "open_for_trade");
check("ופריט 'שמור לי' חוזר להיות שמור",
  (await statusOf(b2.id)) === "keep", await statusOf(b2.id));
check("והפריט של הצד השני משוחרר", (await statusOf(a1.id)) === "open_for_trade");
check("שום פריט לא נשאר קשור להצעה",
  (await pool.query("select count(*)::int c from squish_items where reserved_by_proposal_id=$1", [pBlock]))
    .rows[0].c === 0);
check("סימוני 'מעניין אותי' בין השתיים נמחקו",
  (await pool.query(
    "select count(*)::int c from squish_interests where user_id=$1 and item_id=$2", [beaId, a2.id]))
    .rows[0].c === 0);
check("והקשר סומן כחסום",
  (await pool.query(
    "select count(*)::int c from squish_connections where status='blocked' and ((user_id=$1 and connected_user_id=$2) or (user_id=$2 and connected_user_id=$1))",
    [adaId, beaId])).rows[0].c === 2);
check("אחרי חסימה אי אפשר להציע טרייד",
  /blocked/.test(await fails(beaId, send, [a2.id, [b1.id]])));
check("ואי אפשר לחסום את עצמך",
  /cannot block yourself/.test(await fails(beaId, "select squish_block_user($1)", [beaId])));

await asUser(pool, beaId, "select squish_unblock_user($1)", [adaId]);
check("ביטול חסימה לא מחזיר את הקשר לבד",
  (await pool.query("select squish_can_view($1,$2) v", [beaId, adaId])).rows[0].v === false);

/* ── 2. השהיה עוצרת התקדמות, אבל לא יציאה ──
   ההבחנה הזו היא כל העניין: אם השהיה הייתה עוצרת גם את היציאה, שתי
   הילדות היו נשארות עם פריטים נעולים עד שמנהלת תתערב. */

/* (א) הצעה שעוד לא נשמרה */
const { rows: [{ id: pOpen }] } = await asUser(pool, calId, send, [a2.id, [c1.id, c3.id]]);
const vOpen = (await prop(pOpen)).current_version_id;
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [calId]);

check("מושהית לא שולחת הצעה חדשה",
  /account suspended/.test(await fails(calId, send, [a3.id, [c3.id]])));
check("ומושהית לא יוצרת קישור הזמנה",
  /account suspended/.test(await fails(calId,
    "insert into squish_invites (code, inviter_user_id) values ('susp0001',$1)", [calId])));
check("אישור גרסה נחסם כשהצד השני מושהה",
  /account suspended/.test(await fails(adaId,
    "select squish_approve_version($1,$2)", [pOpen, vOpen])));
check("וגם הצעה נגדית נחסמת",
  /account suspended/.test(await fails(adaId,
    "select squish_counter_proposal($1,$2::uuid[])", [pOpen, [c1.id]])));

await asUser(pool, adaId, "select squish_decline_proposal($1)", [pOpen]);
check("אבל 'לא הפעם' — היציאה — כן עובר",
  (await prop(pOpen)).status === "declined", (await prop(pOpen)).status);
await pool.query("select squish_admin_restore($1,'tester')", [calId]);

/* (ב) טרייד שכבר שמור — ביטול משחרר גם כשצד מושהה */
const pSusp = await reservedTrade(calId, adaId, a3.id, [c1.id, c2.id]);
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [calId]);
await asUser(pool, adaId, "select squish_cancel_trade($1,$2)", [pSusp, "safety"]);
check("ביטול טרייד שמור עובר גם כשצד מושהה",
  (await prop(pSusp)).status === "cancelled", (await prop(pSusp)).status);
check("והפריטים משתחררים בדיוק",
  (await statusOf(c1.id)) === "open_for_trade" && (await statusOf(c2.id)) === "keep"
  && (await statusOf(a3.id)) === "open_for_trade");
await pool.query("select squish_admin_restore($1,'tester')", [calId]);

/* (ג) גם סגירה סופית של טרייד שכבר נשמר היא יציאה, ולכן היא עוברת.
   הפריטים כבר הוחלפו במציאות; לחסום את הסימון היה משאיר אותם נעולים. */
const pDone = await reservedTrade(calId, adaId, a4.id, [c4.id]);
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [calId]);
await asUser(pool, calId, "select squish_confirm_completion($1)", [pDone]);
const { rows: [doneRes] } = await asUser(pool, adaId, "select squish_confirm_completion($1) s", [pDone]);
check("סגירת טרייד שמור עוברת גם בהשהיה", doneRes.s === "completed", doneRes.s);
check("והפריטים סומנו כהוחלפו ולא נשארו נעולים",
  (await statusOf(a4.id)) === "traded" && (await statusOf(c4.id)) === "traded");
await pool.query("select squish_admin_restore($1,'tester')", [calId]);
check("שחזור מנקה את ההשהיה",
  (await pool.query("select suspended_at, suspended_reason from squish_profiles where user_id=$1", [calId]))
    .rows[0].suspended_at === null);
const { rows: acts } = await pool.query(
  "select action from squish_admin_actions where target_user=$1 order by created_at", [calId]);
check("וכל השהיה וכל שחזור תועדו ביומן המנהלת, בסדר",
  acts.map((a) => a.action).join(",") === "suspend,restore,suspend,restore,suspend,restore",
  acts.map((a) => a.action).join(","));

/* ── 3. ביטול מנהלת מחזיר מצב מדויק ── */
const pAdmin = await reservedTrade(calId, adaId, a1.id, [c2.id, c3.id]);
check("לפני הביטול הפריט השמור נעול עם זיכרון",
  (await statusOf(c2.id)) === "reserved"
  && (await pool.query("select pre_reserve_status s from squish_items where id=$1", [c2.id])).rows[0].s === "keep");

await pool.query("select squish_admin_cancel_trade($1,'תקוע','tester')", [pAdmin]);
const adminCancelled = await prop(pAdmin);
check("מנהלת מבטלת טרייד תקוע", adminCancelled.status === "cancelled", adminCancelled.status);
check("והסיבה מסומנת כפעולת מנהלת", adminCancelled.cancel_reason === "admin", String(adminCancelled.cancel_reason));
check("פריט ששמור לבעליו לא נפתח לטרייד בגלל ביטול מנהלת",
  (await statusOf(c2.id)) === "keep", await statusOf(c2.id));
check("ופריט פתוח נשאר פתוח", (await statusOf(c3.id)) === "open_for_trade");
check("הפעולה תועדה עם מזהה הטרייד",
  (await pool.query(
    "select count(*)::int c from squish_admin_actions where action='cancel_trade' and target_id=$1", [pAdmin]))
    .rows[0].c === 1);

/* ── 4. "לא הפעם" — ואז המתנה ── */
const { rows: [{ id: pDecline }] } = await asUser(pool, calId, send, [a3.id, [c3.id]]);
await asUser(pool, adaId, "select squish_decline_proposal($1)", [pDecline]);
check("דחייה סוגרת את ההצעה", (await prop(pDecline)).status === "declined");
check("הצעה חוזרת מיד אחרי דחייה נחסמת",
  /recently declined/.test(await fails(calId, send, [a3.id, [c3.id]])));

await pool.query(
  "update squish_trade_proposals set updated_at = now() - interval '25 hours' where id=$1", [pDecline]);
const { rows: [retry] } = await asUser(pool, calId, send, [a3.id, [c3.id]]);
check("אחרי יממה אפשר לנסות שוב", !!retry.id);
check("והצעה כפולה על אותו פריט עדיין נחסמת",
  /duplicate proposal/.test(await fails(calId, send, [a3.id, [c1.id]])));
await asUser(pool, calId, "select squish_cancel_trade($1,$2)", [retry.id, "cleanup"]);

/* ── 5. דיווח על פריט ── */
await asUser(pool, calId,
  "insert into squish_item_reports (item_id, reporter_user_id, reported_user_id, reason, details)" +
  " values ($1,$2,$3,'inappropriate','לא מתאים')", [a1.id, calId, adaId]);
const { rows: mineRep } = await asUser(pool, calId,
  "select id, reason from squish_item_reports where item_id=$1", [a1.id]);
check("המדווחת רואה את הדיווח שלה", mineRep.length === 1, `${mineRep.length}`);
const { rows: targetRep } = await asUser(pool, adaId,
  "select id from squish_item_reports where item_id=$1", [a1.id]);
check("מי שדווח עליה לא רואה שדווח", targetRep.length === 0, `${targetRep.length}`);
const { rows: thirdRep } = await asUser(pool, beaId,
  "select id from squish_item_reports where item_id=$1", [a1.id]);
check("וגם לא אספנית אחרת", thirdRep.length === 0, `${thirdRep.length}`);
check("והדיווח נפתח במצב 'פתוח'",
  (await pool.query("select state from squish_item_reports where item_id=$1", [a1.id])).rows[0].state === "open");

/* ── 6. הגבלת קצב ── */
const newInvite = (owner, code) =>
  asUser(pool, owner, "insert into squish_invites (code, inviter_user_id) values ($1,$2)", [code, owner]);

for (let i = 0; i < 9; i++) await newInvite(beaId, `rate${i}bea`);
check("תשעה קישורים בשעה עדיין בסדר",
  (await pool.query("select squish_rate_ok($1,'invite') v", [beaId])).rows[0].v === true);
await newInvite(beaId, "rate9bea");
check("העשירי הוא התקרה",
  (await pool.query("select squish_rate_ok($1,'invite') v", [beaId])).rows[0].v === false);
const overInvite = await fails(beaId,
  "insert into squish_invites (code, inviter_user_id) values ('rate99bea',$1)", [beaId]);
check("והאחד-עשר נחסם", /too many invites/.test(overInvite), overInvite.slice(0, 40));

/* הצעות: מציפים את המונה ישירות, ואז בודקים שהפונקציה עוצרת */
for (let i = 0; i < 10; i++) {
  await pool.query(
    "insert into squish_trade_proposals (sender_user_id, receiver_user_id, requested_item_id, status)" +
    " values ($1,$2,$3,'cancelled')", [beaId, adaId, a1.id]);
}
check("עשר הצעות בשעה הן התקרה",
  (await pool.query("select squish_rate_ok($1,'proposal') v", [beaId])).rows[0].v === false);
await joinCircle(bea, code);
check("ומעבר לזה ההצעה נחסמת",
  /too many proposals/.test(await fails(beaId, send, [a1.id, [b1.id]])));
await pool.query(
  "delete from squish_trade_proposals where sender_user_id=$1 and status='cancelled'", [beaId]);

/* ── 7. מחיקת חשבון ── */
const pDelete = await reservedTrade(calId, adaId, a1.id, [c1.id, c2.id]);
check("לפני המחיקה הפריט של עדה נעול", (await statusOf(a1.id)) === "reserved");
const calCode = await makeInvite(cal, pool, calId, "של כל");

await asUser(pool, calId, "select squish_delete_profile()");
check("הטרייד נסגר במחיקת חשבון",
  (await prop(pDelete)).cancel_reason === "account_deleted", String((await prop(pDelete)).cancel_reason));
check("והפריט של הצד השני משוחרר ולא נשאר תקוע",
  (await statusOf(a1.id)) === "open_for_trade", await statusOf(a1.id));
check("הפריטים של מי שמחקה נעלמו",
  (await itemsOf(calId)).length === 0, `${(await itemsOf(calId)).length}`);
check("וגם הפרופיל",
  (await pool.query("select count(*)::int c from squish_profiles where user_id=$1", [calId])).rows[0].c === 0);
check("הקשרים שלה נמחקו",
  (await pool.query(
    "select count(*)::int c from squish_connections where user_id=$1 or connected_user_id=$1", [calId]))
    .rows[0].c === 0);
check("והקישורים שיצרה כבר לא קיימים",
  (await pool.query("select count(*)::int c from squish_invites where code=$1", [calCode])).rows[0].c === 0);

const { rows: [survivor] } = await pool.query(
  "select reporter_user_id, reported_user_id, reason from squish_item_reports where item_id=$1", [a1.id]);
check("הדיווח שהיא הגישה שורד את מחיקת החשבון", !!survivor);
check("בלי קשר אליה", survivor.reporter_user_id === null, String(survivor.reporter_user_id));
check("ועם מי שדווח עליה עדיין רשומה", survivor.reported_user_id === adaId);
check("והסיבה נשמרה למודרציה", survivor.reason === "inappropriate", survivor.reason);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
