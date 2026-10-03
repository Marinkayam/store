import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { randomToken } from "@/lib/slug";
import { QUOTAS } from "@/lib/quotas";
import { INVITE_DAYS, MAX_PARTNERS, maskPhone, phoneOf, storeRole } from "@/lib/team";

/**
 * צוות הדוכן (0057).
 *
 * GET  /api/team?storeId=   — מי בצוות, הזמנות פתוחות, העברת ראשות ממתינה
 * POST /api/team { action, storeId, ... }
 *   invite        (ראש)  — phone → הזמנה ל-7 ימים, רק המספר הזה יכול להצטרף
 *   cancel_invite (ראש)  — inviteId
 *   remove        (ראש)  — userId
 *   leave         (שותף) — יוצא/ת מהדוכן
 *   transfer      (ראש)  — userId: מבקש להעביר ראשות; שום דבר לא משתנה עד אישור
 *   cancel_transfer (ראש)
 *   accept_transfer / decline_transfer (מי שהתבקש/ה)
 *   orders_phone  (ראש)  — userId: לאיזה טלפון מגיעות ההזמנות
 *
 * הכל בשרת, עם service role. הטבלאות האלה לא נכתבות מהדפדפן בכלל.
 */

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

async function me() {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  return user;
}

type StoreRow = {
  id: string; owner_id: string; status: string; contact_phone: string; display_name: string;
  transfer_to: string | null; transfer_requested_at: string | null;
};

async function loadStore(db: ReturnType<typeof supabaseAdmin>, storeId: string) {
  const { data } = await db
    .from("stores")
    .select("id, owner_id, status, contact_phone, display_name, transfer_to, transfer_requested_at")
    .eq("id", storeId)
    .maybeSingle();
  return data as StoreRow | null;
}

export async function GET(req: NextRequest) {
  const user = await me();
  if (!user) return err("צריך להתחבר", 401);
  const storeId = req.nextUrl.searchParams.get("storeId") ?? "";
  const db = supabaseAdmin();
  const store = await loadStore(db, storeId);
  if (!store) return err("הדוכן לא נמצא", 404);
  const role = await storeRole(db, store.id, user.id);
  if (!role) return err("אין לך גישה לדוכן הזה", 403);

  const ownerPhone = await phoneOf(db, store.owner_id);
  const { data: members } = await db
    .from("store_members")
    .select("user_id, phone, joined_at")
    .eq("store_id", store.id)
    .order("joined_at", { ascending: true });

  const people = [
    { userId: store.owner_id, role: "owner" as const, phone: maskPhone(ownerPhone), ordersPhone: ownerPhone === store.contact_phone, me: store.owner_id === user.id },
    ...(members ?? []).map((m) => ({
      userId: m.user_id, role: "partner" as const, phone: maskPhone(m.phone), joinedAt: m.joined_at,
      ordersPhone: m.phone === store.contact_phone, me: m.user_id === user.id,
    })),
  ];

  // הזמנות פתוחות — רק ראש הדוכן רואה (והטוקן רק לו)
  let invites: { id: string; phone: string; expiresAt: string; token: string }[] = [];
  if (role === "owner") {
    const { data } = await db
      .from("store_invites")
      .select("id, phone, expires_at, token")
      .eq("store_id", store.id)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    invites = (data ?? []).map((i) => ({ id: i.id, phone: maskPhone(i.phone), expiresAt: i.expires_at, token: i.token }));
  }

  return NextResponse.json({
    role,
    me: user.id,
    people,
    invites,
    maxPartners: MAX_PARTNERS,
    transferTo: store.transfer_to,
  });
}

