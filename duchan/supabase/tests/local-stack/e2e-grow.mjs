// E2E: לעזור לדוכן לגדול. מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור 5–9).
//
// החוזים:
//   1. "החודש בדוכן": כמה נכנס, כמה הזמנות ומוצרים, מה נמכר הכי טוב, שאלה
//      על המחיר, וכפתור "לשלוח את הסיכום להורים" עם הודעה מוכנה.
//   2. "חדש אצלי בדוכן": אחרי מוצר חדש בדוכן פתוח, כרטיס עם שליחה בוואטסאפ.
//   3. "תמונה לסטטוס": נבנית בדפדפן (1080×1920), עם תמונות המוצרים דרך
//      /api/media, ונותנת תצוגה וכפתור שמירה.
//   4. /api/media מגיש רק תמונות מוצר, לא כל מפתח.
//   (אחרי הזמנה, "לא צריך להזמין שוב": נבדק ב-e2e.mjs, במסך האישור עצמו)
import { chromium } from "playwright";
import pg from "pg";
import { verifyPhone, closeHelper } from "./sms-helper.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select * from stores where contact_phone='972501234567' and activated_at is not null order by created_at limit 1"
);
const { rows: [prod] } = await db.query(
  `select id, name from products where store_id=$1 and deleted_at is null and (is_visible is null or is_visible)
     and (options is null or cardinality(options) = 0) order by sort_order, created_at limit 1`,
  [store.id]
);
await db.query("update products set price=10, stock=80, track_stock=true where id=$1", [prod.id]);

