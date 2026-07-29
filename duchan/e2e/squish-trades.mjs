/**
 * חבילה 4 — טריידים.
 *
 * שלוש אספניות, מסע אחד שלם: הצעה · הצעה מתחרה · צמצום · אישור · שמירה
 * אטומית · וואטסאפ · השלמה. ובנוסף שני חוזים שקל לשבור בלי לשים לב:
 *
 * 1. **מספר טלפון יוצא רק בסוף.** לא ב"הטריידים שלי", לא לפני שמירה,
 *    ולא לפני שההורה סומן. הנקודה היחידה היא /api/squish/trades/whatsapp.
 * 2. **ביטול מחזיר בדיוק את מה שהיה.** פריט שהיה "שמור לי" חוזר "שמור
 *    לי", ולא נפתח לטרייד רק כי הוא היה בהצעה.
 */
import {
  asUser, checker, closeHelper, db, joinCircle, launch, makeInvite, newCollector, uidOf, wipe,
} from "./helpers/index.mjs";

const U = {
  tal:  { num: "0521130401", e164: "972521130401", nick: "TalT",  title: "מדף טל" },
  roni: { num: "0521130402", e164: "972521130402", nick: "RoniT", title: "מדף רוני" },
  shir: { num: "0521130403", e164: "972521130403", nick: "ShirT", title: "מדף שיר" },
};

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות טריידים");
const errs = [];
const b = await launch();

/* טל מחזיקה גם פריטים ש"שמורים לה" — בלי זה אי אפשר להוכיח שביטול
   מחזיר מצב מדויק ולא ניחוש. */
const tal = await newCollector(b, U.tal, [
  { name: "ט1 פתוח" }, { name: "ט2 שמור", keep: true },
  { name: "ט3 פתוח" }, { name: "ט4 שמור", keep: true },
], errs);
const roni = await newCollector(b, U.roni, [
  { name: "ר1 מבוקש" }, { name: "ר2 מבוקש" }, { name: "ר3 שמור", keep: true },
], errs);
const shir = await newCollector(b, U.shir, ["ש1", "ש2", "ש3"], errs);

const talId  = await uidOf(pool, U.tal.e164);
const roniId = await uidOf(pool, U.roni.e164);
const shirId = await uidOf(pool, U.shir.e164);

const code = await makeInvite(roni, pool, roniId, "טריידים");
await joinCircle(tal, code);
await joinCircle(shir, code);

const itemsOf = async (uid) => (await pool.query(
  "select id, name, trade_status, pre_reserve_status, reserved_by_proposal_id, owner_user_id" +
  " from squish_items where owner_user_id=$1 order by sort_order", [uid])).rows;
const byName = (rows, n) => rows.find((r) => r.name === n);
const statusOf = async (id) =>
  (await pool.query("select trade_status from squish_items where id=$1", [id])).rows[0].trade_status;
const prop = async (id) =>
  (await pool.query("select * from squish_trade_proposals where id=$1", [id])).rows[0];
const fails = async (uid, sql, params) => {
  try { await asUser(pool, uid, sql, params); return ""; } catch (e) { return e.message; }
};

const T = await itemsOf(talId);
const R = await itemsOf(roniId);
const S = await itemsOf(shirId);
const t1 = byName(T, "ט1 פתוח"), t2 = byName(T, "ט2 שמור");
const t3 = byName(T, "ט3 פתוח"), t4 = byName(T, "ט4 שמור");
const r1 = byName(R, "ר1 מבוקש"), r2 = byName(R, "ר2 מבוקש"), r3 = byName(R, "ר3 שמור");

check("טל מתחילה עם שני פתוחים ושניים שמורים",
  t1.trade_status === "open_for_trade" && t2.trade_status === "keep"
  && t3.trade_status === "open_for_trade" && t4.trade_status === "keep");

/* ── 1. שליחת הצעה ── */
const send = "select squish_send_proposal($1, $2::uuid[]) id";
check("אי אפשר להציע יותר משלושה פריטים",
  /at most three/.test(await fails(talId, send, [r1.id, [t1.id, t2.id, t3.id, t4.id]])));
check("ואי אפשר להציע כלום",
  /at least one/.test(await fails(talId, send, [r1.id, []])));
check("אי אפשר לבקש פריט ששמור לבעליו",
  /not open for trade/.test(await fails(talId, send, [r3.id, [t1.id]])));
check("ואי אפשר להציע טרייד לעצמך",
  /with yourself/.test(await fails(roniId, send, [r1.id, [r2.id]])));

