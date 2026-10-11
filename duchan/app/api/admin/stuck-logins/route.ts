import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { diagnose, type EventRow } from "@/lib/login-events";
import { findStuck, storesByPhone, STUCK_WINDOW_HOURS } from "@/lib/stuck-logins";

// GET /api/admin/stuck-logins — מי ביקשה קוד כמה פעמים ולא הצליחה להיכנס.
//
// סמס שלא מגיע (בקרת הורים, סינון ספאם) לא משאיר שום סימן אצל הילדה
// חוץ מתסכול. אצלנו הוא כן משאיר: כמה בקשות קוד ברצף, בלי אף כניסה.
// ההגדרה עצמה ב-lib/stuck-logins.ts — אותה אחת שמזינה את "צריכות עזרה"
// בטאב הכניסות של החמ"ל.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });

  const db = supabaseAdmin();
  const found = await findStuck(db);
  if (!found) return NextResponse.json({ error: "לא הצלחנו לטעון", stuck: [] }, { status: 500 });
  if (!found.length) return NextResponse.json({ stuck: [] });

  // יומן הכניסות: משפט אחד לכל שורה. טבלה חסרה = בלי משפט, לא תקלה.
  const since = new Date(Date.now() - STUCK_WINDOW_HOURS * 3600_000).toISOString();
  const { data: evs } = await db
    .from("login_events")
    .select("phone, at, kind, detail, client")
    .in("phone", found.map((s) => s.phone))
    .gte("at", since)
    .order("at", { ascending: true })
    .limit(3000);
  const by = new Map<string, EventRow[]>();
  for (const e of (evs ?? []) as (EventRow & { phone: string })[]) {
    const l = by.get(e.phone) ?? [];
    l.push(e);
    by.set(e.phone, l);
  }
  const stores = await storesByPhone(db, found.map((s) => s.phone));

  const stuck = found.map((s) => ({
    ...s,
    store: stores.get(s.phone) ?? null,
    headline: by.get(s.phone)?.length ? diagnose(by.get(s.phone)!).headline : null,
  }));
  // מי שלחצו "לא קיבלתי קוד" ראשונים, ואחריהם לפי הזמן
  stuck.sort((a, b) => Number(!!b.helpAt) - Number(!!a.helpAt) || b.lastAt.localeCompare(a.lastAt));
  return NextResponse.json({ stuck });
}
