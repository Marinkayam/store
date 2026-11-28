import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { r2Client } from "@/lib/r2";
import { notifyTelegram } from "@/lib/telegram";
import { notifyAdmins } from "@/lib/admin-notify";

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
 * במפורש *לא* כאן: login_events (נשמרת 30 יום ונמחקת למטה), phone_otps ו-sms_outbox (חולפות, וקוד חד-פעמי שפג
 * תוקפו הוא רק סיכון בקובץ), ו-schema_migrations (נגזרת מהקוד).
 */
/* טבלה → מפתח ראשי. הדפדוף חייב סדר קבוע: בלי order, שורה שמתעדכנת בזמן
   הגיבוי יכולה לזוז בין עמודים, ואז היא נכנסת פעמיים או לא נכנסת בכלל. */
const BACKUP: Record<string, string[]> = {
  stores: ["id"],
  products: ["id"],
  orders: ["id"],
  coupons: ["id"],
  phone_accounts: ["phone"],
  store_members: ["store_id", "user_id"],
  store_invites: ["id"],
  kupa_purchases: ["store_id", "item_key"],
  kupa_solved: ["store_id", "riddle_id"],
  store_views: ["store_id", "day"],
  store_stats: ["store_id", "day", "hour", "source"],
  product_stats: ["store_id", "product_id", "day"],
  store_push_subscriptions: ["id"],
  admin_push_subscriptions: ["id"],
  admin_phones: ["phone"],
  announcements: ["id"],
  app_settings: ["key"],
  // רשימת היישובים קטנה, ודוכנים מצביעים עליה: בלעדיה שחזור למסד ריק נכשל
  localities: ["id"],
  // השוק של השכונה (0077)
  neighborhoods: ["id"],
  neighborhood_members: ["store_id"],
  squish_profiles: ["id"],
  squish_items: ["id"],
  squish_connections: ["id"],
  squish_invites: ["id"],
  squish_interests: ["id"],
  squish_wishlist: ["id"],
  squish_trade_proposals: ["id"],
  squish_trade_versions: ["id"],
  squish_trade_version_items: ["version_id", "item_id"],
  squish_trade_reports: ["id"],
  squish_blocks: ["id"],
  squish_item_reports: ["id"],
  squish_feedback: ["id"],
  squish_parent_approvals: ["id"],
  squish_admin_actions: ["id"],
};
const TABLES = Object.keys(BACKUP);

/**
 * טבלאות שבכוונה לא בגיבוי, וכל אחת עם הסיבה. e2e-backup משווה את שתי
 * הרשימות לטבלאות שבמסד: טבלה חדשה שלא מופיעה באחת מהן מפילה את הבדיקה.
 */
const SKIPPED: Record<string, string> = {
  login_events: "יומן כניסות, נמחק אחרי 30 יום",
  phone_otps: "קודים חד-פעמיים שפג תוקפם",
  login_links: "קישורי כניסה חד-פעמיים, נמחקים אחרי 90 יום",
  admin_alerts: "התראות תפעוליות, נמחקות אחרי 90 יום",
  store_presence: "מי בדוכן ברגע זה, מתיישן תוך דקות",
  squish_pilot_tokens: "קישורי פיילוט ישנים, נמחקים אחרי 90 יום",
  squish_write_failures: "יומן תקלות, נמחק אחרי 30 יום",
  app_secrets: "מפתחות. לא שמים סודות בקובץ גיבוי; אפשר להנפיק מחדש",
  schema_migrations: "נגזרת מהקוד",
  sms_outbox: "קיימת רק בסביבת הבדיקות",
};

/** PostgREST מגביל תשובה בודדת. בלי הדפדוף הזה הגיבוי נקטע בשקט. */
const PAGE = 1000;

type Admin = ReturnType<typeof supabaseAdmin>;

