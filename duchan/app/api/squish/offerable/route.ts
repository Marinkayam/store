import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/squish/offerable?item=<requestedId>
 *
 * הפריטים שהמשתמשת יכולה להציע, והפריט שהיא מבקשת. פריט לא חייב להיות
 * מסומן "פתוח לטרייד" כדי שהיא תציע אותו — זו הבחירה שלה מהאוסף שלה —
 * אבל הוא כן חייב להיות זמין: לא נמחק, לא שמור בטרייד אחר, לא הוחלף
 * ולא עבר לדוכן.
 */
export async function GET(req: Request) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  const requestedId = new URL(req.url).searchParams.get("item");
  if (!requestedId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const db = supabaseAdmin();
  const cols = "id, name, squishy_type, custom_type, size, condition, wanted_description, image_key, video_key, poster_key, trade_status";

  const { data: requested } = await db
    .from("squish_items")
    .select(`${cols}, owner_user_id, profile_id`)
    .eq("id", requestedId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!requested) return NextResponse.json({ error: "הפריט לא נמצא" }, { status: 404 });
  if (requested.owner_user_id === user.id) {
    return NextResponse.json({ error: "זה הסקווישי שלך" }, { status: 400 });
  }
  if (requested.trade_status !== "open_for_trade") {
    return NextResponse.json({ error: "הסקווישי הזה כבר לא פתוח לטרייד" }, { status: 409 });
  }

  const { data: allowed } = await db.rpc("squish_can_view", {
    p_viewer: user.id,
    p_owner: requested.owner_user_id,
  });
  if (allowed !== true) return NextResponse.json({ error: "הפריט לא במעגל שלך" }, { status: 403 });

  const { data: owner } = await db
    .from("squish_profiles")
    .select("nickname, collection_code")
    .eq("user_id", requested.owner_user_id)
    .maybeSingle();

  const { data: wishes } = await db
    .from("squish_wishlist")
    .select("id, profile_id, squishy_type, color, description, sort_order")
    .eq("profile_id", requested.profile_id);

  const { data: mine } = await db
    .from("squish_items")
    .select(cols)
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .not("trade_status", "in", "(reserved,traded,moved_to_duchan)")
    .is("duchan_product_id", null)
    .order("sort_order", { ascending: true });

  const { owner_user_id: _o, profile_id: _p, ...requestedSafe } = requested;
  return NextResponse.json({
    requested: requestedSafe,
    owner: { nickname: owner?.nickname ?? "אספנית", code: owner?.collection_code ?? null },
    wishes: wishes ?? [],
    mine: mine ?? [],
  });
}
