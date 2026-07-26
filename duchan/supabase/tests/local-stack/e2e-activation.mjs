// E2E: הפעלת חנות בתשלום + לולאת ההפניות (חנות מביאה חנות).
// מריץ את המסלול המלא: בונים → הלינק נעול → מצהירים ששילמנו → המנהלת מאשרת
// → הלינק פתוח → חברה מגיעה מהחנות ופותחת חנות משלה → הכל נראה בחמ"ל.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/activation-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = () => browser.newContext({ viewport: { width: 390, height: 780 } }).then((c) => c.newPage());

/* ── 0: החנות מ-e2e.mjs היא נקודת המוצא ── */
const { rows: [seed] } = await db.query("select * from stores order by created_at limit 1");
if (!seed) {
  console.error("צריך להריץ קודם את e2e.mjs — אין חנות בסיס");
  process.exit(1);
}
// מחזירים אותה למצב טיוטה כדי לבדוק את המסלול המלא מההתחלה
await db.query(
  "update stores set activated_at = null, payment_claimed_at = null, payment_amount = null where id = $1",
  [seed.id]
);
await fetch(`${BASE}/api/revalidate`, { method: "POST" }).catch(() => {});

/* ── 1: הילדה רואה שהלינק נעול ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await girl.fill("input[type=email]", "tamar-e2e@test.com");
await girl.fill("input[type=password]", "sqsq123!");
await girl.click("button:has-text('כניסה')");
await girl.waitForURL("**/dashboard", { timeout: 15000 });
await girl.waitForSelector("text=החנות שלך עוד לא פורסמה", { timeout: 10000 });
check("dashboard shows the store is unpublished", true);
await girl.screenshot({ path: `${shots}/40-dashboard-draft.png` });

await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("text=הלינק עוד נעול");
check("settings hides the share link until published", true);

/* ── 2: מסך ההפעלה — מה מקבלים, כמה, ואיך משלמים ── */
await girl.goto(`${BASE}/activate`);
await girl.waitForSelector("text=לצאת לעולם");
const act = await girl.textContent("body");
check("activation screen states the one-time price", act.includes("₪200") && act.includes("פעם אחת"));
check("activation screen lists what she gets", act.includes("חנות אמיתית") && act.includes("לינק פרטי משלך"));
check("activation screen shows the payback math", act.includes("את מחזירה את זה") && act.includes("סקווישים"));
check("activation screen has a parent explainer", act.includes("צריך אישור של הורה"));
check("activation screen offers bit/paybox and whatsapp", act.includes("שולחים ביט") && act.includes("לדבר איתך בוואטסאפ"));
await girl.screenshot({ path: `${shots}/41-activate.png`, fullPage: true });

await girl.click("text=או להראות את זה כאן");
await girl.waitForSelector("text=שיעור פרטי אחד");
const parent = await girl.textContent("body");
check("parent view shows learning + price anchors + safety", parent.includes("תמחור") && parent.includes("משחק קונסולה") && parent.includes("אין שדה כתובת"));
await girl.screenshot({ path: `${shots}/42-activate-parent.png`, fullPage: true });

/* ── 3: הצהרת תשלום — לא מפעילה כלום בעצמה ── */
await girl.click("button:has-text('פייבוקס')");
await girl.fill("input[placeholder='על שם מי שולם? (לא חובה)']", "אמא של תמר");
await girl.click("button:has-text('שילמנו')");
await girl.waitForSelector("text=קיבלנו, בודקים", { timeout: 10000 });
const { rows: [claimed] } = await db.query("select * from stores where id=$1", [seed.id]);
check("payment declaration is recorded", !!claimed.payment_claimed_at && claimed.payment_method === "paybox", claimed.payment_ref ?? "");
check("declaring payment does NOT activate the store", claimed.activated_at === null);
await girl.screenshot({ path: `${shots}/43-pending.png` });

const stillDraft = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("link is still closed after declaring payment", stillDraft.includes("בהכנה"));

/* ── 4: הבעלות לא יכולה להפעיל את החנות בעצמה ──
   התרחיש: ילדה (או מישהו בשבילה) לוקחת את ה-access token שלה ומעדכנת ישירות
   את הטבלה. ה-RLS מרשה לה לערוך את החנות שלה, ולכן ההגנה חייבת להיות בטריגר. */
const tokenRes = await fetch("http://localhost:8000/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "tamar-e2e@test.com", password: "sqsq123!" }),
});
const { access_token: girlToken } = await tokenRes.json();
check("got the owner's real access token for the attack", !!girlToken);

