#!/usr/bin/env node
/* ==========================================================================
   AcroShop · AliExpress Affiliate sync
   ==========================================================================
   מה הסקריפט עושה:
     1. קורא את הפרטים שלך מ-tools/config.json (App Key / Secret / Tracking ID)
     2. קורא את רשימת המוצרים מ-tools/products.input.json
     3. לכל לינק קצר (s.click.aliexpress.com) — עוקב אחרי ההפניה ומחלץ את
        מספר המוצר (productId)
     4. קורא ל-API הרשמי aliexpress.affiliate.productdetail.get ומקבל:
        שם המוצר, תמונה, מחיר, אחוז עמלה (!), ולינק אפיליאציה תקין (promotion_link)
     5. כותב מחדש את js/products.js עם כל המוצרים — מוכן לתצוגה

   הרצה:
     node tools/aliexpress-sync.mjs

   דרישות: Node.js 18 ומעלה (יש בו fetch מובנה). אין צורך בהתקנת חבילות.

   ⚠️ הסקריפט ניגש לאינטרנט (אלי אקספרס). אם מריצים אותו בסביבת הענן של
      Claude Code on the web — צריך להגדיר שם Network access ל-Allow all.
      במחשב רגיל זה פשוט עובד.
   ========================================================================== */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GATEWAY = "https://api-sg.aliexpress.com/sync";

/* ---------- קריאת קונפיג וקלט ---------- */

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const configPath = path.join(__dirname, "config.json");
const input = readJson(path.join(__dirname, "products.input.json"));

// שני מצבי הרצה:
//   API MODE   – יש tools/config.json עם מפתחות אמיתיים. מושך שם/תמונה/מחיר/עמלה
//                + לינק אפיליאציה מה-API הרשמי. הכי עשיר.
//   SCRAPE MODE – אין config.json (או חסרים מפתחות). פותח כל לינק, קורא את
//                שם המוצר והתמונה מהדף עצמו, ומשתמש בלינק שסיפקת (שכבר מכיל
//                את האפיליאציה שלך). לא דורש מפתחות בכלל — רק גישת רשת.
let config = {};
let API_MODE = false;
if (fs.existsSync(configPath)) {
  config = readJson(configPath);
  API_MODE = ["appKey", "appSecret", "trackingId"].every(
    (k) => config[k] && !String(config[k]).includes("PUT-YOUR")
  );
}

const CURRENCY = config.targetCurrency || "ILS";
const LANGUAGE = config.targetLanguage || "HE";
const SHIP_TO = config.shipToCountry || "IL";

/* ---------- חתימת בקשה (IOP /sync, HMAC-SHA256) ---------- */

function signRequest(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const base = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}

async function callApi(method, businessParams) {
  const params = {
    method,
    app_key: config.appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    ...businessParams,
  };
  params.sign = signRequest(params, config.appSecret);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מה-API: ${text.slice(0, 300)}`);
  }
  if (json.error_response) {
    const e = json.error_response;
    throw new Error(`שגיאת API: ${e.code} ${e.msg || ""} ${e.sub_msg || ""}`);
  }
  return json;
}

/* ---------- חילוץ מספר מוצר מלינק ---------- */

function extractProductId(url) {
  const m = url.match(/(\d{6,})\.html/) || url.match(/[?&]productId=(\d+)/) || url.match(/\/(\d{6,})(?:[/?]|$)/);
  return m ? m[1] : null;
}

// מחזיר { productId, finalUrl, html } — html מוחזר רק אם כבר משכנו אותו
async function resolveLink(rawInput) {
  const trimmed = String(rawInput).trim();
  if (/^\d{6,}$/.test(trimmed)) {
    return { productId: trimmed, finalUrl: `https://www.aliexpress.com/item/${trimmed}.html`, html: null };
  }
  let direct = extractProductId(trimmed);
  if (direct) return { productId: direct, finalUrl: trimmed, html: null };
  try {
    const res = await fetch(trimmed, { redirect: "follow" });
    const finalUrl = res.url;
    direct = extractProductId(finalUrl);
    const html = await res.text();
    if (!direct) {
      const m = html.match(/productId["':=\s]+(\d{6,})/i) || html.match(/(\d{9,})\.html/);
      if (m) direct = m[1];
    }
    return { productId: direct, finalUrl, html };
  } catch (e) {
    console.warn(`   ⚠️ לא הצלחתי לפתוח את הלינק: ${trimmed} (${e.message})`);
    return { productId: null, finalUrl: null, html: null };
  }
}

// SCRAPE MODE: שולף שם + תמונה + מחיר מתוך ה-HTML של דף המוצר
function scrapeFromHtml(html) {
  if (!html) return {};
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    const m = html.match(re);
    return m ? m[1] : "";
  };
  const decode = (s) =>
    String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  let title = decode(meta("og:title")) || decode((html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  title = title.replace(/\s*[-|]\s*AliExpress.*$/i, "").trim();
  let image = meta("og:image");
  if (image && image.startsWith("//")) image = "https:" + image;
  const priceMatch =
    html.match(/"formatedActivityPrice"\s*:\s*"([^"]+)"/) ||
    html.match(/"formatedPrice"\s*:\s*"([^"]+)"/) ||
    html.match(/"minActivityAmount"[^}]*"formatedAmount"\s*:\s*"([^"]+)"/);
  return { title, image, price: priceMatch ? decode(priceMatch[1]) : "" };
}

