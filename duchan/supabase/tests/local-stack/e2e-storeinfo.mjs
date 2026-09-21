// E2E: מה שהדוכן מספר על עצמו, בחירת אמצעי תשלום בקופה, ובחירת צבע.
//
// הבדיקות כאן נשענות על תוויות ועל תוצאה בדאטהבייס, לא על ניסוח.
// היוצא מן הכלל הוא הודעת הוואטסאפ: המבנה שלה *הוא* המוצר — הקונה
// שולחת אותה, והילדה מזהה לפיה מי הזמינה מה. שם כן נבדק תוכן.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const shots = join(tmpdir(), "duchan-e2e-shots", "storeinfo");
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
if (!store) {
  console.error("צריך דוכן פעיל. הריצי seed.mjs ואז e2e-activation.mjs");
  process.exit(1);
}
await db.query("delete from orders where ip_hash is not null and created_at > now() - interval '1 day'");
await db.query("delete from products where name='גרבי צבעים'");
await db.query(
  `insert into products (store_id,name,price,track_stock,stock,option_label,options,created_at)
   values ($1,'גרבי צבעים',15,true,9,'צבע',$2, now() - interval '40 days')`,
  [store.id, ["ורוד", "כחול", "צהוב"]]
);
await db.query(
  `update stores set tagline=null, about=null, city=null, ships=false, shipping_note=null,
   shipping_price=null, order_intro=null, order_outro=null,
   payout_bit=true, payout_paybox=true, payout_cash=true,
   payout_link='https://link.payboxapp.com/abc123' where id=$1`,
  [store.id]
);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
let tick = 0;
const fresh = () => `${BASE}/s/${store.slug}?t=${Date.now()}-${tick++}`;

/* ── 1. הילדה ממלאת את פרטי הדוכן ── */
const girl = await phone();
await girl.goto(`${BASE}/login`);
await verifyPhone(girl, "0501234567");
await girl.waitForURL("**/dashboard", { timeout: 20000 });
await girl.goto(`${BASE}/dashboard/settings`);
await girl.waitForSelector("textarea[aria-label='תיאור הדוכן']", { timeout: 20000 });

const STORY = "אני תמר, בת 11, ואני מכינה צמידים.";
await girl.fill("textarea[aria-label='תיאור הדוכן']", STORY);
await girl.fill("input[aria-label='עיר בארץ']", "רמת גן");
await girl.click("button[aria-label='יש משלוחים']");
await girl.waitForTimeout(400);
await girl.fill("textarea[aria-label='פרטי משלוח']", "שולחת בדואר לכל הארץ");
await girl.fill("input[aria-label='מחיר משלוח']", "15");
await girl.click("[data-testid=save-settings]");
await girl.waitForTimeout(2000);

const { rows: [saved] } = await db.query("select * from stores where id=$1", [store.id]);
check("התיאור והעיר נשמרו", saved.tagline === STORY && saved.city === "רמת גן", `${saved.city}`);
check("והמשלוח נשמר עם המחיר שלו",
  saved.ships === true && saved.shipping_price === 15,
  `${saved.ships} · ₪${saved.shipping_price}`);
await girl.screenshot({ path: `${shots}/80-settings.png`, fullPage: true });

/* ── 2. הקונה רואה את זה בדף ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const shop = await buyer.textContent("body");
check("הדוכן מציג את העיר", shop.includes("רמת גן"));
check("ואת התיאור שהיא כתבה", shop.includes(STORY));
check("ואת מחיר המשלוח", shop.includes("₪15") && shop.includes("משלוח"));
check("וגם את פרטי המשלוח", shop.includes("שולחת בדואר לכל הארץ"));
await buyer.screenshot({ path: `${shots}/81-storefront.png`, fullPage: true });

/* ── 3. בחירת צבע — הבאג מהשטח: אפשר היה להוסיף לסל בלי לבחור ── */
await buyer.click("button[aria-label='גרבי צבעים']");
await buyer.waitForTimeout(800);
const add = buyer.locator("button[aria-label='הוספה לסל']");
check("אי אפשר להוסיף לסל לפני שבוחרים צבע", await add.isDisabled());
const chip = buyer.locator("button[aria-label='צבע: כחול']");
check("כל אפשרות היא יעד מגע אמיתי", ((await chip.boundingBox())?.height ?? 0) >= 40,
  `${Math.round((await chip.boundingBox())?.height ?? 0)}px`);
