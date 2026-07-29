/**
 * חבילה 3 — לגלות ופרטיות.
 *
 * החוזה: **"לגלות" ו"הגלריה שלה" חייבים לענות אותה תשובה.** שני המסכים
 * נשענים על squish_can_view, ולכן חסימה, השהיה או יציאה מהמעגל צריכות
 * להפיל את שניהם באותו רגע. אם מסך אחד יסנן לבד, יהיה יום שבו הוא יסנן
 * אחרת.
 *
 * ובנוסף: בכרטיס מופיע רק מה שפתוח לטרייד, ולעולם לא מזהה משתמש או טלפון.
 */
import {
  BASE, asUser, checker, closeHelper, db, joinCircle, launch, makeInvite, newCollector,
  stranger, uidOf, wipe,
} from "./helpers/index.mjs";

const U = {
  dor: { num: "0521130301", e164: "972521130301", nick: "DorD", title: "מדף דור" },
  eli: { num: "0521130302", e164: "972521130302", nick: "EliD", title: "מדף אלי" },
  gil: { num: "0521130303", e164: "972521130303", nick: "GilD", title: "מדף גיל" },
};
const OPEN = "פיל כחול לגילוי";
const KEPT = "שמור לי ולא לטרייד";

const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות לגלות");
const errs = [];
const b = await launch();

const dor = await newCollector(b, U.dor, [
  { name: OPEN },
  { name: KEPT, keep: true },
  { name: "עוד אחד של דור" },
], errs);
const eli = await newCollector(b, U.eli, ["א1", "א2", "א3"], errs);
const gil = await newCollector(b, U.gil, ["ג1", "ג2", "ג3"], errs);

const dorId = await uidOf(pool, U.dor.e164);
const eliId = await uidOf(pool, U.eli.e164);
const gilId = await uidOf(pool, U.gil.e164);

const { rows: dorItems } = await pool.query(
  "select id, name, image_key, trade_status from squish_items where owner_user_id=$1", [dorId]);
const openItem = dorItems.find((i) => i.name === OPEN);
const keptItem = dorItems.find((i) => i.name === KEPT);
const { rows: [dorProf] } = await pool.query(
  "select id, collection_code, collection_visibility from squish_profiles where user_id=$1", [dorId]);

/** מבקש את "לגלות" בזהות של הדפדפן הפתוח, ומחזיר את גוף התשובה. */
const discover = (page) =>
  page.evaluate(() => fetch("/api/squish/discover").then((r) => r.json()));
const names = (d) => (d.cards ?? []).map((c) => c.item.name);

/* ── 1. אין מעגל, אין כרטיסים ── */
const alone = await discover(eli);
check("בלי חברות אין כרטיסים", (alone.cards ?? []).length === 0 && alone.circle === false,
  JSON.stringify(alone).slice(0, 60));

/* ── 2. חברה ישירה רואה — ורק את מה שפתוח לטרייד ── */
const dorCode = await makeInvite(dor, pool, dorId, "כיתה ד");
await joinCircle(eli, dorCode);

const asFriend = await discover(eli);
check("חברה ישירה רואה את הפריט הפתוח", names(asFriend).includes(OPEN), names(asFriend).join(","));
check("ולא רואה פריט ששמור לבעלים", !names(asFriend).includes(KEPT));
check("הכרטיס מסביר את הקשר",
  (asFriend.cards ?? []).every((c) => typeof c.context === "string" && c.context.length > 0));

const asFriendRaw = JSON.stringify(asFriend);
check("בתשובה אין מזהה משתמש", !asFriendRaw.includes(dorId));
check("ואין מספר טלפון", !asFriendRaw.includes(U.dor.e164));
check("שדה profile_id נחתך מהכרטיס",
  (asFriend.cards ?? []).every((c) => !("profile_id" in c.item)));
check("ומפתחות המדיה לא נושאים מזהה משתמש",
  (asFriend.cards ?? []).every((c) => !(c.item.image_key ?? "").includes(dorId)));

/* ── 3. חברה של חברה לא נכנסת בברירת מחדל ── */
const eliCode = await makeInvite(eli, pool, eliId, "מחזור");
await joinCircle(gil, eliCode);
check("ברירת המחדל של דור היא חברות ישירות",
  dorProf.collection_visibility === "direct_friends", dorProf.collection_visibility);

const fof = await discover(gil);
check("חברה של חברה לא רואה את דור", !names(fof).includes(OPEN), names(fof).join(","));
check("וגם squish_can_view אומר לא",
  (await pool.query("select squish_can_view($1,$2) v", [gilId, dorId])).rows[0].v === false);
check("אבל את החברה הישירה שלה כן",
  (await pool.query("select squish_can_view($1,$2) v", [gilId, eliId])).rows[0].v === true);

/* ── 4. כשדור פותחת למעגל מורחב, אותו קוד כבר כן נותן ──
   זו הגדרה שקיימת היום, ולכן היא נבדקת היום. הבדיקה נשענת על ההרשאה
   ולא על נוסח הכיתוב, כדי שהיא לא תישבר משינוי טקסט. */
