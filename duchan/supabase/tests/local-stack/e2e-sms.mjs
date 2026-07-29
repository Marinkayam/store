// E2E לכניסה בסמס. ההודעות לא נשלחות באמת — הקוד נקרא מה-DB, כמו שהילדה
// קוראת אותו מהמסך של הטלפון.
//
// דורש שהאפליקציה תרוץ עם SMS4FREE_* מוגדרים אל שרת דמה מקומי.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/sms-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

/** הקוד שנשלח בפועל — השרת הדמה רושם אותו לטבלה */
async function lastCode(phone) {
  const { rows } = await db.query(
    "select msg from sms_outbox where recipient like $1 order by created_at desc limit 1",
    [`%${phone.slice(-9)}%`]
  );
  return rows[0]?.msg?.match(/\d{6}/)?.[0] ?? null;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();

const NUM = "0521110001";
const E164 = "972521110001";
await db.query("delete from sms_outbox");
await db.query("delete from phone_otps");

/* ── 1. הרשמה מלאה בלי מייל ובלי סיסמה ── */
const p = await phone();
await p.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
await p.waitForSelector("input[aria-label='שם הדוכן']", { timeout: 15000 });
await p.fill("input[aria-label='שם הדוכן']", "החנות של אורי");
await p.click("button:has-text('הלאה, לעיצוב הדוכן')");
await p.waitForTimeout(900);
await p.click("button:has-text('הלאה ←')");
await p.waitForTimeout(1000);
await p.check("input[aria-label='ההורים שלי יודעים']");
await p.click("button:has-text('הלאה, למספר הטלפון')");
await p.waitForSelector("input[aria-label='מספר טלפון']", { timeout: 15000 });
const body = await p.textContent("body");
check("the save screen asks for nothing but a phone",
  !body.includes("סיסמה") && !body.includes("אימייל"), "");
await p.screenshot({ path: `${shots}/80-phone-step.png` });

await p.fill("input[aria-label='מספר טלפון']", NUM);
await p.click("button:has-text('שלחו לי קוד')");
await p.waitForSelector("input[aria-label='קוד אימות']", { timeout: 15000 });
check("a code is requested and the code screen opens",
  (await p.locator("input[aria-label='קוד אימות']").count()) === 1);
await p.screenshot({ path: `${shots}/81-code-step.png` });

const { rows: otpRows } = await db.query("select code_hash, phone from phone_otps where phone=$1", [E164]);
check("the phone is stored normalised, not as typed", otpRows[0]?.phone === E164, otpRows[0]?.phone);
check("the code itself is never stored", !/^\d{6}$/.test(otpRows[0]?.code_hash ?? ""), "hash only");

/* ── 2. קוד שגוי נחסם ומודיע כמה נשאר ── */
await p.fill("input[aria-label='קוד אימות']", "000000");
await p.waitForSelector("text=/הקוד לא נכון|יותר מדי/", { timeout: 10000 });
check("a wrong code is rejected, and the code screen stays open",
  (await p.locator("input[aria-label='קוד אימות']").count()) === 1);
const { rows: att } = await db.query("select attempts from phone_otps where phone=$1", [E164]);
check("the failed attempt is counted server-side", att[0].attempts >= 1, `attempts=${att[0].attempts}`);

/* ── 3. הקוד הנכון פותח חנות ── */
const code = await lastCode(E164);
check("an sms actually went out with a 6-digit code", !!code, code ? "נשלח" : "לא נשלח");
await p.fill("input[aria-label='קוד אימות']", code);
await p.waitForSelector("text=נפתח דוכן", { timeout: 40000 });
check("the store is created straight after verification",
  (await db.query("select 1 from stores where display_name='החנות של אורי'")).rowCount === 1);
await p.screenshot({ path: `${shots}/82-saved.png` });

const { rows: [store] } = await db.query("select * from stores where display_name='החנות של אורי'");
check("the store's whatsapp number is the verified one", store?.contact_phone === E164, store?.contact_phone);
check("no parent email is invented for a phone signup", store?.parent_email === null, String(store?.parent_email));

const { rows: [acct] } = await db.query("select * from phone_accounts where phone=$1", [E164]);
check("the phone is linked to the account", acct?.user_id === store.owner_id);
const { rows: [used] } = await db.query("select consumed_at from phone_otps where phone=$1", [E164]);
check("the code is burned after use", used.consumed_at !== null);

/* ── 4. אותו קוד לא עובד פעמיים ── */
const replay = await fetch(`${BASE}/api/auth/sms/verify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: NUM, code }),
});
check("a used code cannot be replayed", replay.status === 400, `status=${replay.status}`);

/* ── 5. כניסה חוזרת מגיעה לחנות הקיימת ── */
await db.query("update phone_otps set created_at = created_at - interval '2 minutes' where phone=$1", [E164]);
const back = await phone();
await back.goto(`${BASE}/login`);
const loginBody = await back.textContent("body");
check("login asks for a phone, not a password", !loginBody.includes("סיסמה"));
await back.fill("input[aria-label='מספר טלפון']", NUM);
await back.click("button:has-text('שלחו לי קוד')");
await back.waitForSelector("input[aria-label='קוד אימות']", { timeout: 15000 });
await back.fill("input[aria-label='קוד אימות']", await lastCode(E164));
await back.waitForURL("**/dashboard", { timeout: 25000 });
// הדשבורד מקבל בברכה בשם הפרטי שנגזר משם החנות, לא בשם החנות המלא
let backOk = true;
try { await back.waitForSelector("text=היי אורי", { timeout: 15000 }); } catch { backOk = false; }
check("logging in again lands in the existing store", backOk);
await back.screenshot({ path: `${shots}/83-returning.png` });

/* ── 6. חנות ותיקה שנרשמה במייל — אותו מספר מחבר אותה ── */
const { rows: [tamar] } = await db.query("select * from stores where contact_phone='972501234567' limit 1");
if (tamar) {
  await db.query("delete from phone_otps where phone='972501234567'");
  const old = await phone();
  await old.goto(`${BASE}/login`);
  await old.fill("input[aria-label='מספר טלפון']", "0501234567");
  await old.click("button:has-text('שלחו לי קוד')");
  await old.waitForSelector("input[aria-label='קוד אימות']", { timeout: 15000 });
  await old.fill("input[aria-label='קוד אימות']", await lastCode("972501234567"));
  await old.waitForURL("**/dashboard", { timeout: 25000 });
  const firstName = tamar.display_name.split(" ").pop();
  let oldOk = true;
  try { await old.waitForSelector(`text=היי ${firstName}`, { timeout: 15000 }); } catch { oldOk = false; }
  check("a store that signed up by email opens with its phone", oldOk, tamar.display_name);
  const { rows: [linked] } = await db.query("select user_id from phone_accounts where phone='972501234567'");
  check("the old account is linked, not duplicated", linked?.user_id === tamar.owner_id);
} else {
  check("a store that signed up by email opens with its phone", false, "לא נמצאה חנות ותיקה לבדיקה");
}

/* ── 7. הגבלת קצב — כל הודעה עולה כסף ── */
await db.query("delete from phone_otps where phone='972521110002'");
const first = await fetch(`${BASE}/api/auth/sms/start`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "0521110002" }),
});
const immediate = await fetch(`${BASE}/api/auth/sms/start`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "0521110002" }),
});
check("a second code for the same number is refused right away",
  first.status === 200 && immediate.status === 429, `${first.status} → ${immediate.status}`);

const bad = await fetch(`${BASE}/api/auth/sms/start`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "123" }),
});
check("a malformed number never reaches the provider", bad.status === 400, `status=${bad.status}`);
const { rows: [{ count: sent }] } = await db.query("select count(*)::int from sms_outbox where recipient = '123'");
check("nothing was sent for it", sent === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} sms auth checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
