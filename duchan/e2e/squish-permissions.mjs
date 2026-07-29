/**
 * חבילה 8 — מטריצת ההרשאות של המעגל המורחב.
 *
 * ארבע הפונקציות של שלב ב' נבדקות כאן **לפני** שמשהו בקוד קורא להן.
 * זו הנקודה: אם ההרשאה נבדקת רק דרך מסך, כל בדיקה מכסה שילוב אחד
 * ובדיוק השילובים שאיש לא חשב עליהם נשארים פתוחים.
 *
 * הצירים: יחס (עצמה · ישירה · מורחבת · זרה · חסומה · מושהית) ×
 * הגדרת צפייה (פרטי · חברות ישירות · מעגל מורחב) × מצב הפריט
 * (פתוח לטרייד · שמור · אולי · שמור בטרייד · הוחלף · נמחק).
 *
 * הכלל שכל השאר נגזר ממנו: **המעגל המורחב רואה רק מה שפתוח לטרייד
 * עכשיו.** לא פרטי, לא "אולי", ולא מה שכבר הוחלף.
 */
import { asUser, checker, closeHelper, db, joinCircle, launch, makeInvite, newCollector, uidOf, wipe } from "./helpers/index.mjs";

const U = {
  own: { num: "0521130601", e164: "972521130601", nick: "OwnP", title: "מדף בעלים" },
  dir: { num: "0521130602", e164: "972521130602", nick: "DirP", title: "מדף ישירה" },
  ext: { num: "0521130603", e164: "972521130603", nick: "ExtP", title: "מדף מורחבת" },
  far: { num: "0521130604", e164: "972521130604", nick: "FarP", title: "מדף זרה" },
};

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות מטריצת הרשאות");
const errs = [];
const b = await launch();

/* לבעלים פריט מכל מצב אפשרי — זה מה שהופך את המטריצה למטריצה */
const own = await newCollector(b, U.own, [
  { name: "פ פתוח" }, { name: "פ שמור", keep: true }, { name: "פ אולי" },
  { name: "פ נעול" }, { name: "פ הוחלף" }, { name: "פ נמחק" },
], errs);
const dir = await newCollector(b, U.dir, ["י1", "י2", "י3"], errs);
const ext = await newCollector(b, U.ext, ["מ1", "מ2", "מ3"], errs);
await newCollector(b, U.far, ["ז1", "ז2", "ז3"], errs);

const ownId = await uidOf(pool, U.own.e164);
const dirId = await uidOf(pool, U.dir.e164);
const extId = await uidOf(pool, U.ext.e164);
const farId = await uidOf(pool, U.far.e164);

/* own ← dir ישירה; dir ← ext ישירה; ולכן ext היא מורחבת של own */
const ownCode = await makeInvite(own, pool, ownId, "מטריצה");
await joinCircle(dir, ownCode);
const dirCode = await makeInvite(dir, pool, dirId, "מטריצה 2");
await joinCircle(ext, dirCode);

const items = Object.fromEntries(
  (await pool.query("select id, name from squish_items where owner_user_id=$1", [ownId]))
    .rows.map((r) => [r.name.split(" ")[1], r.id]));

await pool.query("update squish_items set trade_status='maybe_trade' where id=$1", [items["אולי"]]);
await pool.query("update squish_items set trade_status='reserved' where id=$1", [items["נעול"]]);
await pool.query("update squish_items set trade_status='traded' where id=$1", [items["הוחלף"]]);
await pool.query("update squish_items set deleted_at=now() where id=$1", [items["נמחק"]]);

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const relation = async (v, o) => (await one("select squish_relation($1,$2) r", [v, o])).r;
const canCollection = async (v, o) => (await one("select squish_can_view_collection($1,$2) c", [v, o])).c;
const canItem = async (v, i) => (await one("select squish_can_view_item($1,$2) c", [v, i])).c;
const canTrade = async (v, o, i) => (await one("select squish_can_trade($1,$2,$3) c", [v, o, i])).c;
const setVisibility = (val) =>
  pool.query("update squish_profiles set collection_visibility=$1 where user_id=$2", [val, ownId]);