await pool.query("update squish_profiles set collection_visibility='extended_circle' where user_id=$1", [dorId]);
const fofOpen = await discover(gil);
check("במעגל מורחב חברה של חברה כן רואה", names(fofOpen).includes(OPEN), names(fofOpen).join(","));
check("ועדיין רק את מה שפתוח לטרייד", !names(fofOpen).includes(KEPT));
await pool.query("update squish_profiles set collection_visibility='direct_friends' where user_id=$1", [dorId]);
check("וכשחוזרים לחברות ישירות זה נסגר מיד",
  !names(await discover(gil)).includes(OPEN));

/* ── 5. "מעניין אותי" ──
   הכרטיסים מוצגים אחד-אחד, ולכן הבדיקה לא מניחה איזה מהם ראשון: היא
   קוראת מהמסך על מה בדיוק סומן ומאמתת מול הדאטהבייס את *אותו* פריט. */
await eli.goto(`${BASE}/squish/discover`, { waitUntil: "networkidle" });
await eli.waitForTimeout(1500);
check("הדף חסום לאינדוקס גם למי שמחוברת",
  (await eli.getAttribute("meta[name=robots]", "content") ?? "").includes("noindex"));

const headings = (await eli.locator(".t-heading").allTextContents()).map((t) => t.trim());
const shownName = headings.find((t) => t && t !== "לגלות") ?? "";

await eli.click("button:has-text('מעניין אותי')");
await eli.waitForTimeout(1500);
check("הכפתור מתחלף ל'סימנת'", (await eli.textContent("body")).includes("סימנת"));

const offerHref = await eli.getAttribute("a[href^='/squish/trades/new']", "href");
const shownId = (offerHref ?? "").split("item=")[1] ?? "";
const { rows: [shownItem] } = await pool.query(
  "select id, name, trade_status, owner_user_id from squish_items where id=$1",
  [shownId || "00000000-0000-0000-0000-000000000000"]);
check("הכרטיס שמוצג הוא סקווישי אמיתי מהמעגל, פתוח לטרייד",
  !!shownItem && shownItem.trade_status === "open_for_trade"
  && [dorId, gilId].includes(shownItem.owner_user_id),
  `${shownName} / ${shownItem?.trade_status}`);
check("והלינק להצעה מצביע על אותו פריט שהוצג", shownItem?.name === shownName,
  `לינק: ${shownItem?.name} · מסך: ${shownName}`);

const { rows: [int1] } = await pool.query(
  "select count(*)::int c from squish_interests where item_id=$1 and user_id=$2", [shownItem.id, eliId]);
check("סימון מעניין נשמר", int1.c === 1, String(int1.c));

let dupErr = "";
try {
  await asUser(pool, eliId,
    "insert into squish_interests (item_id, user_id) values ($1,$2)", [shownItem.id, eliId]);
} catch (e) { dupErr = e.message; }
check("סימון כפול נדחה ברמת הדאטהבייס", /duplicate key|unique/i.test(dupErr), dupErr.slice(0, 40));
const { rows: [int2] } = await pool.query(
  "select count(*)::int c from squish_interests where item_id=$1", [shownItem.id]);
check("ונשארה שורה אחת", int2.c === 1, String(int2.c));

const shownOwner = shownItem.owner_user_id;
const thirdParty = [dorId, gilId].find((id) => id !== shownOwner);
const { rows: ownerSees } = await asUser(pool, shownOwner,
  "select user_id from squish_interests where item_id=$1", [shownItem.id]);
check("הבעלים רואה שהתעניינו בפריט שלה", ownerSees.length === 1, `${ownerSees.length}`);
const { rows: otherSees } = await asUser(pool, thirdParty,
  "select id from squish_interests where item_id=$1", [shownItem.id]);
check("ומי שאינה הבעלים ולא המסמנת לא רואה כלום", otherSees.length === 0, `${otherSees.length}`);

/* ── 6. עמוד הפריט מכבד את אותה הרשאה ──
   השם יושב בשדה קלט, ולכן נקרא כערך ולא כטקסט. */
await eli.goto(`${BASE}/squish/item/${openItem.id}`, { waitUntil: "networkidle" });
await eli.waitForTimeout(1200);
check("חברה ישירה מגיעה לעמוד הפריט",
  (await eli.inputValue("input[aria-label='שם הסקווישי']")) === OPEN);

await gil.goto(`${BASE}/squish/item/${openItem.id}`, { waitUntil: "networkidle" });
await gil.waitForTimeout(1200);
const gilItemBody = await gil.textContent("body");
check("מי שמחוץ למעגל מקבלת 'הפריט לא נמצא'",
  gilItemBody.includes("הפריט לא נמצא") && !gilItemBody.includes(OPEN));

const { rows: gilRls } = await asUser(pool, gilId, "select id from squish_items where id=$1", [openItem.id]);
check("וגם ה-RLS לא מחזיר לה את השורה", gilRls.length === 0, `${gilRls.length}`);

