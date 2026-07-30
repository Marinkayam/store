// מדבקות: הבחירה, השמירה, והתצוגה בפינה.
//
// מה שנשמר כאן: "נדיר בעיניי" ו"חדש באוסף" הן דעה של הילדה ונשמרות
// בעמודה; "פתוח לטרייד" ו"אהוב עליי" נגזרים ממצב ולא נשמרות כתווית —
// אחרת אפשר היה לסמן "פתוח לטרייד" על פריט שנעול בטרייד.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, writeFileSync } from "fs";
import { verifyPhone, closeHelper } from "./helpers/index.mjs";

const BASE = "http://localhost:3777";
const OUT = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/stickers";
mkdirSync(OUT, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const U = { num: "0521118801", e164: "972521118801", nick: "StickR", title: "מדף המדבקות" };
const uidSql = "(select a.user_id from phone_accounts a where a.phone=$1)";
await db.query(`delete from squish_items where owner_user_id in ${uidSql}`, [U.e164]);
await db.query(`delete from squish_profiles where user_id in ${uidSql}`, [U.e164]);
await db.query("delete from phone_otps where phone=$1", [U.e164]);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAMklEQVR42u3OMQEAAAgDoC251a3g" +
  "LwrQk525VwEBAQEBAQEBAQEBAQEBAQEBAQEBAY8FDlUAAV6vE0IAAAAASUVORK5CYII=", "base64");
const IMG = `${OUT}/sq.png`;
writeFileSync(IMG, PNG);