/* ══════ 1. היחס עצמו ══════ */
await setVisibility("extended_circle");
const VIEWERS = { own: ownId, dir: dirId, ext: extId, far: farId };
for (const [who, expected] of [["own", "self"], ["dir", "direct"], ["ext", "extended"], ["far", "none"]]) {
  const got = await relation(VIEWERS[who], ownId);
  check(`יחס: ${who} → ${expected}`, got === expected, got);
}
check("ולמי שלא מחוברת בכלל אין יחס", (await relation(null, ownId)) === "none");
check("וגם לא לבעלים שאינו קיים", (await relation(dirId, null)) === "none");

/* המעגל המורחב מחושב ולא שמור — אין ולא תהיה שורה כזו בדאטהבייס */
const { rows: [stored] } = await pool.query(
  "select count(*)::int c from squish_connections where user_id=$1 and connected_user_id=$2", [extId, ownId]);
check("אין שורת קשר שמורה בין המורחבת לבעלים", stored.c === 0, String(stored.c));

/* ══════ 2. הכניסה לגלריה, לפי הגדרת הצפייה ══════ */
const COLLECTION = {
  private:         { own: true, dir: false, ext: false, far: false },
  direct_friends:  { own: true, dir: true,  ext: false, far: false },
  extended_circle: { own: true, dir: true,  ext: true,  far: false },
};
for (const [vis, row] of Object.entries(COLLECTION)) {
  await setVisibility(vis);
  for (const [who, expected] of Object.entries(row)) {
    const got = await canCollection(VIEWERS[who], ownId);
    check(`גלריה · ${vis} · ${who} → ${expected ? "כן" : "לא"}`, got === expected, String(got));
  }
}

/* ══════ 3. הפריט — כאן יושב כל ההבדל של שלב ב' ══════ */
await setVisibility("extended_circle");
const ITEM_STATE = [
  ["פתוח", { own: true, dir: true, ext: true,  far: false }],
  ["שמור", { own: true, dir: true, ext: false, far: false }],
  ["אולי", { own: true, dir: true, ext: false, far: false }],
  ["נעול", { own: true, dir: true, ext: false, far: false }],
  ["הוחלף", { own: true, dir: true, ext: false, far: false }],
  ["נמחק", { own: false, dir: false, ext: false, far: false }],
];
for (const [state, row] of ITEM_STATE) {
  for (const [who, expected] of Object.entries(row)) {
    const got = await canItem(VIEWERS[who], items[state]);
    check(`פריט ${state} · ${who} → ${expected ? "כן" : "לא"}`, got === expected, String(got));
  }
}
check("ופריט שלא קיים אינו גלוי לאיש",
  (await canItem(ownId, "00000000-0000-0000-0000-000000000000")) === false);

/* המורחבת רואה את הגלריה אבל לא את התוכן הפרטי שבה — שתי תשובות
   שונות לאותה אספנית, וזו בדיוק הסיבה שהפונקציות נפרדו */
check("המורחבת נכנסת לגלריה אבל רואה רק את הפתוח לטרייד",
  (await canCollection(extId, ownId)) === true
  && (await canItem(extId, items["פתוח"])) === true
  && (await canItem(extId, items["שמור"])) === false);

/* וכשהבעלים חוזרת לחברות ישירות, המורחבת מאבדת גם את הפתוח */
await setVisibility("direct_friends");
check("ובחברות ישירות היא מאבדת גם את הפריט הפתוח",
  (await canItem(extId, items["פתוח"])) === false);
await setVisibility("extended_circle");

/* ══════ 4. הצעת טרייד ══════ */
const TRADE = [
  ["פתוח", { own: false, dir: true, ext: true, far: false }],
  ["שמור", { own: false, dir: false, ext: false, far: false }],
  ["אולי", { own: false, dir: false, ext: false, far: false }],
  ["נעול", { own: false, dir: false, ext: false, far: false }],
  ["הוחלף", { own: false, dir: false, ext: false, far: false }],
  ["נמחק", { own: false, dir: false, ext: false, far: false }],
];
for (const [state, row] of TRADE) {
  for (const [who, expected] of Object.entries(row)) {
    const got = await canTrade(VIEWERS[who], ownId, items[state]);
    check(`טרייד ${state} · ${who} → ${expected ? "כן" : "לא"}`, got === expected, String(got));
  }
}
check("ואי אפשר להציע טרייד על הפריט של עצמך",
  (await canTrade(ownId, ownId, items["פתוח"])) === false);
