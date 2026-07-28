import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Trade, TradeItem } from "@/lib/squish-trade";

/**
 * GET /api/squish/trades — כל הטריידים שלי, משני הצדדים.
 *
 * **מספר טלפון לא חוזר מכאן. אף פעם.** גם לא אחרי שהטרייד מוכן — הוא
 * נמסר רק דרך /api/squish/trades/whatsapp, שבודק את המצב מחדש.
 */
const ITEM_COLS =
  "id, name, squishy_type, custom_type, size, condition, image_key, video_key, poster_key";

export async function GET() {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("squish_trade_proposals")
    .select("*")
    .or(`sender_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  const props = rows ?? [];
  if (!props.length) return NextResponse.json({ trades: [] });

  const versionIds = props.map((p) => p.current_version_id).filter(Boolean);
  const { data: vItems } = await db
    .from("squish_trade_version_items")
    .select("version_id, item_id, side")
    .in("version_id", versionIds);

  const itemIds = [...new Set((vItems ?? []).map((v) => v.item_id))];
  const { data: items } = await db.from("squish_items").select(ITEM_COLS).in("id", itemIds);
  const itemById = new Map((items ?? []).map((i) => [i.id, i as TradeItem]));

  const otherIds = [...new Set(props.map((p) => (p.sender_user_id === user.id ? p.receiver_user_id : p.sender_user_id)))];
  const { data: profiles } = await db
    .from("squish_profiles")
    .select("user_id, nickname, collection_code")
    .in("user_id", otherIds);
  const profByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const trades: Trade[] = props.map((p) => {
    const mine = p.sender_user_id === user.id;
    const rowsFor = (vItems ?? []).filter((v) => v.version_id === p.current_version_id);
    const other = profByUser.get(mine ? p.receiver_user_id : p.sender_user_id);
    return {
      id: p.id,
      role: mine ? "sender" : "receiver",
      status: p.status,
      other: { nickname: other?.nickname ?? "אספנית", code: other?.collection_code ?? null },
      connection_context: p.connection_context,
      version_id: p.current_version_id,
      requested: itemById.get(rowsFor.find((v) => v.side === "requested")?.item_id ?? "")!,
      offered: rowsFor
        .filter((v) => v.side === "offered")
        .map((v) => itemById.get(v.item_id)!)
        .filter(Boolean),
      iApproved: !!(mine ? p.accepted_by_sender_at : p.accepted_by_receiver_at),
      theyApproved: !!(mine ? p.accepted_by_receiver_at : p.accepted_by_sender_at),
      iConfirmedDone: !!(mine ? p.completed_by_sender_at : p.completed_by_receiver_at),
      theyConfirmedDone: !!(mine ? p.completed_by_receiver_at : p.completed_by_sender_at),
      parentAck: !!(mine ? p.parent_ack_sender_at : p.parent_ack_receiver_at),
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({ trades: trades.filter((t) => t.requested) });
}
