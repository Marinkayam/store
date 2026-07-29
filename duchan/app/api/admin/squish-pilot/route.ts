import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { SITE_URL } from "@/lib/site";
import { randomBytes } from "node:crypto";

/** 32 תווים אקראיים. לא ניתן לניחוש, ולא נגזר משום דבר שאפשר לדעת. */
const randomToken = () => randomBytes(24).toString("base64url");

/**
 * חשבונות פיילוט — מה שהמנהלת צריכה לראות בזמן סשן מלווה.
 *
 * **מה יש כאן ומה בכוונה אין.** יש: האם האונבורדינג הושלם, כמה פריטים
 * נוצרו, כמה כתיבות נכשלו, מתי הייתה שמירה מוצלחת אחרונה, והאם ההורה
 * אישר. אין: תמונות, שמות הפריטים, מספר טלפון, עיר. מסך מעקב אחרי
 * ילדה הוא לא מה שבונים כאן — זה מד לחץ לסשן בדיקה, ותו לא.
 */

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const db = supabaseAdmin();

  const { data: profiles } = await db
    .from("squish_profiles")
    .select("user_id, nickname, pilot_started_at, parent_approved_at, parent_awareness_at, created_at")
    .eq("pilot_user", true)
    .order("pilot_started_at", { ascending: false });

  const rows = [];
  for (const p of profiles ?? []) {
    const [{ count: items }, { count: failures }, lastItem, approval] = await Promise.all([
      db.from("squish_items").select("id", { count: "exact", head: true })
        .eq("owner_user_id", p.user_id).is("deleted_at", null),
      db.from("squish_write_failures").select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id),
      db.from("squish_items").select("created_at")
        .eq("owner_user_id", p.user_id).order("created_at", { ascending: false })
        .limit(1).maybeSingle(),
      db.from("squish_parent_approvals").select("token, sent_at, decided_at, approved")
        .eq("user_id", p.user_id).order("created_at", { ascending: false })
        .limit(1).maybeSingle(),
    ]);

    /* מצב אחד, מחושב בשרת — כדי ששני מסכים לא יגזרו אותו אחרת.
       הסדר הוא סדר הדחיפות: שגיאת שמירה קודמת לכל השאר, כי ילדה
       יושבת עכשיו מול מסך שלא שמר. */
    const status =
      (failures ?? 0) > 0 ? "write_error"
      : p.parent_approved_at ? "approved"
      : (items ?? 0) === 0 ? "onboarding"
      : approval.data?.sent_at ? "awaiting_parent"
      : "building";

    rows.push({
      userId: p.user_id,
      nickname: p.nickname,
      startedAt: p.pilot_started_at,
      // "האונבורדינג הושלם" = יש פרופיל ולפחות פריט אחד. זו ההגדרה
      // היחידה שאפשר למדוד בלי לעקוב אחרי מסכים.
      onboardingCompleted: (items ?? 0) > 0,
      items: items ?? 0,
      failedWrites: failures ?? 0,
      lastSavedAt: lastItem.data?.created_at ?? null,
      status,
      parentApprovedAt: p.parent_approved_at,
      parentRequestSentAt: approval.data?.sent_at ?? null,
      /* קישור ההחלטה של ההורה. מוצג למנהלת כדי שתוכל למסור אותו ביד
         כשהסמס לא הגיע — לא כדי לאשר במקומו. */
      parentLink: approval.data?.token && !approval.data?.decided_at
        ? `${SITE_URL}/squish/parent/${approval.data.token}` : null,
      parentDecision: approval.data?.decided_at ? approval.data.approved : null,
      // ההצהרה של הילדה עצמה, בנפרד מאישור ההורה — שניהם מוצגים כדי
      // שלא יתבלבלו זה בזה
      childDeclaredAt: p.parent_awareness_at,
    });
  }

  return NextResponse.json({ pilots: rows });
}

/** סימון חשבון כפיילוט, ואיפוסו בסוף הבדיקה. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  let body: { action?: string; userId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (body.action !== "link" && !body.userId) {
    return NextResponse.json({ error: "חסר משתמש" }, { status: 400 });
  }

  const db = supabaseAdmin();

  if (body.action === "link") {
    /* קישור חד-פעמי. הילדה פותחת אותו לפני האונבורדינג, והטוקן נצמד
       לחשבון שלה באימות הטלפון — לפני שיש פרופיל, ולכן לפני שיש חלון. */
    const token = randomToken();
    const { error } = await db.from("squish_pilot_tokens").insert({
      token, label: body.label?.slice(0, 40) ?? null, created_by: admin.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, url: `${SITE_URL}/squish/pilot/${token}` });
  }

  if (body.action === "start") {
    const { error } = await db.rpc("squish_pilot_start", {
      p_user: body.userId, p_admin: admin.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset") {
    /* מוחק את כל מה שהילדה בנתה בסקוויש קלאב ומחזיר מה נשאר, כדי
       שיהיה אפשר להוכיח שחשבון הדוכן, החנויות וההזמנות לא נגעו. */
    const { data, error } = await db.rpc("squish_pilot_reset", {
      p_user: body.userId, p_admin: admin.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, result: data });
  }

  return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
}
