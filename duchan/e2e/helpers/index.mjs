/**
 * עזרים משותפים לכל חבילות סקוויש.
 *
 * שלושה כללים שהעזרים האלה אוכפים, ולא רק מקלים:
 *
 * 1. **כל חבילה מנקה אחרי עצמה ולפני עצמה.** `wipe()` נקרא בפתיחה, לא
 *    בסגירה, כי חבילה שנפלה באמצע לא הספיקה לנקות — והבאה אחריה תיפול
 *    בגללה ותסתיר את הכשל האמיתי.
 * 2. **אין תלות בסדר הרצה.** כל חבילה בונה את המשתמשות שלה עם מספרי
 *    טלפון ייחודיים משלה.
 * 3. **הבדיקה מוכיחה תנאי אמיתי.** `check()` דורש ערך בוליאני; בדיקה
 *    שתמיד עוברת היא לא בדיקה.
 */

import { chromium } from "playwright";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPhone, closeHelper } from "./sms.mjs";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const IMG = join(ROOT, "fixtures", "square.png");
export { verifyPhone, closeHelper };

export const db = () => new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

export const launch = () => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/** אוסף תוצאות. `done()` מדפיס סיכום ומחזיר קוד יציאה. */
export function checker(name) {
  const rows = [];
  const check = (label, ok, detail = "") => {
    if (typeof ok !== "boolean") {
      throw new Error(`check("${label}") קיבל ${typeof ok} ולא בוליאני — בדיקה חייבת להכריע`);
    }
    rows.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? " — " + detail : ""}`);
  };
  const done = () => {
    const bad = rows.filter((x) => !x).length;
    console.log(`\n${rows.length - bad}/${rows.length} ${name}`);
    return bad ? 1 : 0;
  };
  return { check, done, count: () => rows.length };
}

/** מנקה כל עקבה של המשתמשות האלה, כדי שהחבילה תתחיל ממצב ידוע. */
export async function wipe(pool, e164s) {
  const u = "(select a.user_id from phone_accounts a where a.phone = any($1))";
  await pool.query(`delete from squish_trade_reports where reported_by_user_id in ${u} or reported_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_item_reports  where reporter_user_id in ${u} or reported_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_trade_proposals where sender_user_id in ${u} or receiver_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_admin_actions where target_user in ${u}`, [e164s]);
  await pool.query(`delete from squish_parent_approvals where user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_feedback   where user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_blocks     where blocker_user_id in ${u} or blocked_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_wishlist   where owner_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_interests  where user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_items      where owner_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_profiles   where user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_connections where user_id in ${u} or connected_user_id in ${u}`, [e164s]);
  await pool.query(`delete from squish_invites    where inviter_user_id in ${u}`, [e164s]);
  await pool.query("delete from phone_otps where phone = any($1)", [e164s]);
}

/** מזהה המשתמשת לפי טלפון. */
export const uidOf = async (pool, e164) =>
  (await pool.query("select user_id from phone_accounts where phone=$1", [e164])).rows[0]?.user_id ?? null;

/**
 * מריץ שאילתה **בזהות של משתמשת מסוימת**, כמו שה-RLS רואה אותה.
 *
 * זה מה שמאפשר לבדוק הרשאה ולא רק ממשק: `select * from squish_items`
 * כאן מחזיר בדיוק את מה שהדפדפן שלה היה מקבל.
 */
export async function asUser(pool, userId, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [userId]);
    await c.query("set local role authenticated");
    const res = await c.query(sql, params);
    await c.query("commit");
    return res;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * מוסיף סקווישי אחד דרך העורך השיחתי — שאלה אחרי שאלה, כמו שילדה עוברת.
 *
 * הסדר כאן הוא הסדר של המסך: תמונה ← שם ← סוג ← גודל ← מצב ← טרייד ←
 * תוספות. בחירה בסוג/גודל/מצב מקדמת לבד; שם וטרייד דורשים לחיצה.
 * `it.keep` עונה "לא" בשאלת הטרייד — בעורך אין יותר מדבקת טרייד.
 */
export async function addSquishy(page, item, isFirst = false) {
  const it = typeof item === "string" ? { name: item } : item;
  await page.click(isFirst ? "button:has-text('להוסיף את הראשון')" : "button:has-text('להוסיף סקווישי')");
  await page.setInputFiles("[data-testid=squish-media]", IMG);
  await page.waitForSelector("input[aria-label='שם הסקווישי']");
  await page.fill("input[aria-label='שם הסקווישי']", it.name);
  await page.click("button:has-text('הלאה')");
  await page.click(`button[aria-label='${it.type ?? "נידו"}']`);
  await page.click(`button:has-text('${it.size ?? "בינוני"}')`);
  await page.click(`button:has-text('${it.condition ?? "מצב טוב"}')`);
  await page.click(it.keep
    ? "button:has-text('לא, הוא נשאר רק אצלי')"
    : "button:has-text('כן, פתוח לטרייד')");
  if (it.sticker) await page.click(`button[aria-label='${it.sticker}']`);
  await page.click("button:has-text('להוסיף לאוסף')");
  await page.waitForTimeout(400);
}

/** נוחת, בונה אוסף עם הפריטים שניתנו, ונרשם. מחזיר את הדף. */
export async function newCollector(browser, user, names, errs = []) {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" })
  ).newPage();
  page.on("pageerror", (e) => errs.push(`${user.nick}: ${e.message}`));

  await page.goto(`${BASE}/squish`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.click("a[href='/squish/new']");
  await page.waitForURL("**/squish/new");

  for (const [i, item] of names.entries()) {
    await addSquishy(page, item, i === 0);
  }

  /* שם לאוסף לא נשאל יותר באונבורדינג — נותנים שם מתוך מסך האוסף */
  await page.click("button:has-text('לשמור את האוסף')");
  await page.fill("input[aria-label='כינוי']", user.nick);
  await page.check("input[aria-label='ההורים שלי יודעים']");
  await page.waitForTimeout(300);
  await verifyPhone(page, user.num);
  await page.waitForURL("**/squish/collection", { timeout: 40000 });
  await page.waitForTimeout(900);
  return page;
}

/** יוצרת קישור הזמנה ומחזירה את הקוד. */
export async function makeInvite(page, pool, inviterId, label = null) {
  await page.goto(`${BASE}/squish/me`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  if (label) await page.fill("input[aria-label='שם לקישור']", label);
  await page.click("button:has-text('ליצור קישור הזמנה')");
  await page.waitForTimeout(1500);
  const { rows } = await pool.query(
    "select code from squish_invites where inviter_user_id=$1 and revoked_at is null order by created_at desc limit 1",
    [inviterId]
  );
  return rows[0]?.code ?? null;
}

/** מצטרפת דרך קישור. */
export async function joinCircle(page, code) {
  await page.goto(`${BASE}/squish/join/${code}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.click("button:has-text('להצטרף למעגל')");
  await page.waitForTimeout(1800);
}

