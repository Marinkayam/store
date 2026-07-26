import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/track { slug } — ספירת כניסה לחנות. beacon מהדפדפן, פעם אחת לביקור.

export async function POST(req: NextRequest) {
  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ ok: false }, { status: 400 });

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id")
    .eq("slug", body.slug)
    .eq("status", "active")
    .maybeSingle();
  if (store) await db.rpc("bump_store_view", { p_store: store.id });

  return NextResponse.json({ ok: true });
}
