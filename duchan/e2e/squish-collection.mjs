/**
 * חבילה 1 — האוסף.
 *
 * החוזה שהיא שומרת: **מה שהילדה בנתה שייך לה, ולא דולף.** קוד הגלריה
 * לא ניתן לניחוש, מספר טלפון לא מופיע בשום מקום, ומי שאינה במעגל לא
 * מקבלת שמות פריטים — לא במסך ולא ב-HTML.
 */
import {
  BASE, IMG, asUser, checker, db, launch, makeInvite, newCollector, stranger, uidOf, wipe, closeHelper,
} from "./helpers/index.mjs";

const U = {
  ana:  { num: "0521130101", e164: "972521130101", nick: "AnaC",  title: "מדף האוסף" },
  bar:  { num: "0521130102", e164: "972521130102", nick: "BarC",  title: "מדף שני" },
};
const pool = db();
await wipe(pool, Object.values(U).map((u) => u.e164));

const { check, done } = checker("בדיקות אוסף");
const errs = [];
const b = await launch();

/* ── 1. בניית אוסף ── */
const ana = await newCollector(b, U.ana, [
  { name: "צפרדע ירוקה", sticker: "נדיר בעיניי" },
  { name: "ענן פסטל" },
  { name: "לימון פרטי", keep: true },
], errs);
const anaId = await uidOf(pool, U.ana.e164);
check("נוצר פרופיל אוסף", !!anaId);

const { rows: items } = await pool.query(
  "select * from squish_items where owner_user_id=$1 order by sort_order", [anaId]);
check("שלושה פריטים נשמרו", items.length === 3, `${items.length}`);
check("לכל פריט יש תמונה", items.every((i) => !!i.image_key));
check("מדבקה אישית נשמרה", (items[0].stickers ?? []).includes("rare"), JSON.stringify(items[0].stickers));
check("פריט שסומן כשלי אינו פתוח לטרייד",
  items.find((i) => i.name === "לימון פרטי")?.trade_status === "keep",
  items.find((i) => i.name === "לימון פרטי")?.trade_status);
check("ופריט רגיל כן פתוח",
  items.find((i) => i.name === "ענן פסטל")?.trade_status === "open_for_trade");

const { rows: [prof] } = await pool.query("select * from squish_profiles where user_id=$1", [anaId]);
/* שם לאוסף לא נשאל באונבורדינג יותר — נותנים אותו מתוך מסך האוסף */
check("האוסף נולד בלי שם", !prof.collection_title, String(prof.collection_title));
await ana.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await ana.waitForTimeout(1200);
check("ובלי שם מוצג 'האוסף של {כינוי}'",
  (await ana.textContent("body")).includes(`האוסף של ${U.ana.nick}`));
await ana.fill("input[aria-label='שם האוסף']", U.ana.title);
await ana.click("button:has-text('שמירת שינויים')");
await ana.waitForTimeout(1500);
const { rows: [named] } = await pool.query(
  "select collection_title from squish_profiles where user_id=$1", [anaId]);
check("שם שניתן ממסך האוסף נשמר", named.collection_title === U.ana.title, String(named.collection_title));
check("ברירת המחדל לצפייה היא חברות ישירות",
  prof.collection_visibility === "direct_friends", prof.collection_visibility);
check("קוד הגלריה אינו ניתן לניחוש",
  /^[a-z0-9]{6,}$/i.test(prof.collection_code) && !prof.collection_code.includes(U.ana.nick.toLowerCase()),
  prof.collection_code);

/* ── 2. סוג, מידה, מצב וסדרה ── */
await ana.goto(`${BASE}/squish/item/${items[0].id}`, { waitUntil: "networkidle" });
await ana.waitForTimeout(1200);
await ana.click("button[aria-label='גודל: גדול']");
await ana.click("button[aria-label='מצב: כמו חדש']");
await ana.fill("input[aria-label='סדרה']", "סדרת הממתקים");
await ana.click("button:has-text('שמירת שינויים')");
await ana.waitForTimeout(2000);
const { rows: [edited] } = await pool.query("select * from squish_items where id=$1", [items[0].id]);
check("מידה נשמרה", edited.size === "large", edited.size);
check("מצב נשמר", edited.condition === "like_new", edited.condition);
check("סדרה נשמרה", edited.series === "סדרת הממתקים", String(edited.series));

