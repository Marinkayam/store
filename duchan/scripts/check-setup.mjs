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
  "ADMIN_EMAILS",
  "CRON_SECRET",
];
const OPTIONAL = [
  "NEXT_PUBLIC_ACTIVATION_PRICE",
  "NEXT_PUBLIC_OWNER_WHATSAPP",
  "ANTHROPIC_API_KEY",
];

for (const key of REQUIRED) {
  process.env[key] ? ok(`env ${key}`) : bad(`env ${key}`, "חסר ב-.env.local");
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
      ? ok("כל עמודות stores קיימות (מיגרציות 0001–0010)")
      : bad("עמודות חסרות ב-stores", `${(await r.text()).slice(0, 200)} → הריצי scripts/migrate.mjs`);
  } catch (e) {
    bad("בדיקת עמודות נכשלה", e.message);
  }

  for (const table of ["products", "orders", "store_views", "announcements"]) {
    try {
      const r = await rest(`${table}?select=*&limit=1`);
      r.ok ? ok(`טבלה ${table}`) : bad(`טבלה ${table}`, `${r.status}`);
    } catch (e) {
      bad(`טבלה ${table}`, e.message);
    }
  }

  // פונקציות ה-DB שהאפליקציה קוראת להן
  for (const fn of ["place_order", "mark_order_paid", "cancel_order", "bump_store_view", "bump_ref_click", "use_ai_credit", "claim_store_payment"]) {
    try {
      const r = await rest(`rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      // 404 = הפונקציה לא קיימת. כל קוד אחר (400 על ארגומנטים חסרים) אומר שהיא שם.
      r.status === 404
        ? bad(`פונקציה ${fn}`, "לא קיימת — מיגרציה חסרה")
        : ok(`פונקציה ${fn}`);
    } catch (e) {
      bad(`פונקציה ${fn}`, e.message);
    }
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
  console.log(`${r.ok ? "✓" : "✗"}  ${r.name}${r.detail ? " — " + r.detail : ""}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} בדיקות עברו.`);
if (failed.length) {
  console.log("\nמה לתקן:");
  failed.forEach((f) => console.log(`  • ${f.name}: ${f.detail || "ראי למעלה"}`));
  process.exit(1);
}
console.log("הכל מחובר. אפשר לעלות לאוויר 🚀");
