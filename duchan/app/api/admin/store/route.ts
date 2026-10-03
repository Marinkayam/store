import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parsePrice } from "@/lib/money";

// GET ?id= — תיק חנות מלא: כל המוצרים (כולל מחוקים — כלום לא נמחק באמת),
// הזמנות אחרונות, כניסות לפי יום.
// PATCH { productId, action } — restore · delete · hide · show · edit.
// גם "delete" כאן הוא רך: deleted_at, לא DELETE. המנהלת לא יכולה למחוק
// באמת מוצר של ילדה, גם לא בטעות — היא רק מוציאה אותו מהחנות.

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

  const db = supabaseAdmin();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [store, products, orders, views, team] = await Promise.all([
    db.from("stores").select("*").eq("id", id).maybeSingle(),
    db.from("products").select("*").eq("store_id", id).order("created_at", { ascending: true }),
    db.from("orders").select("*").eq("store_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("store_views").select("day, views").eq("store_id", id).gte("day", twoWeeksAgo).order("day"),
    // צוות הדוכן (0057). שגיאה (הטבלה עוד לא קיימת) = בלי צוות, לא תיק שנופל
    db.from("store_members").select("user_id, phone, joined_at").eq("store_id", id).order("joined_at"),
  ]);

  if (!store.data) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  // הסיכומים שהחמ"ל מציג (מסע, הכנסות) מחושבים כאן ולא בלקוח —
  // בלעדיהם המסע בתיק החנות נראה נעול גם כשהיא כבר מכרה.
  const prods = products.data ?? [];
  const ords = orders.data ?? [];
  const sold = ords.filter((o) => o.status === "paid" || o.status === "delivered");
  const viewsTotal = (views.data ?? []).reduce((sum, v) => sum + v.views, 0);

  return NextResponse.json({
    store: {
      ...store.data,
      products: prods.filter((p) => !p.deleted_at).length,
      deletedProducts: prods.filter((p) => p.deleted_at).length,
      ordersTotal: ords.length,
      ordersNew: ords.filter((o) => o.status === "sent").length,
      ordersPaid: sold.length,
      revenue: sold.reduce((sum, o) => sum + o.total, 0),
      viewsTotal,
    },
    products: prods,
    orders: ords,
    views: views.data ?? [],
    team: team.error ? [] : team.data ?? [],
  });
}

interface PatchBody {
  productId?: string;
  action?: "restore" | "delete" | "hide" | "show" | "edit";
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  trackStock?: boolean;
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();

  /* החמ"ל מחליף ראש דוכן (0057) — למשל כשהצוות לא מסכים. אותה פעולה
     אטומית כמו העברה רגילה, רק בלי לחכות לאישור. */
  const team = body as { action?: string; storeId?: string; userId?: string };
  if (team.action === "make_head") {
    const { data: st } = await db.from("stores").select("id, owner_id, contact_phone").eq("id", team.storeId ?? "").maybeSingle();
    if (!st) return NextResponse.json({ error: "הדוכן לא נמצא" }, { status: 404 });
    const { data: oldPhone } = await db.from("phone_accounts").select("phone").eq("user_id", st.owner_id).limit(1).maybeSingle();
    await db.from("stores").update({ transfer_to: team.userId, transfer_requested_at: new Date().toISOString() }).eq("id", st.id);
    const { error } = await db.rpc("team_accept_transfer", {
      p_store: st.id, p_user: team.userId, p_old_phone: oldPhone?.phone ?? st.contact_phone,
    });
    if (error) {
      await db.from("stores").update({ transfer_to: null, transfer_requested_at: null }).eq("id", st.id);
      return NextResponse.json({ error: "ההחלפה נכשלה — אולי כבר לא בצוות" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  const { productId, action } = body;
  if (!productId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // רשימה סגורה של פעולות. לא בונים patch מהגוף — אחרת אפשר לשלוח
  // store_id ולהעביר מוצר בין חנויות.
  let patch: Record<string, unknown>;
  switch (action) {
    case "restore":
      patch = { deleted_at: null };
      break;
    case "delete":
      patch = { deleted_at: new Date().toISOString() };
      break;
    case "hide":
      patch = { is_visible: false };
      break;
    case "show":
      patch = { is_visible: true };
      break;
    case "edit": {
      patch = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 40);
      if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 120) || null;
      if (Number.isFinite(body.price)) patch.price = parsePrice(body.price as number) ?? 0;
      if (Number.isFinite(body.stock)) patch.stock = Math.max(0, Math.floor(body.stock as number));
      if (typeof body.trackStock === "boolean") patch.track_stock = body.trackStock;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
      }
      break;
    }
    default:
      return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { data: prod, error } = await db
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select("id, store_id")
    .maybeSingle();
  if (error || !prod) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  // מרעננים מכאן ולא דרך /api/revalidate — אותה נקודה דורשת שהמבקשת תהיה
  // בעלת החנות, והמנהלת איננה. בלי זה היא מסתירה מוצר ורואה אותו עוד דקה בלינק.
  const { data: store } = await db.from("stores").select("slug").eq("id", prod.store_id).maybeSingle();
  if (store?.slug) revalidatePath(`/s/${store.slug}`);

  return NextResponse.json({ ok: true, slug: store?.slug ?? null });
}
