// E2E: התראות פוש למנהלת (0055).
//
// הבקשה: "אני צריכה אצלי פוש מי שיצר חנות, או מחכה למשהו, או לא עובד."
//
// שרת פוש אמיתי (גוגל/אפל) לא זמין מהסביבה הזו, אז הבדיקה מרימה שרת
// דמה מקומי ורושמת אותו כ"מכשיר". web-push מצפין ושולח אליו בדיוק כמו
// לשרת אמיתי — כך נבדק כל המסלול בצד שלנו.
//
// החוזים:
//   1. הכרטיס בחמ"ל, עם מה שמגיע.
//   2. מפתח VAPID נוצר פעם אחת ונשמר, לא מתחלף בין קריאות.
//   3. התראת בדיקה מגיעה למכשיר.
//   4. דוכן חדש → פוש. מישהי שמבקשת קוד פעמיים בלי להיכנס → פוש, פעם אחת בלבד.
//   5. מכשיר שהדפדפן ביטל (410) מסומן כבוי ולא מקבל יותר.
//   6. "מה קרה לאחרונה" מראה את האירועים.
//   7. רק מנהלת.
import { chromium } from "playwright";
import pg from "pg";
import http from "http";
import crypto from "crypto";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

/* ── שרת פוש דמה: /ok מקבל, /gone עונה 410 כמו מנוי שבוטל ── */
const got = [];
const server = http.createServer((req, res) => {
  let size = 0;
  req.on("data", (c) => (size += c.length));
  req.on("end", () => {
    got.push({ path: req.url, size, ttl: req.headers.ttl, urgency: req.headers.urgency, enc: req.headers["content-encoding"], auth: !!req.headers.authorization });
    res.statusCode = req.url.startsWith("/gone") ? 410 : 201;
    res.end();
  });
});
await new Promise((r) => server.listen(9201, r));
const waitFor = async (pred, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
};
/** מפתחות של "דפדפן" — זוג ECDH אמיתי, כדי ש-web-push יוכל להצפין אליו */
const fakeKeys = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
};

const STUCK = "972521110009";
await db.query("delete from admin_push_subscriptions");
await db.query("delete from admin_alerts");
await db.query("delete from phone_otps where phone=$1", [STUCK]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const admin = await ctx.newPage();
const jsErrors = [];
admin.on("pageerror", (e) => jsErrors.push(e.message));
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("[data-testid=admin-push]", { timeout: 20000 });
const card = (await admin.textContent("[data-testid=admin-push]")) ?? "";
check("כרטיס ההתראות בחמ\"ל", card.includes("התראות לטלפון"));
check("ואומר מה מגיע", ["דוכן חדש", "מחכה לאישור", "לא מצליחה להיכנס", "סמס לא נשלח"].every((w) => card.includes(w)));
check("עם כפתור הפעלה", (await admin.locator("[data-testid=push-enable]").count()) === 1);

/* ── מפתח VAPID ── */
const g1 = await (await admin.request.get(`${BASE}/api/admin/push`)).json();
const g2 = await (await admin.request.get(`${BASE}/api/admin/push`)).json();
check("יש מפתח ציבורי", typeof g1.publicKey === "string" && g1.publicKey.length > 80, String(g1.publicKey).slice(0, 12));
check("והוא לא מתחלף בין קריאות", g1.publicKey === g2.publicKey);
const { rows: secrets } = await db.query("select key from app_secrets where key like 'vapid_%' order by key");
check("נשמר בשרת (app_secrets)", secrets.length === 2);

/* ── הרשמה + התראת בדיקה ── */
const sub = (path) => ({ endpoint: `http://localhost:9201/${path}`, keys: fakeKeys() });
const r1 = await admin.request.post(`${BASE}/api/admin/push`, { data: { subscription: sub("ok"), device: "אייפון" } });
check("הרשמת מכשיר", r1.ok(), String(r1.status()));
const bad = await admin.request.post(`${BASE}/api/admin/push`, { data: { subscription: { endpoint: "http://evil.example/x", keys: fakeKeys() } } });
check("כתובת שאינה https נדחית", bad.status() === 400, String(bad.status()));
const t = await (await admin.request.post(`${BASE}/api/admin/push`, { data: { test: true } })).json();
await waitFor(() => got.length >= 1);
check("התראת בדיקה יצאה למכשיר אחד", t.sent === 1, JSON.stringify(t));
check("והגיעה מוצפנת וחתומה", got[0]?.enc === "aes128gcm" && got[0]?.auth && got[0]?.size > 50, JSON.stringify(got[0]));
check("עם דחיפות גבוהה ותוקף", got[0]?.urgency === "high" && Number(got[0]?.ttl) > 0);

/* ── דוכן חדש → פוש ── */
await db.query("delete from stores where contact_phone='972521110008'");
await db.query("delete from phone_accounts where phone='972521110008'");
await db.query("delete from auth.users where email like '972521110008@%'");
const girlCtx = await browser.newContext();
const girl = await girlCtx.newPage();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0521110008");
await girl.waitForTimeout(1500);
const before = got.length;
const created = await girl.request.post(`${BASE}/api/stores`, { data: { displayName: "הדוכן של פוש", parentAware: true } });
const createdBody = await created.json().catch(() => ({}));
check("נפתח דוכן", created.ok() && !!createdBody.slug, `${created.status()} ${JSON.stringify(createdBody).slice(0, 60)}`);
await waitFor(() => got.length > before);
const { rows: storeAlert } = await db.query("select title, body, sent_to from admin_alerts where kind='store_created'");
check("ונשלח פוש 'נפתח דוכן חדש'", storeAlert.length === 1 && storeAlert[0].body.includes("הדוכן של פוש") && got.length > before,
  JSON.stringify(storeAlert[0] ?? {}));

/* ── לא מצליחה להיכנס → פוש פעם אחת ── */
const startSms = () => fetch(`${BASE}/api/auth/sms/start`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "0521110009" }) });
await startSms();
await new Promise((r) => setTimeout(r, 1200));
let { rows: stuck } = await db.query("select * from admin_alerts where kind='login_stuck'");
check("בקשה ראשונה — עוד בלי התראה", stuck.length === 0);
await db.query("update phone_otps set created_at = created_at - interval '2 minutes' where phone=$1", [STUCK]);
const b2 = got.length;
await startSms();
await waitFor(() => got.length > b2);
({ rows: stuck } = await db.query("select title, body from admin_alerts where kind='login_stuck'"));
check("בקשה שנייה בלי כניסה — פוש", stuck.length === 1 && stuck[0].body.includes("052-111-0009"), JSON.stringify(stuck[0] ?? {}));
await db.query("update phone_otps set created_at = created_at - interval '2 minutes' where phone=$1", [STUCK]);
await startSms();
await new Promise((r) => setTimeout(r, 1500));
({ rows: stuck } = await db.query("select * from admin_alerts where kind='login_stuck'"));
check("בקשה שלישית — לא עוד התראה (בלי הצפה)", stuck.length === 1);

