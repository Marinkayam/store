#!/usr/bin/env node
/**
 * בודק שהכל מחובר באמת לפני שעולים לאוויר:
 * משתני סביבה · חיבור ל-Supabase · הרשאות service role · כל המיגרציות · R2 כתיבה+קריאה.
 *
 *   node scripts/check-setup.mjs
 *
 * מריץ מול .env.local. כל כשל מודפס עם מה בדיוק לתקן.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// טוענים .env.local בלי תלות חיצונית
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const results = [];
const ok = (name, detail = "") => results.push({ ok: true, name, detail });
const bad = (name, detail = "") => results.push({ ok: false, name, detail });
const warn = (name, detail = "") => results.push({ warn: true, name, detail });

/* ── 1. משתני סביבה ── */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
  "CRON_SECRET",
  // כתיבה אוטומטית דלוקה לכל החנויות (מיגרציה 0011), ולכן המפתח כבר לא אופציונלי:
  // בלעדיו כל ילדה שתלחץ "כתבי לי תיאור" תקבל שגיאה.
  "ANTHROPIC_API_KEY",
  // הכניסה כולה עוברת בסמס (מיגרציה 0013). בלי אלה אי אפשר להירשם בכלל.
  "SMS4FREE_KEY",
  "SMS4FREE_USER",
  "SMS4FREE_PASS",
];
const OPTIONAL = [
  "NEXT_PUBLIC_ACTIVATION_PRICE",
  "NEXT_PUBLIC_OWNER_WHATSAPP",
  "AI_MODEL",
  "SMS4FREE_SENDER",
];

for (const key of REQUIRED) {
  process.env[key] ? ok(`env ${key}`) : bad(`env ${key}`, "חסר ב-.env.local");
}

// הכניסה בסמס נותנת למשתמשת כתובת פנימית, ולכן ADMIN_EMAILS לבדו כבר לא
// מספיק: מי שנכנסת בטלפון לא תתאים לאף אימייל ותיחסם מהחמ"ל שלה עצמה.
if (!process.env.ADMIN_PHONES && !process.env.ADMIN_EMAILS) {
  bad("env ADMIN_PHONES", "אין אף מנהלת מוגדרת — החמ\"ל יהיה סגור לכולן");
} else if (!process.env.ADMIN_PHONES) {
  warn(
    "ADMIN_PHONES לא מוגדר",
    "הכניסה היא בסמס. בלי המספר שלך ברשימה לא תיכנסי לחמ\"ל אחרי שתתחברי בטלפון."
  );
} else {
  ok("env ADMIN_PHONES");
}
for (const key of OPTIONAL) {
  if (!process.env[key]) console.log(`•  ${key} לא מוגדר (אופציונלי)`);
}

// טעות נפוצה: להדביק את ה-service key בצד הלקוח
if (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  bad("anon key ≠ service role key", "הודבק אותו מפתח בשניהם — ה-service key ידלוף לדפדפן!");
} else if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  ok("anon key ≠ service role key");
}

