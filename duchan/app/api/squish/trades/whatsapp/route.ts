import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { itemLine, type TradeItem } from "@/lib/squish-trade";

/**
 * POST /api/squish/trades/whatsapp { proposalId }
 *
 * זו הנקודה **היחידה** במערכת שבה מספר טלפון של אספנית אחרת יוצא
 * מהשרת, והיא נפתחת רק כשכל התנאים מתקיימים:
 *   1. המבקשת היא צד בטרייד
 *   2. הטרייד במצב ready_for_whatsapp — כלומר הפריטים כבר שמורים
 *   3. שני הצדדים אישרו את הגרסה הנוכחית
 *   4. המבקשת סימנה שההורה יודע
 *
 * המצב נקרא מחדש מהדאטהבייס בכל קריאה. שום ערך שהגיע מהדפדפן לא נבדק
 * ולא נאמן — גם לא "הטרייד מוכן".
 */
export async function POST(req: Request) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: { proposalId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.proposalId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: p } = await db
    .from("squish_trade_proposals")
    .select("*")
    .eq("id", body.proposalId)
    .maybeSingle();

  if (!p || (p.sender_user_id !== user.id && p.receiver_user_id !== user.id)) {
    return NextResponse.json({ error: "הטרייד לא נמצא" }, { status: 404 });
  }
  if (p.status !== "ready_for_whatsapp") {
    return NextResponse.json({ error: "הטרייד עוד לא מוכן לתיאום" }, { status: 409 });
  }
  if (!p.accepted_by_sender_at || !p.accepted_by_receiver_at) {
    return NextResponse.json({ error: "שתי הצדדים צריכות לאשר" }, { status: 409 });
  }
  const mine = p.sender_user_id === user.id;
  const parentAck = mine ? p.parent_ack_sender_at : p.parent_ack_receiver_at;
  if (!parentAck) {
    return NextResponse.json({ error: "קודם מסמנים שההורה יודע" }, { status: 409 });
  }

  /* חשבון פיילוט בלי אישור הורה אמיתי לא מגיע לוואטסאפ, גם אם סימנה
     את התיבה. התיבה היא הצהרה שלה; זה אישור שההורה באמת נתן. */
  const { data: gate } = await db.rpc("squish_pilot_gate", { p_user: user.id });
  if (gate !== "ok") {
    return NextResponse.json(
      { error: "צריך אישור של הורה לפני תיאום בוואטסאפ" },
      { status: 409 }
    );
  }

  const otherId = mine ? p.receiver_user_id : p.sender_user_id;

  // המספר הוא זה שאומת בסמס בחשבון דוכן — אין מספר נפרד לסקוויש
  const { data: acct } = await db
    .from("phone_accounts")
    .select("phone")
    .eq("user_id", otherId)
    .maybeSingle();
  if (!acct?.phone) {
    return NextResponse.json({ error: "לא מצאנו מספר לתיאום" }, { status: 404 });
  }

  const { data: vItems } = await db
    .from("squish_trade_version_items")
    .select("item_id, owner_user_id, side")
    .eq("version_id", p.current_version_id);
  const { data: items } = await db
    .from("squish_items")
    .select("id, name, squishy_type, custom_type, size, condition, image_key, video_key, poster_key")
    .in("id", (vItems ?? []).map((v) => v.item_id));
  const byId = new Map((items ?? []).map((i) => [i.id, i as TradeItem]));

  const mineLines = (vItems ?? [])
    .filter((v) => v.owner_user_id === user.id)
    .map((v) => byId.get(v.item_id))
    .filter(Boolean)
    .map((i) => `• ${itemLine(i as TradeItem)}`);
  const theirLines = (vItems ?? [])
    .filter((v) => v.owner_user_id === otherId)
    .map((v) => byId.get(v.item_id))
    .filter(Boolean)
    .map((i) => `• ${itemLine(i as TradeItem)}`);

  const text =
    `היי, סגרנו טרייד בסקוויש קלאב:\n\n` +
    `אני מביאה:\n${mineLines.join("\n")}\n\n` +
    `את מביאה:\n${theirLines.join("\n")}\n\n` +
    `בואי נסגור מקום וזמן בידיעת ההורים.`;

  return NextResponse.json({
    url: `https://wa.me/${acct.phone}?text=${encodeURIComponent(text)}`,
  });
}
