import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/squish/friends
 *
 * הגלריות של החברות שלי: כינוי, קוד גלריה, כמה יש וכמה פתוחים לטרייד.
 * בלי מזהי משתמש, בלי טלפונים, בלי עיר.
 */
export async function GET() {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: conns } = await db
    .from("squish_connections")
    .select("connected_user_id, connection_type, invited_by_user_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  const ids = (conns ?? []).map((c) => c.connected_user_id);
  if (!ids.length) return NextResponse.json({ friends: [] });

  const { data: profiles } = await db
    .from("squish_profiles")
    .select("id, user_id, nickname, collection_code, updated_at")
    .in("user_id", ids);

  const friends = [];
  for (const p of profiles ?? []) {
    const { count: items } = await db
      .from("squish_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", p.id)
      .is("deleted_at", null);
    const { count: open } = await db
      .from("squish_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", p.id)
      .is("deleted_at", null)
      .eq("trade_status", "open_for_trade");
    const conn = (conns ?? []).find((c) => c.connected_user_id === p.user_id);
    friends.push({
      nickname: p.nickname,
      code: p.collection_code,
      items: items ?? 0,
      open: open ?? 0,
      context: conn?.invited_by_user_id === user.id ? "הצטרפה דרך הקישור שלך" : "חברה שלי",
    });
  }

  return NextResponse.json({ friends });
}
