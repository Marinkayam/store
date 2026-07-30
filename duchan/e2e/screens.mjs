/**
 * מצלם את כל מסכי סקוויש קלאב, עם נתונים אמיתיים.
 *
 *   node e2e/screens.mjs        # אחרי npm run stack
 *
 * **לא צילומים של מצבים ריקים.** נבנות כאן שתי אספניות עם אוסף, מעגל
 * משותף, מבוקשים וטרייד פתוח — מסך ריק לא מלמד כלום על המוצר. אחרי
 * הבנייה התמונות מוחלפות לסקווישים שב-public/demo ישירות בדאטהבייס,
 * כי mediaUrl מזהה מפתח שמתחיל בלוכסן כנכס מקומי.
 *
 * הקובץ הזה בריפו ולא בתיקייה זמנית בכוונה: המכולה נמחקת מדי כמה
 * שעות, וצילום מסכים מחדש הוא משימה שחוזרת.
 */
import {
  BASE, db, launch, makeInvite, joinCircle, newCollector, uidOf, verifyPhone, wipe, closeHelper,
} from "./helpers/index.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const OUT = process.env.SHOTS_DIR ?? join(tmpdir(), "squish-screens");
mkdirSync(OUT, { recursive: true });

const NOA = { num: "0521140001", e164: "972521140001", nick: "נועה", title: "המדף הוורוד" };
const GIL = { num: "0521140002", e164: "972521140002", nick: "גילי", title: "האוסף של גילי" };
const ADMIN = "0509990000";

const pool = db();
await wipe(pool, [NOA.e164, GIL.e164]);

const b = await launch();
const phone = () => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
const shot = async (page, name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("✓", name);
};

/* ── לפני שיש חשבון ── */
const guest = await phone();
await guest.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
await shot(guest, "01-פתיחה-מסך-1");
await guest.click("[data-testid=to-preview]");
await guest.waitForSelector("[data-testid=squish-preview]");
await shot(guest, "02-פתיחה-מסך-2");

await guest.goto(`${BASE}/squish/new`, { waitUntil: "networkidle" });
await guest.click("button:has-text('להוסיף את הראשון')");
await guest.setInputFiles("input[type=file][accept='image/*'] >> nth=0", "e2e/fixtures/square.png");
await guest.waitForTimeout(600);
await guest.fill("input[aria-label='שם הסקווישי']", "באו גלקסי");
await shot(guest, "03-הוספה-שלב-1");
await guest.click("button:has-text('הלאה')");
await shot(guest, "04-הוספה-שלב-2");
await guest.context().close();

/* ── שתי אספניות אמיתיות ── */
const noa = await newCollector(b, NOA, [
  { name: "באו גלקסי", sticker: "נדיר בעיניי" },
  { name: "תות" },
  { name: "מדוזה", keep: true },
  { name: "גבינה" },
]);
const gil = await newCollector(b, GIL, [
  { name: "קוביית קרח" },
  { name: "חמאה" },
  { name: "דונאט", keep: true },
]);
const noaId = await uidOf(pool, NOA.e164);

/* תמונה + סוג לכל פריט הדגמה. הסוג חשוב לא פחות: שורת "כמה נידו,
   כמה מים, כמה קרח" בראש האוסף היא ההתלהבות של אספנית, וכשהכול
   "אחר" היא מציגה גלולה אחת עצובה. */
const PICS = {
  "באו גלקסי": ["/demo/bao.webp", "needoh"],
  "תות": ["/demo/strawberry.webp", "foam"],
  "מדוזה": ["/demo/jellyfish.webp", "water"],
  "גבינה": ["/demo/cheese.webp", "sand"],
  "קוביית קרח": ["/demo/icecube.webp", "ice"],
  "חמאה": ["/demo/butter.webp", "clay"],
  "דונאט": ["/demo/strawberry.webp", "foam"],
};
for (const [name, [key, type]] of Object.entries(PICS)) {
  await pool.query(
    "update squish_items set image_key=$1, squishy_type=$2, poster_key=null, video_key=null where name=$3",
    [key, type, name]);
}
await pool.query(
  "update squish_profiles set favorite_item_id=(select id from squish_items where owner_user_id=$1 and name='באו גלקסי') where user_id=$1",
  [noaId]);

/* ── מעגל ──
   קישור אחד בלבד פעיל בכל רגע, ולכן מסך ההצטרפות מצולם *לפני* שגילי
   מממשת אותו — צפייה אינה מממשת, לחיצה כן. */
const code = await makeInvite(noa, pool, noaId);
const out = await phone();
await out.goto(`${BASE}/squish/join/${code}`, { waitUntil: "networkidle" });
await shot(out, "13-הצטרפות");

await joinCircle(gil, code);
await gil.waitForTimeout(1200);

/* ── מבוקשים ── */
await noa.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await noa.waitForTimeout(900);
await noa.click("button:has-text('להוסיף למה שאני מחפשת')").catch(() => {});
await noa.waitForTimeout(500);
await noa.fill("input[aria-label='תיאור מבוקש']", "צפרדע גדולה").catch(() => {});
await noa.click("button:has-text('ורוד')").catch(() => {});
await noa.click("button:has-text('להוסיף')").catch(() => {});
await noa.waitForTimeout(1200);

/* ── ארבעת הטאבים ופריט ── */
await noa.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await shot(noa, "05-האוסף");
await noa.goto(`${BASE}/squish/discover`, { waitUntil: "networkidle" });
await shot(noa, "06-לגלות");
await noa.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
await shot(noa, "07-שלי");

const { rows: [item] } = await pool.query(
  "select id from squish_items where owner_user_id=$1 and name='תות'", [noaId]);
await noa.goto(`${BASE}/squish/item/${item.id}`, { waitUntil: "networkidle" });
await shot(noa, "08-פריט");

/* ── טרייד ── */
await gil.goto(`${BASE}/squish/discover`, { waitUntil: "networkidle" });
await gil.waitForTimeout(1200);
await gil.click("a:has-text('להציע טרייד')").catch(() => {});
await gil.waitForTimeout(1500);
await shot(gil, "09-הצעת-טרייד");
await gil.click("button:has-text('לשלוח')").catch(() => {});
await gil.waitForTimeout(1800);

await noa.goto(`${BASE}/squish/trades`, { waitUntil: "networkidle" });
await shot(noa, "10-טריידים");

/* ── אותה כתובת, שתי עיניים ── */
const { rows: [prof] } = await pool.query(
  "select collection_code from squish_profiles where user_id=$1", [noaId]);
await gil.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await shot(gil, "11-גלריה-בקישור-חברה");

const stranger = await phone();
await stranger.goto(`${BASE}/squish/c/${prof.collection_code}`, { waitUntil: "networkidle" });
await shot(stranger, "12-גלריה-בקישור-זרה");

/* ── חמ״ל ── */
const admin = await (await b.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })).newPage();
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, ADMIN);
await admin.waitForTimeout(2200);
await admin.goto(`${BASE}/admin/squish`, { waitUntil: "networkidle" });
await shot(admin, "14-חמל");

console.log("\nהצילומים ב-", OUT);
await b.close();
await closeHelper();
await pool.end();
