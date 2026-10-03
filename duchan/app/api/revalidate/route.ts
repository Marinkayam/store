import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";

// POST /api/revalidate { slug } — מרעננת את דף החנות אחרי שינוי.
// בלי זה, שינוי ערכה/שם/מצב חופשה לוקח עד 60 שניות להופיע לקונות,
// והילדה פותחת את הלינק שלה ורואה גרסה ישנה.

export async function POST(req: NextRequest) {
  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ ok: false }, { status: 400 });

  // רק בעלת החנות (או אדמין דרך service role) יכולה לרענן — לא נקודת DoS
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id")
    .eq("slug", body.slug)
    .maybeSingle();
  // ראש הדוכן או שותף/ה (0057)
  if (!store || !(await canManage(db, store.id, user.id))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  revalidatePath(`/s/${body.slug}`);
  return NextResponse.json({ ok: true });
}