await chip.click();
await buyer.waitForTimeout(500);
check("בחירת צבע פותחת את ההוספה", !(await add.isDisabled()));
check("והנבחרת מסומנת גם לקורא מסך, לא רק בצבע",
  (await chip.getAttribute("aria-pressed")) === "true",
  String(await chip.getAttribute("aria-pressed")));
await buyer.screenshot({ path: `${shots}/82-colour.png` });

/* ── 4. הקופה ── */
await add.click();
await buyer.waitForTimeout(700);
await buyer.click("[data-testid=cart-bar]");
await buyer.waitForSelector("input[aria-label='השם שלך']", { timeout: 15000 });
for (const m of ["ביט", "פייבוקס", "מזומן"]) {
  check(`${m} מוצע כי הדוכן מקבל אותו`,
    (await buyer.locator(`button[aria-label='תשלום ב${m}']`).count()) === 1);
}
await buyer.click("button[aria-label='תשלום בפייבוקס']");
await buyer.waitForTimeout(500);
check("בחירת פייבוקס חושפת את לינק התשלום",
  (await buyer.locator("a[href='https://link.payboxapp.com/abc123']").count()) === 1);
await buyer.screenshot({ path: `${shots}/83-checkout.png` });

/* השם אינו נוחות: בלעדיו הילדה לא יודעת איזו הזמנה של מי. הטלפון חובה
   מאז שההזמנה נקלטת במערכת (2026-09) — בלעדיו אין דרך לחזור לקונה.
   הדוכן הזה שולח, אז נדרשים גם כתובת ועיר. */
await buyer.fill("input[aria-label='השם שלך']", "נועה");
await buyer.fill("input[aria-label='מספר טלפון']", "052-000-2222");
await buyer.fill("input[aria-label='כתובת למשלוח']", "הרצל 12");
await buyer.fill("input[aria-label='עיר למשלוח']", "רמת גן");
await buyer.click("button:has-text('שליחת ההזמנה')");
await buyer.waitForSelector("[data-testid=order-confirmed]", { timeout: 15000 });
const waUrl = await buyer
  .locator("[data-testid=order-confirmed] a:has-text('יצירת קשר')")
  .getAttribute("href");
