import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { squishError } from "@/lib/squish-errors";

/**
 * POST /api/squish/safety
 *
 * פעולות הבטיחות של המשתמשת: חסימה, הסרת חברה, ודיווח על פריט.
 *
 * **למה בשרת ולא ישירות מהדפדפן:** כל הפעולות האלה מקבלות *קוד גלריה*
 * ולא מזהה משתמש. מזהה משתמש לא יוצא לדפדפן בשום מסך של סקוויש קלאב,
 * וזה לא אמור להשתנות רק כדי לחסום מישהי. התרגום מקוד למזהה קורה כאן.
 */

type Body = { action?: string; code?: string; itemId?: string; reason?: string; details?: string };

const ITEM_REASONS = new Set([
  "not_squishy", "inappropriate", "someone_elses_photo", "shows_a_person", "other",
]);

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const db = supabaseAdmin();

  /** קוד גלריה → מזהה בעלים. הדרך היחידה להצביע על מישהי אחרת. */
  async function ownerOf(code: string | undefined): Promise<string | null> {
    if (!code) return null;
    const { data } = await db
      .from("squish_profiles")
      .select("user_id")
      .eq("collection_code", code)
      .maybeSingle();
    return data?.user_id ?? null;
  }

  // הפעולות רצות בשם המשתמשת (לא service role), כדי שכל בדיקות
  // ה-RLS וה-auth.uid() בתוך הפונקציות ימשיכו לחול.
  const asUser = supa;

  switch (body.action) {
    case "block":
    case "unblock":
    case "remove_connection": {
      const other = await ownerOf(body.code);
      if (!other) return NextResponse.json({ error: "לא מצאנו את האוסף" }, { status: 404 });
      if (other === user.id) return NextResponse.json({ error: "זה האוסף שלך" }, { status: 400 });
      const fn =
        body.action === "block" ? "squish_block_user"
        : body.action === "unblock" ? "squish_unblock_user"
        : "squish_remove_connection";
      const { error } = await asUser.rpc(fn, { p_other: other });
      if (error) {
        console.error(`[squish] ${fn} failed:`, error.message);
        return NextResponse.json({ error: squishError(error.message) }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    case "report_item": {
      if (!body.itemId || !ITEM_REASONS.has(body.reason ?? "")) {
        return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
      }
      // הבעלים נקרא בשרת: אסור לסמוך על מי שהלקוח אומר שהוא הבעלים
      const { data: item } = await db
        .from("squish_items")
        .select("owner_user_id")
        .eq("id", body.itemId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "לא מצאנו את הסקווישי" }, { status: 404 });
      if (item.owner_user_id === user.id) {
        return NextResponse.json({ error: "זה סקווישי שלך" }, { status: 400 });
      }
      const { error } = await asUser.from("squish_item_reports").insert({
        item_id: body.itemId,
        reporter_user_id: user.id,
        reported_user_id: item.owner_user_id,
        reason: body.reason,
        details: body.details?.slice(0, 500) || null,
      });
      if (error) {
        console.error("[squish] item report failed:", error.message);
        return NextResponse.json({ error: squishError(error.message) }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    case "delete_profile": {
      const { error } = await asUser.rpc("squish_delete_profile");
      if (error) {
        console.error("[squish] delete profile failed:", error.message);
        return NextResponse.json({ error: squishError(error.message) }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
}
