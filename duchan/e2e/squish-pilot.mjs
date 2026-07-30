/**
 * חבילה 10 — חשבון פיילוט מלווה.
 *
 * הרקע: ילדה בת 8 מקבלת את הטלפון לחצי שעה, בליווי. היא מתחת לטווח
 * שהמוצר נבנה לו, ולכן הסשן הראשון סגור יותר מהרגיל.
 *
 * שני חוזים:
 *
 * 1. **מה שפתוח באמת פתוח.** אונבורדינג, צילום, שמות, סוג ומצב,
 *    מדבקות, אוסף, וצפייה באוסף שלה. אם משהו מזה חסום — הבדיקה
 *    נכשלת, כי ילדה שנתקעת בדקה הראשונה לא מלמדת אותנו כלום.
 * 2. **מה שסגור סגור עד שההורה אישר.** קישורי הזמנה, הצעת טרייד,
 *    קבלת טרייד, וואטסאפ, והגלריה שלה לאחרות. הצ'קבוקס שהיא סימנה
 *    הוא הצהרה שלה; רק הטוקן בסמס הוא אישור של הורה.
 */
import {
  BASE, IMG, asUser, checker, closeHelper, db, launch, newCollector, stranger, uidOf, wipe,
  verifyPhone,
} from "./helpers/index.mjs";

const U = {
  kid:    { num: "0521130801", e164: "972521130801", nick: "PilotKid", title: "האוסף שלי" },
  friend: { num: "0521130802", e164: "972521130802", nick: "PilotPal", title: "מדף חברה" },
};
const PARENT = "0521130899";

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));
await pool.query("delete from squish_parent_approvals where parent_phone = $1", ["972521130899"]);

