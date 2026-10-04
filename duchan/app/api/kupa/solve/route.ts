import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManage } from "@/lib/team";
import { pickSample } from "@/lib/kupa-lessons";
import { isRight, riddleIds } from "@/lib/kupa-riddle-check";

// POST /api/kupa/solve — חידה שנפתרה = כוכב לדוכן (0058, kupa_solved).
//
//   { storeId, riddleId, answer }  — השרת בודק שהתשובה נכונה, ורק אז שומר
//   { storeId, import: [...] }     — מעבר חד-פעמי מהכוכבים שנשמרו בטלפון
//                                     (רק כשלדוכן עוד אין אף כוכב במסד)
//
// מחזיר את כל החידות שנפתרו בדוכן. כוכבים לא נותנים מטבעות, אבל בכל זאת
// לא סומכים על הדפדפן: בלי תשובה נכונה אין כוכב.

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return err("צריך להתחבר", 401);

  let body: { storeId?: string; riddleId?: string; answer?: string; import?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("בקשה לא תקינה", 400);
  }
  const db = supabaseAdmin();
  const storeId = body.storeId ?? "";
  if (!storeId || !(await canManage(db, storeId, user.id))) return err("אין לך גישה לדוכן הזה", 403);

  const { data: products } = await db
    .from("products")
    .select("name, price")
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("sort_order");
  const sample = pickSample(products ?? []);
  const valid = riddleIds(sample);

  const list = async () => {
    const { data } = await db.from("kupa_solved").select("riddle_id").eq("store_id", storeId);
    return (data ?? []).map((r) => r.riddle_id as string);
  };

  if (Array.isArray(body.import)) {
    const { count } = await db.from("kupa_solved").select("riddle_id", { count: "exact", head: true }).eq("store_id", storeId);
    if ((count ?? 0) === 0) {
      const ids = [...new Set(body.import.filter((x): x is string => typeof x === "string" && valid.has(x)))].slice(0, 200);
      if (ids.length) {
        await db
          .from("kupa_solved")
          .upsert(ids.map((riddle_id) => ({ store_id: storeId, riddle_id, solved_by: user.id })), { ignoreDuplicates: true });
      }
    }
    return NextResponse.json({ solved: await list() });
  }

  const id = body.riddleId ?? "";
  if (!valid.has(id)) return err("חידה לא מוכרת", 400);
  if (!isRight(id, String(body.answer ?? ""), sample)) return err("זו לא התשובה הנכונה", 400);
  const { error } = await db
    .from("kupa_solved")
    .upsert({ store_id: storeId, riddle_id: id, solved_by: user.id }, { ignoreDuplicates: true });
  if (error) return err("לא הצלחנו לשמור, לנסות שוב", 500);
  return NextResponse.json({ solved: await list() });
}
