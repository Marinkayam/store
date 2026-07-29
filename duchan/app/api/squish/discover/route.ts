import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { MIN_ITEMS } from "@/lib/squish";

/**
 * GET /api/squish/discover
 *
 * מחזיר סקווישים פתוחים לטרייד ממי שבמעגל של המשתמשת.
 *
 * הכל מחושב בשרת. אף פעם לא שולחים לדפדפן רשימה רחבה ומסננים אותה שם,
 * ואף פעם לא סומכים על ערך "מי החברות שלי" שהגיע מהלקוח. הסינון נשען
 * על squish_can_view — אותה פונקציה שה-RLS משתמש בה.
 *
 * מה *לא* חוזר: מזהה משתמש, טלפון, עיר מדויקת, גיל. רק כינוי, קוד
 * הגלריה, והפריט עצמו.
 */
export async function GET() {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  const db = supabaseAdmin();

  // אין אוסף משלה, או פחות משלושה — אין כניסה ללגלות
  const { data: mine } = await db
    .from("squish_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mine) return NextResponse.json({ reason: "no-collection" });
  const { count: myItems } = await db
    .from("squish_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", mine.id)
    .is("deleted_at", null);
  if ((myItems ?? 0) < MIN_ITEMS) return NextResponse.json({ reason: "no-collection" });

  // המעגל: חברות ישירות, ובעקיפין חברות שלהן
  const { data: direct } = await db
    .from("squish_connections")
    .select("connected_user_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const directIds = (direct ?? []).map((c) => c.connected_user_id);

  let extendedIds: string[] = [];
  if (directIds.length) {
    const { data: second } = await db
      .from("squish_connections")
      .select("connected_user_id")
      .in("user_id", directIds)
      .eq("status", "active");
    extendedIds = (second ?? [])
      .map((c) => c.connected_user_id)
      .filter((id) => id !== user.id && !directIds.includes(id));
  }

  const candidates = [...new Set([...directIds, ...extendedIds])];
  if (!candidates.length) return NextResponse.json({ circle: false, cards: [] });

  // ההרשאה נבדקת אחת-אחת מול אותה פונקציה שה-RLS משתמש בה
  const allowed: string[] = [];
  for (const owner of candidates) {
    const { data: ok } = await db.rpc("squish_can_view", { p_viewer: user.id, p_owner: owner });
    if (ok === true) allowed.push(owner);
  }
  if (!allowed.length) return NextResponse.json({ circle: true, cards: [] });

  const { data: profiles } = await db
    .from("squish_profiles")
    .select("id, user_id, nickname, collection_code")
    .in("user_id", allowed);
  const byProfile = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: items } = await db
    .from("squish_items")
    .select(
      "id, profile_id, name, squishy_type, custom_type, size, condition, condition_note, wanted_description, image_key, video_key, poster_key, stickers, created_at"
    )
    .in("profile_id", (profiles ?? []).map((p) => p.id))
    .eq("trade_status", "open_for_trade")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  // מה כבר סומן "מעניין אותי", כדי לא להציע שוב את אותו דבר
  const { data: seen } = await db
    .from("squish_interests")
    .select("item_id")
    .eq("user_id", user.id);
  const seenIds = new Set((seen ?? []).map((s) => s.item_id));

  // שמות החברות המשותפות, כדי להסביר *למה* החיבור קיים
  const nickByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname]));
  const { data: theirFriends } = await db
    .from("squish_connections")
    .select("user_id, connected_user_id")
    .in("user_id", allowed)
    .eq("status", "active");

  const cards = (items ?? []).map((it) => {
    const owner = byProfile.get(it.profile_id)!;
    let context = "חברה שלי";
    if (!directIds.includes(owner.user_id)) {
      const via = (theirFriends ?? []).find(
        (f) => f.user_id === owner.user_id && directIds.includes(f.connected_user_id)
      );
      const viaName = via ? nickByUser.get(via.connected_user_id) : null;
      context = viaName ? `חברה של ${viaName}` : "חברה של חברה";
    }
    const { profile_id: _p, ...item } = it;
    return {
      item,
      owner: { nickname: owner.nickname, code: owner.collection_code },
      context,
      interested: seenIds.has(it.id),
    };
  });

  return NextResponse.json({ circle: true, cards });
}
