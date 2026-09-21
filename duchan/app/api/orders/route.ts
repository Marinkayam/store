import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { safeOptionLabel } from "@/lib/product-options";
import type { OrderItem } from "@/lib/types";

// POST /api/orders  { slug, items:[{productId, qty}], note?, buyerPhone? }
// המספר של הילדה לא יושב ב-HTML — הוא מוחזר מכאן, רק אחרי שההזמנה נוצרה.
// המלאי לא יורד כאן (הזמנות רפאים) — הוא יורד ב"שולם".

interface Body {
  slug?: string;
  items?: { productId: string; qty: number; option?: string }[];
  note?: string;
  buyerPhone?: string;
  buyerName?: string;
  /** true = משלוח (ואז כתובת ועיר חובה), false = מסירה אישית */
  wantsShipping?: boolean;
  shipAddress?: string;
  shipCity?: string;
  /** הפירוק המובנה: רחוב, בניין/פרטי, קומה, דירה, קוד כניסה */
  shipDetails?: {
    street?: string;
    homeType?: string;
    floor?: string;
    apartment?: string;
    entryCode?: string;
  };
  payMethod?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { slug, items, note, buyerPhone, buyerName, wantsShipping, shipAddress, shipCity, shipDetails, payMethod } = body;
  if (!slug || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const name = buyerName?.trim().replace(/\s+/g, " ").slice(0, 24) ?? "";

  const db = supabaseAdmin();

  const { data: store } = await db
    .from("stores")
    .select("id, display_name, contact_phone, status, activated_at")
    .eq("slug", slug)
    .maybeSingle();

  // חנות שלא הופעלה לא מקבלת הזמנות, גם אם מישהו הגיע ללינק
  if (!store || !store.activated_at || store.status !== "active") {
    return NextResponse.json({ error: "הדוכן סגור כרגע" }, { status: 404 });
  }

  // נשמר על ההזמנה עצמה (p_ip_hash) לצורך מעקב, לא לשם הגבלת קצב —
  // אין יותר תקרת הזמנות ליום.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(`duchan:${ip}`).digest("hex").slice(0, 32);

  // מאמתים מחירים ומלאי מול ה-DB. לעולם לא סומכים על הלקוח.
  const ids = items.map((i) => i.productId);
  const { data: products } = await db
    .from("products")
    .select("id, name, price, track_stock, stock, option_label, options")
    .eq("store_id", store.id)
    .in("id", ids)
    .is("deleted_at", null);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const snapshot: OrderItem[] = [];
  let total = 0;

  for (const item of items) {
    const qty = Math.floor(Number(item.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      return NextResponse.json({ error: "כמות לא תקינה" }, { status: 400 });
    }
    const p = byId.get(item.productId);
    if (!p) {
      return NextResponse.json({ error: "אחד המוצרים כבר לא בחנות" }, { status: 409 });
    }
    if (p.track_stock && p.stock < qty) {
      return NextResponse.json({ error: `נשארו רק ${p.stock} מ"${p.name}"` }, { status: 409 });
    }

    // הבחירה של הקונה מאומתת מול הרשימה ב-DB, כמו המחיר. אחרת אפשר לשלוח
    // כל טקסט והוא ייכנס להזמנה ולהודעת הוואטסאפ של הילדה.
    const choices = p.options ?? [];
    let option: string | undefined;
    if (choices.length > 0) {
      if (!item.option || !choices.includes(item.option)) {
        return NextResponse.json(
          { error: `צריך לבחור ${safeOptionLabel(p.option_label)} ל"${p.name}"` },
          { status: 400 }
        );
      }
      option = item.option;
    }

    // המזהה נשמר כדי שתגית "הכי נמכר" תוכל להיגזר מהזמנות אמיתיות.
    // השם לבדו נשבר ברגע שילדה משנה שם מוצר.
    snapshot.push({ id: p.id, name: p.name, qty, price: p.price, ...(option ? { option } : {}) });
    total += p.price * qty;
  }

  // השם הוא מה שמאפשר לה לדעת מי הזמינה, ולכן הוא נדרש גם כאן ולא רק
  // בטופס — טופס אפשר לעקוף, את זה לא. הבדיקה יושבת אחרי אימות החנות
  // והמוצרים, כדי שדוכן סגור ימשיך לומר "סגור" ובחירה חסרה תמשיך לומר
  // מה חסר, במקום שהשם יבלע כל הודעה אחרת.
  if (name.length < 2) {
    return NextResponse.json(
      { error: "רק צריך את השם שלך, כדי שהיא תדע מי הזמינה" },
      { status: 400 }
    );
  }

  // הטלפון הפך חובה (2026-09): ההזמנה כבר לא עוברת בוואטסאפ, ולכן בלי
  // מספר אין למוכרת שום דרך לחזור לקונה. מאומת בשרת ולא רק בטופס.
  const phone = normalizePhone(buyerPhone ?? "");
  if (!phone) {
    return NextResponse.json(
      { error: "צריך מספר טלפון תקין, כדי שהמוכרת תוכל לחזור אלייך" },
      { status: 400 }
    );
  }

  // אמצעי תשלום — רק מהרשימה המוכרת; ערך זר לא נכנס להזמנה.
  const pay = ["bit", "paybox", "cash"].includes(payMethod ?? "") ? payMethod! : null;

  // משלוח דורש כתובת מובנית. הכל של הקונה, נראה רק למוכרת.
  const ships = wantsShipping === true;
  const address = shipAddress?.trim().replace(/\s+/g, " ").slice(0, 200) ?? "";
  const city = shipCity?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "";
  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
  const details = shipDetails
    ? {
        street: clean(shipDetails.street, 80),
        homeType: shipDetails.homeType === "building" ? "building" : "private",
        ...(shipDetails.homeType === "building"
          ? {
              floor: clean(shipDetails.floor, 6),
              apartment: clean(shipDetails.apartment, 6),
              ...(clean(shipDetails.entryCode, 12) ? { entryCode: clean(shipDetails.entryCode, 12) } : {}),
            }
          : {}),
      }
    : null;
  if (ships) {
    if (city.length < 2 || !details || details.street.length < 2) {
      return NextResponse.json(
        { error: "למשלוח צריך עיר ורחוב, כדי שהחבילה תדע לאן להגיע" },
        { status: 400 }
      );
    }
    if (details.homeType === "building" && (!details.floor || !details.apartment)) {
      return NextResponse.json(
        { error: "לבניין צריך גם קומה ומספר דירה" },
        { status: 400 }
      );
    }
  }

  // מספור + כתיבה בטרנזקציה אחת — שתי קונות בו-זמניות מקבלות מספרים שונים.
  //
  // p_buyer_phone נוסף במיגרציה 0020 ו-p_buyer_name ב-0029. אם הקוד עולה
  // לפני שהמיגרציה רצה על הדאטהבייס, ל-place_order אין פרמטר כזה
  // ו-PostgREST מחזיר "function not found" — וזה היה מפיל *כל* הזמנה בכל
  // חנות, בדיוק כמו התקלה עם payout_link. יורדים חתימה-חתימה עד שאחת
  // עוברת: עדיף הזמנה בלי שם הקונה מאשר בלי הזמנה.
  const base = {
    p_store: store.id,
    p_items: snapshot,
    p_total: total,
    p_note: note?.slice(0, 200) || null,
    p_ip_hash: ipHash,
  };
  const v8 = {
    ...base, p_buyer_phone: phone, p_buyer_name: name,
    p_ship_address: ships ? address : null, p_ship_city: ships ? city : null,
    p_pay_method: pay, p_wants_shipping: wantsShipping ?? null,
  };
  const attempts: Record<string, unknown>[] = [
    { ...v8, p_ship_details: ships ? details : null },
    v8,
    { ...base, p_buyer_phone: phone, p_buyer_name: name },
    { ...base, p_buyer_phone: phone },
    base,
  ];

  let orderNumber: number | null = null;
  let orderErr;
  for (const args of attempts) {
    ({ data: orderNumber, error: orderErr } = await db.rpc("place_order", args));
    if (!orderErr) break;
    console.error(
      `[orders] place_order(${Object.keys(args).length} args) failed, falling back:`,
      orderErr.message
    );
  }
  if (orderErr || typeof orderNumber !== "number") {
    return NextResponse.json({ error: "משהו השתבש, לנסות שוב" }, { status: 500 });
  }

  return NextResponse.json({
    orderNumber,
    phone: store.contact_phone,
    storeName: store.display_name,
    buyerName: name,
    items: snapshot,
    total,
  });
}
