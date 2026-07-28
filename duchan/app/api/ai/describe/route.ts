import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/ai/describe { storeId, productName?, imageBase64+mediaType | imageKey }
//
// imageKey הוא המסלול לתמונה ששמורה כבר: היא עורכת מוצר ותיק ורוצה תיאור,
// בלי לצלם אותו מחדש. השרת מושך את הקובץ מ-R2 — הדפדפן לא יכול, כי קריאה
// חוצת-דומיין של בייטים דורשת CORS, ובכל מקרה אין סיבה להוריד תמונה למכשיר
// רק כדי להעלות אותה בחזרה.
// פיצ'ר פרימיום: כותב תיאור קצר למוצר מתוך התמונה. נדלק פר חנות ע"י המנהלת.
// המפתח של Anthropic נשאר בשרת — הדפדפן שולח תמונה ומקבל טקסט.

const MODEL = process.env.AI_MODEL || "claude-opus-5";
const ALLOWED_MEDIA = ["image/webp", "image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // התמונות שלנו ~120KB; זו תקרת הגנה

const SYSTEM = `עוזרים לילד או ילדה בני 9–14 שמנהלים דוכן אונליין קטן בעברית.
מהתמונה, כתבו תיאור קצר וקולע למוצר.

חוקים:
- עברית פשוטה, גוף שני, בלי ילדותיות מזויפת ובלי סופרלטיבים ריקים.
- עד 12 מילים. משפט אחד או שניים קצרים.
- תארי מה רואים: צבע, גודל, מרקם, למה זה כיף.
- בלי מחיר, בלי אמוג'י, בלי סימני קריאה.
- אם לא ברור מה בתמונה, כתבו תיאור כללי וזהיר, בלי להמציא פרטים.
- החזירי רק את התיאור עצמו, בלי מרכאות ובלי הקדמה.`;

export async function POST(req: NextRequest) {
  // סדר הבדיקות מכוון: אימות ובעלות לפני הכל.
  // בודקים תצורת שרת רק אחרי — כדי לא לחשוף מצב הגדרה לקורא לא מזוהה.
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: {
    storeId?: string;
    imageBase64?: string;
    mediaType?: string;
    imageKey?: string;
    productName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { storeId, imageKey, productName } = body;
  let { imageBase64, mediaType } = body;
  if (!storeId || (!imageKey && (!imageBase64 || !mediaType))) {
    return NextResponse.json({ error: "צריך תמונה" }, { status: 400 });
  }
  if (imageBase64) {
    if (!mediaType || !ALLOWED_MEDIA.includes(mediaType)) {
      return NextResponse.json({ error: "צריך תמונה" }, { status: 400 });
    }
    // base64 ≈ 4/3 מהגודל האמיתי
    if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 });
    }
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

  // המפתח חייב להיות בתיקייה של החנות. בלי הבדיקה הזו אפשר לבקש תיאור
  // לתמונה של חנות אחרת — הבעלות נבדקה על החנות, לא על הקובץ.
  if (imageKey) {
    if (!imageKey.startsWith(`${storeId}/`) || imageKey.includes("..")) {
      return NextResponse.json({ error: "אין גישה" }, { status: 403 });
    }
    try {
      const obj = await r2Client().send(
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: imageKey })
      );
      const type = obj.ContentType ?? "image/webp";
      if (!ALLOWED_MEDIA.includes(type)) {
        return NextResponse.json({ error: "אפשר תיאור לתמונה בלבד" }, { status: 400 });
      }
      const bytes = Buffer.from(await obj.Body!.transformToByteArray());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 });
      }
      imageBase64 = bytes.toString("base64");
      mediaType = type;
    } catch {
      return NextResponse.json({ error: "לא מצאנו את התמונה" }, { status: 404 });
    }
  }

  const { data: allowed, error: creditErr } = await db.rpc("use_ai_credit", { p_store: storeId });
  if (creditErr) return NextResponse.json({ error: "משהו השתבש" }, { status: 500 });
  if (!allowed) {
    // מבררים למה נדחה רק בנתיב הכישלון — "נגמרו" ו"כבוי" הן שתי בעיות שונות,
    // ולילדה שנגמרו לה הקרדיטים "לא פעיל בחנות שלך" זו הודעה מבלבלת.
    const { data: why } = await db
      .from("stores")
      .select("ai_enabled, ai_credits")
      .eq("id", storeId)
      .maybeSingle();
    const exhausted = why?.ai_enabled && (why?.ai_credits ?? 0) <= 0;
    return NextResponse.json(
      {
        error: exhausted
          ? "נגמרו התיאורים האוטומטיים בחנות שלך"
          : "כתיבה אוטומטית כבויה בחנות שלך",
        exhausted: !!exhausted,
      },
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
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/webp", data: imageBase64! } },
            {
              type: "text",
              text: productName?.trim()
                ? `שם המוצר: "${productName.trim()}". כתבו תיאור קצר.`
                : "כתבו תיאור קצר למוצר בתמונה.",
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
  } catch (e) {
    // רואים את זה בלוגים של השרת — בלעדיה שגיאה אמיתית (מפתח, מכסה, שינוי ב-API) נעלמת בשקט
    console.error("[ai/describe] failed:", e instanceof Error ? e.message : e);
    // הקרדיט כבר נוכה; בכישלון מחזירים אותו
    try {
      await db.rpc("refund_ai_credit", { p_store: storeId });
    } catch {}
    return NextResponse.json({ error: "הכתיבה נכשלה, לנסות שוב" }, { status: 502 });
  }
}
