import { NextRequest, NextResponse } from "next/server";
import { sendSms, smsConfigured } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/sms-status?key=<CRON_SECRET>[&to=05XXXXXXXX]
//
// אבחון לשליחת הסמס. קיים כי כשהסמס שבור אי אפשר להיכנס לחמ"ל — הכניסה
// עצמה היא בסמס — ולכן נקודה שמוגנת באדמין הייתה חסרת תועלת בדיוק ברגע
// שצריך אותה. ההגנה היא CRON_SECRET, שכבר קיים ואינו נמצא אצל אף אחת חוץ
// מהמנהלת.
//
// לא מוחזר כאן שום ערך של משתנה סביבה — רק אם הוא קיים ומה הספק ענה.

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  }

  const present = (v?: string) => (v && v.trim().length > 0 ? "✓ קיים" : "✗ חסר");
  const env = {
    SMS4FREE_KEY: present(process.env.SMS4FREE_KEY),
    SMS4FREE_USER: present(process.env.SMS4FREE_USER),
    SMS4FREE_PASS: present(process.env.SMS4FREE_PASS),
    SMS4FREE_SENDER: present(process.env.SMS4FREE_SENDER),
    SUPABASE_SERVICE_ROLE_KEY: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ADMIN_PHONES: present(process.env.ADMIN_PHONES),
  };

  // הכתיבה ל-DB היא השלב שלפני הספק, ורוב התקלות יושבות דווקא בה: טבלה
  // שהמיגרציה לא רצה עליה, או מפתח service role שגוי. בודקים אותה ממש —
  // כותבים שורה ומוחקים אותה — כי "הטבלה קיימת" לא אומר "אפשר לכתוב אליה".
  let db: string;
  try {
    const admin = supabaseAdmin();
    const probe = `probe-${Math.random().toString(36).slice(2, 10)}`;
    const { error: wErr } = await admin.from("phone_otps").insert({
      phone: probe,
      code_hash: "probe",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    if (wErr) {
      db = `✗ כתיבה נכשלה — ${wErr.message}`;
    } else {
      await admin.from("phone_otps").delete().eq("phone", probe);
      db = "✓ כתיבה וקריאה עובדות";
    }
  } catch (e) {
    db = `✗ אין חיבור ל-DB — ${(e as Error).message}`;
  }

  if (db.startsWith("✗")) {
    return NextResponse.json({
      ok: false,
      env,
      db,
      diagnosis:
        "הבעיה היא בדאטהבייס ולא בסמס. אם כתוב שהטבלה לא קיימת — להריץ את המיגרציה בסופרבייס. אם כתוב הרשאה — לבדוק את SUPABASE_SERVICE_ROLE_KEY בוורסל.",
    });
  }

  if (!smsConfigured()) {
    return NextResponse.json({
      ok: false,
      env,
      db,
      diagnosis:
        "חסרים משתני סביבה. בוורסל: Settings → Environment Variables, לסמן Production, ואז Deployments → Redeploy. בלי Redeploy השינוי לא נכנס לתוקף.",
    });
  }

  // אורך המספר נחשף ולא המספר עצמו, כדי שאפשר יהיה לזהות ערך שהודבק שגוי
  const senderLen = (process.env.SMS4FREE_SENDER || process.env.SMS4FREE_USER || "").trim().length;

  const to = req.nextUrl.searchParams.get("to");
  if (!to) {
    return NextResponse.json({
      ok: true,
      env,
      db,
      senderLength: senderLen,
      next: "להוסיף &to=05XXXXXXXX לכתובת כדי לשלוח הודעת בדיקה אמיתית",
    });
  }

  const phone = normalizePhone(to);
  if (!phone) return NextResponse.json({ ok: false, env, error: "המספר לא תקין" }, { status: 400 });

  const res = await sendSms(phone, "בדיקה מדוכן ✓ אם קיבלת את זה, שליחת הסמס עובדת.");
  return NextResponse.json({
    ok: res.ok,
    env,
    db,
    senderLength: senderLen,
    provider: res.ok ? "נשלח" : res.reason,
    providerCode: res.ok ? null : res.code ?? null,
    diagnosis: res.ok
      ? "עובד. אם ההודעה לא הגיעה — בדקי חסימת פרסומות אצל המפעיל."
      : res.code === -1
        ? "המפתח, שם המשתמש או הסיסמה שגויים. שימי לב ש-SMS4FREE_USER הוא מספר הנייד שאיתו נרשמת לספק, לא אימייל."
        : res.code === -2
          ? "אין יתרת הודעות בחשבון אצל הספק."
          : res.code === -4
            ? "שדה השולח לא מאושר. עם ההודעות החינמיות הוא חייב להיות מספר הנייד שאיתו נרשמת."
            : "ראי את הודעת הספק למעלה.",
  });
}
