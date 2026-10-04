import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";
import { loadKupa } from "@/lib/kupa-server";

// GET /api/kupa?storeId= — קופת הדוכן (lib/kupa.ts), לראש הדוכן ולשותף/ה.
//
// מחושב כאן ולא בדפדפן: הכניסות (store_views) נקראות רק בשרת, וכך גם
// אי אפשר "להוסיף" מטבעות מהקונסול. הקופה שייכת לדוכן ולא לאדם —
// בדוכן משותף שני השותפים רואים אותה מספר.

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId") ?? "";
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "צריך להתחבר" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("*").eq("id", storeId).maybeSingle();
  if (!store || !(await canManage(db, store.id, user.id))) {
    return NextResponse.json({ error: "אין לך גישה לדוכן הזה" }, { status: 403 });
  }

  const k = await loadKupa(db, store);
  // מוצר אחד לחידות החשבון ("‘צמיד קשת’ עולה ₪12…") — שם ומחיר, שגם ככה פומביים
  return NextResponse.json({
    ...k.kupa,
    slug: store.slug,
    name: store.display_name,
    sample: k.sample,
    solved: k.solved,
    owned: k.owned,
    deco: k.deco,
    shopReady: k.shopReady,
  });
}
