// E2E: "תבדוק שהכל נשמר וכל הפלואים עובדים" — כל מקטע ב"החנות שלי".
//
// עוברים על כל המקטעים כמו ילדה אמיתית: משנים, לוחצים "חזרה" (שומרת לבד),
// ובסוף טוענים את הדף מחדש ובודקים שכל דבר נשאר — גם בדאטהבייס וגם על המסך.
// ועוד שלושה מקרים שבהם שינוי היה יכול ללכת לאיבוד:
//   • יציאה דרך שורת הניווט עם שינוי שלא נשמר — שואלת קודם.
//   • מספר לא תקין — "חזרה" לא יוצאת ולא שומרת חצי, ואומרת למה.
//   • פתוח/בהפסקה — נשמר מיד, בלי כפתור.
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

// ריצה שנקטעה באמצע יכולה להשאיר את שם הבדיקה — מחזירים לשם של seed.mjs לפני ששומרים את "המקור"
await db.query("update stores set display_name='החנות של תמר' where contact_phone='972501234567' and display_name='בדיקת שמירה'");
const { rows: [orig] } = await db.query("select * from stores where contact_phone='972501234567' order by created_at limit 1");
if (!orig) {
  console.error("צריך את דוכן הבדיקה של 0501234567 (seed.mjs)");
  process.exit(1);
}
const RESTORE = [
  "display_name", "tagline", "about", "emoji", "theme", "look", "bg_pattern", "cover_preset", "cover_key",
  "featured_title", "show_sold_out", "promo_on", "promo_title", "promo_text",
  "payout_bit", "payout_paybox", "payout_cash", "payout_bit_phone", "payout_paybox_phone",
  "payout_bit_link", "payout_paybox_link", "payout_link", "payout_whatsapp",
  "ships", "shipping_note", "shipping_price", "city", "age", "status", "contact_phone",
];
await db.query("update stores set status='active', payout_bit=true, payout_paybox=false, payout_bit_link=null, payout_bit_phone=null, payout_whatsapp=false where id=$1", [orig.id]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));
await page.goto(`${BASE}/login`);
await verifyPhone(page, "0501234567");
await page.waitForURL("**/dashboard", { timeout: 20000 });
await page.goto(`${BASE}/dashboard/settings`);
await page.waitForSelector("[data-testid=settings-hub]", { timeout: 20000 });

const open = async (key) => {
  await page.click(key === "coupons" ? "[data-testid=settings-coupons-link]" : `[data-testid=hub-${key}]`);
  await page.waitForSelector(`[data-testid=section-${key}]`);
};
const back = async () => {
  await page.click("[data-testid=section-back]");
  await page.waitForSelector("[data-testid=settings-hub]", { timeout: 10000 });
  await page.waitForTimeout(900); // השמירה רצה ברקע של החזרה
};
const row = async () => (await db.query("select * from stores where id=$1", [orig.id])).rows[0];

/* ── 1. עיצוב הדוכן ── */
await open("design");
await page.fill("input[aria-label='שם הדוכן']", "בדיקת שמירה");
await page.fill("textarea[aria-label='תיאור הדוכן']", "צמידים וסקווישים בעבודת יד");
await page.fill("input[aria-label='עיר']", "חולון");
await page.click("button[aria-label='אמוג׳י 🐼']");
await page.click("button[aria-label='ערכת לבנדר']");
await page.click("button[aria-label='סגנון רך']");
await page.click("button[aria-label='רקע כוכבים']");
await page.click("button[aria-label='קאבר זית']"); // נשמר מיד
await back();
let r = await row();
check("עיצוב: שם, תיאור ועיר", r.display_name === "בדיקת שמירה" && r.tagline === "צמידים וסקווישים בעבודת יד" && r.city === "חולון",
  `${r.display_name} · ${r.tagline} · ${r.city}`);
check("עיצוב: אמוג׳י, צבעים, סגנון ורקע", r.emoji === "🐼" && r.theme === "berry" && r.look === "soft" && r.bg_pattern === "stars",
  `${r.emoji} ${r.theme} ${r.look} ${r.bg_pattern}`);
check("עיצוב: הקאבר", r.cover_preset === "olive", String(r.cover_preset));

/* ── 2. המוצרים בדוכן ── */
await open("products");
await page.fill("input[aria-label='כותרת המומלצים']", "הכי שווים");
await page.click("[data-testid=show-sold-out-toggle-off]"); // להציג עם 'אזל'
await back();
r = await row();
check("מוצרים: כותרת המומלצים ומה קורה למה שאזל", r.featured_title === "הכי שווים" && r.show_sold_out === true,
  `${r.featured_title} · ${r.show_sold_out}`);

/* ── 3. הודעה לקונים ── */
await open("promo");
await page.click("[data-testid=promo-toggle-on]");
await page.fill("input[aria-label='כותרת ההודעה']", "מבצע חנוכה");
await page.fill("textarea[aria-label='תוכן ההודעה']", "בקנייה מעל ₪30 — מתנה 🎁");
await back();
r = await row();
check("הודעה: דלוקה עם כותרת וטקסט", r.promo_on === true && r.promo_title === "מבצע חנוכה" && r.promo_text === "בקנייה מעל ₪30 — מתנה 🎁",
  `${r.promo_on} · ${r.promo_title}`);

