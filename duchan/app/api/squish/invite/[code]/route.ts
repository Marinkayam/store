import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/squish/invite/[code]
 *
 * מי הזמינה, וכמה יש לה — כדי שמסך ההצטרפות יראה הזמנה אמיתית ולא
 * "קוד". מחזיר כינוי וספירות בלבד: אין כאן מספר טלפון, עיר, גיל או
 * מזהה משתמש, כי הדף הזה פתוח לכל מי שיש לו את הקישור.
 *
 * הקריאה גם סופרת לחיצה, וזה המדד שמבדיל בין קישור ששותף לבין הצטרפות.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^[a-z0-9]{4,16}$/i.test(code)) {
    return NextResponse.json({ error: "קוד לא תקין" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: invite } = await db
    .from("squish_invites")
    .select("inviter_user_id")
    .eq("code", code)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "ההזמנה לא נמצאה" }, { status: 404 });

  const { data: profile } = await db
    .from("squish_profiles")
    .select("id, nickname")
    .eq("user_id", invite.inviter_user_id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "ההזמנה לא נמצאה" }, { status: 404 });

  const { count: items } = await db
    .from("squish_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .is("deleted_at", null);
  const { count: open } = await db
    .from("squish_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .eq("trade_status", "open_for_trade");

  await db.rpc("squish_invite_click", { p_code: code });

  return NextResponse.json({ nickname: profile.nickname, items: items ?? 0, open: open ?? 0 });
}
