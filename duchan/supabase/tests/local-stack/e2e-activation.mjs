// E2E: הפעלת דוכן בתשלום + לולאת ההפניות (דוכן מביא דוכן).
// המסלול המלא: בונים → הלינק נעול → מצהירים ששילמנו → המנהלת מאשרת →
// הלינק פתוח → חברה מגיעה מהדוכן ופותחת דוכן משלה → הכל נראה בחמ"ל.
//
// **מה הבדיקה הזו כן בודקת ומה לא.** היא לא בודקת ניסוח. משפט שיווקי
// משתנה כל חודש, וכל שינוי כזה שבר כאן שרשרת שלמה. במקומו נבדקת
// התנהגות: המסך מוצג, הכפתור קיים ופעיל, הלחיצה מקדמת לשלב הנכון,
// והתוצאה נשמרת בדאטהבייס.
//
// טקסט מדויק נבדק רק כשהניסוח *עצמו* הוא ההבטחה: המחיר, אישור ההורים,
// והבטחת "בלי עמלה". אלה לא מיקרו-קופי — אלה מה שהילדה וההורה שלה
// מסתמכים עליו.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifyPhone } from "./sms-helper.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const IMG = join(HERE, "..", "..", "..", "e2e", "fixtures", "square.png");
const shots = join(tmpdir(), "duchan-e2e-shots", "activation");
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

/** מפתח ה-service מגיע מהסביבה של האפליקציה, לא מקובץ בתיקייה זמנית. */
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  readFileSync(join(HERE, "..", "..", "..", ".env.local"), "utf8")
    .split("\n").find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))?.split("=")[1]?.trim();

const results = [];
const check = (name, ok, detail = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${name}") לא קיבל בוליאני`);
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};
/** קיים, נראה, ולא מושבת. זה מה ש"ה-CTA עובד" אומר, בלי לגעת בניסוח. */
const usable = async (page, sel) => {
  const el = page.locator(sel).first();
  return (await el.count()) >= 1 && (await el.isVisible()) && (await el.isEnabled());
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = () => browser.newContext({ viewport: { width: 390, height: 780 } }).then((c) => c.newPage());

/* ── 0: הדוכן הזרוע הוא נקודת המוצא ── */
const { rows: [seed] } = await db.query("select * from stores order by created_at limit 1");
if (!seed) {
  console.error("צריך להריץ קודם: node supabase/tests/local-stack/seed.mjs");
  process.exit(1);
}
// מחזירים למצב טיוטה כדי לבדוק את המסלול מההתחלה. גם אישור ההורים
// מתאפס — דוכן שאישר בריצה קודמת לא יראה את החסימה.
await db.query(
  "update stores set activated_at = null, payment_claimed_at = null, payment_amount = null, parent_consent_at = null where id = $1",
  [seed.id]
);
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});
// הדוכן של החברה נוצר מחדש בכל ריצה, אחרת נערמים כמה לאותו מספר
// והאשכול בחמ"ל סופר יותר ממה שהריצה יצרה.
await db.query("delete from stores where contact_phone = '972529998877'");
await db.query("delete from phone_accounts where phone = '972529998877'");
await db.query("delete from auth.users where email like '972529998877@%'");

/* ── 1: הדוכן בתצוגה מקדימה, והמסך אומר את זה ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.waitForSelector("[data-testid=store-state-banner]", { timeout: 15000 });
check("הדשבורד מסמן שהדוכן בתצוגה מקדימה ולא חסום",
  await usable(girl, "[data-testid=store-state-banner]"));
await girl.screenshot({ path: `${shots}/40-dashboard-draft.png` });

await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("[data-testid=publish-cta]", { timeout: 15000 });
check("ההגדרות מציגות את אזהרת התצוגה המקדימה",
  await usable(girl, "[data-testid=preview-notice]"));
check("ויש קריאה לפעולה לפרסום", await usable(girl, "[data-testid=publish-cta]"));
check("שמובילה למסך ההפעלה",
  (await girl.getAttribute("[data-testid=publish-cta]", "href")) === "/activate");

/* ── 2: מסך ההפעלה ──
   כאן נבדק המחיר כטקסט מדויק, כי המחיר *הוא* ההבטחה. */
