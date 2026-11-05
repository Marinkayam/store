import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";
import { notifyAdmins } from "@/lib/admin-notify";
import { METHOD_LABEL, PAYMENT_METHODS } from "@/lib/pricing";

// POST /api/parent/claim { slug, t, method, ref? } — ההורה לוחץ/ת "שילמתי" בדף
// שלו/ה. זה אותו דבר שהילד/ה עושה ב-/activate (claim_store_payment), עם
// אישור ההורים באותה לחיצה — מי שמחזיק/ה את הלינק עם הטוקן הוא ההורה.
// זה רק מכניס את הדוכן לתור האישורים בחמ"ל; ההפעלה עצמה ידנית, אחרי
// שבודקים שהכסף הגיע.
export async function POST(req: NextRequest) {
  let body: { slug?: string; t?: string; method?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const slug = String(body.slug ?? "").slice(0, 40);
  const method = (PAYMENT_METHODS as readonly string[]).includes(String(body.method)) ? String(body.method) : "bit";
  const ref = String(body.ref ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || null;

  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, slug, display_name, activated_at, payment_claimed_at, parent_consent_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!store || !checkParentToken(store.id, body.t)) {
    return NextResponse.json({ error: "הלינק לא תקין. אפשר לבקש שישלחו אותו שוב" }, { status: 403 });
  }
  if (store.activated_at) return NextResponse.json({ ok: true, state: "live" });

  const now = new Date().toISOString();
  const { error } = await db
    .from("stores")
    .update({
      parent_consent_at: store.parent_consent_at ?? now,
      payment_claimed_at: now,
      payment_method: method,
      payment_ref: ref ?? "הורה, דרך הלינק",
    })
    .eq("id", store.id)
    .is("activated_at", null);
  if (error) {
    console.error("[parent-claim]", error.message);
    return NextResponse.json({ error: "משהו השתבש. אפשר לנסות שוב" }, { status: 500 });
  }

  after(() =>
    notifyAdmins({
      kind: "payment_claimed",
      ref: `${store.id}:${now}`,
      title: `💰 ${store.display_name} מחכה לאישור`,
      body: `הורה סימן ששילם · ${METHOD_LABEL[method] ?? method}${ref ? ` · ${ref}` : ""}. לבדוק ולאשר בחמ"ל`,
      url: "/admin",
    }).catch(() => {})
  );
  return NextResponse.json({ ok: true, state: "pending" });
}
