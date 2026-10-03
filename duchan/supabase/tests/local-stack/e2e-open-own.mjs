// E2E: "רוצה גם דוכן כזה?" בתחתית דוכן.
//
// מרינה: "לא רואים את הפרטים של רוצה גם דוכן כזה — זה חשוב מאוד ומביא לקוחות".
// בדוכן עם תמונת רקע, השכבה הקבועה של התמונה נצבעה מעל הכרטיס (הוא ישב
// מחוץ לשכבת הדוכן), ורק פס המבצע — שהוא positioned — נשאר גלוי.
// הבדיקה לא מסתפקת ב"האלמנט קיים": היא דוגמת פיקסלים במסך ומוודאת שהכרטיס
// הלבן באמת מצויר, ושהכפתור לא מכוסה.
import { chromium } from "playwright";
import pg from "pg";

const BASE = process.env.E2E_BASE ?? "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  if (typeof ok !== "boolean") throw new Error(`check("${n}") לא קיבל בוליאני`);
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select id, slug, theme, look, bg_pattern, bg_key from stores where activated_at is not null order by created_at limit 1"
);
const orig = { ...store };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
// תמונת רקע כהה ורוויה — המקרה הקשה ביותר לכרטיס שאמור להיות לבן
const BG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#2a4d8f"/></svg>';

async function bottom(label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route("**/bg/e2e-open-own.webp", (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: BG }));
  await p.goto(`${BASE}/s/${store.slug}?t=${Date.now()}`, { waitUntil: "networkidle" });
  const card = p.locator("[data-testid=open-own]");
  await card.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  check(`${label}: הכותרת "רוצה גם דוכן כזה?" נראית`,
    await p.getByRole("heading", { name: "רוצה גם דוכן כזה?" }).isVisible());
  const cardText = (await card.textContent()) ?? "";
  check(`${label}: בלי שורת הצעדים ובלי 'בגדים שקטנו'`,
    (await p.locator("[data-testid=open-own-steps]").count()) === 0 && !cardText.includes("בגדים שקטנו"));
  const cta = p.locator("[data-testid=open-own-cta]");
  check(`${label}: הכפתור מרובע`, (await cta.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)) === "0px");
  check(`${label}: הכפתור מוביל לפתיחת דוכן עם שיוך`, (await cta.getAttribute("href")) === `/?ref=${store.slug}`);

  // פיקסלים: הרקע של הכרטיס באמת לבן במסך (לא מכוסה בתמונה)
  const box = await card.boundingBox();
  const shot = await p.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width: 6, height: 6 } });
  const png = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(2, 2, 1, 1).data);
  }, shot.toString("base64"));
  check(`${label}: הכרטיס מצויר לבן מעל הרקע`, png[0] > 245 && png[1] > 245 && png[2] > 245, png.join(","));

  // מה שמצויר באמצע הכפתור הוא הכפתור עצמו
  const cb = await cta.boundingBox();
  const hit = await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid=open-own-cta]") !== null,
    { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 });
  check(`${label}: אפשר ללחוץ על הכפתור`, hit);

  // סל פתוח: פס הסל מכסה את הכרטיס ולא להפך
  const add = p.locator("button:has-text('הוספה לסל')").first();
  if (await add.count()) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await add.click();
    await p.waitForTimeout(400);
    const bar = p.locator("[data-testid=cart-bar]");
    await card.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(300);
    const bb = await bar.boundingBox();
    const onTop = await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-testid=cart-bar]"),
      { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    check(`${label}: פס הסל נשאר מעל הכרטיס`, onTop);
    const cb2 = await cta.boundingBox();
    check(`${label}: גלילה עד הסוף — הכפתור לא נבלע מתחת לפס הסל`, cb2.y + cb2.height <= bb.y, `${Math.round(cb2.y + cb2.height)} ≤ ${Math.round(bb.y)}`);
  }
  await ctx.close();
}

try {
  await db.query("update stores set bg_pattern=null, bg_key=null where id=$1", [store.id]);
  await bottom("רקע רגיל");
  await db.query("update stores set theme='minimal', look='soft', bg_pattern='photo', bg_key=$2 where id=$1",
    [store.id, `${store.id}/bg/e2e-open-own.webp`]);
  await bottom("תמונת רקע");
  await db.query("update stores set bg_pattern='hearts', bg_key=null where id=$1", [store.id]);
  await bottom("דוגמת רקע");
} finally {
  await db.query("update stores set theme=$2, look=$3, bg_pattern=$4, bg_key=$5 where id=$1",
    [store.id, orig.theme, orig.look, orig.bg_pattern, orig.bg_key]);
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} עברו`);
process.exit(failed.length ? 1 : 0);