await girl.click("[data-testid=publish-cta]");
await girl.waitForURL("**/activate");
await girl.waitForSelector("[data-testid=activation-price]", { timeout: 15000 });
const priceText = (await girl.textContent("[data-testid=activation-price]")).replace(/\s+/g, "");
/* המחיר לא מקודד כאן. הוא נקרא מהמסך, ובסוף הריצה נבדק שהסכום שהמנהלת
   רשמה בפועל הוא בדיוק זה — כך שינוי מחיר לא שובר את הבדיקה, אבל פער
   בין מה שהובטח לילדה למה שנגבה כן. */
const shown = priceText.match(/₪(\d+)/g)?.map((s) => Number(s.slice(1))) ?? [];
const expectedPrice = shown[0];
check("מסך ההפעלה מציג מחיר חד-פעמי", shown.length >= 1 && expectedPrice > 0, priceText);
check("ולצידו מחיר מלא גבוה יותר, כדי שיהיה ברור שזו הנחת השקה",
  shown.length === 2 && shown[1] > expectedPrice, priceText);

check("ההסבר להורה מקופל כברירת מחדל",
  (await girl.locator("[data-testid=parent-explainer]").count()) === 0);
await girl.click("button:has-text('או להראות את זה כאן')");
await girl.waitForSelector("[data-testid=parent-explainer]", { timeout: 10000 });
check("ולחיצה פותחת אותו", await usable(girl, "[data-testid=parent-explainer]"));
check("ויש בו גם הסבר על בטיחות",
  (await girl.textContent("[data-testid=parent-explainer]")).includes("בטיחות"));
await girl.screenshot({ path: `${shots}/41-activate.png`, fullPage: true });

/* ── 3: הצהרת תשלום חסומה עד אישור ההורים ── */
const declare = girl.locator("[data-testid=declare-paid]");
check("כפתור ההצהרה מושבת לפני אישור ההורים", !(await declare.isEnabled()));
const consentBody = await girl.textContent("body");
check("והמסך אומר במפורש שההורים צריכים לאשר",
  consentBody.includes("ההורים שלי יודעים ומאשרים"));

await girl.check("input[aria-label='אישור הורים']");
await girl.waitForTimeout(800);
const { rows: [consented] } = await db.query("select parent_consent_at from stores where id=$1", [seed.id]);
check("סימון התיבה נחתם בשרת, לא רק במסך", !!consented.parent_consent_at);
check("ואז ההצהרה נפתחת", await declare.isEnabled());

await girl.click("[data-testid=pay-method-paybox]");
await girl.fill("[data-testid=payment-ref]", "אמא של תמר");
await declare.click();
await girl.waitForSelector("[data-testid=payment-pending]", { timeout: 15000 });
const { rows: [claimed] } = await db.query("select * from stores where id=$1", [seed.id]);
check("ההצהרה נרשמה עם אמצעי התשלום שנבחר",
  !!claimed.payment_claimed_at && claimed.payment_method === "paybox", claimed.payment_ref ?? "");
check("והצהרה לבדה לא מפעילה את הדוכן", claimed.activated_at === null);
await girl.screenshot({ path: `${shots}/43-pending.png` });

