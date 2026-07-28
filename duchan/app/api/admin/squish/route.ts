import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * מודרציה של סקוויש קלאב.
 *
 * **הדיווחים לא יוצאים מכאן לשום מקום אחר.** אין endpoint ציבורי שמחזיר
 * אותם, ואין policy ב-RLS שנותן למי שדווח עליו לראות אותם — הטבלה
 * נקראת כאן עם service role, אחרי requireAdmin.
 *
 * מה החמ"ל מקבל: דיווחים פתוחים, חשבונות עם יותר מדיווח אחד, טריידים
 * ששמורים הרבה זמן ולא נסגרו, ויומן הפעולות של המנהלת.
 */

/** טרייד ששמור יותר מזה ולא נסגר — כנראה תקוע. */
const STUCK_HOURS = 72;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = supabaseAdmin();

  const [tradeReports, itemReports, stuck, actions, profiles] = await Promise.all([
    db.from("squish_trade_reports").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("squish_item_reports").select("*").order("created_at", { ascending: false }).limit(200),
    db
      .from("squish_trade_proposals")
      .select("id, sender_user_id, receiver_user_id, status, reserved_at, updated_at, requested_item_id")
      .eq("status", "ready_for_whatsapp")
      .lt("reserved_at", new Date(Date.now() - STUCK_HOURS * 3600_000).toISOString())
      .order("reserved_at", { ascending: true })
      .limit(100),
    db.from("squish_admin_actions").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("squish_profiles").select("user_id, nickname, collection_code, suspended_at, suspended_reason, completed_trades"),
  ]);

  const nickBy = new Map(
    (profiles.data ?? []).map((p) => [p.user_id, { nickname: p.nickname, code: p.collection_code }])
  );
  const who = (id: string | null) =>
    (id && nickBy.get(id)?.nickname) || (id ? "אספנית שנמחקה" : "—");

  // כמה שמורים בכל טרייד תקוע, כדי שיהיה ברור מה ישתחרר
  const stuckIds = (stuck.data ?? []).map((s) => s.id);
  const { data: held } = stuckIds.length
    ? await db
        .from("squish_items")
        .select("id, name, trade_status, pre_reserve_status, reserved_by_proposal_id, owner_user_id")
        .in("reserved_by_proposal_id", stuckIds)
    : { data: [] };

  const reports = [
    ...(tradeReports.data ?? []).map((r) => ({
      kind: "trade" as const,
      id: r.id,
      targetId: r.proposal_id,
      reporter: who(r.reported_by_user_id),
      reported: who(r.reported_user_id),
      reportedUser: r.reported_user_id,
      reason: r.reason,
      details: r.details,
      state: r.state ?? "open",
      admin_note: r.admin_note ?? null,
      created_at: r.created_at,
    })),
    ...(itemReports.data ?? []).map((r) => ({
      kind: "item" as const,
      id: r.id,
      targetId: r.item_id,
      reporter: who(r.reporter_user_id),
      reported: who(r.reported_user_id),
      reportedUser: r.reported_user_id,
      reason: r.reason,
      details: r.details,
      state: r.state ?? "open",
      admin_note: r.admin_note ?? null,
      created_at: r.created_at,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // חשבונות עם יותר מדיווח אחד — מה שמצדיק מבט, לא ענישה אוטומטית
  const tally = new Map<string, number>();
  for (const r of reports) if (r.reportedUser) tally.set(r.reportedUser, (tally.get(r.reportedUser) ?? 0) + 1);
  const repeat = [...tally.entries()]
    .filter(([, n]) => n > 1)
    .map(([uid, n]) => ({
      user_id: uid,
      nickname: nickBy.get(uid)?.nickname ?? "אספנית שנמחקה",
      code: nickBy.get(uid)?.code ?? null,
      reports: n,
      suspended: !!(profiles.data ?? []).find((p) => p.user_id === uid)?.suspended_at,
    }))
    .sort((a, b) => b.reports - a.reports);

  return NextResponse.json({
    reports,
    repeat,
    stuck: (stuck.data ?? []).map((s) => ({
      id: s.id,
      sender: who(s.sender_user_id),
      receiver: who(s.receiver_user_id),
      reserved_at: s.reserved_at,
      items: (held ?? [])
        .filter((i) => i.reserved_by_proposal_id === s.id)
        .map((i) => ({
          name: i.name,
          now: i.trade_status,
          back_to: i.pre_reserve_status ?? (i.id === s.requested_item_id ? "open_for_trade" : "keep"),
        })),
    })),
    accounts: (profiles.data ?? [])
      .filter((p) => p.suspended_at)
      .map((p) => ({
        user_id: p.user_id,
        nickname: p.nickname,
        code: p.collection_code,
        suspended_at: p.suspended_at,
        reason: p.suspended_reason,
      })),
    actions: (actions.data ?? []).map((a) => ({ ...a, target: who(a.target_user) })),
  });
}

type Body = {
  action?: "suspend" | "restore" | "cancel_trade" | "report_state";
  userId?: string;
  proposalId?: string;
  reportId?: string;
  kind?: "trade" | "item";
  state?: "open" | "reviewed" | "resolved";
  note?: string;
};

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = supabaseAdmin();

  switch (body.action) {
    case "suspend": {
      if (!body.userId) return NextResponse.json({ error: "bad request" }, { status: 400 });
      const { error } = await db.rpc("squish_admin_suspend", {
        p_user: body.userId,
        p_reason: body.note?.slice(0, 300) ?? null,
        p_admin: admin.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "restore": {
      if (!body.userId) return NextResponse.json({ error: "bad request" }, { status: 400 });
      const { error } = await db.rpc("squish_admin_restore", {
        p_user: body.userId,
        p_admin: admin.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "cancel_trade": {
      if (!body.proposalId) return NextResponse.json({ error: "bad request" }, { status: 400 });
      const { error } = await db.rpc("squish_admin_cancel_trade", {
        p_proposal: body.proposalId,
        p_note: body.note?.slice(0, 300) ?? null,
        p_admin: admin.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "report_state": {
      if (!body.reportId || !body.state || !body.kind) {
        return NextResponse.json({ error: "bad request" }, { status: 400 });
      }
      const table = body.kind === "trade" ? "squish_trade_reports" : "squish_item_reports";
      const { error } = await db
        .from(table)
        .update({
          state: body.state,
          reviewed_at: body.state === "open" ? null : new Date().toISOString(),
          admin_note: body.note?.slice(0, 300) ?? null,
        })
        .eq("id", body.reportId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await db.from("squish_admin_actions").insert({
        admin_label: admin.email,
        action: `report_${body.state}`,
        target_id: body.reportId,
        note: body.note?.slice(0, 300) ?? null,
      });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
