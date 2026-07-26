import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/track/ref { slug } — מישהי לחצה "פתחי חנות משלך" מדף החנות הזו.
// לא כל לחיצה הופכת לחנות; ההפרש בין הלחיצות לחנויות בפועל הוא מה שמעניין באדמין.

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
    .select("id, display_name, emoji")
    .eq("slug", body.slug)
    .maybeSingle();
  if (!store) return NextResponse.json({ ok: true, name: null });

  await db.rpc("bump_ref_click", { p_store: store.id });
  // רק שם ואמוג'י — כדי שדף הנחיתה יוכל לומר "הגעת מהחנות של…". שום דבר מעבר.
  return NextResponse.json({ ok: true, name: store.display_name, emoji: store.emoji });
}
