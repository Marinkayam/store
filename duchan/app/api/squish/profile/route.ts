import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { squishCode } from "@/lib/squish";

/**
 * POST /api/squish/profile — יוצר את פרופיל האוסף.
 *
 * **למה בשרת.** הפרופיל נוצר קודם מהדפדפן, והסימון `pilot_user` נכתב
 * אחר כך ביד. בין שני הרגעים היה פרופיל חי בלי שער. עכשיו שניהם
 * נכתבים באותה שורה, באותה טרנזקציה, בתוך `squish_create_profile` —
 * ואין מצב שקיים פרופיל שעדיין לא מסומן.
 *
 * הקריאה רצה **בזהות של המשתמשת** ולא ב-service role, כדי שכל בדיקות
 * ה-RLS ו-auth.uid() בתוך הפונקציה ימשיכו לחול.
 */
export async function POST(req: Request) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: {
    nickname?: string; city?: string; title?: string;
    parentAware?: boolean; awarenessVersion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  /* קוד הגלריה אקראי, ומתנגשות קורות. חמישה ניסיונות, ואז מוותרים
     בגלוי במקום להחזיר פרופיל בלי קוד. */
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supa.rpc("squish_create_profile", {
      p_nickname: body.nickname ?? "",
      p_city: body.city ?? "",
      p_title: body.title ?? "",
      p_code: squishCode(),
      p_aware: body.parentAware === true,
      p_aware_ver: body.awarenessVersion ?? null,
    });
    if (!error && data) return NextResponse.json({ id: data });
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error(JSON.stringify({ op: "squish.profile.create", code: error.code ?? "unknown" }));
      return NextResponse.json({ error: "לא הצלחנו לפתוח את האוסף" }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "לא הצלחנו לפתוח את האוסף" }, { status: 502 });
}