const { rows: [{ id: propA }] } = await asUser(pool, talId, send, [r1.id, [t1.id, t2.id, t3.id]]);
const a0 = await prop(propA);
check("הצעה נשלחה במצב 'נשלח'", a0.status === "sent", a0.status);
check("והשולחת מאשרת אוטומטית את הגרסה שהיא יצרה", !!a0.accepted_by_sender_at);
check("והמקבלת עוד לא אישרה", a0.accepted_by_receiver_at === null);
check("ההצעה יודעת מה סוג הקשר", !!a0.connection_context, String(a0.connection_context));

const { rows: v1 } = await pool.query(
  "select item_id, side from squish_trade_version_items where version_id=$1", [a0.current_version_id]);
check("בגרסה יש פריט מבוקש אחד", v1.filter((v) => v.side === "requested").length === 1);
check("ושלושה מוצעים", v1.filter((v) => v.side === "offered").length === 3,
  `${v1.filter((v) => v.side === "offered").length}`);
check("פריט 'שמור לי' יכול להיות מוצע — זו הבחירה של הבעלים",
  v1.some((v) => v.item_id === t2.id && v.side === "offered"));
check("והפריטים עצמם עוד לא נעולים",
  (await statusOf(t1.id)) === "open_for_trade" && (await statusOf(r1.id)) === "open_for_trade");

check("הצעה שנייה על אותו פריט מאותה אספנית נדחית",
  /duplicate proposal/.test(await fails(talId, send, [r1.id, [t3.id]])));

/* ── 2. הצעה מתחרה, מאספנית אחרת ── */
const { rows: [{ id: propB }] } = await asUser(pool, shirId, send, [r1.id, [S[0].id, S[1].id]]);
check("אספנית אחרת כן יכולה להציע על אותו פריט", !!propB);

/* ── 3. נצפה ── */
await asUser(pool, talId, "select squish_mark_viewed($1)", [propA]);
check("השולחת לא יכולה לסמן 'נצפה' בשם המקבלת",
  (await prop(propA)).status === "sent", (await prop(propA)).status);
await asUser(pool, roniId, "select squish_mark_viewed($1)", [propA]);
check("המקבלת מסמנת 'נצפה'", (await prop(propA)).status === "viewed");

/* ── 4. הצעה נגדית מצמצמת בלבד ── */
check("אי אפשר להכניס פריט שלא הוצע",
  /can only narrow/.test(await fails(roniId,
    "select squish_counter_proposal($1,$2::uuid[])", [propA, [t1.id, t4.id]])));

const oldVersion = (await prop(propA)).current_version_id;
await asUser(pool, roniId, "select squish_counter_proposal($1,$2::uuid[])", [propA, [t1.id, t2.id]]);
const a1 = await prop(propA);
check("צמצום יוצר גרסה חדשה", a1.current_version_id !== oldVersion);
check("והמצב הופך ל'הצעה נגדית'", a1.status === "countered", a1.status);
check("הגרסה החדשה מאפסת את אישור השולחת", a1.accepted_by_sender_at === null);
check("ומאשרת רק את מי שיצרה אותה", !!a1.accepted_by_receiver_at);
const { rows: v2 } = await pool.query(
  "select item_id, side from squish_trade_version_items where version_id=$1", [a1.current_version_id]);
check("ובגרסה החדשה נשארו שני מוצעים", v2.filter((v) => v.side === "offered").length === 2,
  `${v2.filter((v) => v.side === "offered").length}`);
check("והפריט שנשמט באמת יצא", !v2.some((v) => v.item_id === t3.id));

check("אישור של גרסה ישנה לא תופס",
  /version changed/.test(await fails(talId, "select squish_approve_version($1,$2)", [propA, oldVersion])));

/* ── 5. אישור ושמירה אטומית ── */
check("אי אפשר לשמור לפני ששני הצדדים אישרו",
  /both sides must approve/.test(await fails(roniId,
    "select squish_accept_and_reserve_trade($1)", [propA])));

const { rows: [approved] } = await asUser(pool, talId,
  "select squish_approve_version($1,$2) s", [propA, a1.current_version_id]);
check("אחרי ששתיהן אישרו המצב הוא 'אושר'",
  approved.s === "accepted" && (await prop(propA)).status === "accepted", approved.s);

const before = {
  t1: await statusOf(t1.id), t2: await statusOf(t2.id),
  t3: await statusOf(t3.id), r1: await statusOf(r1.id),
};
const { rows: [reserved] } = await asUser(pool, roniId,
  "select squish_accept_and_reserve_trade($1) s", [propA]);
