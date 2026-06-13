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
if (!fs.existsSync(configPath)) {
  console.error("❌ חסר הקובץ tools/config.json");
  console.error("   העתיקי את tools/config.example.json ל-tools/config.json ומלאי את הפרטים שלך.");
  process.exit(1);
}
const config = readJson(configPath);
const input = readJson(path.join(__dirname, "products.input.json"));

for (const key of ["appKey", "appSecret", "trackingId"]) {
  if (!config[key] || String(config[key]).includes("PUT-YOUR")) {
    console.error(`❌ חסר ערך בקונפיג: ${key}. מלאי אותו ב-tools/config.json`);
    process.exit(1);
  }
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

async function resolveToProductId(rawInput) {
  const trimmed = String(rawInput).trim();
  if (/^\d{6,}$/.test(trimmed)) return trimmed;          // כבר מספר מוצר
  let direct = extractProductId(trimmed);
  if (direct) return direct;
  // לינק קצר — עוקבים אחרי ההפניה
  try {
    const res = await fetch(trimmed, { redirect: "follow" });
    direct = extractProductId(res.url);
    if (direct) return direct;
    const html = await res.text();
    const m = html.match(/productId["':=\s]+(\d{6,})/i) || html.match(/(\d{9,})\.html/);
    if (m) return m[1];
  } catch (e) {
    console.warn(`   ⚠️ לא הצלחתי לפתוח את הלינק: ${trimmed} (${e.message})`);
  }
  return null;
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
  console.log(`\n🔄 מסנכרן ${input.items.length} מוצרים מאלי אקספרס...\n`);

  // 1) פותרים לינקים -> מספרי מוצר
  const resolved = [];
  for (const item of input.items) {
    const id = await resolveToProductId(item.input);
    if (!id) {
      console.warn(`   ⚠️ דילגתי על: ${item.input} (לא נמצא מספר מוצר)`);
      continue;
    }
    resolved.push({ ...item, productId: id });
    console.log(`   ✓ ${item.input}  →  מוצר ${id}`);
  }

  if (resolved.length === 0) {
    console.error("\n❌ לא נמצא אף מוצר. בדקי את הלינקים ב-products.input.json");
    process.exit(1);
  }

  // 2) שולפים פרטי מוצר ב-API (עד 50 בכל קריאה)
  console.log(`\n📡 שולף פרטים מה-API עבור ${resolved.length} מוצרים...`);
  const fields = [
    "product_id", "product_title", "product_main_image_url",
    "target_sale_price", "target_sale_price_currency",
    "commission_rate", "hot_product_commission_rate",
    "promotion_link", "product_detail_url",
  ].join(",");

  const detailsById = {};
  for (let i = 0; i < resolved.length; i += 50) {
    const batch = resolved.slice(i, i + 50);
    const json = await callApi("aliexpress.affiliate.productdetail.get", {
      product_ids: batch.map((b) => b.productId).join(","),
      tracking_id: config.trackingId,
      target_currency: CURRENCY,
      target_language: LANGUAGE,
      ship_to_country: SHIP_TO,
      fields,
    });
    for (const prod of extractProducts(json)) {
      detailsById[String(prod.product_id)] = prod;
    }
  }

  // 3) בונים את רשימת המוצרים הסופית
  const products = [];
  for (const item of resolved) {
    const d = detailsById[item.productId];
    if (!d) {
      console.warn(`   ⚠️ ה-API לא החזיר פרטים למוצר ${item.productId}`);
      continue;
    }
    const title = item.name || d.product_title || `מוצר ${item.productId}`;
    const category = item.category || guessCategory(d.product_title);
    const commission = d.hot_product_commission_rate || d.commission_rate || "";
    products.push({
      name: title,
      desc: title,
      category,
      emoji: CATEGORY_EMOJI[category] || "🛍️",
      image: d.product_main_image_url || "",
      link: d.promotion_link || item.input,         // לינק אפיליאציה תקין מה-API
      price: d.target_sale_price || "",
      currency: d.target_sale_price_currency || CURRENCY,
      commission,
    });
    const c = commission ? ` | עמלה ${commission}` : "";
    console.log(`   ✓ ${title}  [${category}]${c}`);
  }

  // 4) כותבים את הקובץ
  const out = path.join(ROOT, "js", "products.js");
  fs.writeFileSync(out, buildProductsFile(products), "utf8");
  console.log(`\n✅ נכתבו ${products.length} מוצרים אל js/products.js`);
  console.log("   פתחי את index.html בדפדפן כדי לראות את התוצאה 🎉\n");

  // טיפ על עמלות נמוכות
  const low = products.filter((p) => {
    const n = parseFloat(String(p.commission).replace("%", ""));
    return !isNaN(n) && n < 3;
  });
  if (low.length) {
    console.log(`💡 שימי לב: ל-${low.length} מוצרים יש עמלה נמוכה מ-3%. שווה לשקול חלופות עם עמלה גבוהה יותר:`);
    low.forEach((p) => console.log(`   · ${p.name} (${p.commission})`));
  }
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