/** בונה אוסף בדף שכבר קיים — כדי לשמור על ההקשר שנושא את העוגייה. */
async function buildCollection(page, user, names) {
  await page.click("a[href='/squish/new']");
  await page.waitForURL("**/squish/new");
  for (const [i, it] of names.entries()) {
    await page.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
    await page.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
    await page.waitForTimeout(600);
    await page.fill("input[aria-label='שם הסקווישי']", it.name);
    await page.click("button[aria-label='נידו']");
    await page.click("button:has-text('הלאה')");
    await page.waitForTimeout(250);
    if (it.sticker) await page.click(`button[aria-label='${it.sticker}']`);
    if (it.keep) await page.click("button[aria-label='פתוח לטרייד']");
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
}

const { check, done } = checker("בדיקות פיילוט");
const errs = [];
const b = await launch();

/* ── 0. הבוטסטראפ: הסימון קיים לפני שיש מה לסמן ──
   זה החלון שהיה פתוח: הילדה סיימה אונבורדינג, ורק אחר כך מישהי סימנה
   אותה. בין לבין היא כבר מאומתת, ו-squish_own_invites מרשה להכניס
   קישור הזמנה גם בלי פרופיל. */
const { rows: [tokRow] } = await pool.query(
  "insert into squish_pilot_tokens (token, label, created_by) values ($1,'בדיקה','tester') returning token",
  ["pilot-token-" + Date.now().toString(36) + "-abcdefghij"]);
const PILOT_TOKEN = tokRow.token;

const kidCtx = await b.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
const kid = await kidCtx.newPage();
kid.on("pageerror", (e) => errs.push(`${U.kid.nick}: ${e.message}`));

await kid.goto(`${BASE}/squish/pilot/${PILOT_TOKEN}`, { waitUntil: "networkidle" });
check("הקישור מעביר לסקוויש בלי להשאיר את הטוקן בכתובת",
  kid.url().endsWith("/squish") && !kid.url().includes(PILOT_TOKEN), kid.url());
const cookies = await kidCtx.cookies();
const pilotCookie = cookies.find((c) => c.name === "squish_pilot");
check("הטוקן עבר לעוגייה httpOnly", !!pilotCookie && pilotCookie.httpOnly === true);
check("והוא לא נגיש לג׳אווהסקריפט בדף",
  (await kid.evaluate(() => document.cookie)).includes("squish_pilot") === false);
const { rows: [opened] } = await pool.query(
  "select opened_at, claimed_by_user_id from squish_pilot_tokens where token=$1", [PILOT_TOKEN]);
check("הפתיחה נרשמה", !!opened.opened_at);
check("ועוד לא נצמד לאף חשבון", opened.claimed_by_user_id === null);

/* בונים את האוסף דרך אותו הקשר — כלומר עם העוגייה */
await buildCollection(kid, U.kid, [
  { name: "חד-קרן ורוד", sticker: "נדיר בעיניי" },
  { name: "ענן קטן" },
  { name: "לימון", keep: true },
]);
const kidId = await uidOf(pool, U.kid.e164);

const { rows: [claimed] } = await pool.query(
  "select claimed_by_user_id, claimed_at from squish_pilot_tokens where token=$1", [PILOT_TOKEN]);
check("הטוקן נצמד לחשבון שלה", claimed.claimed_by_user_id === kidId);
check("עם חותמת הצמדה", !!claimed.claimed_at);
const { rows: [born] } = await pool.query(
  "select pilot_user, pilot_started_at, parent_approved_at from squish_profiles where user_id=$1", [kidId]);
check("הפרופיל **נולד** מסומן כפיילוט — לא סומן אחר כך", born.pilot_user === true);
check("עם חותמת התחלה מהרגע הראשון", !!born.pilot_started_at);
check("ובלי אישור הורה", born.parent_approved_at === null);
check("כלומר השער סגור מהבקשה המאומתת הראשונה",
  (await pool.query("select squish_pilot_gate($1) g", [kidId])).rows[0].g === "awaiting_parent");

/* אין רגע שבו היה פרופיל לא מסומן: מספר הפריטים שנוצרו לפני הסימון
   חייב להיות אפס, כי הסימון קדם לפרופיל עצמו. */
const { rows: [order] } = await pool.query(
  "select (select pilot_started_at from squish_profiles where user_id=$1) p," +
  " (select min(created_at) from squish_items where owner_user_id=$1) i", [kidId]);
check("הסימון קדם לסקווישי הראשון שנשמר",
  order.p !== null && order.i !== null && new Date(order.p) <= new Date(order.i),
  `${order.p} ≤ ${order.i}`);

/* טוקן חד-פעמי: לא נצמד לחשבון שני */
const { rows: [reclaim] } = await pool.query(
  "select squish_claim_pilot_token($1,'00000000-0000-0000-0000-000000000001') ok", [PILOT_TOKEN]);
check("טוקן שכבר נתפס לא נצמד לחשבון אחר", reclaim.ok === false);
const friend = await newCollector(b, U.friend, ["ח1", "ח2", "ח3"], errs);
const friendId = await uidOf(pool, U.friend.e164);

const { rows: items } = await pool.query(
  "select name, stickers, trade_status, image_key from squish_items where owner_user_id=$1 order by sort_order", [kidId]);
check("היא בנתה אוסף עם שלושה סקווישים", items.length === 3, `${items.length}`);
check("לכל אחד יש תמונה", items.every((i) => !!i.image_key));
check("שם שהיא כתבה נשמר", items[0].name === "חד-קרן ורוד", items[0].name);
check("מדבקה שהיא בחרה נשמרה", (items[0].stickers ?? []).includes("rare"));
check("ופריט שסימנה כשלה אינו פתוח לטרייד",
  items.find((i) => i.name === "לימון")?.trade_status === "keep");

/* ── 2. חברה רגילה, בלי טוקן — כדי להוכיח שהשער לא נוגע בה ── */
const { rows: [prof] } = await pool.query(
  "select collection_code from squish_profiles where user_id=$1", [kidId]);
const { rows: [friendGate] } = await pool.query("select squish_pilot_gate($1) g", [friendId]);
check("חשבון רגיל לא מושפע מהשער", friendGate.g === "ok");
const { rows: [friendProf] } = await pool.query(
  "select pilot_user from squish_profiles where user_id=$1", [friendId]);
check("והוא לא מסומן כפיילוט", friendProf.pilot_user === false);

/* ── 3. היא עדיין רואה את האוסף שלה במלואו ── */
await kid.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await kid.waitForTimeout(1200);
const mine = await kid.textContent("body");
check("היא רואה את האוסף שלה אחרי הסימון",
  mine.includes("חד-קרן ורוד") && mine.includes("ענן קטן") && mine.includes("לימון"));
const { rows: ownRls } = await asUser(pool, kidId, "select id from squish_items where owner_user_id=$1", [kidId]);
check("וגם ה-RLS נותן לה את כל השלושה", ownRls.length === 3, `${ownRls.length}`);

/* ── 4. מה שסגור ── */
/* לפני שמחברים אותן: היא לא רואה כלום של אף אחת אחרת */
const { rows: isolated } = await asUser(pool, kidId,
  "select id from squish_items where owner_user_id=$1", [friendId]);
check("היא לא רואה אוסף של אחרת דרך RLS", isolated.length === 0, `${isolated.length}`);

/* וגם לא יכולה להיכנס למעגל של מישהי — הצד השני של חסימת ההזמנות */
const { rows: [inv] } = await asUser(pool, friendId,
  "insert into squish_invites (code, inviter_user_id) values ('pilotinv1',$1) returning code", [friendId]);
let joinErr = "";
try { await asUser(pool, kidId, "select squish_join($1)", [inv.code]); } catch (e) { joinErr = e.message; }
check("ואי אפשר להצטרף למעגל של מישהי אחרת",
  /awaiting parent approval/.test(joinErr), joinErr.slice(0, 40));
check("ולא נוצר קשר",
  (await pool.query(
    "select count(*)::int c from squish_connections where user_id=$1 or connected_user_id=$1", [kidId]))
    .rows[0].c === 0);

let inviteErr = "";
try {
  await asUser(pool, kidId,
    "insert into squish_invites (code, inviter_user_id) values ('pilot001',$1)", [kidId]);
} catch (e) { inviteErr = e.message; }
check("אי אפשר ליצור קישור הזמנה", /awaiting parent approval/.test(inviteErr), inviteErr.slice(0, 40));

const { rows: [friendItem] } = await pool.query(
  "select id from squish_items where owner_user_id=$1 limit 1", [friendId]);
const { rows: [kidItem] } = await pool.query(
  "select id from squish_items where owner_user_id=$1 and trade_status='open_for_trade' limit 1", [kidId]);

/* מחברים אותן ידנית, בעקיפת squish_join — כדי להוכיח שחסימת הטרייד
   היא של אישור ההורה עצמו, ולא תופעת לוואי של מעגל ריק */
await pool.query(
  "insert into squish_connections (user_id, connected_user_id, connection_type, status) values " +
  "($1,$2,'direct_friend','active'), ($2,$1,'direct_friend','active') on conflict do nothing",
  [kidId, friendId]);

let sendErr = "";
try {
  await asUser(pool, kidId, "select squish_send_proposal($1,$2::uuid[])", [friendItem.id, [kidItem.id]]);
} catch (e) { sendErr = e.message; }
check("אי אפשר להציע טרייד", /awaiting parent approval/.test(sendErr), sendErr.slice(0, 40));

let recvErr = "";
try {
  await asUser(pool, friendId, "select squish_send_proposal($1,$2::uuid[])", [kidItem.id, [friendItem.id]]);
} catch (e) { recvErr = e.message; }
check("וגם אי אפשר להציע לה טרייד", /awaiting parent approval/.test(recvErr), recvErr.slice(0, 40));

/* הגלריה שלה לא נפתחת לאחרות, גם כשהן במעגל */
await friend.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await friend.waitForTimeout(900);
const friendSees = await friend.textContent("body");
check("חברה במעגל לא רואה את הפריטים שלה",
  !friendSees.includes("חד-קרן ורוד") && !friendSees.includes("ענן קטן"));

const anon = await stranger(b);
const rawHtml = await (await fetch(`${BASE}/squish/c/${prof.collection_code}`)).text();
check("ושמות הפריטים לא יושבים ב-HTML", !rawHtml.includes("חד-קרן ורוד"));
check("וגם לא מפתחות המדיה", !rawHtml.includes(items[0].image_key ?? "@@none@@"));
check("ולא מספר טלפון", !rawHtml.includes(U.kid.e164) && !rawHtml.includes("972521130899"));
check("הדף חסום לאינדוקס", /noindex/i.test(rawHtml));

/* ── 5. מה שהילדה לא רואה בכלל ── */
await kid.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await kid.waitForTimeout(1200);
const adminTry = await kid.textContent("body");
check("החמ\"ל לא נפתח לה",
  !adminTry.includes("חנויות שהצהירו על תשלום") && !adminTry.includes('דוכן · חמ"ל'),
  kid.url());
const pilotApi = await kid.evaluate(() =>
  fetch("/api/admin/squish-pilot").then(async (r) => ({ s: r.status, t: await r.text() })));
check("וגם ה-API של הפיילוט חסום לה", pilotApi.s === 403, `${pilotApi.s}`);
check("בלי דליפה בתשובה", !pilotApi.t.includes("PilotKid"));


/* ── 6. אישור ההורה, דרך הטוקן בסמס ── */
const send = await kid.evaluate((p) =>
  fetch("/api/squish/parent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentPhone: p }),
  }).then(async (r) => ({ s: r.status, b: await r.json() })), PARENT);