const attack = async (patch) => {
  const res = await fetch(`http://localhost:3001/stores?id=eq.${seed.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${girlToken}`,
      apikey: girlToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  return res.status;
};

const s1 = await attack({ activated_at: new Date().toISOString() });
const { rows: [afterHack] } = await db.query("select activated_at, payment_amount, ref_clicks from stores where id=$1", [seed.id]);
check("owner cannot self-activate with her own token", afterHack.activated_at === null, `http=${s1}`);

await attack({ payment_amount: 999999 });
check("owner cannot fake the paid amount", afterHack.payment_amount === null);

const beforeClicks = afterHack.ref_clicks;
await attack({ ref_clicks: 9999 });
const { rows: [afterClicks] } = await db.query("select ref_clicks from stores where id=$1", [seed.id]);
check("owner cannot inflate her referral clicks", afterClicks.ref_clicks === beforeClicks, `${afterClicks.ref_clicks}`);

// ...אבל כן יכולה לערוך את מה ששלה
const s2 = await attack({ tagline: "משהו חדש" });
const { rows: [afterEdit] } = await db.query("select tagline from stores where id=$1", [seed.id]);
check("owner can still edit her own store fields", afterEdit.tagline === "משהו חדש", `http=${s2}`);

/* ── 5: המנהלת מאשרת מהחמ"ל ── */
const admin = await browser.newContext({ viewport: { width: 720, height: 1000 } }).then((c) => c.newPage());
await fetch("http://localhost:8000/auth/v1/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@duchan.test", password: "admin123!" }),
});
await admin.goto(`${BASE}/login`);
await admin.fill("input[type=email]", "admin@duchan.test");
await admin.fill("input[type=password]", "admin123!");
await admin.click("button:has-text('כניסה')");
await admin.waitForTimeout(1500);
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector('text=ממתינות לאישור תשלום');
const queue = await admin.textContent("body");
check("admin queue lists the pending store with its declaration", queue.includes(seed.display_name) && queue.includes("פייבוקס"));
await admin.screenshot({ path: `${shots}/44-admin-queue.png` });

await admin.click("button:has-text('אישור והפעלה')");
await admin.waitForSelector("text=הלינק פתוח");
await admin.waitForTimeout(800);
const { rows: [live] } = await db.query("select * from stores where id=$1", [seed.id]);
check("admin activation sets activated_at + amount + active", !!live.activated_at && live.payment_amount === 200 && live.status === "active");

const liveHtml = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("link opens immediately after approval (no 60s ISR wait)", !liveHtml.includes("בהכנה") && liveHtml.includes("גם לך יש דברים למכור"));

await girl.goto(`${BASE}/activate`);
await girl.waitForSelector("text=החנות שלך באוויר");
check("girl now sees her live link and share buttons", (await girl.textContent("body")).includes(`/s/${seed.slug}`));
await girl.screenshot({ path: `${shots}/45-live.png` });

/* ── 5ב: הכסף של הילדה נפרד מהתשלום לדוכן ── */
// מתחילים מברירת המחדל כדי שהריצה תהיה חוזרת על עצמה
await db.query(
  "update stores set payout_bit=true, payout_paybox=false, payout_cash=true, payout_note=null where id=$1",
  [seed.id]
);
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("text=איך משלמים לי");
const payUi = await girl.textContent("body");
check("settings separates her money from the platform fee",
  payUi.includes("הכסף עובר ישירות אלייך") && payUi.includes("לא לוקח עמלה"));

// ברירת מחדל: ביט + מזומן. מכבים מזומן ומוסיפים הערה.
await girl.click("button:has-text('מזומן')");
await girl.fill("input[placeholder='הערה לקונה — \"ביט לאמא: 052-1234567\"']", "ביט לאמא: 052-1234567");
await girl.click("button:has-text('שמירת שינויים')");
await girl.waitForSelector("text=נשמר");
await girl.waitForTimeout(600);
const { rows: [payRow] } = await db.query("select payout_bit, payout_cash, payout_note from stores where id=$1", [seed.id]);
check("payout prefs saved", payRow.payout_bit === true && payRow.payout_cash === false && payRow.payout_note === "ביט לאמא: 052-1234567");

// אמצעי התשלום מוצגים בגיליון ההזמנה, ולכן בודקים בדפדפן ולא ב-HTML הגולמי
const buyer = await phone();
await buyer.goto(`${BASE}/s/${seed.slug}`);
await buyer.waitForSelector(".grid img", { timeout: 10000 });
await buyer.click("text=סקוויש חד-קרן");
await buyer.click("button:has-text('הוספה לסל')");
await buyer.click("text=פריט"); // הכפתור הצף של הסל
await buyer.waitForSelector("text=ההזמנה שלך", { timeout: 10000 });
const sheet = await buyer.textContent("body");
check("checkout shows how to pay her", sheet.includes("אפשר לשלם ב") && sheet.includes("ביט"));
check("her note to the buyer is shown", sheet.includes("ביט לאמא: 052-1234567"));
check("cash is gone once she turned it off", !sheet.includes("מזומן"));
await buyer.screenshot({ path: `${shots}/49-checkout-payment.png` });