/* ---------- ניחוש קטגוריה לפי שם המוצר ---------- */

const CATEGORY_KEYWORDS = {
  hair: ["hair", "net", "bun", "pin", "clip", "comb", "elastic", "tie", "scrunchie", "rhinestone",
         "שיער", "רשת", "בייגלה", "סיכ", "מסרק", "גומי", "קוקו"],
  clothing: ["leotard", "bodysuit", "underwear", "panties", "bra", "shorts", "seamless", "nude",
             "בגד גוף", "תחתון", "גוזיי", "חזיי", "מכנס", "שקוף"],
  training: ["weight", "resistance", "band", "stretch", "knee", "wrist", "ankle", "flexibility",
             "splits", "foot stretcher", "משקול", "התנגדות", "מתיח", "ברך", "שורש", "גמיש", "ספגט"],
};

function guessCategory(title) {
  const t = (title || "").toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(w.toLowerCase()))) return cat;
  }
  return "gear";
}

const CATEGORY_EMOJI = { hair: "🎀", clothing: "👗", training: "💪", gear: "🎒" };

/* ---------- כתיבת js/products.js ---------- */

function buildProductsFile(products) {
  const header = `/* ==========================================================================
   רשימת המוצרים — נוצר אוטומטית ע"י tools/aliexpress-sync.mjs
   ==========================================================================
   כדי לעדכן: ערכי את tools/products.input.json והריצי שוב:
       node tools/aliexpress-sync.mjs
   אפשר גם לערוך ידנית כאן, אבל הרצה מחדש של הסקריפט תדרוס את הקובץ.
   עודכן: ${new Date().toISOString().slice(0, 10)}
   ========================================================================== */

const CATEGORIES = [
  { id: "all",      label: "הכל ✨" },
  { id: "hair",     label: "שיער 🎀" },
  { id: "clothing", label: "ביגוד 👗" },
  { id: "training", label: "אימון וכוח 💪" },
  { id: "gear",     label: "ציוד ואביזרים 🎒" },
];

const PRODUCTS = [
`;
  const entries = products
    .map((p) => {
      const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const note = p.commission ? `  // עמלה: ${p.commission}` : "";
      return `  {
    name: "${esc(p.name)}",
    desc: "${esc(p.desc)}",
    category: "${p.category}",
    emoji: "${p.emoji}",
    image: "${esc(p.image)}",
    price: "${esc(p.price)} ${esc(p.currency)}",${note}
    link: "${esc(p.link)}",
  },`;
    })
    .join("\n");
  return header + entries + "\n];\n";
}

/* ---------- ראשי ---------- */