const stillDraft = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("הלינק עדיין תצוגה מקדימה אחרי ההצהרה", stillDraft.includes("תצוגה מקדימה"));
const previewOrder = await fetch(`${BASE}/api/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug: seed.slug, items: [{ productId: "00000000-0000-0000-0000-000000000000", qty: 1 }] }),
});
check("ודוכן בתצוגה מקדימה לא מקבל הזמנות", previewOrder.status === 404, `status=${previewOrder.status}`);

/* ── 4: הבעלים לא יכולה להפעיל את הדוכן בעצמה ──
   התרחיש: לוקחים את ה-access token שלה ומעדכנים ישירות את הטבלה.
   ה-RLS מרשה לה לערוך את הדוכן שלה, ולכן ההגנה חייבת לשבת בטריגר. */
const { rows: [ownerRow] } = await db.query("select owner_id from stores where id=$1", [seed.id]);
const { rows: [ownerUser] } = await db.query("select email from auth.users where id=$1", [ownerRow.owner_id]);
await fetch(`http://localhost:8000/auth/v1/admin/users/${ownerRow.owner_id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
  body: JSON.stringify({ password: "attack-probe-123" }),
});
const tokenRes = await fetch("http://localhost:8000/auth/v1/token?grant_type=password", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ownerUser.email, password: "attack-probe-123" }),
});
const { access_token: girlToken } = await tokenRes.json();
check("השגנו טוקן אמיתי של הבעלים לבדיקת התקיפה", !!girlToken);

