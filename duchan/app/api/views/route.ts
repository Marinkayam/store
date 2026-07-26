import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/views?slug= — סה"כ כניסות לחנות, לבעלת החנות בלבד.
// store_views אין עליה policy ציבורי, ולכן הקריאה עוברת דרך השרת.

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ views: 0 });

  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ views: 0 }, { status: 401 });

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!store || store.owner_id !== user.id) {
    return NextResponse.json({ views: 0 }, { status: 403 });
  }

  const { data } = await db.from("store_views").select("views").eq("store_id", store.id);
  return NextResponse.json({ views: (data ?? []).reduce((s, v) => s + v.views, 0) });
}