async function main() {
  console.log(`\n🔄 מסנכרן ${input.items.length} מוצרים מאלי אקספרס...`);
  console.log(API_MODE
    ? "   מצב: API מלא (שם, תמונה, מחיר, עמלה, לינק אפיליאציה)\n"
    : "   מצב: ללא מפתחות (שם + תמונה מהדף; הלינקים שלך משמשים כמו שהם)\n");

  // 1) פותרים לינקים
  const resolved = [];
  for (const item of input.items) {
    const r = await resolveLink(item.input);
    if (!r.productId && !r.finalUrl) {
      console.warn(`   ⚠️ דילגתי על: ${item.input}`);
      continue;
    }
    resolved.push({ ...item, ...r });
    console.log(`   ✓ ${item.input}  →  ${r.productId || r.finalUrl}`);
  }

  if (resolved.length === 0) {
    console.error("\n❌ לא נמצא אף מוצר. בדקי את הלינקים ב-products.input.json");
    process.exit(1);
  }

  const products = API_MODE
    ? await buildViaApi(resolved)
    : await buildViaScrape(resolved);

  // כותבים את הקובץ
  const out = path.join(ROOT, "js", "products.js");
  fs.writeFileSync(out, buildProductsFile(products), "utf8");
  console.log(`\n✅ נכתבו ${products.length} מוצרים אל js/products.js`);
  console.log("   פתחי את index.html בדפדפן כדי לראות את התוצאה 🎉\n");

  // טיפ על עמלות נמוכות (רק במצב API)
  const low = products.filter((p) => {
    const n = parseFloat(String(p.commission).replace("%", ""));
    return !isNaN(n) && n < 3;
  });
  if (low.length) {
    console.log(`💡 שימי לב: ל-${low.length} מוצרים יש עמלה נמוכה מ-3%. שווה לשקול חלופות עם עמלה גבוהה יותר:`);
    low.forEach((p) => console.log(`   · ${p.name} (${p.commission})`));
  }
}

async function buildViaApi(resolved) {
  const withId = resolved.filter((r) => r.productId);
  console.log(`\n📡 שולף פרטים מה-API עבור ${withId.length} מוצרים...`);
  const fields = [
    "product_id", "product_title", "product_main_image_url",
    "target_sale_price", "target_sale_price_currency",
    "commission_rate", "hot_product_commission_rate",
    "promotion_link", "product_detail_url",
  ].join(",");

  const detailsById = {};
  for (let i = 0; i < withId.length; i += 50) {
    const batch = withId.slice(i, i + 50);
    const json = await callApi("aliexpress.affiliate.productdetail.get", {
      product_ids: batch.map((b) => b.productId).join(","),
      tracking_id: config.trackingId,
      target_currency: CURRENCY,
      target_language: LANGUAGE,
      ship_to_country: SHIP_TO,
      fields,
    });
    for (const prod of extractProducts(json)) detailsById[String(prod.product_id)] = prod;
  }

  const products = [];
  for (const item of withId) {
    const d = detailsById[item.productId];
    if (!d) {
      console.warn(`   ⚠️ ה-API לא החזיר פרטים למוצר ${item.productId}`);
      continue;
    }
    const title = item.name || d.product_title || `מוצר ${item.productId}`;
    const category = item.category || guessCategory(d.product_title);
    const commission = d.hot_product_commission_rate || d.commission_rate || "";
    products.push({
      name: title, desc: title, category,
      emoji: CATEGORY_EMOJI[category] || "🛍️",
      image: d.product_main_image_url || "",
      link: d.promotion_link || item.input,
      price: d.target_sale_price || "",
      currency: d.target_sale_price_currency || CURRENCY,
      commission,
    });
    console.log(`   ✓ ${title}  [${category}]${commission ? ` | עמלה ${commission}` : ""}`);
  }
  return products;
}

async function buildViaScrape(resolved) {
  console.log(`\n🌐 קורא פרטי מוצר מהדפים...`);
  const products = [];
  for (const item of resolved) {
    let html = item.html;
    if (!html && item.finalUrl) {
      try { html = await (await fetch(item.finalUrl)).text(); } catch {}
    }
    const s = scrapeFromHtml(html);
    const title = item.name || s.title || (item.productId ? `מוצר ${item.productId}` : "מוצר");
    const category = item.category || guessCategory(s.title);
    products.push({
      name: title, desc: title, category,
      emoji: CATEGORY_EMOJI[category] || "🛍️",
      image: s.image || "",
      link: item.input,            // הלינק שסיפקת — כבר מכיל את האפיליאציה שלך
      price: s.price || "",
      currency: "",
      commission: "",
    });
    console.log(`   ✓ ${title}  [${category}]`);
  }
  return products;
}

function extractProducts(json) {
  // התשובה מגיעה בעטיפות שונות לפי הגדרות החשבון — מנווטים בזהירות
  const resp = json.aliexpress_affiliate_productdetail_get_response || json.resp_result || json;
  const result = resp.resp_result || resp.result || resp;
  const products = result?.result?.products || result?.products;
  const arr = products?.product || products;
  return Array.isArray(arr) ? arr : arr ? [arr] : [];
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
});
