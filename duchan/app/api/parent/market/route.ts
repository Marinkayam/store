import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";

/**
 * POST /api/parent/market { slug, t, approve } — ההורה מאשר (או לא) שהדוכן
 * ייכנס לשוק של העיר (0077). מי שמחזיק את הלינק עם הטוקן הוא ההורה.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; t?: string; approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("id").eq("slug", String(body.slug ?? "").slice(0, 40)).maybeSingle();
  if (!store || !checkParentToken(store.id, body.t)) {
    return NextResponse.json({ error: "הלינק לא תקין. אפשר לבקש שישלחו אותו שוב" }, { status: 403 });
  }
  const { data: m } = await db.from("community_members").select("status").eq("store_id", store.id).maybeSingle();
  if (!m || m.status === "left") return NextResponse.json({ error: "אין בקשה שמחכה. אפשר לבקש מהילדים לבחור עיר שוב" }, { status: 404 });
  if (m.status !== "parent") return NextResponse.json({ ok: true, state: m.status });

  const now = new Date().toISOString();
  await db
    .from("community_members")
    .update(body.approve ? { status: "active", parent_approved_at: now, joined_at: now, updated_at: now } : { status: "left", updated_at: now })
    .eq("store_id", store.id);
  return NextResponse.json({ ok: true, state: body.approve ? "active" : "none" });
}