/* ── 2. Supabase ── */
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (SUPA && SERVICE) {
  const rest = (path, init = {}) =>
    fetch(`${SUPA}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...(init.headers ?? {}) },
    });

  try {
    const r = await rest("stores?select=id&limit=1");
    r.ok ? ok("Supabase מגיב ו-service role קורא stores") : bad("Supabase / stores", `${r.status} ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    bad("Supabase לא נגיש", e.message);
  }

  // כל העמודות שהקוד מסתמך עליהן — זה מה שתופס מיגרציה שלא רצה
  const COLUMNS =
    "id,slug,display_name,emoji,tagline,theme,cover_key,avatar_key,contact_phone,status," +
    "claim_token,media_bytes,ai_enabled,ai_credits,activated_at,payment_claimed_at," +
    "payment_method,payment_ref,payment_amount,payout_bit,payout_paybox,payout_cash," +
    "payout_note,referred_by,referral_source,ref_clicks";
  try {
    const r = await rest(`stores?select=${COLUMNS}&limit=1`);
    r.ok
      ? ok("כל עמודות stores קיימות (כל המיגרציות)")
      : bad("עמודות חסרות ב-stores", `${(await r.text()).slice(0, 200)} → הריצי scripts/migrate.mjs`);
  } catch (e) {
    bad("בדיקת עמודות נכשלה", e.message);
  }

  // עמודות ההזמנה שנוספו אחרי 0019 — buyer_name הוא מה שמקשר בין
  // ההזמנה לשיחה בוואטסאפ, ו-deleted_at הוא מה שמאפשר להוריד מהרשימה
  try {
    const r = await rest("orders?select=id,buyer_note,buyer_phone,buyer_name,owner_note,deleted_at&limit=1");
    r.ok
      ? ok("כל עמודות orders קיימות")
      : bad("עמודות חסרות ב-orders", `${(await r.text()).slice(0, 200)} → הריצי scripts/migrate.mjs`);
  } catch (e) {
    bad("בדיקת עמודות orders נכשלה", e.message);
  }

  /* כל טבלה שהקוד קורא ממנה, כולל סקוויש קלאב. הרשימה הזו והרשימה
     ב-app/api/cron/route.ts צריכות להישאר זהות: מה שלא נבדק כאן גם לא
     מגובה שם. */
  const TABLES = [
    "products", "orders", "store_views", "announcements", "phone_accounts", "admin_phones",
    "squish_profiles", "squish_items", "squish_connections", "squish_invites",
    "squish_interests", "squish_wishlist",
    "squish_trade_proposals", "squish_trade_versions", "squish_trade_version_items",
    "squish_trade_reports",
    "squish_blocks", "squish_item_reports", "squish_feedback", "squish_parent_approvals",
    "squish_admin_actions",
  ];
  for (const table of TABLES) {
    try {
      const r = await rest(`${table}?select=*&limit=1`);
      r.ok ? ok(`טבלה ${table}`) : bad(`טבלה ${table}`, `${r.status}`);
    } catch (e) {
      bad(`טבלה ${table}`, e.message);
    }
  }

  // פונקציות ה-DB שהאפליקציה קוראת להן
  const FUNCTIONS = [
    "place_order", "mark_order_paid", "cancel_order", "bump_store_view", "bump_ref_click",
    "use_ai_credit", "claim_store_payment",
    "squish_join", "squish_send_proposal", "squish_counter_proposal", "squish_approve_version",
    "squish_accept_and_reserve_trade", "squish_cancel_trade", "squish_confirm_completion",
    "squish_report_trade", "squish_ack_parent",
    "squish_block_user", "squish_unblock_user", "squish_remove_connection",
    "squish_delete_profile", "squish_is_blocked", "squish_rate_ok",
  ];
  /* קוראים את מפרט ה-OpenAPI של PostgREST במקום לנסות לקרוא לכל פונקציה.
     ניסיון קריאה עם גוף ריק מחזיר 404 גם לפונקציה *שקיימת*, רק בגלל
     שהארגומנטים לא תואמים לאף חתימה — כלומר הבדיקה הקודמת דיווחה על
     "מיגרציה חסרה" בכל פעם, ולכן אי אפשר היה להאמין לה. */
  try {
    const spec = await (await rest("")).json();
    const paths = Object.keys(spec?.paths ?? {});
    if (!paths.length) throw new Error("מפרט ריק");
    for (const fn of FUNCTIONS) {
      paths.includes(`/rpc/${fn}`)
        ? ok(`פונקציה ${fn}`)
        : bad(`פונקציה ${fn}`, "לא קיימת — מיגרציה חסרה");
    }
  } catch (e) {
    bad("בדיקת הפונקציות נכשלה", e.message);
  }

  /* החתימה עם שם הקונה, במפורש.
     ה-API נופל לחתימה ישנה יותר אם החדשה חסרה, וזה מכוון — עדיף הזמנה
     בלי שם מאשר בלי הזמנה. אבל זה גם אומר שמיגרציה 0029 שלא רצה לא
     תשבור כלום, רק תשתיק את השם. פה תופסים את זה לפני הדיפלוי. */
  try {
    const r = await rest("rpc/place_order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_store: null, p_items: null, p_total: null, p_note: null,
        p_ip_hash: null, p_buyer_phone: null, p_buyer_name: null,
      }),
    });
    r.status === 404
      ? bad("place_order עם שם הקונה", "מיגרציה 0029 לא רצה — הזמנות יישמרו בלי שם")
      : ok("place_order עם שם הקונה (0029)");
  } catch (e) {
    bad("בדיקת place_order עם שם נכשלה", e.message);
  }

  // RLS: anon לא אמור לראות כלום
  try {
    const r = await fetch(`${SUPA}/rest/v1/stores?select=contact_phone&limit=1`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
    });
    const body = await r.json();
    Array.isArray(body) && body.length === 0
      ? ok("RLS: אנונימי לא רואה חנויות")
      : bad("RLS פרוץ!", `אנונימי קיבל ${JSON.stringify(body).slice(0, 120)} — בדקי שה-policies הורצו`);
  } catch (e) {
    bad("בדיקת RLS נכשלה", e.message);
  }
}

/* ── 3. R2 ── */
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    const key = `_healthcheck/${Date.now()}.txt`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: "ok", ContentType: "text/plain" }));
    ok("R2 כתיבה");

    const pub = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
    const r = await fetch(pub);
    r.ok
      ? ok("R2 קריאה פומבית", pub)
      : bad("R2 קריאה פומבית", `${r.status} על ${pub} — הפעילי Public Access על ה-bucket`);

    await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
  } catch (e) {
    bad("R2", e.message);
  }
}

/* ── סיכום ── */
console.log("");
for (const r of results) {
  console.log(`${r.warn ? "!" : r.ok ? "✓" : "✗"}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
}
// אזהרה היא לא כישלון: היא לא מפילה את הבדיקה אבל גם לא נבלעת
const failed = results.filter((r) => !r.ok && !r.warn);
const checked = results.filter((r) => !r.warn);
console.log(`\n${checked.length - failed.length}/${checked.length} בדיקות עברו.`);
if (failed.length) {
  console.log("\nמה לתקן:");
  failed.forEach((f) => console.log(`  • ${f.name}: ${f.detail || "ראי למעלה"}`));
  process.exit(1);
}
console.log("הכל מחובר. אפשר לעלות לאוויר 🚀");
