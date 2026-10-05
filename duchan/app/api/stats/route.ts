import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";
import { isRange, loadStats } from "@/lib/stats-server";

// GET /api/stats?storeId=…&range=today|7|30 — "מי מסתכל על הדוכן" (0062).
// רק ראש הדוכן או השותף/ה. המונים עצמם של השרת בלבד.

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId");
  const range = req.nextUrl.searchParams.get("range") ?? "today";
  if (!storeId || !isRange(range)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים. צריך להיכנס שוב" }, { status: 401 });
  const db = supabaseAdmin();
  if (!(await canManage(db, storeId, user.id))) return NextResponse.json({ error: "אין גישה לדוכן הזה" }, { status: 403 });

  try {
    return NextResponse.json(await loadStats(db, [storeId], range));
  } catch (e) {
    console.error("[stats]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "לא הצלחנו לטעון את המספרים. לנסות שוב בעוד רגע" }, { status: 500 });
  }
}
