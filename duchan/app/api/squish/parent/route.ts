import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { squishCode, PARENT_APPROVAL_VERSION, parentApprovalEnabled } from "@/lib/squish";
import { SITE_URL } from "@/lib/site";

/**
 * אישור הורה חד-פעמי — **מאחורי דגל**, כבוי כברירת מחדל.
 *
 * זה לא בקרת הורים ולא דשבורד להורה. זו הוכחה אחת: ההורה קיבל את
 * המידע על מה שהילדה עושה כאן, ואישר. נשמרת גם גרסת הנוסח שהוצגה לו,
 * כדי שאם הנוסח ישתנה יהיה ברור על מה בדיוק אישרו.
 *
 * כל עוד הדגל כבוי, המסלול מחזיר 404 ותיבת הסימון הקיימת נשארת הדרך
 * היחידה — בדיוק כמו היום.
 */

export async function POST(req: NextRequest) {
  if (!parentApprovalEnabled()) {
    return NextResponse.json({ error: "not enabled" }, { status: 404 });
  }

  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: { parentPhone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const phone = normalizePhone(body.parentPhone ?? "");
  if (!phone) return NextResponse.json({ error: "המספר לא נראה תקין" }, { status: 400 });

  const db = supabaseAdmin();

  // מספר ההורה לא יכול להיות המספר של הילדה עצמה — אחרת "אישור הורה"
  // הוא רק לחיצה נוספת שלה.
  const { data: mine } = await db
    .from("phone_accounts")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (mine?.phone === phone) {
    return NextResponse.json({ error: "זה המספר שלך. צריך מספר של הורה." }, { status: 400 });
  }

  const token = squishCode(24);
  const { error } = await db.from("squish_parent_approvals").insert({
    user_id: user.id,
    token,
    parent_phone: phone,
    copy_version: PARENT_APPROVAL_VERSION,
  });
  if (error) {
    console.error("[squish] parent approval insert failed:", error.message);
    return NextResponse.json({ error: "לא הצלחנו לשלוח, לנסות שוב" }, { status: 500 });
  }

  const { data: prof } = await db
    .from("squish_profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  const res = await sendSms(
    phone,
    `${prof?.nickname ?? "הילדה שלך"} פתחה אוסף בסקוויש קלאב. ` +
      `כדי לאשר או לא לאשר: ${SITE_URL}/squish/parent/${token}`
  );
  if (!res.ok) {
    console.error("[squish] parent sms failed:", res.reason);
    return NextResponse.json({ error: "לא הצלחנו לשלוח את ההודעה" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/** ההחלטה עצמה — נכתבת דרך הטוקן בלבד, לא מהחשבון של הילדה. */
export async function PATCH(req: NextRequest) {
  if (!parentApprovalEnabled()) {
    return NextResponse.json({ error: "not enabled" }, { status: 404 });
  }

  let body: { token?: string; approved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.token || typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("squish_parent_approvals")
    .select("id, decided_at")
    .eq("token", body.token)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "הקישור לא נמצא" }, { status: 404 });
  if (row.decided_at) return NextResponse.json({ ok: true, already: true });

  const { error } = await db
    .from("squish_parent_approvals")
    .update({ approved: body.approved, decided_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) return NextResponse.json({ error: "לא הצלחנו לשמור" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
