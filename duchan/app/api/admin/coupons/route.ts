import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { draftToRow, type CouponDraft } from "@/lib/coupons";

// קופונים מהחמ"ל. המנהלת יוצרת ומנהלת קופונים לכל חנות.
// GET   ?storeId=                         — הקופונים של החנות
// POST  { storeId, draft }                — קופון חדש (created_by = admin)
// PATCH { id, active } | { id, remove }   — כיבוי/הפעלה, או מחיקה רכה
// אותה בדיקת טופס כמו אצל המוכרת (draftToRow), כדי ששני הצדדים יסכימו.

async function revalidateStore(db: ReturnType<typeof supabaseAdmin>, storeId: string) {
  const { data } = await db.from("stores").select("slug").eq("id", storeId).maybeSingle();
  if (data?.slug) revalidatePath(`/s/${data.slug}`);
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const storeId = req.nextUrl.searchParams.get("storeId");
  if (!storeId) return NextResponse.json({ error: "חסר storeId" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("coupons")
    .select("*")
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "הקופונים עוד לא זמינים", coupons: [] }, { status: 200 });
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { storeId?: string; draft?: CouponDraft };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.storeId || !body.draft) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const r = draftToRow(body.draft);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("coupons").insert({ ...r.row, store_id: body.storeId, created_by: "admin" });
  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: `כבר יש בחנות קופון עם הקוד ${r.row.code}` }, { status: 409 });
    console.error("[admin/coupons] insert failed:", error.message);
    return NextResponse.json({ error: "השמירה לא הצליחה" }, { status: 500 });
  }
  await revalidateStore(db, body.storeId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  let body: { id?: string; active?: boolean; remove?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
  const patch = body.remove
    ? { deleted_at: new Date().toISOString() }
    : typeof body.active === "boolean"
      ? { active: body.active }
      : null;
  if (!patch) return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("coupons").update(patch).eq("id", body.id).select("store_id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "העדכון לא הצליח" }, { status: 500 });
  await revalidateStore(db, data.store_id);
  return NextResponse.json({ ok: true });
}