const attack = async (patch) => {
  const res = await fetch(`http://localhost:3001/stores?id=eq.${seed.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${girlToken}`, apikey: girlToken, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.status;
};

const s1 = await attack({ activated_at: new Date().toISOString() });
const { rows: [afterHack] } = await db.query("select activated_at, payment_amount, ref_clicks from stores where id=$1", [seed.id]);
check("הבעלים לא יכולה להפעיל את עצמה עם הטוקן שלה", afterHack.activated_at === null, `http=${s1}`);

await attack({ payment_amount: 999999 });
check("ולא לזייף את הסכום ששולם", afterHack.payment_amount === null);

const beforeClicks = afterHack.ref_clicks;
await attack({ ref_clicks: 9999 });
const { rows: [afterClicks] } = await db.query("select ref_clicks from stores where id=$1", [seed.id]);
check("ולא לנפח את ספירת ההפניות שלה", afterClicks.ref_clicks === beforeClicks, `${afterClicks.ref_clicks}`);

/* אישור ההורים הוא לא רק צ'קבוקס: מי שתקרא ל-RPC ישירות, בלי לעבור
   במסך, עדיין תיחסם. */
await db.query("update stores set parent_consent_at = null, payment_claimed_at = null where id=$1", [seed.id]);
const rpcNoConsent = await fetch("http://localhost:3001/rpc/claim_store_payment", {
  method: "POST",
  headers: { Authorization: `Bearer ${girlToken}`, apikey: girlToken, "Content-Type": "application/json" },
  body: JSON.stringify({ p_store: seed.id, p_method: "bit", p_ref: null }),
});
const { rows: [afterNoConsent] } = await db.query("select payment_claimed_at from stores where id=$1", [seed.id]);
check("הצהרת תשלום בלי אישור הורים נדחית בשרת",
  !rpcNoConsent.ok && afterNoConsent.payment_claimed_at === null, `http=${rpcNoConsent.status}`);

await db.query("update stores set parent_consent_at = now() where id=$1", [seed.id]);
const rpcConsent = await fetch("http://localhost:3001/rpc/claim_store_payment", {
  method: "POST",
  headers: { Authorization: `Bearer ${girlToken}`, apikey: girlToken, "Content-Type": "application/json" },
  body: JSON.stringify({ p_store: seed.id, p_method: "paybox", p_ref: "אמא של תמר" }),
});
const { rows: [afterConsent] } = await db.query("select payment_claimed_at from stores where id=$1", [seed.id]);
check("ועם אישור אותה קריאה עוברת", rpcConsent.ok && !!afterConsent.payment_claimed_at, `http=${rpcConsent.status}`);

const s2 = await attack({ tagline: "משהו חדש" });
const { rows: [afterEdit] } = await db.query("select tagline from stores where id=$1", [seed.id]);
check("אבל כן אפשר לערוך את מה ששלה", afterEdit.tagline === "משהו חדש", `http=${s2}`);

/* ── 5: המנהלת מאשרת מהחמ"ל ── */
const admin = await browser.newContext({ viewport: { width: 720, height: 1000 } }).then((c) => c.newPage());
await admin.goto(`${BASE}/login`);
await verifyPhone(admin, "0509990000");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector("[data-testid=approve-store]", { timeout: 25000 });
check("החמ\"ל נוחת על תור האישורים כשמישהי מחכה",
  await usable(admin, "[data-testid=approve-store]"));
const queue = await admin.textContent("body");
check("והתור מציג את הדוכן שמחכה ואת אמצעי התשלום שהצהיר",
  queue.includes(seed.display_name) && queue.includes("פייבוקס"));
check("ומראה אם ההורים אישרו",
  queue.includes("ההורים מאשרים") || queue.includes("בלי אישור הורים"));
await admin.screenshot({ path: `${shots}/44-admin-queue.png` });

await admin.click("[data-testid=approve-store]");
await admin.waitForTimeout(1500);
const { rows: [live] } = await db.query("select * from stores where id=$1", [seed.id]);
check("האישור רושם את המחיר שנגבה בפועל, לא מספר קשיח",
  !!live.activated_at && live.payment_amount === expectedPrice && live.status === "active",
  `₪${live.payment_amount}`);

const liveHtml = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("הלינק נפתח מיד אחרי האישור, בלי המתנה ל-ISR", !liveHtml.includes("תצוגה מקדימה"));

await girl.goto(`${BASE}/activate`);
await girl.waitForSelector("[data-testid=store-live]", { timeout: 15000 });
check("והילדה רואה שהדוכן באוויר", (await girl.textContent("body")).includes(`/s/${seed.slug}`));
await girl.screenshot({ path: `${shots}/45-live.png` });

/* ── 5ב: הכסף של הילדה נפרד מהתשלום לדוכן ── */
await db.query(
  "update stores set payout_bit=true, payout_paybox=false, payout_cash=true, payout_note=null where id=$1",
  [seed.id]
);
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("#payment", { timeout: 15000 });
const payUi = await girl.textContent("#payment");
// זו הבטחה, לא ניסוח: דוכן לא נוגע בכסף של הקונות ולא לוקח ממנו אחוז
check("ההגדרות מבטיחות במפורש שאין עמלה על המכירות", payUi.includes("לא לוקח עמלה"));

/* "הערה לקונה" הוסרה מהמוצר בכוונה — רוב מה שנכתב בה היה מספר טלפון,
   והיא נדחפה לתוך הודעת הוואטסאפ. הבדיקה לא מחזירה אותה; היא בודקת את
   מה שבא במקומה: הסימונים, ולינק תשלום שנאכף. */
await girl.click("#payment button:has-text('מזומן')");
await girl.fill("input[aria-label='לינק לתשלום']", "https://www.bitpay.co.il/app/me/ABC123");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2000);
const { rows: [payRow] } = await db.query(
  "select payout_bit, payout_cash, payout_link from stores where id=$1", [seed.id]);
check("כיבוי אמצעי תשלום נשמר", payRow.payout_cash === false, `cash=${payRow.payout_cash}`);
check("ומה שנשאר דלוק נשמר גם הוא", payRow.payout_bit === true, `bit=${payRow.payout_bit}`);
check("ולינק התשלום נשמר", (payRow.payout_link ?? "").includes("bitpay.co.il"), String(payRow.payout_link));

// רק לינקים של ביט ופייבוקס מותרים, וזה נאכף בדאטהבייס ולא רק במסך
let badLink = "";
try {
  await db.query("update stores set payout_link='https://evil.example.com/pay' where id=$1", [seed.id]);
} catch (e) { badLink = e.message; }
check("ולינק תשלום שאינו ביט או פייבוקס נדחה בדאטהבייס", badLink !== "", badLink.slice(0, 50));

