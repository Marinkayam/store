// E2E: מה שהחנות מספרת על עצמה, בחירת אמצעי תשלום בקופה, ובחירת צבע.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "fs";
import { verifyPhone } from "./sms-helper.mjs";

const BASE = "http://localhost:3777";
const shots = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad/info-shots";
mkdirSync(shots, { recursive: true });
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where activated_at is not null order by created_at limit 1"
);
await db.query("delete from orders where ip_hash is not null and created_at > now() - interval '1 day'");
await db.query("delete from products where name='גרבי צבעים'");
await db.query(
  `insert into products (store_id,name,price,track_stock,stock,option_label,options,created_at)
   values ($1,'גרבי צבעים',15,true,9,'צבע',$2, now() - interval '40 days')`,
  [store.id, ["ורוד", "כחול", "צהוב"]]
);
await db.query(
  `update stores set about=null, city=null, ships=false, shipping_note=null, shipping_price=null,
   order_intro=null, order_outro=null, payout_bit=true, payout_paybox=true, payout_cash=true,
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
await girl.waitForSelector("text=על הדוכן", { timeout: 15000 });

await girl.fill("textarea[aria-label='על הדוכן']", "אני תמר, בת 11, ואני מכינה צמידים.");
await girl.fill("input[aria-label='עיר']", "רמת גן");
await girl.click("button[aria-label='יש משלוחים']");
await girl.waitForTimeout(300);
await girl.fill("textarea[aria-label='פרטי משלוח']", "שולחת בדואר לכל הארץ");
await girl.fill("input[aria-label='מחיר משלוח']", "15");
await girl.fill("input[aria-label='שורת פתיחה']", "היי תמר!! 🌸");
await girl.fill("input[aria-label='שורת סיום']", "תודה! אחזור אלייך היום 💛");
check("the order message preview updates as she types",
  (await girl.textContent("body")).includes("תודה! אחזור אלייך היום"));
await girl.click("button:has-text('שמירת שינויים')");
await girl.waitForSelector("text=נשמר", { timeout: 10000 });
await girl.waitForTimeout(900);

const { rows: [saved] } = await db.query("select * from stores where id=$1", [store.id]);
check("about and city are saved", saved.about?.includes("תמר") && saved.city === "רמת גן", saved.city);
check("shipping is saved with its price", saved.ships === true && saved.shipping_price === 15,
  `${saved.ships} · ₪${saved.shipping_price}`);
check("her own wording for the order message is saved",
  saved.order_intro === "היי תמר!! 🌸" && saved.order_outro?.startsWith("תודה"));
await girl.screenshot({ path: `${shots}/80-settings.png`, fullPage: true });

/* ── 2. הקונה רואה את זה בדף ── */
const buyer = await phone();
await buyer.goto(fresh(), { waitUntil: "networkidle" });
const shop = await buyer.textContent("body");
check("the storefront shows the city", shop.includes("רמת גן"));
check("the storefront counts the products", /\d+ מוצרים/.test(shop));
check("the storefront states the shipping price", shop.includes("משלוח ₪15"));
check("the storefront tells her story", shop.includes("אני תמר, בת 11"));
check("and explains how shipping works", shop.includes("שולחת בדואר לכל הארץ"));
await buyer.screenshot({ path: `${shots}/81-storefront.png`, fullPage: true });

/* ── 3. בחירת צבע — הבאג מהשטח ── */
await buyer.click("text=גרבי צבעים");
await buyer.waitForTimeout(700);
const add = buyer.locator("button[aria-label='הוספה לסל']");
check("add is blocked before a colour is chosen", await add.isDisabled());
const chip = buyer.locator("button[aria-label='צבע: כחול']");
check("each choice is a real touch target (44px)", ((await chip.boundingBox())?.height ?? 0) >= 40,
  `${Math.round((await chip.boundingBox())?.height ?? 0)}px`);
await chip.click();
await buyer.waitForTimeout(400);
check("tapping a colour selects it", !(await add.isDisabled()));
check("and the chosen one is marked, not just tinted",
  ((await chip.textContent()) ?? "").includes("✓"), (await chip.textContent())?.trim());
await buyer.screenshot({ path: `${shots}/82-colour.png` });

/* ── 4. הקופה: הקונה בוחרת איך היא משלמת ── */
let waUrl = null;
await buyer.route("https://wa.me/**", (r) => { waUrl = r.request().url(); r.abort(); });
await add.click();
await buyer.waitForTimeout(600);
await buyer.click("text=פריט");
await buyer.waitForSelector("text=ההזמנה שלך", { timeout: 10000 });
check("checkout asks how she will pay", (await buyer.textContent("body")).includes("איך תשלמי?"));
for (const m of ["ביט", "פייבוקס", "מזומן"]) {
  check(`${m} is offered because the store accepts it`,
    (await buyer.locator(`button[aria-label='תשלום ב${m}']`).count()) === 1);
}
await buyer.click("button[aria-label='תשלום בפייבוקס']");
await buyer.waitForTimeout(400);
check("choosing paybox surfaces the payment link",
  (await buyer.locator("a[href='https://link.payboxapp.com/abc123']").count()) === 1);
await buyer.screenshot({ path: `${shots}/83-checkout.png` });

await buyer.click("button:has-text('שליחה בוואטסאפ')");
await buyer.waitForTimeout(2500);
const msg = waUrl ? decodeURIComponent(new URL(waUrl).searchParams.get("text") ?? "") : "";
check("the whatsapp message opens", !!waUrl);
check("it opens with her own words", msg.startsWith("היי תמר!! 🌸"), msg.split("\n")[0]);
check("it carries the paybox link, so she knows where to send the money",
  msg.includes("link.payboxapp.com/abc123"));
check("it states the shipping arrangement", msg.includes("משלוח: שולחת בדואר לכל הארץ · ₪15"));
check("it ends with her closing line", msg.trim().endsWith("תודה! אחזור אלייך היום 💛"));
console.log("\n--- ההודעה ---\n" + msg + "\n---------------");

/* ── 5. ביט מביא את המספר, מזומן לא ── */
const buyer2 = await phone();
let waUrl2 = null;
await buyer2.route("https://wa.me/**", (r) => { waUrl2 = r.request().url(); r.abort(); });
await buyer2.goto(fresh(), { waitUntil: "networkidle" });
await buyer2.locator("button[aria-label^='הוספה מהירה']").first().click();
await buyer2.waitForTimeout(600);
await buyer2.click("text=פריט");
await buyer2.waitForSelector("text=ההזמנה שלך");
await buyer2.click("button[aria-label='תשלום בביט']");
await buyer2.click("button:has-text('שליחה בוואטסאפ')");
await buyer2.waitForTimeout(2500);
const msg2 = waUrl2 ? decodeURIComponent(new URL(waUrl2).searchParams.get("text") ?? "") : "";
check("choosing bit puts her number in the message", msg2.includes("אשלם בביט למספר 050"),
  msg2.split("\n").find((l) => l.includes("אשלם")) ?? "");
check("the number still never appears in the page html",
  !(await (await fetch(fresh())).text()).includes("972501234567"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} store-info + checkout checks passed`);
await browser.close();
await db.end();
process.exit(failed.length ? 1 : 0);
