import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";
import { parentToken } from "@/lib/parent-link";
import { isLocalityId } from "@/lib/localities";
import { isAway } from "@/lib/away";
import { redactContacts } from "@/lib/public-text";
import type { HoodStall } from "@/lib/hood";

/**
 * השוק של השכונה (0077).
 *
 * GET  ?storeId=…                  — המצב של הדוכן, ואם הוא בשוק: הדוכנים של השכנים
 * GET  ?storeId=…&cityId=…         — השכונות ביישוב (לבחירה)
 * GET  ?storeId=…&invite=…         — שכונה מהזמנה של שכן (שם ויישוב)
 * POST { storeId, cityId, neighborhoodId | other: true, invitedBy? } — לבקש להיכנס
 * POST { storeId, action: "leave" } — לצאת מהשוק
 *
 * הכול רק למי שמנהל את הדוכן. את השוק רואה רק דוכן שחבר פעיל בו.
 * הכניסה עצמה תמיד באישור הורה (/parent/[slug]/hood).
 */

async function who(req: NextRequest, storeId: string | null) {
  if (!storeId) return { error: NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 }) };
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "לא מחוברים" }, { status: 401 }) };
  const db = supabaseAdmin();
  if (!(await canManage(db, storeId, user.id))) return { error: NextResponse.json({ error: "אין גישה" }, { status: 403 }) };
  return { db };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const storeId = q.get("storeId");
  const w = await who(req, storeId);
  if (w.error) return w.error;
  const db = w.db!;

  // השכונות ביישוב, לבחירה. רק שמות.
  const cityId = Number(q.get("cityId"));
  if (q.get("cityId")) {
    if (!isLocalityId(cityId)) return NextResponse.json({ items: [] });
    const { data, error } = await db.from("neighborhoods").select("id, name").eq("locality_id", cityId).order("name");
    return NextResponse.json({ items: error ? [] : data ?? [] });
  }

  const invite = q.get("invite");
  if (invite) {
    if (!/^[0-9a-f-]{36}$/.test(invite)) return NextResponse.json({ hood: null });
    const { data } = await db.from("neighborhoods").select("id, name, locality_id").eq("id", invite).maybeSingle();
    return NextResponse.json({ hood: data ? { id: data.id, name: data.name, cityId: data.locality_id } : null });
  }

  const { data: store } = await db.from("stores").select("id, slug, city_id").eq("id", storeId!).maybeSingle();
  if (!store) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const { data: m, error } = await db.from("neighborhood_members").select("*").eq("store_id", store.id).maybeSingle();
  if (error) return NextResponse.json({ state: "none", cityId: store.city_id ?? null, unavailable: true });
  const parentPath = `/parent/${store.slug}/hood?t=${parentToken(store.id)}`;
  if (!m || m.status === "left") return NextResponse.json({ state: "none", cityId: store.city_id ?? null, parentPath });

  let hood: { id: string; name: string } | null = null;
  if (m.neighborhood_id) {
    const { data } = await db.from("neighborhoods").select("id, name").eq("id", m.neighborhood_id).maybeSingle();
    hood = data ?? null;
  }
  const base = { state: m.status, cityId: m.locality_id, hood, requestedName: m.requested_name, parentPath };
  if (m.status !== "active" || !hood) return NextResponse.json(base);

  return NextResponse.json({ ...base, stalls: await stallsOf(db, hood.id, store.id) });
}