async function dumpTable(db: Admin, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select("*");
    for (const col of BACKUP[table] ?? []) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
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
  users: { id: string; email: string | null; phone: string | null; created_at: string }[];
  error?: string;
}> {
  const users: { id: string; email: string | null; phone: string | null; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { users, error: error.message };
    users.push(
      // המייל הוא מה שמזהה את החשבון בכניסה (גם המייל הפנימי {טלפון}@phone.duchan.app);
      // בלעדיו אי אפשר להקים את המשתמש מחדש בשחזור
      ...data.users.map((u) => ({ id: u.id, email: u.email ?? null, phone: u.phone ?? null, created_at: u.created_at }))
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

  /* יומן הכניסות (0063) נשמר 30 יום ואז נמחק. הוא לא נכנס לגיבוי בכוונה:
     מספרי טלפון של ניסיונות כניסה הם בדיוק מה שלא צריך להישמר מעבר למה
     שנחוץ לתמיכה. כישלון כאן (טבלה שעוד לא קיימת) לא עוצר את הגיבוי. */
  await db
    .from("login_events")
    .delete()
    .lt("at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
    .then(({ error }) => {
      if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
        console.error("[cron] login_events purge:", error.message);
      }
    });

  /* שמירה מוגבלת בזמן (מדיניות הפרטיות, סעיף 13): התראות לצוות, קודי SMS,
     קישורי כניסה וקישורי הפיילוט הישנים של הסקוויש — 90 יום; תקלות שמירה בסקוויש — 30 יום. כל אחד לבד,
     כדי שטבלה אחת שנכשלת לא תעצור את השאר ואת הגיבוי. */
  const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();
  await Promise.all(
    ([
      ["admin_alerts", 90],
      ["phone_otps", 90],
      ["login_links", 90],
      ["squish_pilot_tokens", 90],
      ["squish_write_failures", 30],
    ] as const).map(([table, days]) =>
      db
        .from(table)
        .delete()
        .lt("created_at", daysAgo(days))
        .then(({ error }) => {
          if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
            console.error(`[cron] ${table} purge:`, error.message);
          }
        })
    )
  );

  /* תזכורת יומית: מי שסימנו ששילמו ומחכים לאישור יותר מיום. אחת ביום
     (ref = התאריך), עם הוותיק ביותר בכותרת — ב-11.2026 היו כאן שישה דוכנים
     שחיכו עד 86 יום, כי ההתראה הבודדת על כל אחד הלכה לאיבוד. */
  {
    const { data: waiting } = await db
      .from("stores")
      .select("display_name, payment_claimed_at")
      .is("activated_at", null)
      .not("payment_claimed_at", "is", null)
      .lt("payment_claimed_at", new Date(Date.now() - 20 * 3600_000).toISOString())
      .order("payment_claimed_at", { ascending: true });
    if (waiting?.length) {
      const oldest = waiting[0];
      const days = Math.max(1, Math.floor((Date.now() - new Date(oldest.payment_claimed_at!).getTime()) / 86400_000));
      await notifyAdmins({
        kind: "payment_reminder",
        ref: new Date().toISOString().slice(0, 10),
        title: waiting.length === 1 ? "⏰ דוכן אחד מחכה לאישור תשלום" : `⏰ ${waiting.length} דוכנים מחכים לאישור תשלום`,
        body: `הכי ותיק: ${oldest.display_name} — ${days === 1 ? "יום" : `${days} ימים`}. לבדוק בביט / בפייבוקס ולאשר בחמ"ל`,
        url: "/admin",
      }).catch(() => {});
    }
  }

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
        Body: JSON.stringify({ day, format: 2, partial: failed.length > 0, failed, counts, keys: BACKUP, ...data }),
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // גיבוי שנכשל בשקט גרוע מאין גיבוי, כי סומכים עליו
    console.error("[cron] backup upload failed:", msg);
    await notifyTelegram(`⚠️ הגיבוי היומי של דוכן נכשל (${day}):\n${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  /* גיבויים נשמרים 30 יום. יש בהם טלפונים וכתובות משלוח — לא שומרים אותם
     לנצח. רק אחרי שהגיבוי של היום נכתב בהצלחה. */
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);
    const r2 = r2Client();
    const old: { Key: string }[] = [];
    let token: string | undefined;
    do {
      const page = await r2.send(
        new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET!, Prefix: "_backups/", ContinuationToken: token })
      );
      for (const o of page.Contents ?? []) {
        const d = /^_backups\/(\d{4}-\d{2}-\d{2})\.json$/.exec(o.Key ?? "")?.[1];
        if (d && d < cutoff) old.push({ Key: o.Key! });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    for (let i = 0; i < old.length; i += 1000) {
      await r2.send(
        new DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET!, Delete: { Objects: old.slice(i, i + 1000) } })
      );
    }
  } catch (e) {
    console.error("[cron] backup prune failed:", e instanceof Error ? e.message : String(e));
  }

  /* שמירה מוגבלת בזמן של פרטי קונים (מיגרציה 0071).
     רק אחרי שהגיבוי של היום נכתב, ורק אם טבלת ההזמנות נכנסה אליו במלואה:
     מה שנמחק כאן אפשר לשחזר מהגיבוי במשך 30 יום, ואחר כך לא.
     כברירת מחדל זו הרצה "על יבש" שרק סופרת. מחיקה בפועל רק כשבמסד
     app_settings.order_retention_enforce = '1' — מתג שנקבע ידנית אחרי אישור. */
  const retention = await runOrderRetention(db, !failed.some((f) => f.startsWith("orders:")));

  if (failed.length) {
    console.error("[cron] partial backup:", failed.join(" | "));
    await notifyTelegram(
      `⚠️ הגיבוי היומי של דוכן (${day}) נכתב חלקי.\nטבלאות שנכשלו:\n${failed.join("\n")}`
    );
  }

  return NextResponse.json({ ok: true, partial: failed.length > 0, failed, counts, skipped: Object.keys(SKIPPED), retention });
}

/**
 * מריץ את purge_buyer_data ושומר את הדוח ב-app_settings, כדי שאפשר יהיה
 * לראות כל יום מה נמחק (או מה היה נמחק). כישלון כאן לא מפיל את הקרון.
 */
async function runOrderRetention(db: Admin, ordersBackedUp: boolean): Promise<unknown> {
  try {
    const { data: flag, error: flagErr } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "order_retention_enforce")
      .maybeSingle();
    if (flagErr) return { skipped: "not_installed" }; // המיגרציה עוד לא רצה
    // בלי גיבוי תקין של ההזמנות לא מוחקים, גם אם המתג דלוק
    const enforce = flag?.value === "1" && ordersBackedUp;
    const { data, error } = await db.rpc("purge_buyer_data", { p_enforce: enforce });
    if (error) {
      console.error("[cron] order retention:", error.message);
      return { error: error.message };
    }
    const report = { ...(data as Record<string, unknown>), backup_ok: ordersBackedUp };
    await db.from("app_settings").upsert(
      { key: "order_retention_last", value: JSON.stringify(report), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    return report;
  } catch (e) {
    console.error("[cron] order retention failed:", e instanceof Error ? e.message : String(e));
    return { error: "failed" };
  }
}
