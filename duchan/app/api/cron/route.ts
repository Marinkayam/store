import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { r2Client } from "@/lib/r2";
import { notifyTelegram } from "@/lib/telegram";

// קרון יומי — GET עם Authorization: Bearer CRON_SECRET.
// ב-Vercel זה מוגדר ב-vercel.json; היא שולחת את הכותרת הזו לבד כשקיים
// משתנה סביבה בשם CRON_SECRET. אפשר גם Cloudflare Worker עם Cron Trigger.
// 1. פינג ל-Supabase — פרויקטים חינמיים מושהים אחרי שבוע ללא פעילות
// 2. ייצוא הדאטהבייס ל-JSON ב-R2 — בתוכנית החינמית אין גיבוי אוטומטי

/**
 * כל טבלה שאובדנה הוא אובדן אמיתי.
 *
 * הרשימה הזו הייתה שלוש טבלאות, ובינתיים נוספו אימות בטלפון וכל סקוויש
 * קלאב — כלומר גיבוי שנראה תקין החזיר בפועל חלק קטן מהמוצר, ובלי
 * phone_accounts אף אחת לא הייתה יכולה להיכנס לדוכן שלה אחרי שחזור.
 * **טבלה חדשה צריכה להיכנס לכאן באותה מיגרציה שיוצרת אותה.**
 *
 * במפורש *לא* כאן: phone_otps ו-sms_outbox (חולפות, וקוד חד-פעמי שפג
 * תוקפו הוא רק סיכון בקובץ), ו-schema_migrations (נגזרת מהקוד).
 */
const TABLES = [
  "stores",
  "products",
  "orders",
  "phone_accounts",
  "admin_phones",
  "announcements",
  "store_views",
  "squish_profiles",
  "squish_items",
  "squish_connections",
  "squish_invites",
  "squish_interests",
  "squish_wishlist",
  "squish_trade_proposals",
  "squish_trade_versions",
  "squish_trade_version_items",
  "squish_trade_reports",
] as const;

/** PostgREST מגביל תשובה בודדת. בלי הדפדוף הזה הגיבוי נקטע בשקט. */
const PAGE = 1000;

type Admin = ReturnType<typeof supabaseAdmin>;

async function dumpTable(db: Admin, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      // טבלה שעוד לא קיימת (דאטהבייס מאחורי הקוד) לא מפילה את שאר הגיבוי,
      // אבל היא כן נספרת ככישלון ומדווחת.
      return { rows, error: error.message };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows };
  }
}

/** משתמשי Auth — בלעדיהם שורת חנות משוחזרת מצביעה על בעלים שלא קיים. */
async function dumpUsers(db: Admin): Promise<{
  users: { id: string; phone: string | null; created_at: string }[];
  error?: string;
}> {
  const users: { id: string; phone: string | null; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { users, error: error.message };
    users.push(
      ...data.users.map((u) => ({ id: u.id, phone: u.phone ?? null, created_at: u.created_at }))
    );
    if (data.users.length < 200) return { users };
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseAdmin();
  const dumps = await Promise.all(TABLES.map((t) => dumpTable(db, t).then((d) => [t, d] as const)));
  const users = await dumpUsers(db);

  const data: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const failed: string[] = [];
  for (const [table, d] of dumps) {
    data[table] = d.rows;
    counts[table] = d.rows.length;
    if (d.error) failed.push(`${table}: ${d.error}`);
  }
  data.auth_users = users.users;
  counts.auth_users = users.users.length;
  if (users.error) failed.push(`auth_users: ${users.error}`);

  const day = new Date().toISOString().slice(0, 10);
  try {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: `_backups/${day}.json`,
        ContentType: "application/json",
        // partial מסומן בקובץ עצמו: מי שמשחזר חייב לדעת שחסר בו משהו,
        // ולא לגלות את זה אחרי שכבר הריץ אותו.
        Body: JSON.stringify({ day, partial: failed.length > 0, failed, counts, ...data }),
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // גיבוי שנכשל בשקט גרוע מאין גיבוי, כי סומכים עליו
    console.error("[cron] backup upload failed:", msg);
    await notifyTelegram(`⚠️ הגיבוי היומי של דוכן נכשל (${day}):\n${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (failed.length) {
    console.error("[cron] partial backup:", failed.join(" | "));
    await notifyTelegram(
      `⚠️ הגיבוי היומי של דוכן (${day}) נכתב חלקי.\nטבלאות שנכשלו:\n${failed.join("\n")}`
    );
  }

  return NextResponse.json({ ok: true, partial: failed.length > 0, failed, counts });
}