check("אפשר לשלוח בקשת אישור להורה", send.s === 200, `${send.s} ${JSON.stringify(send.b).slice(0, 60)}`);

const ownNumber = await kid.evaluate((p) =>
  fetch("/api/squish/parent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentPhone: p }),
  }).then((r) => r.status), U.kid.num);
check("אבל לא למספר של הילדה עצמה", ownNumber === 400, `${ownNumber}`);

const { rows: [tok] } = await pool.query(
  "select token, parent_phone from squish_parent_approvals where user_id=$1 order by created_at desc limit 1", [kidId]);
check("נוצר טוקן למספר ההורה", !!tok?.token && tok.parent_phone === "972521130899", String(tok?.parent_phone));

/* ההורה מחליט מדף בלי חשבון ובלי התחברות */
const parentPage = await stranger(b);
await parentPage.goto(`${BASE}/squish/parent/${tok.token}`, { waitUntil: "networkidle" });
await parentPage.waitForTimeout(900);
const parentBody = await parentPage.textContent("body");
check("ההורה רואה מסך החלטה בלי להתחבר", parentBody.includes("סקוויש קלאב"));
check("והוא אומר מה יש ומה אין", parentBody.includes("מכירה") || parentBody.includes("כסף"));
check("השער עדיין סגור לפני שהחליט",
  (await pool.query("select squish_pilot_gate($1) g", [kidId])).rows[0].g === "awaiting_parent");

