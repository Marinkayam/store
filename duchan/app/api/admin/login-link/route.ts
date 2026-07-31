import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

// POST /api/admin/login-link { phone } — קישור כניסה חד-פעמי לילדה.
//
// קיים כי סמס הוא ערוץ שביר: סינון תכנים בחבילות של ילדים בולע את
// הקודים, והילדה נשארת בחוץ. המנהלת מייצרת קישור ושולחת לה אותו
// בוואטסאפ — ערוץ שתמיד עובד — והקישור פותח סשן לאותו חשבון טלפון,
// כך ששום דבר לא נמחק ולא נפתח חשבון כפול.

const LINK_TTL_HOURS = 24;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return NextResponse.json({ error: "המספר לא נראה תקין" }, { status: 400 });
  }

  /* base64url של 24 בייטים אקראיים — 32 תווים, לא ניתן לניחוש */
  const token = randomBytes(24).toString("base64url");
  const db = supabaseAdmin();

  /* ילדה שעוד אין לה פרופיל סקוויש = ילדה שמנסה את המוצר. מצמידים
     לקישור טוקן פיילוט, כדי שברגע שתיכנס היא תסומן — תופיע בחמ"ל,
     ואישור ההורה יחול עליה — בדיוק כמו במסלול קישור-פיילוט + סמס. */
  let pilotToken: string | null = null;
  const { data: acct } = await db.from("phone_accounts").select("user_id").eq("phone", phone).maybeSingle();
  const { data: prof } = acct
    ? await db.from("squish_profiles").select("id").eq("user_id", acct.user_id).maybeSingle()
    : { data: null };
  if (!prof) {
    pilotToken = "trial-" + randomBytes(12).toString("base64url");
    const { error: ptErr } = await db.from("squish_pilot_tokens").insert({
      token: pilotToken,
      label: `כניסה בלי סמס · ${phone.slice(-4)}`,
      created_by: admin.email,
    });
    /* אם טבלת הפיילוט חסרה — הקישור עדיין נוצר, רק בלי הסימון */
    if (ptErr) pilotToken = null;
  }

  const { error } = await db.from("login_links").insert({
    token,
    phone,
    created_by: admin.email,
    expires_at: new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    ...(pilotToken ? { pilot_token: pilotToken } : {}),
  });
  if (error) {
    // הטבלה עוד לא קיימת בפרודקשן? אומרים למנהלת מה להריץ, לא "שגיאה"
    return NextResponse.json(
      { error: `יצירת הקישור נכשלה: ${error.message}. אם הטבלה חסרה — להריץ את מיגרציה 0041.` },
      { status: 500 }
    );
  }

  const origin = req.nextUrl.origin;
  return NextResponse.json({
    url: `${origin}/enter/${token}`,
    phone,
    expiresHours: LINK_TTL_HOURS,
  });
}
