import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/parent  { token, status: 'active'|'paused' }
// הטוקן (שנשלח ב-SMS להורה) הוא ההרשאה. blocked שמור לאדמין בלבד.

export async function POST(req: NextRequest) {
  let body: { token?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { token, status } = body;
  if (!token || !status || !["active", "paused"].includes(status)) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, status")
    .eq("parent_token", token)
    .maybeSingle();

  if (!store) return NextResponse.json({ error: "לינק לא בתוקף" }, { status: 404 });
  if (store.status === "blocked") {
    return NextResponse.json({ error: "החנות הושבתה על ידי הנהלת דוכן" }, { status: 403 });
  }

  await db.from("stores").update({ status }).eq("id", store.id);
  return NextResponse.json({ ok: true });
}
