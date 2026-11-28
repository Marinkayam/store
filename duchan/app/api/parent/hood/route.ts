import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";
import { notifyAdmins } from "@/lib/admin-notify";
import { cleanHoodName, hoodKey } from "@/lib/hood";
import { localityName } from "@/lib/localities";

/**
 * POST /api/parent/hood { slug, t, approve, name? } — ההורה מאשר (או לא)
 * שהדוכן ייכנס לשוק של השכונה (0077). מי שמחזיק את הלינק עם הטוקן הוא ההורה.
 *
 * השכונה מהרשימה → הדוכן בשוק מיד.
 * "לא ברשימה" → ההורה כותב שם. אם הוא זהה לשכונה שכבר קיימת ביישוב (אותו
 * מפתח), נכנסים אליה. אחרת זה מחכה לאישור בחמ"ל, ורק שם נוצרת שכונה.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; t?: string; approve?: boolean; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("id, slug, display_name").eq("slug", String(body.slug ?? "").slice(0, 40)).maybeSingle();
  if (!store || !checkParentToken(store.id, body.t)) {
    return NextResponse.json({ error: "הלינק לא תקין. אפשר לבקש שישלחו אותו שוב" }, { status: 403 });
  }
  const { data: m } = await db.from("neighborhood_members").select("*").eq("store_id", store.id).maybeSingle();
  if (!m || m.status === "left") return NextResponse.json({ error: "אין בקשה שמחכה. אפשר לבקש מהילדים לבחור שכונה שוב" }, { status: 404 });
  if (m.status !== "parent") return NextResponse.json({ ok: true, state: m.status });

  const now = new Date().toISOString();
  if (!body.approve) {
    await db.from("neighborhood_members").update({ status: "left", updated_at: now }).eq("store_id", store.id);
    return NextResponse.json({ ok: true, state: "none" });
  }

  if (m.neighborhood_id) {
    await db
      .from("neighborhood_members")
      .update({ status: "active", parent_approved_at: now, joined_at: now, updated_at: now })
      .eq("store_id", store.id);
    return NextResponse.json({ ok: true, state: "active" });
  }

  const name = cleanHoodName(String(body.name ?? ""));
  const key = hoodKey(name);
  if (key.length < 2) return NextResponse.json({ error: "צריך לכתוב את שם השכונה" }, { status: 400 });
  const { data: same } = await db.from("neighborhoods").select("id").eq("locality_id", m.locality_id).eq("name_key", key).maybeSingle();
  if (same) {
    await db
      .from("neighborhood_members")
      .update({ neighborhood_id: same.id, status: "active", parent_approved_at: now, joined_at: now, updated_at: now })
      .eq("store_id", store.id);
    return NextResponse.json({ ok: true, state: "active" });
  }
  await db
    .from("neighborhood_members")
    .update({ requested_name: name, status: "review", parent_approved_at: now, updated_at: now })
    .eq("store_id", store.id);
  after(() =>
    notifyAdmins({
      kind: "hood_review",
      ref: `${store.id}:${key}`,
      title: "שכונה חדשה לבדיקה",
      body: `${name}, ${localityName(m.locality_id) ?? ""} · ${store.display_name}`,
      url: "/admin#hoods",
    })
  );
  return NextResponse.json({ ok: true, state: "review" });
}