/* ── 3. אהוב ורשימת מבוקשים ── */
await ana.click("button:has-text('להגדיר כאהוב עליי')");
await ana.waitForTimeout(1800);
const { rows: [fav] } = await pool.query("select favorite_item_id from squish_profiles where user_id=$1", [anaId]);
check("האהוב נשמר על הפרופיל", fav.favorite_item_id === items[0].id);

await asUser(pool, anaId,
  "insert into squish_wishlist (profile_id, owner_user_id, description) values ($1,$2,'סקווישי ורוד')",
  [prof.id, anaId]);
const { rows: wish } = await asUser(pool, anaId, "select * from squish_wishlist where owner_user_id=$1", [anaId]);
check("רשימת מבוקשים נשמרת", wish.length === 1);

/* ── 4. האהוב מתנקה כשהפריט יוצא מהאוסף ── */
await pool.query("update squish_items set trade_status='traded' where id=$1", [items[0].id]);
const { rows: [cleared] } = await pool.query("select favorite_item_id from squish_profiles where user_id=$1", [anaId]);
check("פריט שהוחלף מתנקה מהאהוב אוטומטית", cleared.favorite_item_id === null,
  String(cleared.favorite_item_id));
await pool.query("update squish_items set trade_status='open_for_trade' where id=$1", [items[0].id]);

await pool.query("update squish_profiles set favorite_item_id=$1 where user_id=$2", [items[1].id, anaId]);
await pool.query("update squish_items set deleted_at=now() where id=$1", [items[1].id]);
const { rows: [cleared2] } = await pool.query("select favorite_item_id from squish_profiles where user_id=$1", [anaId]);
check("וגם פריט שנמחק רכות", cleared2.favorite_item_id === null, String(cleared2.favorite_item_id));
await pool.query("update squish_items set deleted_at=null where id=$1", [items[1].id]);

/* ── 5. הבעלים רואה הכל ── */
const { rows: mine } = await asUser(pool, anaId, "select id from squish_items where owner_user_id=$1", [anaId]);
check("הבעלים רואה את כל הפריטים שלה", mine.length === 3, `${mine.length}`);

/* ── 6. פרטיות — מי שאינה במעגל ── */
const bar = await newCollector(b, U.bar, ["פריט זר 1", "פריט זר 2", "פריט זר 3"], errs);
const barId = await uidOf(pool, U.bar.e164);

const { rows: hidden } = await asUser(pool, barId,
  "select id from squish_items where owner_user_id=$1", [anaId]);
check("זרה לא רואה אף פריט של אנה דרך RLS", hidden.length === 0, `${hidden.length}`);

const { rows: [canView] } = await pool.query("select squish_can_view($1,$2) v", [barId, anaId]);
check("ו-squish_can_view מחזיר false", canView.v === false);

await bar.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await bar.waitForTimeout(900);
const barSees = await bar.textContent("body");
check("המסך מציג שער הצטרפות ולא פריטים",
  !barSees.includes("צפרדע ירוקה") && barSees.includes("הזמינה אותך"));

/* ── 7. פרטיות — מי שלא מחוברת בכלל ── */
const out = await stranger(b);
await out.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await out.waitForTimeout(800);
const rawHtml = await (await fetch(`${BASE}/squish/c/${prof.collection_code}`)).text();
check("שמות פריטים לא יושבים ב-HTML לזרה", !rawHtml.includes("צפרדע ירוקה"));
check("וגם לא כתובות המדיה שלהם",
  !rawHtml.includes(items[0].image_key ?? "@@none@@"));
check("הדף חסום לאינדוקס", /noindex/i.test(rawHtml));
check("ומספר הטלפון לא מופיע בקוד המקור", !rawHtml.includes(U.ana.e164));

/* ── 8. חברה כן רואה ── */
const code = await makeInvite(ana, pool, anaId);
await bar.goto(`${BASE}/squish/join/${code}`, { waitUntil: "networkidle" });
await bar.waitForTimeout(700);
await bar.click("button:has-text('להצטרף למעגל')");
await bar.waitForTimeout(1800);
await bar.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await bar.waitForTimeout(900);
const asFriend = await bar.textContent("body");
check("חברה ישירה כן רואה את הפריטים", asFriend.includes("צפרדע ירוקה"));
check("וגם את הפריט הפרטי, כי היא חברה ישירה", asFriend.includes("לימון פרטי"));
check("ועדיין בלי מספר טלפון",
  !(await (await fetch(`${BASE}/squish/c/${prof.collection_code}`)).text()).includes(U.ana.e164));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

await b.close();
await closeHelper();
await pool.end();
process.exit(done());