check("וגם לא כשמצהירים על בעלים אחר מזה שרשום על הפריט",
  (await canTrade(dirId, farId, items["פתוח"])) === false);

/* הגדרת צפייה פרטית סוגרת גם טרייד — אחרת פריט פתוח לטרייד באוסף
   שהוסתר לגמרי היה עדיין ניתן להצעה */
await setVisibility("private");
check("באוסף פרטי אין הצעות טרייד, גם לחברה ישירה",
  (await canTrade(dirId, ownId, items["פתוח"])) === false);
await setVisibility("extended_circle");

/* ══════ 5. חסימה גוברת על הכל ══════ */
await asUser(pool, extId, "select squish_block_user($1)", [ownId]);
check("חסומה: היחס הוא חסימה", (await relation(extId, ownId)) === "blocked");
check("ולשני הכיוונים", (await relation(ownId, extId)) === "blocked");
check("בלי גלריה", (await canCollection(extId, ownId)) === false);
check("בלי הפריט הפתוח", (await canItem(extId, items["פתוח"])) === false);
check("ובלי טרייד", (await canTrade(extId, ownId, items["פתוח"])) === false);
await asUser(pool, extId, "select squish_unblock_user($1)", [ownId]);
check("וביטול החסימה מחזיר את היחס המורחב", (await relation(extId, ownId)) === "extended");

/* חסימה של החוליה האמצעית מנתקת את המעגל המורחב שעבר דרכה */
await asUser(pool, dirId, "select squish_block_user($1)", [ownId]);
check("חסימה של החוליה האמצעית מנתקת גם את המורחבת שמאחוריה",
  (await relation(extId, ownId)) === "none", await relation(extId, ownId));
await asUser(pool, dirId, "select squish_unblock_user($1)", [ownId]);
await joinCircle(dir, ownCode);
check("ואחרי חיבור מחדש המעגל חוזר", (await relation(extId, ownId)) === "extended");

/* ══════ 6. השהיה גוברת גם היא ══════ */
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [ownId]);
check("בעלים מושהית: היחס הוא השהיה", (await relation(dirId, ownId)) === "suspended");
check("בלי גלריה", (await canCollection(dirId, ownId)) === false);
check("בלי פריטים", (await canItem(dirId, items["פתוח"])) === false);
check("ובלי טרייד", (await canTrade(dirId, ownId, items["פתוח"])) === false);
check("וגם היא עצמה לא רואה, בדיוק כמו ב-squish_can_view של היום",
  (await canCollection(ownId, ownId)) === false);
await pool.query("select squish_admin_restore($1,'tester')", [ownId]);

await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [dirId]);
check("צופה מושהית: גם היא לא רואה", (await relation(dirId, ownId)) === "suspended");
check("ולא מציעה טרייד", (await canTrade(dirId, ownId, items["פתוח"])) === false);
await pool.query("select squish_admin_restore($1,'tester')", [dirId]);
check("ואחרי שחזור הכל חוזר", (await relation(dirId, ownId)) === "direct");

/* ══════ 7. הפונקציות החדשות לא נגעו בישנה ══════ */
check("squish_can_view עדיין קיימת ועונה כמו קודם לחברה ישירה",
  (await one("select squish_can_view($1,$2) v", [dirId, ownId])).v === true);
check("ועדיין נותנת למורחבת גישה מלאה כשההגדרה מורחבת — זו ההתנהגות שהדגל ישנה",
  (await one("select squish_can_view($1,$2) v", [extId, ownId])).v === true);
check("בעוד שהפונקציה החדשה כבר מצמצמת אותה לפתוח לטרייד בלבד",
  (await canItem(extId, items["שמור"])) === false);

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
