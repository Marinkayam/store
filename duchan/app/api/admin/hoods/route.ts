import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { localityName } from "@/lib/localities";
import { cleanHoodName, hoodKey } from "@/lib/hood";

/**
 * שכונות לבדיקה (0077). אין רשימה רשמית ארצית של שכונות, אז שכונה חדשה
 * נוצרת רק כאן: הורה כתב שם, והמנהלת מאשרת אותו, מאחדת עם שכונה שכבר
 * קיימת ביישוב, או דוחה.
 *
 * GET                                          — בקשות שמחכות, והשכונות הקיימות
 * PATCH { storeId, action: "create", name }    — שכונה חדשה (בשם שנבחר) והדוכן בפנים
 * PATCH { storeId, action: "merge", hoodId }   — זו שכונה שכבר קיימת
 * PATCH { storeId, action: "reject" }          — לא שכונה
 */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("neighborhood_members")
    .select("store_id, locality_id, requested_name, updated_at")
    .eq("status", "review")
    .order("updated_at", { ascending: true });
  if (error) return NextResponse.json({ items: [], hoods: [] }); // לפני 0077
  const ids = (rows ?? []).map((r) => r.store_id);
  const { data: stores } = ids.length
    ? await db.from("stores").select("id, slug, display_name").in("id", ids)
    : { data: [] as { id: string; slug: string; display_name: string }[] };
  const byId = new Map((stores ?? []).map((s) => [s.id, s]));
  const { data: hoods } = await db.from("neighborhoods").select("id, name, locality_id").order("name");
  const { data: active } = await db.from("neighborhood_members").select("neighborhood_id").eq("status", "active");
  const count = new Map<string, number>();
  for (const a of active ?? []) if (a.neighborhood_id) count.set(a.neighborhood_id, (count.get(a.neighborhood_id) ?? 0) + 1);
  return NextResponse.json({
    items: (rows ?? []).map((r) => ({
      storeId: r.store_id,
      slug: byId.get(r.store_id)?.slug ?? "",
      store: byId.get(r.store_id)?.display_name ?? "",
      cityId: r.locality_id,
      city: localityName(r.locality_id) ?? "",
      name: r.requested_name ?? "",
    })),
    hoods: (hoods ?? []).map((h) => ({ id: h.id, name: h.name, cityId: h.locality_id, city: localityName(h.locality_id) ?? "", stalls: count.get(h.id) ?? 0 })),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { storeId?: string; action?: string; name?: string; hoodId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: m } = await db.from("neighborhood_members").select("*").eq("store_id", String(body.storeId ?? "")).maybeSingle();
  if (!m || m.status !== "review") return NextResponse.json({ error: "הבקשה כבר טופלה" }, { status: 409 });
  const now = new Date().toISOString();

  if (body.action === "reject") {
    await db.from("neighborhood_members").update({ status: "rejected", updated_at: now }).eq("store_id", m.store_id);
    return NextResponse.json({ ok: true });
  }

  let hoodId: string | null = null;
  if (body.action === "merge") {
    const { data: h } = await db.from("neighborhoods").select("id, locality_id").eq("id", String(body.hoodId ?? "")).maybeSingle();
    if (!h || h.locality_id !== m.locality_id) return NextResponse.json({ error: "השכונה לא באותו יישוב" }, { status: 400 });
    hoodId = h.id;
  } else if (body.action === "create") {
    const name = cleanHoodName(String(body.name ?? m.requested_name ?? ""));
    const key = hoodKey(name);
    if (key.length < 2) return NextResponse.json({ error: "צריך שם" }, { status: 400 });
    const { data: same } = await db.from("neighborhoods").select("id").eq("locality_id", m.locality_id).eq("name_key", key).maybeSingle();
    if (same) hoodId = same.id;
    else {
      const { data: made, error } = await db.from("neighborhoods").insert({ locality_id: m.locality_id, name, name_key: key }).select("id").single();
      if (error || !made) return NextResponse.json({ error: "לא הצלחנו ליצור את השכונה" }, { status: 500 });
      hoodId = made.id;
    }
  } else return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  await db
    .from("neighborhood_members")
    .update({ neighborhood_id: hoodId, status: "active", joined_at: now, updated_at: now })
    .eq("store_id", m.store_id);
  return NextResponse.json({ ok: true, hoodId });
}
