import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/price-hint?name=… — "בדוכנים אחרים זה עולה בדרך כלל ₪X–₪Y".
 *
 * מרינה, 11.2026 ("תתחיל הכל", סבב 4 סעיף 3): עוזר לתמחר, ולומדים מזה.
 * רק טווח מצטבר: בלי שמות, בלי דוכנים, בלי מוצר אחד. צריך לפחות 6 מוצרים
 * מלפחות 3 דוכנים שונים, אחרת לא מחזירים כלום (שאי אפשר יהיה לנחש של מי
 * המחיר). רק לבעלי דוכן מחוברים. רק מוצרים בדוכנים פתוחים, בלי בחינם.
 */

const STOP = new Set(["של", "עם", "בלי", "גדול", "קטן", "חדש", "יפה", "מיוחד", "סט"]);

function keyword(name: string): string | null {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  // המילה הראשונה היא בדרך כלל סוג המוצר ("סקוויש אבוקדו", "צמיד חרוזים")
  return words[0] ?? null;
}

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 40);
  const kw = keyword(name);
  if (!kw) return NextResponse.json({ hint: null });

  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ hint: null }, { status: 401 });

  const db = supabaseAdmin();
  // דוכנים פתוחים בלבד. שתי שאילתות פשוטות, בלי join, שיעבדו בכל גרסה
  const { data: open } = await db.from("stores").select("id").not("activated_at", "is", null).eq("status", "active");
  const ids = (open ?? []).map((r) => r.id as string);
  if (ids.length < 3) return NextResponse.json({ hint: null });
  const { data } = await db
    .from("products")
    .select("price, store_id")
    .in("store_id", ids)
    .ilike("name", `%${kw.replace(/[%_]/g, "")}%`)
    .is("deleted_at", null)
    .gt("price", 0)
    .limit(400);
  const rows = (data ?? []) as { price: number; store_id: string }[];
  const stores = new Set(rows.map((r) => r.store_id));
  if (rows.length < 6 || stores.size < 3) return NextResponse.json({ hint: null });

  const prices = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  const q = (p: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round((prices.length - 1) * p)))];
  const low = Math.round(q(0.25));
  const high = Math.round(q(0.75));
  return NextResponse.json({ hint: { word: kw, low, high } });
}