check("השמירה מצליחה", reserved.s === "reserved", reserved.s);
const a2 = await prop(propA);
check("המצב הוא 'מוכן לוואטסאפ'", a2.status === "ready_for_whatsapp", a2.status);
check("ויש חותמת שמירה", !!a2.reserved_at);

const afterReserve = await itemsOf(talId);
check("שני הפריטים בגרסה ננעלו",
  byName(afterReserve, "ט1 פתוח").trade_status === "reserved"
  && byName(afterReserve, "ט2 שמור").trade_status === "reserved");
check("והפריט שיצא בצמצום לא ננעל",
  byName(afterReserve, "ט3 פתוח").trade_status === before.t3);
check("גם הפריט המבוקש ננעל", (await statusOf(r1.id)) === "reserved");
check("כל הנעולים מצביעים על ההצעה",
  (await pool.query("select count(*)::int c from squish_items where reserved_by_proposal_id=$1", [propA]))
    .rows[0].c === 3);
check("והמצב הקודם נשמר בדיוק לפני הנעילה",
  byName(afterReserve, "ט1 פתוח").pre_reserve_status === before.t1
  && byName(afterReserve, "ט2 שמור").pre_reserve_status === before.t2);

const bAfter = await prop(propB);
check("ההצעה המתחרה בוטלה אוטומטית", bAfter.status === "cancelled", bAfter.status);
check("עם סיבה שמסבירה למה", bAfter.cancel_reason === "item_unavailable", String(bAfter.cancel_reason));
check("והפריטים של המתחרה לא ננעלו",
  (await statusOf(S[0].id)) === "open_for_trade");

/* ── 6. פריט שמור לא עובר לדוכן ── */
const toDuchan = "update squish_items set duchan_product_id=gen_random_uuid() where id=$1";
const duchanErr = await fails(roniId, toDuchan, [r1.id]);
check("פריט ששמור בטרייד לא עובר לדוכן", /reserved in trade/.test(duchanErr), duchanErr.slice(0, 60));
check("והוא נשאר שמור", (await statusOf(r1.id)) === "reserved");

/* ── 7. וואטסאפ — הנקודה היחידה שבה מספר יוצא ── */
const wa = (page, id) => page.evaluate((p) =>
  fetch("/api/squish/trades/whatsapp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalId: p }),
  }).then(async (r) => ({ s: r.status, t: await r.text() })), id);

const noAck = await wa(tal, propA);
check("בלי סימון הורה אין מספר", noAck.s === 409, `${noAck.s}`);
check("וגם לא בטעות בגוף התשובה", !noAck.t.includes(U.roni.e164), noAck.t.slice(0, 50));

const notMine = await wa(shir, propA);
check("מי שאינה צד בטרייד מקבלת 'לא נמצא'", notMine.s === 404, `${notMine.s}`);

const cancelledWa = await wa(shir, propB);
check("ובטרייד מבוטל אין מספר גם לצדדים שלו", cancelledWa.s === 409, `${cancelledWa.s}`);
check("ובלי דליפה בגוף", !cancelledWa.t.includes(U.roni.e164));

const listed = await tal.evaluate(() => fetch("/api/squish/trades").then((r) => r.text()));
check("'הטריידים שלי' לא מחזיר טלפון אף פעם",
  !listed.includes(U.roni.e164) && !listed.includes(U.tal.e164));
check("וגם לא מזהי משתמש", !listed.includes(roniId) && !listed.includes(talId));
check("אבל כן מחזיר את הטרייד עצמו", listed.includes(propA));

await asUser(pool, talId, "select squish_ack_parent($1)", [propA]);
const withAck = await wa(tal, propA);
check("אחרי סימון הורה המספר נמסר", withAck.s === 200, `${withAck.s}`);
check("והוא המספר של הצד השני", withAck.t.includes(U.roni.e164));
check("ולא המספר של עצמה", !withAck.t.includes(U.tal.e164));
const waText = decodeURIComponent(JSON.parse(withAck.t).url ?? "");
check("וההודעה מפרטת מה כל אחת מביאה",
  waText.includes("אני מביאה") && waText.includes("את מביאה"));
check("ובתוכה שמות הפריטים שסוכמו",
  waText.includes("ט1 פתוח") && waText.includes("ר1 מבוקש"));
check("ולא הפריט שיצא בצמצום", !waText.includes("ט3 פתוח"));
check("סימון ההורה של טל לא מסמן עבור רוני",
  (await prop(propA)).parent_ack_receiver_at === null);
check("ולכן רוני עדיין לא מקבלת מספר", (await wa(roni, propA)).s === 409);