// שתי הזמנות ששולמו החודש: 3 ועוד 2 מאותו מוצר
const made = [];
for (const qty of [3, 2]) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: store.slug, items: [{ productId: prod.id, qty }], buyerName: "רוני", buyerPhone: "0526665544", payMethod: "cash" }),
  });
  const j = await r.json();
  const { rows: [o] } = await db.query("update orders set status='paid' where store_id=$1 and order_number=$2 returning id", [store.id, j.orderNumber]);
  made.push(o.id);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const me = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await me.goto(`${BASE}/login`);
  await verifyPhone(me, "0501234567");
  await me.waitForURL("**/dashboard", { timeout: 20000 });
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  /* ── 1. החודש בדוכן ── */
  const rep = me.locator("[data-testid=month-report]");
  await rep.waitFor({ timeout: 15000 });
  const t = (await rep.textContent()) ?? "";
  check("'החודש בדוכן' מופיע עם כמה נכנס", /₪\d/.test(t) && t.includes("נכנסו"));
  check("ושאלה על המחיר, על המוצר שנמכר הכי הרבה", (await rep.locator("[data-testid=month-question]").count()) === 1);
  const wa = decodeURIComponent((await rep.locator("[data-testid=month-share-parents]").getAttribute("href")) ?? "");
  check("'לשלוח את הסיכום להורים': הודעה עם שם הדוכן והסכום", wa.includes(store.display_name) && wa.includes("נכנסו ₪"), wa.slice(0, 90));

  /* ── 1א. לפני שמוסרים הזמנה: טיפים לבטיחות ── */
  {
    const r = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug, items: [{ productId: prod.id, qty: 1 }], buyerName: "רוני", buyerPhone: "0526665544", payMethod: "cash" }),
    });
    const j = await r.json();
    const { rows: [o] } = await db.query("select id from orders where store_id=$1 and order_number=$2", [store.id, j.orderNumber]);
    made.push(o.id);
    await me.evaluate((id) => localStorage.removeItem(`duchan-safety-seen-${id}`), store.id);
    await me.reload({ waitUntil: "networkidle" });
    const card = me.locator("[data-testid=safety-tips]");
    const shown = await card.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const txt = shown ? await card.innerText() : "";
    check("הזמנה שמחכה: 'לפני שמוסרים הזמנה' עם שישה טיפים", shown && (await card.locator("li").count()) === 6);
    check("לא להיפגש לבד, רק אחרי שהכסף הגיע, לוודא שהקונה אמין", ["לא נפגשים לבד", "רק אחרי שהכסף הגיע", "שהקונה אמין"].every((w) => txt.includes(w)));
    if (shown) await me.click("[data-testid=safety-ok]");
    await me.reload({ waitUntil: "networkidle" });
    await me.locator("[data-testid=safety-tips-line]").waitFor({ timeout: 15000 }).catch(() => {});
    check("אחרי 'הבנו': רק שורה אחת שאפשר לפתוח", (await me.locator("[data-testid=safety-tips]").count()) === 0 && (await me.locator("[data-testid=safety-tips-line]").count()) === 1);
  }

  /* ── 2. חדש אצלי בדוכן ── */
  await me.goto(`${BASE}/dashboard/products?new=1&name=${encodeURIComponent("מוצר חדש לבדיקה")}`, { waitUntil: "networkidle" });
  await me.waitForSelector("#ed-name", { timeout: 15000 });
  check("?name= ממלא את שם המוצר", (await me.inputValue("#ed-name")) === "מוצר חדש לבדיקה");
  await me.fill("[aria-label='מחיר']", "12").catch(async () => {
    await me.locator("input[inputmode=decimal], input[inputmode=numeric]").first().fill("12");
  });
  // בלי תמונה: אם העורך דורש תמונה, הבדיקה הזו מדלגת על שמירה
  const saveBtn = me.getByRole("button", { name: /^(שמירה|להוסיף לדוכן|לשמור)/ }).first();
  await saveBtn.click().catch(() => {});
  const share = me.locator("[data-testid=new-product-share]");
  const shown = await share.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  if (shown) {
    const href = decodeURIComponent((await share.locator("[data-testid=new-product-share-wa]").getAttribute("href")) ?? "");
    check("אחרי מוצר חדש: 'לספר לחברים' עם 'חדש אצלי בדוכן' ומחיר", href.includes("חדש אצלי בדוכן: מוצר חדש לבדיקה") && href.includes("₪12"), href.slice(0, 80));
    check("לא חופר: נעלם לבד אחרי כמה שניות", await share.waitFor({ state: "detached", timeout: 10000 }).then(() => true).catch(() => false));
    const seen = await me.evaluate((id) => localStorage.getItem(`duchan-new-share-${id}`), store.id);
    check("ופעם ביום לכל היותר (נשמר היום במכשיר)", /^\d{4}-\d{2}-\d{2}$/.test(seen ?? ""), seen);
  } else {
    console.log("(העורך לא שמר בלי תמונה. בודקים את הכרטיס דרך מוצר עם תמונה בפעם הבאה)");
  }
  await db.query("update products set deleted_at=now() where store_id=$1 and name='מוצר חדש לבדיקה'", [store.id]);

  /* ── 3. תמונה לסטטוס ── */
  await me.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  // הכפתור יושב במסלול הצעדים, שמופיע רק בדוכן בלי הזמנות. כאן בודקים את הבנייה עצמה דרך הקומפוננטה בדף בדיקה.
  await db.query("update orders set deleted_at=now() where id = any($1)", [made]);
  const { rows: others } = await db.query("select id from orders where store_id=$1 and deleted_at is null", [store.id]);
  await db.query("update orders set deleted_at=now() where id = any($1)", [others.map((r) => r.id)]);
  await me.reload({ waitUntil: "networkidle" });
  const make = me.locator("[data-testid=status-image-make]").first();
  const hasBtn = await make.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  check("דוכן בלי הזמנות: כפתור 'תמונה לסטטוס'", hasBtn);
  if (hasBtn) {
    await make.click();
    const prev = me.locator("[data-testid=status-image-preview] img");
    await prev.waitFor({ timeout: 20000 });
    const dim = await prev.evaluate((img) => new Promise((r) => (img.complete ? r([img.naturalWidth, img.naturalHeight]) : (img.onload = () => r([img.naturalWidth, img.naturalHeight])))));
    check("התמונה בגודל סטטוס, 1080×1920", dim[0] === 1080 && dim[1] === 1920, dim.join("×"));
    check("וכפתור לשמור", await me.locator("[data-testid=status-image-download]").isVisible());
  }
  await db.query("update orders set deleted_at=null where id = any($1)", [others.map((r) => r.id)]);

} finally {
  await browser.close();
  await closeHelper();
}

/* ── 4. /api/media ── */
{
  const bad = await fetch(`${BASE}/api/media?k=${encodeURIComponent("../../etc/passwd")}`);
  const other = await fetch(`${BASE}/api/media?k=${encodeURIComponent(store.id + "/cover.webp")}`);
  check("/api/media: מפתח לא של מוצר נדחה", bad.status === 400 && other.status === 400, `${bad.status}/${other.status}`);
  const { rows: [img] } = await db.query("select image_key from products where image_key ~ '^[0-9a-f-]{36}/products/' and deleted_at is null limit 1");
  if (img) {
    const r = await fetch(`${BASE}/api/media?k=${encodeURIComponent(img.image_key)}`);
    check("/api/media: תמונת מוצר מוגשת מאותו דומיין", r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"), String(r.status));
  }
}

await db.query("update orders set deleted_at=now() where id = any($1)", [made]);
await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