export async function POST(req: NextRequest) {
  const user = await me();
  if (!user) return err("צריך להתחבר", 401);
  let body: { action?: string; storeId?: string; phone?: string; inviteId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return err("בקשה לא תקינה", 400);
  }
  const db = supabaseAdmin();
  const store = await loadStore(db, body.storeId ?? "");
  if (!store) return err("הדוכן לא נמצא", 404);
  const role = await storeRole(db, store.id, user.id);
  if (!role) return err("אין לך גישה לדוכן הזה", 403);
  if (store.status === "blocked") return err("הדוכן מושבת כרגע", 403);
  const ownerOnly = () => (role === "owner" ? null : err("רק ראש הדוכן יכול לעשות את זה", 403));

  const members = async () =>
    ((await db.from("store_members").select("user_id, phone").eq("store_id", store.id)).data ?? []) as {
      user_id: string; phone: string;
    }[];

  /** מי שיוצא/ת: אם ההזמנות הגיעו לטלפון שלו/ה — חוזרות לראש הדוכן, ובקשת ראשות אליו/ה מתבטלת */
  async function afterLeave(userId: string, phone: string) {
    const patch: Record<string, unknown> = {};
    if (store!.contact_phone === phone) {
      const ownerPhone = await phoneOf(db, store!.owner_id);
      if (ownerPhone) patch.contact_phone = ownerPhone;
    }
    if (store!.transfer_to === userId) {
      patch.transfer_to = null;
      patch.transfer_requested_at = null;
    }
    if (Object.keys(patch).length) await db.from("stores").update(patch).eq("id", store!.id);
  }

  switch (body.action) {
    case "invite": {
      const deny = ownerOnly();
      if (deny) return deny;
      const phone = normalizePhone(body.phone ?? "");
      if (!phone) return err("המספר לא נראה תקין. בודקים ומנסים שוב", 400);
      if (phone === (await phoneOf(db, store.owner_id))) return err("זה המספר שלך 🙂 מזמינים את המספר של השותף/ה", 400);
      const team = await members();
      if (team.some((m) => m.phone === phone)) return err("המספר הזה כבר בצוות", 409);

      const now = new Date();
      const { data: open } = await db
        .from("store_invites")
        .select("id, phone, token, expires_at")
        .eq("store_id", store.id)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      const live = (open ?? []).filter((i) => new Date(i.expires_at) > now);
      // הזמנה פגה שעוד "פתוחה" חוסמת את האינדקס הייחודי — סוגרים אותה
      const stale = (open ?? []).filter((i) => new Date(i.expires_at) <= now).map((i) => i.id);
      if (stale.length) await db.from("store_invites").update({ cancelled_at: now.toISOString() }).in("id", stale);

      const expires = new Date(now.getTime() + INVITE_DAYS * 86400_000).toISOString();
      const same = live.find((i) => i.phone === phone);
      if (same) {
        // אותו מספר שוב — אותה הזמנה, עם תוקף מחודש
        await db.from("store_invites").update({ expires_at: expires }).eq("id", same.id);
        return NextResponse.json({ ok: true, token: same.token, renewed: true });
      }
      if (team.length + live.length >= MAX_PARTNERS) {
        return err(`בדוכן יכולים להיות עד ${MAX_PARTNERS + 1}: ראש הדוכן ושותף/ה אחד/ת`, 409);
      }
      const token = randomToken(24);
      const { error } = await db.from("store_invites").insert({
        store_id: store.id, phone, token, created_by: user.id, expires_at: expires,
      });
      if (error) return err("לא הצלחנו ליצור הזמנה, לנסות שוב", 500);
      return NextResponse.json({ ok: true, token });
    }

    case "cancel_invite": {
      const deny = ownerOnly();
      if (deny) return deny;
      await db
        .from("store_invites")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", body.inviteId ?? "")
        .eq("store_id", store.id)
        .is("accepted_at", null);
      return NextResponse.json({ ok: true });
    }

    case "remove": {
      const deny = ownerOnly();
      if (deny) return deny;
      const target = (await members()).find((m) => m.user_id === body.userId);
      if (!target) return err("השותף/ה כבר לא בצוות", 404);
      await db.from("store_members").delete().eq("store_id", store.id).eq("user_id", target.user_id);
      await afterLeave(target.user_id, target.phone);
      return NextResponse.json({ ok: true });
    }

    case "leave": {
      if (role === "owner") return err("ראש הדוכן לא יכול לצאת. קודם מעבירים את הראשות לשותף/ה", 400);
      const self = (await members()).find((m) => m.user_id === user.id);
      if (!self) return err("כבר לא בצוות", 404);
      await db.from("store_members").delete().eq("store_id", store.id).eq("user_id", user.id);
      await afterLeave(user.id, self.phone);
      return NextResponse.json({ ok: true });
    }

    case "transfer": {
      const deny = ownerOnly();
      if (deny) return deny;
      if (!(await members()).some((m) => m.user_id === body.userId)) return err("אפשר להעביר ראשות רק לשותף/ה בצוות", 400);
      await db
        .from("stores")
        .update({ transfer_to: body.userId, transfer_requested_at: new Date().toISOString() })
        .eq("id", store.id);
      return NextResponse.json({ ok: true });
    }

    case "cancel_transfer": {
      const deny = ownerOnly();
      if (deny) return deny;
      await db.from("stores").update({ transfer_to: null, transfer_requested_at: null }).eq("id", store.id);
      return NextResponse.json({ ok: true });
    }

    case "decline_transfer": {
      if (store.transfer_to !== user.id) return err("אין בקשה כזו", 404);
      await db.from("stores").update({ transfer_to: null, transfer_requested_at: null }).eq("id", store.id);
      return NextResponse.json({ ok: true });
    }

    case "accept_transfer": {
      if (store.transfer_to !== user.id || role !== "partner") return err("אין בקשה כזו", 404);
      // אותה מכסה כמו פתיחת דוכן: עד 3 דוכנים שאני ראש שלהם
      const { count } = await db
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      if ((count ?? 0) >= QUOTAS.storesPerParentEmail) {
        return err(`כבר יש לך ${QUOTAS.storesPerParentEmail} דוכנים שאת/ה ראש שלהם — זה המקסימום`, 409);
      }
      const oldPhone = (await phoneOf(db, store.owner_id)) ?? store.contact_phone;
      const { error } = await db.rpc("team_accept_transfer", {
        p_store: store.id, p_user: user.id, p_old_phone: oldPhone,
      });
      if (error) return err("ההעברה לא הצליחה, לנסות שוב", 409);
      return NextResponse.json({ ok: true });
    }

    case "orders_phone": {
      const deny = ownerOnly();
      if (deny) return deny;
      let phone: string | null = null;
      if (body.userId === store.owner_id) phone = await phoneOf(db, store.owner_id);
      else phone = (await members()).find((m) => m.user_id === body.userId)?.phone ?? null;
      if (!phone) return err("אפשר לבחור רק טלפון של מישהו/י מהצוות", 400);
      await db.from("stores").update({ contact_phone: phone }).eq("id", store.id);
      return NextResponse.json({ ok: true });
    }
  }
  return err("פעולה לא מוכרת", 400);
}