/** הדוכנים בשוק: רק חברים פעילים, דוכנים פתוחים, שדות ציבוריים בלבד */
async function stallsOf(db: ReturnType<typeof supabaseAdmin>, hoodId: string, me: string): Promise<HoodStall[]> {
  const { data: members } = await db
    .from("neighborhood_members")
    .select("store_id, joined_at")
    .eq("neighborhood_id", hoodId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(200);
  const ids = (members ?? []).map((r) => r.store_id as string);
  if (!ids.length) return [];
  const full = await db
    .from("stores")
    .select("id, slug, display_name, emoji, avatar_key, status, activated_at, away, away_until")
    .in("id", ids);
  // לפני 0076 (חופשה): בלי עמודות החופשה
  const stores: Record<string, unknown>[] | null = full.error
    ? (await db.from("stores").select("id, slug, display_name, emoji, avatar_key, status, activated_at").in("id", ids)).data
    : full.data;
  const open = new Map(
    (stores ?? [])
      .filter((s) => s.status === "active" && (s.activated_at || s.id === me))
      .map((s) => [s.id as string, s as Record<string, unknown>])
  );
  const { data: prods } = await db
    .from("products")
    .select("store_id, name, price, image_key, sort_order, created_at")
    .in("store_id", [...open.keys()])
    .is("deleted_at", null)
    .or("is_visible.is.null,is_visible.eq.true")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000);
  const by = new Map<string, HoodStall["products"]>();
  for (const p of prods ?? []) {
    const list = by.get(p.store_id) ?? [];
    if (list.length < 3) list.push({ name: redactContacts(p.name as string), price: p.price as number, image_key: (p.image_key as string) || null });
    by.set(p.store_id, list);
  }
  return ids
    .filter((id) => open.has(id))
    .map((id) => {
      const s = open.get(id)!;
      return {
        slug: s.slug as string,
        name: redactContacts(s.display_name as string) || "דוכן",
        emoji: (s.emoji as string) ?? null,
        avatar_key: (s.avatar_key as string) ?? null,
        away: isAway(s as { away?: boolean; away_until?: string }),
        mine: id === me,
        products: by.get(id) ?? [],
      };
    });
}

export async function POST(req: NextRequest) {
  let body: { storeId?: string; cityId?: number; neighborhoodId?: string; other?: boolean; invitedBy?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const w = await who(req, body.storeId ?? null);
  if (w.error) return w.error;
  const db = w.db!;
  const storeId = body.storeId!;
  const now = new Date().toISOString();

  if (body.action === "leave") {
    await db.from("neighborhood_members").update({ status: "left", updated_at: now }).eq("store_id", storeId);
    return NextResponse.json({ ok: true, state: "none" });
  }

  if (!isLocalityId(body.cityId)) return NextResponse.json({ error: "צריך לבחור עיר מהרשימה" }, { status: 400 });
  let hoodId: string | null = null;
  if (!body.other) {
    if (!body.neighborhoodId) return NextResponse.json({ error: "צריך לבחור שכונה" }, { status: 400 });
    const { data: h } = await db.from("neighborhoods").select("id, locality_id").eq("id", body.neighborhoodId).maybeSingle();
    if (!h || h.locality_id !== body.cityId) return NextResponse.json({ error: "השכונה לא נמצאה" }, { status: 400 });
    hoodId = h.id;
  }
  let invitedBy: string | null = null;
  if (body.invitedBy) {
    const { data: inv } = await db.from("stores").select("id").eq("slug", String(body.invitedBy).slice(0, 40)).maybeSingle();
    if (inv && inv.id !== storeId) invitedBy = inv.id;
  }

  const { data: store } = await db.from("stores").select("id, slug, city_id").eq("id", storeId).maybeSingle();
  if (!store) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const { error } = await db.from("neighborhood_members").upsert(
    {
      store_id: storeId,
      locality_id: body.cityId,
      neighborhood_id: hoodId,
      requested_name: null,
      status: "parent",
      invited_by: invitedBy,
      parent_approved_at: null,
      joined_at: null,
      updated_at: now,
    },
    { onConflict: "store_id" }
  );
  if (error) return NextResponse.json({ error: "לא הצלחנו לשמור. אפשר לנסות שוב" }, { status: 500 });
  // דוכן בלי עיר מקבל את העיר שבחרו כאן (אותה רשימה רשמית)
  if (!store.city_id) await db.from("stores").update({ city_id: body.cityId }).eq("id", storeId);
  return NextResponse.json({ ok: true, state: "parent", parentPath: `/parent/${store.slug}/hood?t=${parentToken(store.id)}` });
}