/* ── 4. איך משלמים לי ── */
await open("payment");
check("תשלום: ביט מסומן — הפרטים שלו פתוחים", (await page.locator("[data-testid=bit-details]").count()) === 1);
check("ופייבוקס לא מסומן — בלי שדות", (await page.locator("[data-testid=paybox-details]").count()) === 0);
await page.fill("input[aria-label='מספר ביט']", "052-123-4567");
await page.click("#payment button:has-text('פייבוקס')");
check("סימון פייבוקס פותח את הפרטים שלו", (await page.locator("[data-testid=paybox-details]").count()) === 1);
await page.fill("input[aria-label='לינק פייבוקס']", "https://link.payboxapp.com/test42");
await page.click("button[aria-label='לסגור תשלום בוואטסאפ']");
await back();
r = await row();
check("תשלום: ביט עם מספר, פייבוקס עם לינק, וסגירה בוואטסאפ",
  r.payout_bit === true && r.payout_bit_phone === "0521234567" && r.payout_paybox === true &&
    r.payout_paybox_link === "https://link.payboxapp.com/test42" && r.payout_whatsapp === true,
  `${r.payout_bit_phone} · ${r.payout_paybox_link} · ${r.payout_whatsapp}`);

/* ── 5. משלוחים ── */
await open("shipping");
await page.click("[data-testid=ships-choice-on]");
await page.fill("textarea[aria-label='פרטי משלוח']", "בדואר, עד שבוע");
await page.fill("input[aria-label='מחיר משלוח']", "12.90");
await back();
r = await row();
check("משלוחים: יש, עם פרטים ומחיר עשרוני", r.ships === true && r.shipping_note === "בדואר, עד שבוע" && Number(r.shipping_price) === 12.9,
  `${r.ships} · ${r.shipping_note} · ${r.shipping_price}`);

/* ── 6. הפרטים שלי ── */
await open("details");
await page.fill("input[aria-label='גיל']", "12");
await back();
r = await row();
check("פרטים: הגיל", r.age === 12, String(r.age));

/* ── 7. קופונים ולשתף נפתחים ── */
await open("coupons");
check("קופונים נפתחים במקום", (await page.locator("[data-testid=coupon-manager]").count()) === 1);
await back();
await open("share");
const link = (await page.textContent("[data-testid=share-link]")) ?? "";
check("לשתף: הלינק הנכון לדוכן", link.trim().endsWith(`/s/${orig.slug}`), link.trim());
await back();

/* ── 8. טעינה מחדש — הכל עדיין שם, גם על המסך ── */
await page.reload();
await page.waitForSelector("[data-testid=settings-hub]", { timeout: 20000 });
const hub = (await page.textContent("[data-testid=settings-hub]")) ?? "";
check("אחרי טעינה מחדש: מסך הבית מראה את מה שנשמר",
  ["בדיקת שמירה", "לבנדר", "רך", "כוכבים", "הכי שווים", "מבצע חנוכה", "משלוח ₪12.90"].every((w) => hub.includes(w)),
  hub.replace(/\s+/g, " ").slice(0, 160));
await open("design");
check("ובתוך העיצוב: השם והעיר במקום",
  (await page.inputValue("input[aria-label='שם הדוכן']")) === "בדיקת שמירה" && (await page.inputValue("input[aria-label='עיר']")) === "חולון");
check("והבחירות מסומנות", (await page.getAttribute("button[aria-label='סגנון רך']", "aria-pressed")) === "true" &&
  (await page.getAttribute("button[aria-label='רקע כוכבים']", "aria-pressed")) === "true");
await back();
await open("payment");
check("ובתשלום: המספר והלינק במקום",
  (await page.inputValue("input[aria-label='מספר ביט']")).replace(/\D/g, "") === "0521234567" &&
    (await page.inputValue("input[aria-label='לינק פייבוקס']")) === "https://link.payboxapp.com/test42");
await back();

/* ── 9. יציאה דרך שורת הניווט עם שינוי שלא נשמר — שואלת ── */
await open("design");
await page.fill("input[aria-label='שם הדוכן']", "שינוי שלא נשמר");
let asked = "";
page.once("dialog", async (d) => { asked = d.message(); await d.dismiss(); });
await page.click("nav button:has-text('מוצרים')");
await page.waitForTimeout(600);
check("יציאה עם שינוי שלא נשמר — שואלת קודם", asked.includes("לא נשמרו"), asked);
check("ובחירה 'לא' — נשארת במסך עם השינוי", page.url().includes("/dashboard/settings") &&
  (await page.inputValue("input[aria-label='שם הדוכן']")) === "שינוי שלא נשמר");
await page.fill("input[aria-label='שם הדוכן']", "בדיקת שמירה");
await back();

/* ── 10. מספר לא תקין — "חזרה" לא יוצאת ולא שומרת חצי ── */
await open("details");
await page.fill("input[aria-label='טלפון וואטסאפ']", "123");
await page.click("[data-testid=section-back]");
await page.waitForTimeout(800);
check("מספר לא תקין: נשארים במקטע", (await page.locator("[data-testid=section-details]").count()) === 1);
check("ואומרים למה", ((await page.textContent("body")) ?? "").includes("מספר הוואטסאפ לא נראה תקין"));
r = await row();
check("ובדאטהבייס המספר הישן נשאר", r.contact_phone === "972501234567", r.contact_phone);
await page.fill("input[aria-label='טלפון וואטסאפ']", "050-123-4567");
await back();

/* ── 11. פתוח / בהפסקה — מיד ── */
await page.click("[data-testid=store-open-off]");
await page.waitForTimeout(1200);
check("בהפסקה נשמר מיד", (await row()).status === "paused");
await page.click("[data-testid=store-open-on]");
await page.waitForTimeout(1200);
check("ופתוח שוב", (await row()).status === "active");

check("אין שגיאות ג׳אווהסקריפט", jsErrors.length === 0, jsErrors.join(" | "));

/* ── ניקוי ── */
const sets = RESTORE.map((c, i) => `${c}=$${i + 2}`).join(", ");
await db.query(`update stores set ${sets} where id=$1`, [orig.id, ...RESTORE.map((c) => orig[c])]);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} settings save checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