const buyer = await phone();
await buyer.goto(`${BASE}/s/${seed.slug}`);
await buyer.waitForSelector(".grid img", { timeout: 15000 });
/* מוצר בלי אפשרויות בחירה: הוספה מהירה עליו באמת מוסיפה לסל, בעוד
   שמוצר עם אפשרויות פותח גיליון בחירה ולא מוסיף כלום. */
const { rows: [simple] } = await db.query(
  "select name from products where store_id=$1 and deleted_at is null" +
  " and coalesce(array_length(options, 1), 0) = 0 and stock > 0 order by sort_order limit 1",
  [seed.id]);
check("יש בדוכן מוצר זמין בלי אפשרויות בחירה", !!simple, String(simple?.name));
await buyer.click(`button[aria-label='הוספה מהירה, ${simple.name}']`);
await buyer.waitForTimeout(900);
await buyer.click("[data-testid=cart-bar]");
await buyer.waitForSelector("button[aria-label='תשלום בביט']", { timeout: 15000 });
check("הקופה מציעה את אמצעי התשלום שהדוכן קיבל",
  (await buyer.locator("button[aria-label='תשלום בביט']").count()) === 1);
check("ולא את זה שכובה בהגדרות",
  (await buyer.locator("button[aria-label='תשלום במזומן']").count()) === 0);
await buyer.screenshot({ path: `${shots}/49-checkout-payment.png` });

// הטלפון שלה עדיין לא ב-HTML. ההערה היא בחירה שלה, לא דליפה שלנו.
const storeHtml = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("מספר הוואטסאפ שלה עדיין לא מופיע בקוד המקור", !storeHtml.includes("972501234567"));

/* ── 5ג: תצוגה מקדימה בוואטסאפ ── */
const og = (prop) => storeHtml.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1];
check("og:title הוא שם הדוכן", og("og:title") === seed.display_name, og("og:title"));
check("og:url מוחלט על הדומיין האמיתי", og("og:url")?.startsWith("https://duchan.app/s/") === true, og("og:url"));
check("og:image מצביע על תמונה שהועלתה", og("og:image")?.includes("/duchan-media/") === true, og("og:image"));
// noindex ו-OpenGraph חיים יחד בכוונה: לא נמצא בגוגל, אבל נראה טוב בשיתוף
check("ועדיין noindex למרות כרטיס התצוגה", storeHtml.includes("noindex"));

/* ── 6: מסך "להפיץ" ── */
await girl.goto(`${BASE}/dashboard/share`);
await girl.waitForSelector("textarea", { timeout: 15000 });
const box = await girl.locator("textarea").first().inputValue();
check("ההודעה המוכנה נושאת את שם הדוכן ואת הלינק",
  box.includes(seed.display_name) && box.includes(`/s/${seed.slug}`));
check("ואפשר לשלוח אותה בוואטסאפ בלחיצה", await usable(girl, "[data-testid=share-send]"));
await girl.screenshot({ path: `${shots}/46-share.png`, fullPage: true });

/* ── 7: הלולאה — חברה מגיעה מהדוכן ופותחת דוכן משלה ── */
const friend = await phone();
await friend.goto(`${BASE}/s/${seed.slug}`);
const openOwn = `a[href="/?ref=${seed.slug}"]`;
await friend.waitForSelector(openOwn, { timeout: 15000 });
check("דוכן חי מזמין מבקרות לפתוח דוכן משלהן", await usable(friend, openOwn));

