import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// עדכונים מהמנהלת לבנות. GET — רשימה · POST — פרסום · DELETE — הסרה.
// הבנות קוראות ישירות מהטבלה (RLS: select לכולן, כתיבה רק דרך כאן).

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const db = supabaseAdmin();
  const { data } = await db.from("announcements").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ announcements: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { title?: string; body?: string; emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const title = body.title?.trim().slice(0, 80);
  const text = body.body?.trim().slice(0, 500);
  if (!title || !text) return NextResponse.json({ error: "צריך כותרת וטקסט" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("announcements")
    .insert({ title, body: text, emoji: (body.emoji ?? "✨").slice(0, 8) })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "משהו השתבש" }, { status: 500 });
  return NextResponse.json({ announcement: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
  const db = supabaseAdmin();
  await db.from("announcements").delete().eq("id", body.id);
  return NextResponse.json({ ok: true });
}
