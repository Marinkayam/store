import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";

/**
 * GET /api/stats/wanted?storeId=… — מוצרים שאזלו ואנשים ניסו לקנות (0075).
 *
 * מרינה, 11.2026 ("תתחיל הכל", סבב 3 סעיף 2): 99 מוצרים אזלו. כשמישהו לוחץ
 * על מוצר שאזל זה נספר, ובעלי הדוכן רואים "3 אנשים רצו את X". בלי שום פרט
 * של מי. 14 הימים האחרונים, רק מוצרים שעדיין אזלו.
 */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId");
  if (!storeId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });
  const db = supabaseAdmin();
  if (!(await canManage(db, storeId, user.id))) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const { data: rows, error } = await db.from("product_stats").select("product_id, wanted").eq("store_id", storeId).gte("day", since).gt("wanted", 0);
  if (error) return NextResponse.json({ items: [] }); // לפני 0075: אין עמודה, אין כרטיס
  const sums = new Map<string, number>();
  for (const r of rows ?? []) sums.set(r.product_id, (sums.get(r.product_id) ?? 0) + Number(r.wanted ?? 0));
  if (!sums.size) return NextResponse.json({ items: [] });
  const { data: prods } = await db
    .from("products")
    .select("id, name, stock, track_stock")
    .in("id", [...sums.keys()])
    .is("deleted_at", null);
  const items = (prods ?? [])
    .filter((p) => p.track_stock && p.stock === 0)
    .map((p) => ({ id: p.id, name: p.name, wanted: sums.get(p.id) ?? 0 }))
    .sort((a, b) => b.wanted - a.wanted)
    .slice(0, 5);
  return NextResponse.json({ items });
}