// contact_phone עדיין לא ב-HTML — ההערה שלה היא בחירה שלה, לא דליפה שלנו
const storeHtml = await (await fetch(`${BASE}/s/${seed.slug}`, { headers: { "Cache-Control": "no-cache" } })).text();
check("her whatsapp number still never appears in the HTML", !storeHtml.includes("972501234567"));

/* ── 5ג: תצוגה מקדימה בוואטסאפ ── */
const og = (prop) => storeHtml.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1];
check("og:title is the store name", og("og:title") === seed.display_name, og("og:title"));
check("og:url is absolute on the real domain", og("og:url")?.startsWith("https://duchan.app/s/"), og("og:url"));
check("og:image points at a real uploaded image", !!og("og:image")?.includes("/duchan-media/"), og("og:image"));
check("preview image is actually fetchable", (await fetch(og("og:image"))).ok);
// noindex ו-OpenGraph חיים יחד בכוונה: לא נמצא בגוגל, אבל נראה טוב בשיתוף
check("still noindex despite having a preview card", storeHtml.includes("noindex"));

/* ── 6: מסך "להפיץ" — ההודעות המוכנות ── */
await girl.goto(`${BASE}/dashboard/share`);
// מחכים לתוכן שנטען אחרי useStore, לא לכותרת שקיימת גם בניווט התחתון
await girl.waitForSelector("textarea", { timeout: 10000 });
const share = await girl.textContent("body");
check("share tab offers ready-made messages", share.includes("פתחתי חנות") && share.includes("לחברה אחת") && share.includes("למשפחה"));
const box = await girl.locator("textarea").first().inputValue();
check("message is personalised with the store name and link", box.includes(seed.display_name) && box.includes(`/s/${seed.slug}`));
check("share tab has an invite-a-friend link", share.includes("להזמין חברה לפתוח חנות"));
await girl.screenshot({ path: `${shots}/46-share.png`, fullPage: true });

/* ── 7: הלולאה — חברה מגיעה מהחנות ופותחת חנות משלה ── */
const friend = await phone();
await friend.goto(`${BASE}/s/${seed.slug}`);
await friend.waitForSelector("text=פתחי חנות משלך");
check("live storefront invites visitors to open their own store", true);
await friend.click("text=פתחי חנות משלך");
await friend.waitForURL(`**/?ref=${seed.slug}`);
await friend.waitForSelector("text=עכשיו תורך", { timeout: 10000 });
check("landing greets the referred visitor by the referring store", (await friend.textContent("body")).includes(seed.display_name));
const { rows: [clicked] } = await db.query("select ref_clicks from stores where id=$1", [seed.id]);
check("referral click counted on the referring store", clicked.ref_clicks >= 1, `clicks=${clicked.ref_clicks}`);
await friend.screenshot({ path: `${shots}/47-referred-landing.png` });

await friend.fill("input", "החנות של נועה");
await friend.click("button:has-text('בואי נבנה')");
await friend.waitForURL("**/onboarding");
await friend.click("button:has-text('ענן')");
await friend.click("button:has-text('הלאה')");
await friend.fill("input[placeholder='שם המוצר']", "צמיד חוטים");
await friend.fill("input[placeholder='מחיר (₪)']", "30");
await friend.click("button:has-text('הלאה')");
await friend.click("button:has-text('שמירת החנות')");
await friend.fill("input[placeholder='הטלפון שלך (וואטסאפ)']", "0529998877");
await friend.fill("input[placeholder='אימייל (איתו נכנסים לניהול)']", "noa-e2e@test.com");
await friend.fill("input[placeholder='סיסמה (6 תווים לפחות)']", "noano123!");
await friend.click("button:has-text('שמירה ופתיחת החנות')");
await friend.waitForSelector("text=החנות שלך נשמרה", { timeout: 20000 });

const { rows: [noa] } = await db.query("select * from stores where parent_email = 'noa-e2e@test.com'");
check("referred store records who brought it", noa?.referred_by === seed.id && noa?.referral_source === "store");
check("referred store also starts as a draft", noa?.activated_at === null);

/* ── 8: החמ"ל מראה את הרשת ── */
await admin.goto(`${BASE}/admin`);
await admin.waitForSelector('text=חמ"ל');
await admin.click("button:has-text('רשת')");
await admin.waitForSelector("text=אשכולות");
const net = await admin.textContent("body");
check("network tab shows the cluster with both stores", net.includes("אשכול של 2 חנויות") && net.includes("החנות של נועה"));
check("network tab counts referrals and clicks", net.includes("הגיעו מחנות"));
await admin.screenshot({ path: `${shots}/48-admin-network.png`, fullPage: true });

/* ── 9: אימות שדות רגישים לא דלפו בדרך ── */
check("referral endpoint returns only name/emoji", !JSON.stringify(
  await (await fetch(`${BASE}/api/track/ref`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: seed.slug }),
  })).json()
).includes("972"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} activation+referral checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