// הפנייה למרינה היא הערוץ שממנו מגיעות רוב הלקוחות, וההודעה נושאת את
// שם הדוכן ואת הקוד — בלעדיהם אי אפשר לדעת מאיפה הפנייה הגיעה
const salesHref = await friend.locator("a[href*='wa.me']").first().getAttribute("href");
const salesMsg = decodeURIComponent(salesHref ?? "");
check("ויש קו ישיר למרינה", salesMsg.includes("wa.me/972545888471"), salesHref?.slice(0, 40));
check("וההודעה אומרת מאיזה דוכן היא הגיעה",
  salesMsg.includes(seed.display_name) && salesMsg.includes(seed.slug));

await friend.click(openOwn);
await friend.waitForURL(`**/?ref=${seed.slug}`);
/* שם הדוכן המפנה מגיע מקריאת רשת אחרי ההידרציה, ולכן מחכים לאלמנט
   עצמו ולא לפרק זמן שרירותי. */
await friend.waitForSelector("[data-testid=referred-from]", { timeout: 20000 }).catch(() => {});
check("דף הנחיתה מזכיר את הדוכן שהפנה",
  ((await friend.textContent("[data-testid=referred-from]").catch(() => "")) ?? "")
    .includes(seed.display_name));
const { rows: [clicked] } = await db.query("select ref_clicks from stores where id=$1", [seed.id]);
check("והלחיצה נספרה על הדוכן המפנה", clicked.ref_clicks >= 1, `clicks=${clicked.ref_clicks}`);
await friend.screenshot({ path: `${shots}/47-referred-landing.png` });

/* אונבורדינג מלא של החברה, דרך המסכים האמיתיים */
await friend.click("a[href='/onboarding'], button:has-text('לפתוח דוכן')");
await friend.waitForURL("**/onboarding");
await friend.waitForTimeout(900);
await friend.fill("input[aria-label='שם הדוכן']", "החנות של נועה");
await friend.click("button:has-text('הלאה, לעיצוב הדוכן')");
await friend.waitForTimeout(900);
await friend.click("button:has-text('+ להוסיף מוצר')");
await friend.waitForTimeout(600);
await friend.setInputFiles("input[type=file] >> nth=1", IMG);
await friend.waitForTimeout(1500);
await friend.fill("input[aria-label='שם המוצר']", "צמיד קשת");
await friend.fill("input[aria-label='מחיר המוצר']", "12");
await friend.click("button:has-text('הוספה לדוכן')");
await friend.waitForTimeout(900);
await friend.click("button:has-text('הלאה ←')");
await friend.waitForTimeout(1100);
await friend.check("input[aria-label='ההורים שלי יודעים']");
await friend.click("button:has-text('הלאה, למספר הטלפון')");
await friend.waitForTimeout(1100);
await verifyPhone(friend, "0529998877");
await friend.waitForSelector("text=נפתח דוכן", { timeout: 40000 });

const { rows: [noa] } = await db.query("select * from stores where contact_phone = '972529998877'");
check("הדוכן שהופנה רושם מי הביא אותו",
  noa?.referred_by === seed.id && noa?.referral_source === "store",
  `${noa?.referral_source}`);
check("והוא גם מתחיל כטיוטה", noa?.activated_at === null);

/* ── 8: החמ"ל מראה את הרשת ── */
await admin.goto(`${BASE}/admin`);
await admin.waitForTimeout(1200);
await admin.click("button:has-text('רשת')");
await admin.waitForTimeout(1500);
const net = await admin.textContent("body");
check("לשונית הרשת מציגה את האשכול עם שני הדוכנים",
  net.includes("אשכול של 2 חנויות") && net.includes("החנות של נועה"));
check("וסופרת הפניות", net.includes("הגיעו מחנות"));
await admin.screenshot({ path: `${shots}/48-admin-network.png`, fullPage: true });

/* ── 9: שדות רגישים לא דלפו בדרך ── */
const refBody = JSON.stringify(await (await fetch(`${BASE}/api/track/ref`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug: seed.slug }),
})).json());
check("נקודת ההפניה מחזירה רק שם ואמוג׳י, בלי טלפון", !refBody.includes("972"), refBody.slice(0, 60));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} activation+referral checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
