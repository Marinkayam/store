import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isLocalityId, localityName } from "@/lib/localities";

// ערים לבדיקה (מיגרציות 0070, 0072).
//
// העיר הייתה פעם טקסט חופשי. מה שזוהה בוודאות כבר מופה לרשימת היישובים.
// מה שלא (שגיאת כתיב, שכונה, שני מקומות, או משהו שאינו עיר) נשאר בלי עיר
// ומחכה כאן להחלטה של המנהלת. לא מנחשים, ולא מוחקים את הטקסט הישן.
//
// GET                                — הדוכנים שמחכים לבדיקה
// PATCH { storeId, cityId }          — לבחור עיר מהרשימה
// PATCH { storeId, leaveEmpty: true } — להשאיר בלי עיר

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const { data, error } = await supabaseAdmin()
    .from("stores")
    .select("id, slug, display_name, emoji, avatar_key, city, activated_at, created_at")
    .is("city_id", null)
    .is("city_reviewed_at", null)
    .not("city", "is", null)
    .order("activated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  // המיגרציה עוד לא רצה: אין רשימה, ולא שגיאה על המסך
  if (error) return NextResponse.json({ items: [] });
  const items = (data ?? [])
    .filter((s) => (s.city ?? "").trim() !== "")
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.display_name,
      emoji: s.emoji,
      avatar_key: s.avatar_key,
      oldText: s.city as string,
      published: !!s.activated_at,
    }));
  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { storeId?: string; cityId?: number; leaveEmpty?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.storeId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const picked = isLocalityId(body.cityId) ? body.cityId : null;
  if (!picked && !body.leaveEmpty) {
    return NextResponse.json({ error: "צריך לבחור עיר מהרשימה, או להשאיר בלי עיר" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("stores")
    // הטקסט הישן (city) נשאר כמו שהוא
    .update({ ...(picked ? { city_id: picked } : {}), city_reviewed_at: new Date().toISOString() })
    .eq("id", body.storeId)
    .select("slug")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "לא נשמר, לנסות שוב" }, { status: 500 });
  revalidatePath(`/s/${data.slug}`);
  return NextResponse.json({ ok: true, city: localityName(picked) });
}
