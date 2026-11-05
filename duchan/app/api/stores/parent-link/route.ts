import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parentPath } from "@/lib/parent-link";

// GET /api/stores/parent-link?storeId=… — הלינק האישי להורה (lib/parent-link.ts).
// RLS על stores: רק מי שמנהל/ת את הדוכן מקבל/ת את הלינק שלו.
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId");
  if (!storeId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });
  const { data: store } = await supa.from("stores").select("id, slug").eq("id", storeId).maybeSingle();
  if (!store) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({ path: parentPath(store.slug, store.id) });
}