const decide = await parentPage.evaluate((t) =>
  fetch("/api/squish/parent", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: t, approved: true }),
  }).then((r) => r.status), tok.token);
check("ההורה מאשר", decide === 200, `${decide}`);

/* ── 7. אחרי האישור השער נפתח ── */
const { rows: [after] } = await pool.query(
  "select parent_approved_at from squish_profiles where user_id=$1", [kidId]);
check("האישור נחת על הפרופיל", !!after.parent_approved_at);
check("והשער נפתח", (await pool.query("select squish_pilot_gate($1) g", [kidId])).rows[0].g === "ok");

await asUser(pool, kidId, "insert into squish_invites (code, inviter_user_id) values ('pilot002',$1)", [kidId]);
check("עכשיו אפשר ליצור קישור הזמנה",
  (await pool.query("select count(*)::int c from squish_invites where code='pilot002'")).rows[0].c === 1);

check("וגם להצטרף למעגל",
  (await (async () => {
    try { await asUser(pool, kidId, "select squish_join($1)", [inv.code]); return true; }
    catch { return false; }
  })()) === true);

const { rows: [{ id: prop }] } = await asUser(pool, kidId,
  "select squish_send_proposal($1,$2::uuid[]) id", [friendItem.id, [kidItem.id]]);
check("ואפשר להציע טרייד", !!prop);

await friend.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await friend.waitForTimeout(900);
check("והגלריה נפתחת לחברה שבמעגל",
  (await friend.textContent("body")).includes("חד-קרן ורוד"));

/* ── 8. מד הלחץ של המנהלת ── */
await pool.query(
  "insert into squish_write_failures (user_id, op, code, expects, cid) values ($1,'squish.item.create','PGRST204','squish_items.stickers','smoke')",
  [kidId]);
const { rows: [panel] } = await pool.query(
  "select (select count(*)::int from squish_items where owner_user_id=$1 and deleted_at is null) items," +
  " (select count(*)::int from squish_write_failures where user_id=$1) fails", [kidId]);
check("המנהלת רואה כמה סקווישים נוצרו", panel.items === 3, `${panel.items}`);
check("וכמה שמירות נכשלו", panel.fails === 1, `${panel.fails}`);
const { rows: failRow } = await pool.query(
  "select op, code, expects, cid from squish_write_failures where user_id=$1", [kidId]);
check("ויומן הכשלים לא מכיל טקסט חופשי או מדיה",
  Object.values(failRow[0]).every((v) => typeof v === "string" && !v.includes("/") && !v.includes(".webp")),
  JSON.stringify(failRow[0]));

/* ── 9. איפוס נקי ── */
const { rows: [{ n: storesBefore }] } = await pool.query(
  "select count(*)::int n from stores where owner_id=$1", [kidId]);
const { rows: [reset] } = await pool.query("select squish_pilot_reset($1,'tester') r", [kidId]);
check("האיפוס מדווח כמה נמחקו", reset.r.items_removed === 3, JSON.stringify(reset.r));
check("ומאשר שהדוכנים לא נגעו", reset.r.stores_intact === storesBefore, `${reset.r.stores_intact}`);
check("הפרופיל נמחק",
  (await pool.query("select count(*)::int c from squish_profiles where user_id=$1", [kidId])).rows[0].c === 0);
check("הפריטים נמחקו",
  (await pool.query("select count(*)::int c from squish_items where owner_user_id=$1", [kidId])).rows[0].c === 0);
check("הקשרים והקישורים נמחקו",
  (await pool.query(
    "select (select count(*)::int from squish_connections where user_id=$1 or connected_user_id=$1)" +
    " + (select count(*)::int from squish_invites where inviter_user_id=$1) c", [kidId])).rows[0].c === 0);
check("וגם בקשות אישור ההורה",
  (await pool.query("select count(*)::int c from squish_parent_approvals where user_id=$1", [kidId])).rows[0].c === 0);
check("אבל חשבון הכניסה נשאר",
  (await pool.query("select count(*)::int c from phone_accounts where phone=$1", [U.kid.e164])).rows[0].c === 1);
check("והפריטים של החברה לא נגעו",
  (await pool.query("select count(*)::int c from squish_items where owner_user_id=$1", [friendId])).rows[0].c === 3);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
