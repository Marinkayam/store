import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { notifyAdmins } from "@/lib/admin-notify";

// POST /api/auth/sms/help { phone } — "לא קיבלתי קוד".
//
// מסמנים את בקשת הקוד האחרונה של המספר (מהשעה האחרונה) כבקשת עזרה,
// והמנהלת מקבלת פוש. בחמ"ל המספר עולה לראש "לא מצליחים להיכנס", ומשם
// שולחים קישור כניסה בוואטסאפ.
//
// אפשר ללחוץ רק אחרי שנשלח קוד למספר הזה — אחרת זה כפתור שמקפיץ התראות
// למנהלת על כל מספר שמישהו מקליד. לחיצה שנייה לא שולחת פוש שני.

const WINDOW_MINUTES = 60;

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "המספר לא נראה תקין" }, { status: 400 });

  const db = supabaseAdmin();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data: otp } = await db
    .from("phone_otps")
    .select("id, created_at, help_requested_at, consumed_at")
    .eq("phone", phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp) return NextResponse.json({ error: "קודם שולחים קוד למספר הזה" }, { status: 404 });
  if (otp.consumed_at) return NextResponse.json({ ok: true, already: true });

  if (!otp.help_requested_at) {
    const { error } = await db.from("phone_otps").update({ help_requested_at: new Date().toISOString() }).eq("id", otp.id);
    if (error) {
      console.error("[sms/help] update:", error.message);
      return NextResponse.json({ error: "לא הצלחנו לשלוח. אפשר לנסות שוב בעוד רגע." }, { status: 500 });
    }
    const { data: store } = await db
      .from("stores")
      .select("display_name")
      .eq("contact_phone", phone)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    after(() =>
      notifyAdmins({
        kind: "login_stuck",
        ref: `help:${otp.id}`,
        title: "🆘 לא קיבלו קוד",
        body: `${displayPhone(phone)}${store ? ` · ${store.display_name}` : ""} לחצו "לא קיבלתי קוד". אפשר לשלוח קישור כניסה בוואטסאפ`,
        url: "/admin",
      })
    );
  }
  return NextResponse.json({ ok: true });
}
