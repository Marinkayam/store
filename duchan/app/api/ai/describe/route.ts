import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/ai/describe { storeId, imageBase64, mediaType, productName? }
// פיצ'ר פרימיום: כותב תיאור קצר למוצר מתוך התמונה. נדלק פר חנות ע"י המנהלת.
// המפתח של Anthropic נשאר בשרת — הדפדפן שולח תמונה ומקבל טקסט.

const MODEL = process.env.AI_MODEL || "claude-opus-5";
const ALLOWED_MEDIA = ["image/webp", "image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // התמונות שלנו ~120KB; זו תקרת הגנה

const SYSTEM = `את עוזרת לילדה בת 9–14 שמנהלת חנות אונליין קטנה בעברית.
מהתמונה, כתבי תיאור קצר וקולע למוצר.

חוקים:
- עברית פשוטה, גוף שני, בלי ילדותיות מזויפת ובלי סופרלטיבים ריקים.
- עד 12 מילים. משפט אחד או שניים קצרים.
- תארי מה רואים: צבע, גודל, מרקם, למה זה כיף.
- בלי מחיר, בלי אמוג'י, בלי סימני קריאה.
- אם לא ברור מה בתמונה — כתבי תיאור כללי וזהיר, בלי להמציא פרטים.
- החזירי רק את התיאור עצמו, בלי מרכאות ובלי הקדמה.`;

export async function POST(req: NextRequest) {
  // סדר הבדיקות מכוון: אימות ובעלות לפני הכל.
  // בודקים תצורת שרת רק אחרי — כדי לא לחשוף מצב הגדרה לקורא לא מזוהה.
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברת" }, { status: 401 });

  let body: { storeId?: string; imageBase64?: string; mediaType?: string; productName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { storeId, imageBase64, mediaType, productName } = body;
  if (!storeId || !imageBase64 || !mediaType || !ALLOWED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: "צריך תמונה" }, { status: 400 });
  }
  // base64 ≈ 4/3 מהגודל האמיתי
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 });
  }

  // בעלות + פרימיום + קרדיט, בבדיקה אחת אטומית
  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("id, owner_id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store || store.owner_id !== user.id) {
    return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  }

  const { data: allowed, error: creditErr } = await db.rpc("use_ai_credit", { p_store: storeId });
  if (creditErr) return NextResponse.json({ error: "משהו השתבש" }, { status: 500 });
  if (!allowed) {
    return NextResponse.json(
      { error: "כתיבה אוטומטית לא פעילה בחנות שלך", upgrade: true },
      { status: 402 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      await db.rpc("refund_ai_credit", { p_store: storeId });
    } catch {}
    return NextResponse.json({ error: "הפיצ'ר לא מוגדר עדיין" }, { status: 503 });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      output_config: { effort: "low" }, // משימה קצרה — אין צורך בחשיבה עמוקה
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/webp", data: imageBase64 } },
            {
              type: "text",
              text: productName?.trim()
                ? `שם המוצר: "${productName.trim()}". כתבי תיאור קצר.`
                : "כתבי תיאור קצר למוצר בתמונה.",
            },
          ],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "לא הצלחנו לכתוב תיאור לתמונה הזו" }, { status: 422 });
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim()
      .replace(/^["'״]|["'״]$/g, "")
      .slice(0, 120);

    if (!text) return NextResponse.json({ error: "לא התקבל תיאור" }, { status: 502 });
    return NextResponse.json({ description: text });
  } catch {
    // הקרדיט כבר נוכה; בכישלון מחזירים אותו
    try {
      await db.rpc("refund_ai_credit", { p_store: storeId });
    } catch {}
    return NextResponse.json({ error: "הכתיבה נכשלה — נסי שוב" }, { status: 502 });
  }
}