const r = []; const check = (n, ok, d = "") => { r.push(ok); console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
const p = await (await b.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" })).newPage();
p.on("pageerror", (e) => errs.push(e.message));

/* ── בונים אוסף, ומסמנים מדבקות תוך כדי ── */
await p.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
await p.click("a[href='/squish/new']");
await p.waitForURL("**/squish/new");

const NAMES = ["ענן נדיר", "לב אהוב", "כוכב חדש"];
for (const [i, nm] of NAMES.entries()) {
  await p.click(i === 0 ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
  await p.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
  await p.waitForSelector("input[aria-label='שם הסקווישי']");
  await p.fill("input[aria-label='שם הסקווישי']", nm);
  await p.click("button:has-text('הלאה')");
  await p.click("button[aria-label='נידו']");
  await p.click("button:has-text('בינוני')");
  await p.click("button:has-text('מצב טוב')");
  await p.waitForTimeout(300);

  if (i === 0) {
    /* הטרייד הוא שאלה בשיחה, לא מדבקה בבחירה */
    const atTrade = await p.textContent("body");
    check("שאלת הטרייד מופיעה עם הסבר", atTrade.includes("לפתוח אותו לטרייד?"));
    check("וההסבר אומר מה יקרה", atTrade.includes("חברות מהמעגל שלך יוכלו להציע עליו החלפה"));
  }
  await p.click(nm === "כוכב חדש"
    ? "button:has-text('לא, הוא נשאר רק אצלי')"
    : "button:has-text('כן, פתוח לטרייד')");
  await p.waitForTimeout(300);

  if (i === 0) {
    // המדבקות מוצגות כבר בהוספה הראשונה, עם הסמלים
    const body = await p.textContent("body");
    check("שורת המדבקות מופיעה בהוספה", body.includes("תוסיפי לו מדבקה"));
    check("וההסבר הקצר לצידה", body.includes("מדבקות עוזרות לספר מה מיוחד"));
    for (const label of ["נדיר בעיניי", "אהוב עליי", "חדש באוסף"]) {
      check(`יש כרטיסיה "${label}"`, (await p.locator(`button[aria-label='${label}']`).count()) === 1);
    }
    check('"פתוח לטרייד" אינו מדבקה בעורך — הוא נשאל כשאלה',
      (await p.locator("button[aria-label='פתוח לטרייד']").count()) === 0);
    check("מדבקת הטרייד מופיעה מיד על התמונה אחרי התשובה",
      (await p.locator("[data-overlay=trade]").count()) === 1);
    await p.screenshot({ path: `${OUT}/01-picker.png`, fullPage: true });
    await p.click("button[aria-label='נדיר בעיניי']");
  }
  if (i === 1) await p.click("button[aria-label='אהוב עליי']");
  if (i === 2) await p.click("button[aria-label='חדש באוסף']");
  await p.waitForTimeout(200);
  await p.click("button:has-text('להוסיף לאוסף')");
  await p.waitForTimeout(400);
}

await p.click("button:has-text('לשמור את האוסף')");
await p.fill("input[aria-label='כינוי']", U.nick);
await p.check("input[aria-label='ההורים שלי יודעים']");
await p.waitForTimeout(300);
await verifyPhone(p, U.num);
await p.waitForURL("**/squish/collection", { timeout: 40000 });
await p.waitForTimeout(1500);

/* ── מה נשמר בדאטהבייס ── */
const { rows: items } = await db.query(
  `select name, stickers, trade_status from squish_items
    where owner_user_id in ${uidSql} order by sort_order`, [U.e164]);
const by = (n) => items.find((i) => i.name === n);
check("שלושת הפריטים נשמרו", items.length === 3, items.map((i) => i.name).join(", "));
check('"נדיר בעיניי" נשמר בעמודה', by("ענן נדיר")?.stickers?.includes("rare") === true,
  JSON.stringify(by("ענן נדיר")?.stickers));
check('"חדש באוסף" נשמר בעמודה', by("כוכב חדש")?.stickers?.includes("new") === true,
  JSON.stringify(by("כוכב חדש")?.stickers));
check('"פתוח לטרייד" נשמר כמצב ולא כתווית',
  by("ענן נדיר")?.trade_status === "open_for_trade"
  && by("כוכב חדש")?.trade_status === "keep"
  && !(by("ענן נדיר")?.stickers ?? []).includes("trade"),
  `${by("כוכב חדש")?.trade_status}`);

const { rows: [prof] } = await db.query(
  `select p.favorite_item_id, i.name from squish_profiles p
     left join squish_items i on i.id = p.favorite_item_id
    where p.user_id in ${uidSql}`, [U.e164]);
check('"אהוב עליי" נשמר כ-favorite_item_id ולא כתווית', prof?.name === "לב אהוב", String(prof?.name));
check("ולא נשמר גם בעמודת המדבקות",
  !(by("לב אהוב")?.stickers ?? []).includes("loved"), JSON.stringify(by("לב אהוב")?.stickers));

/* ── הרשימה הסגורה נאכפת בדאטהבייס ── */
let badSticker = "";
try {
  await db.query(
    `update squish_items set stickers = array['legendary'] where name='ענן נדיר' and owner_user_id in ${uidSql}`,
    [U.e164]);
} catch (e) { badSticker = e.message; }
check("מדבקה שלא ברשימה נדחית בדאטהבייס", /stickers_known|check constraint/.test(badSticker),
  badSticker.slice(0, 60));

/* ── בגלריה ── */
const gallery = await p.textContent("body");
check("הרגע החד-פעמי מופיע אחרי הסקווישי הראשון", gallery.includes("תני לסקווישים שלך אופי"));
check("והוא מסביר בשורה אחת", gallery.includes("סמני מי אהוב עלייך, מי מיוחד ומי פתוח לטרייד"));
await p.screenshot({ path: `${OUT}/02-collection.png`, fullPage: true });

await p.click("button:has-text('הבנתי')");
await p.waitForTimeout(500);
check("ואחרי הבנתי הוא נעלם", !(await p.textContent("body")).includes("תני לסקווישים שלך אופי"));
await p.reload();
await p.waitForTimeout(1800);
check("ולא חוזר בטעינה הבאה", !(await p.textContent("body")).includes("תני לסקווישים שלך אופי"));

// המדבקות עצמן, כטקסט נגיש
const names = await p.locator(".sr-only").allTextContents();
const joined = names.join(" | ");
check("הגלריה מציגה מדבקות על הכרטיסים", /נדיר בעיניי/.test(joined), joined.slice(0, 120));
check("והאהוב מקבל לב", /אהוב עליי/.test(joined));
check("ומי שלא פתוח לטרייד לא מקבל את מדבקת הטרייד",
  (joined.match(/פתוח לטרייד/g) ?? []).length <= 2,
  `${(joined.match(/פתוח לטרייד/g) ?? []).length} פעמים`);

/* ── סדר התצוגה: טרייד ראשון ── */
const { rows: [ordered] } = await db.query(
  `select id from squish_items where name='ענן נדיר' and owner_user_id in ${uidSql}`, [U.e164]);
await p.goto(`${BASE}/squish/item/${ordered.id}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
check("גם בעריכת פריט קיים יש שורת מדבקות",
  (await p.locator("button[aria-label='נדיר בעיניי']").count()) === 1);
check('ו"נדיר בעיניי" מסומן כדלוק',
  (await p.getAttribute("button[aria-label='נדיר בעיניי']", "aria-pressed")) === "true");
await p.screenshot({ path: `${OUT}/03-item.png`, fullPage: true });

// כיבוי מדבקה נשמר
await p.click("button[aria-label='נדיר בעיניי']");
await p.waitForTimeout(400);
await p.click("button:has-text('שמירת שינויים')");
await p.waitForTimeout(2000);
const { rows: [off] } = await db.query("select stickers from squish_items where id=$1", [ordered.id]);
check("כיבוי מדבקה נשמר", !(off.stickers ?? []).includes("rare"), JSON.stringify(off.stickers));

/* ── פריט שנעול בטרייד לא מקבל "פתוח לטרייד" ── */
await db.query("update squish_items set trade_status='reserved' where id=$1", [ordered.id]);
await p.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const locked = (await p.locator(".sr-only").allTextContents()).join(" | ");
check("פריט שנעול בטרייד לא מוצג כפתוח לטרייד",
  !/ענן נדיר/.test(locked) || (locked.match(/פתוח לטרייד/g) ?? []).length <= 1,
  locked.slice(0, 120));

/* ── סוג הוא בחירה, לא ברירת מחדל ──
   "אחר" שסומן מראש השאיר אוספים שלמים אפורים. בשיחה זה מבני: שאלת
   הסוג היא תחנה שאי אפשר לעבור בלי ללחוץ על סוג — אין בה "הלאה". */
await p.goto(`${BASE}/squish/collection`, { waitUntil: "networkidle" });
await p.waitForTimeout(700);
await p.click("a:has-text('להוסיף סקווישי')");
await p.waitForURL("**/squish/new");
await p.waitForTimeout(600);
/* טיוטה חדשה נפתחת ריקה גם כשיש אוסף שמור — הכפתור תלוי בזה */
const firstBtn = await p.locator("button:has-text('להוסיף את הראשון')").count();
await p.click(firstBtn ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
await p.setInputFiles("input[type=file][accept='image/*'] >> nth=0", IMG);
await p.waitForSelector("input[aria-label='שם הסקווישי']");
await p.fill("input[aria-label='שם הסקווישי']", "בלי סוג");
await p.click("button:has-text('הלאה')");
await p.waitForTimeout(300);
check("שאלת הסוג נפתחת אחרי השם", (await p.textContent("body")).includes("איזה סוג הוא?"));
check("שום סוג לא מסומן מראש",
  (await p.locator("[role=radio][aria-checked=true]").count()) === 0);
check("ואין דרך לדלג — אין 'הלאה' בשאלת הסוג",
  (await p.locator("button:has-text('הלאה')").count()) === 0);
await p.click("button[aria-label='מים']");
await p.waitForTimeout(300);
check("אחרי בחירה — מתקדמים לגודל", (await p.textContent("body")).includes("באיזה גודל הוא?"));

check("אין שגיאות ג׳אווהסקריפט", errs.length === 0, errs.slice(0, 2).join(" | "));

const bad = r.filter((x) => !x).length;
console.log(`\n${r.length - bad}/${r.length} עברו`);
await b.close(); await closeHelper(); await db.end();
process.exit(bad ? 1 : 0);
