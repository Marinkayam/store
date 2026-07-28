import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/phone";

// GET /api/admin/enroll?key=<CRON_SECRET>&phone=05XXXXXXXX
//
// רישום ראשוני של מנהלת. קיים כי הכניסה עברה לסמס, והזיהוי הסתמך על משתנה
// סביבה — וכשהוא חסר, המנהלת נעולה מחוץ לחמ"ל שלה בלי שום דרך לפתוח אותו
// מבפנים: כדי להיכנס צריך להיות מנהלת.
//
// שתי הגנות, לא אחת:
// 1. CRON_SECRET — סוד שקיים רק אצלה.
// 2. הרישום הפתוח עובד רק כשהרשימה ריקה (bootstrap). מרגע שיש מנהלת אחת,
//    הוספה נוספת דורשת גם session של מנהלת. כך סוד שדלף לא הופך לדלת אחורית
//    קבועה — הוא שווה כלום אחרי הרישום הראשון.

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: existing, error: listErr } = await db.from("admin_phones").select("phone");
  if (listErr) {
    return NextResponse.json(
      { error: `אין גישה לטבלה, ${listErr.message}`, hint: "להריץ את מיגרציה 0017 בסופרבייס" },
      { status: 500 }
    );
  }

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") ?? "");
  if (!phone) {
    // בלי מספר זו בקשת מצב: כמה מנהלות רשומות, בלי לחשוף את המספרים
    return NextResponse.json({
      admins: existing?.length ?? 0,
      next:
        (existing?.length ?? 0) === 0
          ? "להוסיף &phone=05XXXXXXXX כדי לרשום את עצמך"
          : "כבר רשומה הנהלה. הוספה נוספת דורשת להיות מחוברים כמנהלים.",
    });
  }

  if ((existing?.length ?? 0) > 0 && !(await requireAdmin())) {
    return NextResponse.json(
      { error: "כבר רשומה הנהלה. להיכנס לחמ\"ל ורק אז להוסיף עוד אחד." },
      { status: 403 }
    );
  }

  const { error } = await db
    .from("admin_phones")
    .upsert({ phone, note: "נרשם דרך enroll" }, { onConflict: "phone" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    // המספר לא מוחזר במלואו — הדף הזה נפתח בדפדפן והכתובת נשמרת בהיסטוריה
    enrolled: `…${phone.slice(-4)}`,
    next: "להיכנס עם המספר הזה דרך /login, ואז /admin נפתח.",
  });
}

export const GET = handle;
export const POST = handle;
