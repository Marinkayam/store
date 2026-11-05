// .env.local לסטאק המקומי (scripts/local-stack.sh).
//
// הקובץ לא בגיט, וקונטיינר חדש מתחיל בלעדיו — ואז השרת עולה בלי כתובת
// Supabase וכל דף מחזיר 500. הסקריפט כותב אותו מחדש מערכים מקומיים בלבד:
// השימים (supashim / s3shim / smsshim) והסוד של supashim, שכבר בקוד.
// אין כאן ולא ייכנס לכאן שום מפתח אמיתי.
//
// לא דורס ערכים קיימים: מוסיף רק מה שחסר.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHmac } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, ".env.local");
// זהה ל-supabase/tests/local-stack/supashim.mjs
const JWT_SECRET = "local-test-secret-with-at-least-32-chars!!";

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (role) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const b = b64u(JSON.stringify({ role, iss: "local", iat: 1700000000, exp: 4102444800 }));
  return `${h}.${b}.${createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url")}`;
};

async function vapid() {
  try {
    const { default: webpush } = await import("web-push");
    return webpush.generateVAPIDKeys();
  } catch {
    return null;
  }
}

const want = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:8000",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
  // הדומיין האמיתי ולא localhost: כרטיסי השיתוף (og:url) נבדקים מולו
  NEXT_PUBLIC_SITE_URL: "https://duchan.app",
  R2_ENDPOINT: "http://localhost:9000",
  R2_ACCOUNT_ID: "local",
  R2_ACCESS_KEY_ID: "local",
  R2_SECRET_ACCESS_KEY: "local",
  R2_BUCKET: "duchan-media",
  NEXT_PUBLIC_R2_PUBLIC_URL: "http://localhost:9000/duchan-media",
  SMS4FREE_ENDPOINT: "http://localhost:9100/ApiSMS/v2/SendSMS",
  // זהים ל-supabase/tests/local-stack/smsshim.mjs
  SMS4FREE_KEY: "test-key",
  SMS4FREE_USER: "0500000000",
  SMS4FREE_PASS: "test-pass",
  SMS4FREE_SENDER: "Duchan",
  ADMIN_PHONES: "0509990000",
  CRON_SECRET: "test-cron-secret",
  PUSH_TEST_ENDPOINTS: "1",
  // רק כדי שהחמ"ל יראה "כתיבה בעזרת AI מוגדרת" (כפתור "הדלקה מחדש"). לא מפתח
  // אמיתי — קריאה אמיתית ל-AI נכשלת בשקט, והבדיקות לא נשענות עליה.
  ANTHROPIC_API_KEY: "local-test-not-a-real-key",
  NEXT_PUBLIC_SQUISH_PARENT_APPROVAL: "1",
};

const current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const has = (k) => current.split("\n").some((l) => l.trim().startsWith(`${k}=`));
const add = Object.entries(want).filter(([k]) => !has(k));
if (!has("VAPID_PUBLIC_KEY")) {
  const keys = await vapid();
  if (keys) add.push(["VAPID_PUBLIC_KEY", keys.publicKey], ["VAPID_PRIVATE_KEY", keys.privateKey]);
}
if (add.length) {
  const block = add.map(([k, v]) => `${k}=${v}`).join("\n");
  writeFileSync(FILE, `${current.replace(/\n*$/, "")}${current ? "\n" : ""}# local-env.mjs — ערכים מקומיים בלבד\n${block}\n`);
  console.log(`  .env.local: נוספו ${add.length} ערכים מקומיים`);
}
