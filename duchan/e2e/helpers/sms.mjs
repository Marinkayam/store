// עוזר משותף לבדיקות: הרשמה וכניסה בסמס, קריאת הקוד מתיבת היוצא של השים.
import pg from "pg";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

export async function lastCode(local) {
  const { rows } = await db.query(
    "select msg from sms_outbox where recipient = $1 order by created_at desc limit 1",
    [local]
  );
  return rows[0]?.msg?.match(/\d{6}/)?.[0] ?? null;
}

/** ממלא מספר, מבקש קוד, קורא אותו מה-DB ומקליד. מחזיר כשהאימות הסתיים. */
export async function verifyPhone(page, local) {
  // הגבלת "קוד אחד לדקה" היא נכונה במוצר ומפריעה בבדיקות רצופות
  await db.query("delete from phone_otps where phone = $1", ["972" + local.replace(/^0/, "")]);
  // מילוי לפני ההידרציה של React נמחק כשהיא מסיימת, והכפתור נשאר מושבת.
  // ממלאים, מוודאים שהערך נשאר, ואם לא — ממלאים שוב.
  const field = page.locator("input[aria-label='מספר טלפון']");
  await field.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 5; i++) {
    await field.fill(local);
    await page.waitForTimeout(250);
    if ((await field.inputValue()) === local) break;
  }
  await page.click("button:has-text('שלחו לי קוד')");
  await page.waitForSelector("input[aria-label='קוד אימות']", { timeout: 20000 });
  const code = await lastCode(local);
  if (!code) throw new Error(`לא נשלח קוד ל-${local}`);
  await page.fill("input[aria-label='קוד אימות']", code);
}

export async function closeHelper() {
  await db.end();
}