/* ── 8. טרייד שני: ביטול מחזיר מצב מדויק ── */
const { rows: [{ id: propC }] } = await asUser(pool, talId, send, [r2.id, [t3.id, t4.id]]);
await asUser(pool, roniId, "select squish_approve_version($1,$2)",
  [propC, (await prop(propC)).current_version_id]);
await asUser(pool, roniId, "select squish_accept_and_reserve_trade($1)", [propC]);
check("הטרייד השני נשמר", (await prop(propC)).status === "ready_for_whatsapp");
check("ופריט 'שמור לי' נעול עם זיכרון של מה שהיה",
  (await statusOf(t4.id)) === "reserved"
  && (await pool.query("select pre_reserve_status s from squish_items where id=$1", [t4.id])).rows[0].s === "keep");

await asUser(pool, talId, "select squish_cancel_trade($1,$2)", [propC, "changed_mind"]);
const cAfter = await prop(propC);
check("ביטול משנה את המצב ל'בוטל'", cAfter.status === "cancelled", cAfter.status);
check("עם הסיבה שנמסרה", cAfter.cancel_reason === "changed_mind", String(cAfter.cancel_reason));
check("פריט שהיה פתוח חוזר להיות פתוח", (await statusOf(t3.id)) === "open_for_trade");
check("ופריט ששמור לבעליו חוזר להיות שמור — ולא נפתח",
  (await statusOf(t4.id)) === "keep", await statusOf(t4.id));
check("הפריט המבוקש חוזר להיות פתוח", (await statusOf(r2.id)) === "open_for_trade");
check("והזיכרון מתנקה",
  (await pool.query(
    "select count(*)::int c from squish_items where reserved_by_proposal_id=$1 or (pre_reserve_status is not null and id=any($2::uuid[]))",
    [propC, [t3.id, t4.id, r2.id]])).rows[0].c === 0);

/* ── 9. השלמה משני הצדדים ── */
const { rows: [{ completed_trades: talBefore }] } = await pool.query(
  "select completed_trades from squish_profiles where user_id=$1", [talId]);

const { rows: [half] } = await asUser(pool, talId, "select squish_confirm_completion($1) s", [propA]);
check("צד אחד לבדו לא סוגר טרייד", half.s === "waiting", half.s);
check("והמצב עוד לא 'הושלם'", (await prop(propA)).status === "ready_for_whatsapp");
check("והפריטים עדיין שמורים", (await statusOf(t1.id)) === "reserved");

const { rows: [full] } = await asUser(pool, roniId, "select squish_confirm_completion($1) s", [propA]);
check("שני הצדדים סוגרים את הטרייד", full.s === "completed", full.s);
check("המצב 'הושלם'", (await prop(propA)).status === "completed");
check("הפריטים סומנו כהוחלפו",
  (await statusOf(t1.id)) === "traded" && (await statusOf(t2.id)) === "traded"
  && (await statusOf(r1.id)) === "traded");
check("והנעילה שוחררה",
  (await pool.query("select count(*)::int c from squish_items where reserved_by_proposal_id=$1", [propA]))
    .rows[0].c === 0);
const { rows: [{ completed_trades: talAfter }] } = await pool.query(
  "select completed_trades from squish_profiles where user_id=$1", [talId]);
check("מונה הטריידים עלה באחד", talAfter === talBefore + 1, `${talBefore}→${talAfter}`);
check("ולשתי הצדדים",
  (await pool.query("select completed_trades c from squish_profiles where user_id=$1", [roniId]))
    .rows[0].c >= 1);
check("פריט שהוחלף כבר לא ניתן לבקשה",
  /not open for trade/.test(await fails(shirId, send, [r1.id, [S[0].id]])));

/* ── 10. דיווח ── */
await asUser(pool, shirId, "select squish_report_trade($1,$2,$3)",
  [propB, "no_show", "לא הגיעה למפגש"]);
check("דיווח משנה את מצב הטרייד",
  (await prop(propB)).status === "reported", (await prop(propB)).status);
const { rows: [rep] } = await pool.query(
  "select reported_by_user_id, reported_user_id from squish_trade_reports where proposal_id=$1", [propB]);
check("והוא זוכר מי דיווחה ועל מי",
  rep.reported_by_user_id === shirId && rep.reported_user_id === roniId);
const { rows: seenByTarget } = await asUser(pool, roniId,
  "select id from squish_trade_reports where proposal_id=$1", [propB]);
check("המדווחת עליה לא רואה את הדיווח", seenByTarget.length === 0, `${seenByTarget.length}`);
const { rows: seenByOther } = await asUser(pool, talId,
  "select id from squish_trade_reports where proposal_id=$1", [propB]);
check("וגם לא אף אחת אחרת", seenByOther.length === 0, `${seenByOther.length}`);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
