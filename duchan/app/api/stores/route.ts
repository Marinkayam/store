import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { randomSlug } from "@/lib/slug";
import { QUOTAS } from "@/lib/quotas";
import { THEMES } from "@/lib/themes";
import { COVERS, DEFAULT_COVER } from "@/lib/covers";
import { notifyTelegram } from "@/lib/telegram";
import { absolute } from "@/lib/site";

// POST /api/stores — נקרא בסוף האונבורדינג, אחרי supabase.auth.signUp.
// מאמת טלפון (נרמול בשמירה!), אוכף 3 חנויות לאימייל, ומגריל slug אקראי.

interface Body {
  displayName?: string;
  emoji?: string;
  coverPreset?: string;
  tagline?: string;
  theme?: string;
  contactPhone?: string;
  age?: number;
  city?: string;
  parentAware?: boolean;
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
  if (!user) return NextResponse.json({ error: "לא מחוברת" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const displayName = body.displayName?.trim().slice(0, 40);
  if (!displayName) return NextResponse.json({ error: "לחנות צריך שם" }, { status: 400 });

  // שניהם לא חובה. גיל מחוץ לטווח נשמר כלא-קיים במקום לדחות את כל הבקשה —
  // זה שדה עזר לפיד עתידי, לא משהו שצריך לחסום עליו פתיחת דוכן.
  const age = Number.isInteger(body.age) && body.age! >= 5 && body.age! <= 18 ? body.age : null;
  const city = body.city?.trim().slice(0, 30) || null;

  const theme = body.theme && body.theme in THEMES ? body.theme : "cloud";
  // רשימה סגורה — מפתח קאבר שלא קיים היה מוגש כרקע ריק
  const coverPreset = COVERS.some((c) => c.key === body.coverPreset)
    ? body.coverPreset!
    : DEFAULT_COVER.key;

  const db = supabaseAdmin();

  // הטלפון נלקח מהמספר שאומת בסמס, לא מהגוף של הבקשה. אחרת ילדה שאימתה מספר
  // אחד יכולה לפתוח חנות שההזמנות שלה נשלחות למספר של מישהי אחרת.
  const { data: verified } = await db
    .from("phone_accounts")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();

  const contactPhone = verified?.phone ?? normalizePhone(body.contactPhone ?? "");
  if (!contactPhone) {
    return NextResponse.json({ error: "צריך לאמת מספר טלפון קודם" }, { status: 400 });
  }

  // המכסה עברה מאימייל לטלפון: אפשר להמציא כתובת מייל, קשה יותר להשיג מספר נוסף
  const { count } = await db
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("contact_phone", contactPhone);
  if ((count ?? 0) >= QUOTAS.storesPerParentEmail) {
    return NextResponse.json(
      { error: `אפשר לפתוח עד ${QUOTAS.storesPerParentEmail} חנויות למספר אחד` },
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

  // מודעות ההורים מסומנת חובה במסך 1 של ההקמה, לפני שהטלפון אפילו נשלח —
  // כאן רק נרשמת החותמת. parent_aware_at (מיגרציה 0023) עשוי עוד לא להיות
  // בפרודקשן, ולכן includeParentAware יורד אוטומטית אם העמודה חסרה במקום
  // להפיל את פתיחת החנות כולה.
  const parentAwareAt = body.parentAware ? new Date().toISOString() : null;
  let includeParentAware = true;

  // slug אקראי — מנסים שוב במקרה הנדיר של התנגשות
  let store: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !store; attempt++) {
    const payload: Record<string, unknown> = {
      owner_id: user.id,
      slug: randomSlug(),
      display_name: displayName,
      emoji: (body.emoji ?? "🦄").slice(0, 8),
      tagline: body.tagline?.trim().slice(0, 60) || null,
      theme,
      cover_preset: coverPreset,
      contact_phone: contactPhone,
      age,
      city,
      // נשמר רק אם יש כתובת אמיתית. בכניסה בסמס אין כזו, והכתובת הפנימית
      // @phone.duchan.app היא לא מייל שמישהי קוראת — אין טעם לשמור אותה.
      parent_email: user.email?.endsWith("@phone.duchan.app") ? null : user.email?.toLowerCase() ?? null,
      referred_by: referredBy,
      referral_source: referredBy ? "store" : "direct",
    };
    if (includeParentAware) payload.parent_aware_at = parentAwareAt;

    const { data, error } = await db.from("stores").insert(payload).select("id, slug").single();
    if (!error) {
      store = data;
    } else if (error.message.includes("slug")) {
      continue; // התנגשות אקראית בסלאג — מנסים שוב עם סלאג חדש
    } else if (includeParentAware) {
      console.error("[stores] insert with parent_aware_at failed, retrying without it:", error.message);
      includeParentAware = false;
    } else {
      return NextResponse.json({ error: "משהו השתבש, לנסות שוב" }, { status: 500 });
    }
  }
  if (!store) return NextResponse.json({ error: "משהו השתבש, לנסות שוב" }, { status: 500 });

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

  // לא חוסמים את התשובה לילדה בשביל התראה למרינה
  notifyTelegram(
    `🆕 חנות חדשה נפתחה: <b>${escapeHtml(displayName)}</b>\n${absolute(`/s/${store.slug}`)}`
  );

  return NextResponse.json({ slug: store.slug, storeId: store.id, firstProductId });
}

/** טלגרם מפרש HTML ב-parse_mode — לא סומכים על שם חנות שהילדה הקלידה */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
