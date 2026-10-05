import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isRange, loadStats } from "@/lib/stats-server";

// GET /api/admin/stats?range=today|7|30 — "מי מסתכל" על כל הדוכנים יחד (0062). מנהלת בלבד.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const range = req.nextUrl.searchParams.get("range") ?? "today";
  if (!isRange(range)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  try {
    return NextResponse.json(await loadStats(supabaseAdmin(), null, range));
  } catch (e) {
    console.error("[admin/stats]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "לא הצלחנו לטעון" }, { status: 500 });
  }
}
