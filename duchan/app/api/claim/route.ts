import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/claim  { token, email, password }
// לחנויות שנוצרו ע"י אדמין: הלינק החד-פעמי מגדיר בעלות וסיסמה.

export async function POST(req: NextRequest) {
  let body: { token?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { token, email, password } = body;
  if (!token || !email || !password || password.length < 6) {
    return NextResponse.json({ error: "חסרים פרטים — סיסמה של 6 תווים לפחות" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, owner_id")
    .eq("claim_token", token)
    .maybeSingle();

  if (!store || store.owner_id) {
    return NextResponse.json({ error: "הלינק הזה כבר לא בתוקף" }, { status: 404 });
  }

  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    return NextResponse.json(
      { error: "לא הצלחנו ליצור חשבון — אולי האימייל כבר רשום" },
      { status: 409 }
    );
  }

  await db
    .from("stores")
    .update({ owner_id: created.user.id, parent_email: email.toLowerCase(), claim_token: null })
    .eq("id", store.id);

  return NextResponse.json({ ok: true });
}