/* ── 7. הצעת טרייד נחסמת באותם גבולות ── */
const offerable = (page, id) =>
  page.evaluate((i) => fetch(`/api/squish/offerable?item=${i}`).then(async (r) => ({ s: r.status, b: await r.json() })), id);

const okOffer = await offerable(eli, openItem.id);
check("חברה ישירה מקבלת רשימת פריטים להצעה",
  okOffer.s === 200 && Array.isArray(okOffer.b.mine) && okOffer.b.mine.length === 3,
  `${okOffer.s}/${okOffer.b.mine?.length}`);
check("ובתשובה אין מזהה בעלים", !JSON.stringify(okOffer.b).includes(dorId));

const outOffer = await offerable(gil, openItem.id);
check("מי שמחוץ למעגל נחסמת מהצעה", outOffer.s === 403, `${outOffer.s}`);
const keptOffer = await offerable(eli, keptItem.id);
check("אי אפשר להציע על פריט שלא פתוח לטרייד", keptOffer.s === 409, `${keptOffer.s}`);
const ownOffer = await offerable(dor, openItem.id);
check("ואי אפשר להציע על הפריט של עצמך", ownOffer.s === 400, `${ownOffer.s}`);

/* ── 8. פחות משלושה פריטים — אין כניסה ── */
await pool.query("update squish_items set deleted_at=now() where owner_user_id=$1 and name='ג1'", [gilId]);
const thin = await discover(gil);
check("מי שיש לה פחות משלושה סקווישים לא נכנסת ללגלות",
  thin.reason === "no-collection", JSON.stringify(thin).slice(0, 40));
await pool.query("update squish_items set deleted_at=null where owner_user_id=$1 and name='ג1'", [gilId]);

/* ── 9. השהיה מפילה את שני המסכים יחד ── */
await pool.query("select squish_admin_suspend($1,'בדיקה','tester')", [dorId]);
check("אחרי השהיה הפריט נעלם מלגלות", !names(await discover(eli)).includes(OPEN));
await eli.goto(`${BASE}/squish/c/${dorProf.collection_code}`, { waitUntil: "networkidle" });
await eli.waitForTimeout(900);
const suspBody = await eli.textContent("body");
check("ובאותו רגע גם הגלריה נסגרת", !suspBody.includes(OPEN));
await pool.query("select squish_admin_restore($1,'tester')", [dorId]);
check("ואחרי שחזור הכל חוזר", names(await discover(eli)).includes(OPEN));

/* ── 10. חסימה מפילה את שני המסכים יחד ── */
await asUser(pool, eliId, "select squish_block_user($1)", [dorId]);
check("אחרי חסימה אין כרטיסים", !names(await discover(eli)).includes(OPEN));
await eli.goto(`${BASE}/squish/c/${dorProf.collection_code}`, { waitUntil: "networkidle" });
await eli.waitForTimeout(900);
const blockBody = await eli.textContent("body");
check("והגלריה מציגה שער ולא פריטים",
  !blockBody.includes(OPEN) && blockBody.includes("הזמינה אותך"));
const blockedOffer = await offerable(eli, openItem.id);
check("וגם הצעת טרייד נחסמת", blockedOffer.s === 403, `${blockedOffer.s}`);
await asUser(pool, eliId, "select squish_unblock_user($1)", [dorId]);

/* ── 11. מי שלא מחוברת בכלל ── */
const anon = await stranger(b);
await anon.goto(`${BASE}/squish/discover`, { waitUntil: "networkidle" });
await anon.waitForTimeout(900);
const anonApi = await anon.evaluate(() =>
  fetch("/api/squish/discover").then(async (r) => ({ s: r.status, t: await r.text() })));
check("לא מחוברת מקבלת 401 מהשרת", anonApi.s === 401, `${anonApi.s}`);
check("ובגוף התשובה אין שמות פריטים", !anonApi.t.includes(OPEN), anonApi.t.slice(0, 60));

const anonRes = await fetch(`${BASE}/squish/discover`, { redirect: "manual" });
check("לא מחוברת מוסטת מהמסך לכניסה",
  anonRes.status === 307 && (anonRes.headers.get("location") ?? "").includes("/login"),
  `${anonRes.status} ${anonRes.headers.get("location")}`);
const anonHtml = await anonRes.text();
check("שמות פריטים לא יושבים בתשובה", !anonHtml.includes(OPEN));
check("וגם לא מפתחות המדיה", !anonHtml.includes(openItem.image_key ?? "@@none@@"));
check("ואין בה מספרי טלפון",
  !anonHtml.includes(U.dor.e164) && !anonHtml.includes(U.eli.e164));

const anonItemHtml = await (await fetch(`${BASE}/squish/item/${openItem.id}`)).text();
check("וגם עמוד הפריט לא מדליף שם למי שלא מחוברת", !anonItemHtml.includes(OPEN));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