const msg = waUrl ? decodeURIComponent(new URL(waUrl).searchParams.get("text") ?? "") : "";
check("ההזמנה מאושרת במסך, וההודעה חיה בכפתור הקשר", !!waUrl);
check("השורה הראשונה נושאת את שם הקונה ואת מספר ההזמנה",
  /נועה/.test(msg.split("\n")[0]) && /#\d+/.test(msg.split("\n")[0]), msg.split("\n")[0]);
check("ההודעה מפרטת את מה שהוזמן", msg.includes("גרבי צבעים") && msg.includes("כחול"));
check("ואת הסכום", /סה"כ: ₪\d+/.test(msg), msg.split("\n").find((l) => l.includes('סה"כ')) ?? "");
check("ואומרת במה הקונה בחרה לשלם", msg.includes("בחרתי לשלם ב: פייבוקס"),
  msg.split("\n").find((l) => l.includes("בחרתי לשלם")) ?? "");
check("ואת שיטת המסירה שהיא בחרה", /בחרתי בשיטת מסירה:/.test(msg),
  msg.split("\n").find((l) => l.includes("שיטת מסירה")) ?? "");
/* הקישור של הילדה נשלח מיד עם ההזמנה (בקשת מרינה 2026-08) — הקונה
   בחרה פייבוקס והלינק של הדוכן הוא פייבוקס, אז הוא בהודעה והתשלום
   יכול לקרות בלי הלוך-חזור. הטלפון של הילדה עדיין לא נכנס להודעה. */
check("לינק התשלום נשלח מיד עם ההזמנה כשהאמצעי תואם",
  msg.includes("https://link.payboxapp.com/abc123"),
  msg.split("\n").find((l) => l.includes("לינק")) ?? "");
check("ההודעה לא נושאת את מספר הטלפון של הילדה",
  !msg.includes(store.contact_phone) && !msg.includes("050-123-4567"));

const { rows: [order] } = await db.query(
  "select order_number, buyer_name, buyer_phone, ship_address, ship_city, pay_method, wants_shipping from orders where store_id=$1 order by created_at desc limit 1",
  [store.id]);
check("וההזמנה נשמרה עם השם, לא רק בהודעה",
  order?.buyer_name === "נועה" && msg.includes(`#${order.order_number}`),
  `${order?.buyer_name} #${order?.order_number}`);
/* ההזמנה כבר לא חיה בוואטסאפ — כל מה שהמוכרת צריכה יושב עליה ב-DB */
check("הטלפון של הקונה נשמר מנורמל", order?.buyer_phone === "972520002222", String(order?.buyer_phone));
check("כתובת ועיר למשלוח נשמרו",
  order?.ship_address === "הרצל 12" && order?.ship_city === "רמת גן" && order?.wants_shipping === true,
  `${order?.ship_address}, ${order?.ship_city}`);
check("אמצעי התשלום שנבחר נשמר", order?.pay_method === "paybox", String(order?.pay_method));

/* ── 5. ביט בהודעה, אבל המספר לא בקוד המקור ── */
const buyer2 = await phone();
await buyer2.goto(fresh(), { waitUntil: "networkidle" });
await buyer2.locator("button[aria-label^='הוספה מהירה']").first().click();
await buyer2.waitForTimeout(700);
await buyer2.click("[data-testid=cart-bar]");
await buyer2.waitForSelector("input[aria-label='השם שלך']", { timeout: 15000 });
await buyer2.fill("input[aria-label='השם שלך']", "שירה");
await buyer2.fill("input[aria-label='מספר טלפון']", "0520003333");
// מסירה אישית — כדי לוודא שכתובת לא נדרשת כשאין משלוח
await buyer2.click("button:has-text('מסירה אישית')");
await buyer2.click("button[aria-label='תשלום בביט']");
await buyer2.waitForTimeout(400);
await buyer2.click("button:has-text('שליחת ההזמנה')");
await buyer2.waitForSelector("[data-testid=order-confirmed]", { timeout: 15000 });
const waUrl2 = await buyer2
  .locator("[data-testid=order-confirmed] a:has-text('יצירת קשר')")
  .getAttribute("href");
const msg2 = waUrl2 ? decodeURIComponent(new URL(waUrl2).searchParams.get("text") ?? "") : "";
check("בחירת ביט מצוינת בהודעה", msg2.includes("בחרתי לשלם ב: ביט"),
  msg2.split("\n").find((l) => l.includes("בחרתי לשלם")) ?? "");
/* הלינק של הדוכן הוא פייבוקס והקונה בחרה ביט — קישור לא רלוונטי
   לא נדחף לה להודעה. */
check("לינק שלא תואם את האמצעי שנבחר לא נכנס להודעה",
  !msg2.includes("payboxapp.com"));
check("והמספר של הילדה עדיין לא מופיע בקוד המקור של הדף",
  !(await (await fetch(fresh())).text()).includes(store.contact_phone));

/* ── 6. פופאפ "מה חדש" ──
   חנות ותיקה (נוצרה לפני העדכון) רואה אותו פעם אחת; סגירה נשמרת.
   חנות הבדיקה נוצרת טרייה, אז מדמים ותיקות בהזזת created_at. */
const { rows: [orig] } = await db.query("select created_at from stores where id=$1", [store.id]);
await db.query("update stores set created_at='2026-01-01' where id=$1", [store.id]);
// עוזר ההתחברות מסמן "כבר ראיתי" כדי לא לחסום בדיקות אחרות — כאן
// בודקים את הפופאפ עצמו, אז מוחקים את הסימון
await girl.evaluate(() => localStorage.removeItem("duchan-whatsnew-2026-09-orders"));
await girl.goto(`${BASE}/dashboard`);
await girl.waitForSelector("[data-testid=release-popup]", { timeout: 15000 });
check("חנות ותיקה מקבלת את 'מה חדש' בכניסה", true);
const whatsNewText = (await girl.locator("[data-testid=release-popup]").textContent()) ?? "";
check("והוא מספר על ההזמנות החדשות", whatsNewText.includes("ההזמנות"));
await girl.click("button:has-text('מגניב, הבנתי!')");
await girl.waitForTimeout(400);
await girl.reload();
await girl.waitForSelector("text=היי", { timeout: 15000 });
await girl.waitForTimeout(1200);
check("אחרי סגירה הוא לא חוזר", (await girl.locator("[data-testid=release-popup]").count()) === 0);
await db.query("update stores set created_at=$1 where id=$2", [orig.created_at, store.id]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} store-info + checkout checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