/**
 * לוחצת עד שהמסך באמת התקדם.
 *
 * **למה זה נחוץ:** דפי סקוויש מוגשים מהשרת ורק אז מתעוררים בדפדפן.
 * בין הרגע שהכפתור קיים ב-HTML לרגע ש-React חיבר אליו מאזין יש חלון
 * שבו לחיצה נופלת על סימון מת — Playwright רואה אלמנט "גלוי, פעיל
 * ויציב" ולוחץ בהצלחה, ושום דבר לא קורה. סטנדאלון החלון הזה קצר
 * ולא מורגש; בריצה רצופה, כשהשרת מקמפל מסלולים ברקע, הוא נפתח.
 *
 * הפתרון הוא לא המתנה ארוכה יותר — היא רק מסתירה את המרוץ. לוחצים,
 * בודקים אם המצב הבא הגיע, ואם לא — לוחצים שוב. מחזירה כמה ניסיונות
 * נדרשו, כדי שבדיקה תוכל להצהיר על זה במקום לבלוע.
 */
export async function clickUntil(page, selector, nextSelector, tries = 6) {
  for (let i = 1; i <= tries; i++) {
    await page.click(selector);
    try {
      await page.waitForSelector(nextSelector, { timeout: 2500 });
      return i;
    } catch {
      if (i === tries) {
        throw new Error(`אחרי ${tries} לחיצות על ${selector} לא הופיע ${nextSelector}`);
      }
    }
  }
}

/** דפדפן של מי שלא מחוברת בכלל — לבדיקות פרטיות. */
export const stranger = async (browser) =>
  (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
