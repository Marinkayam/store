import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { randomSlug, randomToken } from "@/lib/slug";
import { normalizePhone } from "@/lib/phone";

// GET — רשימת חנויות · POST — יצירת חנות עם claim_token · PATCH — שינוי סטטוס

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const db = supabaseAdmin();
  const { data } = await db
    .from("stores")
    .select("id, slug, display_name, emoji, status, parent_email, claim_token, media_bytes, created_at")
    .order("created_at", { ascending: false });
  return NextResponse.json({ stores: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  let body: { displayName?: string; parentName?: string; parentPhone?: string; parentEmail?: string; contactPhone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const displayName = body.displayName?.trim().slice(0, 40);
  if (!displayName) return NextResponse.json({ error: "לחנות צריך שם" }, { status: 400 });

  const contactPhone = normalizePhone(body.contactPhone ?? "") ?? "972500000000";
  const parentPhone = normalizePhone(body.parentPhone ?? "") ?? contactPhone;

  const db = supabaseAdmin();
  const claimToken = randomToken();

  const { data: store, error } = await db
    .from("stores")
    .insert({
      slug: randomSlug(),
      display_name: displayName,
      contact_phone: contactPhone,
      parent_name: body.parentName?.trim().slice(0, 60) || "—",
      parent_phone: parentPhone,
      parent_email: body.parentEmail?.trim().toLowerCase() || "",
      claim_token: claimToken,
      status: "paused", // עד שהחנות נתבעת היא לא פומבית
    })
    .select("id, slug")
    .single();

  if (error || !store) return NextResponse.json({ error: "משהו השתבש" }, { status: 500 });
  return NextResponse.json({ slug: store.slug, claimToken });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  let body: { storeId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!body.storeId || !["active", "paused", "blocked"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();
  await db.from("stores").update({ status: body.status }).eq("id", body.storeId);
  return NextResponse.json({ ok: true });
}
