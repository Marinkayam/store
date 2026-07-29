import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PILOT_COOKIE } from "@/lib/squish-pilot";

/**
 * GET /squish/pilot/<token>
 *
 * הדלת של סשן הפיילוט. הילדה פותחת אותה פעם אחת, לפני האונבורדינג.
 *
 * **הטוקן לא נשאר בכתובת.** הוא עובר לעוגייה httpOnly ומיד אחר כך יש
 * הפניה ל-/squish. אחרת הוא היה יושב בהיסטוריה של הדפדפן, בכותרת
 * Referer של כל בקשה, ובצילום מסך הראשון שמישהי שולחת לחברה.
 *
 * העוגייה אינה הוכחת פיילוט בפני עצמה — היא רק נושאת את הטוקן עד
 * לאימות הטלפון, ושם הוא נצמד לחשבון בדאטהבייס. משם והלאה השער נשען
 * על הדאטהבייס בלבד.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const home = new URL("/squish", req.url);

  if (!token || token.length < 12) return NextResponse.redirect(home);

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("squish_pilot_tokens")
    .select("token, expires_at, revoked_at, claimed_by_user_id")
    .eq("token", token)
    .maybeSingle();

  // קישור שלא קיים, פג, בוטל או כבר נתפס — נכנסים כמו כל אחת אחרת
  const dead =
    !row ||
    row.revoked_at !== null ||
    new Date(row.expires_at).getTime() < Date.now() ||
    row.claimed_by_user_id !== null;
  if (dead) return NextResponse.redirect(home);

  await db
    .from("squish_pilot_tokens")
    .update({ opened_at: new Date().toISOString() })
    .eq("token", token)
    .is("opened_at", null);

  const res = NextResponse.redirect(home);
  res.cookies.set(PILOT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 6, // שש שעות — סשן מלווה, לא הרשאה קבועה
  });
  return res;
}
