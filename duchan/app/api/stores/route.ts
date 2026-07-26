import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { randomSlug } from "@/lib/slug";
import { QUOTAS } from "@/lib/quotas";
import { THEMES } from "@/lib/themes";

// POST /api/stores — נקרא בסוף האונבורדינג, אחרי supabase.auth.signUp.
// מאמת טלפון (נרמול בשמירה!), אוכף 3 חנויות לאימייל, ומגריל slug אקראי.

interface Body {
  displayName?: string;
  emoji?: string;
  tagline?: string;
  theme?: string;
  contactPhone?: string;
  ref?: string | null; // הסלאג של החנות שממנה הגיעה
  firstProduct?: {
    name: string;
    description?: string;
    price: number;
    emoji?: string;
    trackStock?: boolean;
    stock?: number;
  };
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "לא מחוברת" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const displayName = body.displayName?.trim().slice(0, 40);
  if (!displayName) return NextResponse.json({ error: "לחנות צריך שם" }, { status: 400 });

  const theme = body.theme && body.theme in THEMES ? body.theme : "cloud";

  const contactPhone = normalizePhone(body.contactPhone ?? "");
  if (!contactPhone) {
    return NextResponse.json({ error: "מספר הוואטסאפ לא נראה תקין — בדקי אותו שוב" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // 3 חנויות לאימייל
  const { count } = await db
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("parent_email", user.email.toLowerCase());
  if ((count ?? 0) >= QUOTAS.storesPerParentEmail) {
    return NextResponse.json(
      { error: `אפשר לפתוח עד ${QUOTAS.storesPerParentEmail} חנויות לאימייל אחד` },
      { status: 409 }
    );
  }

  // מאיפה הגיעה. מאמתים את הסלאג מול ה-DB — הלקוח יכול לשלוח כל דבר,
  // וחנות שמפנה לעצמה או לסלאג שלא קיים לא נספרת.
  let referredBy: string | null = null;
  if (body.ref && /^[a-z0-9]{3,12}$/i.test(body.ref)) {
    const { data: src } = await db.from("stores").select("id").eq("slug", body.ref).maybeSingle();
    referredBy = src?.id ?? null;
  }

  // slug אקראי — מנסים שוב במקרה הנדיר של התנגשות
  let store: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !store; attempt++) {
    const { data, error } = await db
      .from("stores")
      .insert({
        owner_id: user.id,
        slug: randomSlug(),
        display_name: displayName,
        emoji: (body.emoji ?? "🦄").slice(0, 8),
        tagline: body.tagline?.trim().slice(0, 60) || null,
        theme,
        contact_phone: contactPhone,
        parent_email: user.email.toLowerCase(), // האימייל של החשבון — משמש למכסה
        referred_by: referredBy,
        referral_source: referredBy ? "store" : "direct",
      })
      .select("id, slug")
      .single();
    if (!error) store = data;
    else if (!error.message.includes("slug")) {
      return NextResponse.json({ error: "משהו השתבש, נסי שוב" }, { status: 500 });
    }
  }
  if (!store) return NextResponse.json({ error: "משהו השתבש, נסי שוב" }, { status: 500 });

  let firstProductId: string | null = null;
  const fp = body.firstProduct;
  if (fp?.name && Number.isFinite(fp.price)) {
    const { data: prod } = await db
      .from("products")
      .insert({
        store_id: store.id,
        name: fp.name.trim().slice(0, 40),
        description: fp.description?.trim().slice(0, 120) || null,
        price: Math.max(0, Math.floor(fp.price)),
        track_stock: fp.trackStock ?? true,
        stock: Math.max(0, Math.floor(fp.stock ?? 1)),
      })
      .select("id")
      .single();
    firstProductId = prod?.id ?? null;
  }

  return NextResponse.json({ slug: store.slug, storeId: store.id, firstProductId });
}