/* ── מכשיר שבוטל (410) ── */
await admin.request.post(`${BASE}/api/admin/push`, { data: { subscription: sub("gone"), device: "מחשב" } });
await admin.request.post(`${BASE}/api/admin/push`, { data: { test: true } });
await waitFor(() => got.some((g) => g.path === "/gone"));
await new Promise((r) => setTimeout(r, 500));
const { rows: subs } = await db.query("select endpoint, disabled_at from admin_push_subscriptions order by created_at");
check("מכשיר שהדפדפן ביטל מסומן כבוי", subs.find((s) => s.endpoint.endsWith("/gone"))?.disabled_at != null);
check("והמכשיר הפעיל נשאר פעיל", subs.find((s) => s.endpoint.endsWith("/ok"))?.disabled_at === null);

/* ── מה קרה לאחרונה ── */
await admin.reload();
await admin.waitForSelector("[data-testid=push-recent]", { timeout: 15000 });
const recent = (await admin.textContent("[data-testid=push-recent]")) ?? "";
check("'מה קרה לאחרונה' מראה דוכן חדש ומי שתקועה", recent.includes("נפתח דוכן חדש") && recent.includes("לא מצליחה להיכנס"));
check("בלי התראות הבדיקה", !recent.includes("ההתראות עובדות"));
await admin.locator("[data-testid=admin-push]").screenshot({ path: "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/admin-push.png" });

/* ── רק מנהלת ── */
const stranger = await girl.request.get(`${BASE}/api/admin/push`);
check("ילדה מחוברת — 403", stranger.status() === 403, String(stranger.status()));
const strangerSub = await girl.request.post(`${BASE}/api/admin/push`, { data: { subscription: sub("ok2") } });
check("ולא יכולה לרשום מכשיר", strangerSub.status() === 403);
const anon = await db.query("select has_table_privilege('anon','admin_push_subscriptions','select') a, has_table_privilege('authenticated','admin_alerts','select') b, has_table_privilege('authenticated','app_secrets','select') c");
check("הטבלאות סגורות לדפדפן", !anon.rows[0].a && !anon.rows[0].b && !anon.rows[0].c);
check("אין שגיאות ג׳אווהסקריפט", jsErrors.length === 0, jsErrors.join(" | "));

/* ── ניקוי ── */
await db.query("delete from admin_push_subscriptions");
await db.query("delete from stores where contact_phone='972521110008'");
await db.query("delete from phone_otps where phone=$1", [STUCK]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} admin push checks passed`);
await browser.close();
server.close();
await db.end();
process.exit(failed.length ? 1 : 0);
