import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { notifyTelegram } from "@/lib/telegram";
import { absolute } from "@/lib/site";

// POST /api/stores/notify-payment { storeId } — נקרא מהצד לקוח מיד אחרי
// claim_store_payment RPC. לא מקבל טקסט חופשי מהלקוח: קורא בעצמו את
// השורה שכבר נכתבה (עם RLS, כך שרק בעלת החנות יכולה להפעיל את זה על
// החנות שלה), כדי שמה שמגיע לטלגרם של מרינה תמיד יהיה נתון אמיתי.

const METHOD_LABEL: Record<string, string> = { bit: "ביט", paybox: "פייבוקס", other: "אחר" };

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברת" }, { status: 401 });

  let body: { storeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!body.storeId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // RLS על stores מוודא שזו החנות של המשתמשת המחוברת בלבד
  const { data: store } = await supa
    .from("stores")
    .select("id, slug, display_name, payment_claimed_at, payment_method, payment_ref")
    .eq("id", body.storeId)
    .maybeSingle();

  if (!store?.payment_claimed_at) return NextResponse.json({ ok: true }); // אין מה לדווח

  notifyTelegram(
    `⏳ ${escapeHtml(store.display_name)} הצהירה ששילמה — ממתינה לאישור\n` +
      `${METHOD_LABEL[store.payment_method ?? ""] ?? "לא צוין"}` +
      `${store.payment_ref ? ` · ${escapeHtml(store.payment_ref)}` : ""}\n` +
      absolute("/admin")
  );

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
