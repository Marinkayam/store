import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/squish/describe { imageBase64, mediaType, name?, typeLabel? }
//
// כמו התיאורים בדוכן, בגזרה של סקוויש: הילדה מצלמת, ואנחנו מציעים
// משפט על הצבע והצורה. ההצעה נערכת על ידה — היא הכותבת, אנחנו העט.
//
// שלושה הבדלים מהמסלול של דוכן, וכולם מכוונים:
// - **שער לפי פרופיל, לא לפי חנות.** לילדת סקוויש לא בהכרח יש דוכן.
// - **מכסה יומית בדאטהבייס** (squish_use_ai, 20 ביום) במקום קרדיטים
//   בתשלום — זה חלק מהמועדון, לא פרימיום.
// - **מודל קטן.** תיאור של סקווישי בשמונה מילים לא צריך את המודל
//   הגדול, והעלות פר קריאה קטנה פי כמה.

const MODEL = process.env.AI_MODEL_SQUISH || "claude-haiku-4-5";
const ALLOWED_MEDIA = ["image/webp", "image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const SYSTEM = `עוזרים לילדה בת 8–14 שמתעדת את אוסף הסקווישים שלה, בעברית.
מהתמונה, כתבו משפט קצר וכיפי על הסקווישי.

חוקים:
- עברית פשוטה, בגובה העיניים, בלי ילדותיות מזויפת.
- עד 10 מילים. משפט אחד.
- תארו מה רואים: צבע, צורה, מרקם — מה שהופך אותו למיוחד.
- בלי מחיר, בלי אמוג'י, בלי סימני קריאה.
- אם לא ברור מה בתמונה, תיאור כללי וזהיר, בלי להמציא.
- להחזיר רק את המשפט, בלי מרכאות ובלי הקדמה.`;

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: { imageBase64?: string; mediaType?: string; name?: string; typeLabel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const { imageBase64, mediaType, name, typeLabel } = body;
  if (!imageBase64 || !mediaType || !ALLOWED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: "צריך תמונה" }, { status: 400 });
  }
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "התמונה גדולה מדי" }, { status: 413 });
  }

  const db = supabaseAdmin();
  /* המכסה נבדקת ונרשמת בפעולה אטומית אחת. אם הפונקציה עוד לא קיימת
     בפרודקשן (מיגרציה 0039 לא הוחלה) — הפיצ'ר סגור, לא שבור. */
  const { data: allowed, error: gateErr } = await db.rpc("squish_use_ai", { p_user: user.id });
  if (gateErr) {
    console.error("[squish/describe] gate failed:", gateErr.message);
    return NextResponse.json({ error: "הכתיבה האוטומטית עוד לא זמינה" }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "נגמרו התיאורים להיום, אפשר לכתוב בעצמך" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "הכתיבה האוטומטית עוד לא זמינה" }, { status: 503 });
  }

  try {
    const client = new Anthropic();
    const hints = [
      name?.trim() ? `קוראים לו "${name.trim()}"` : null,
      typeLabel?.trim() ? `הסוג שלו: ${typeLabel.trim()}` : null,
    ].filter(Boolean).join(". ");
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/webp", data: imageBase64 } },
            { type: "text", text: hints ? `${hints}. כתבו משפט על הסקווישי.` : "כתבו משפט על הסקווישי בתמונה." },
          ],
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "לא הצלחנו לכתוב על התמונה הזו" }, { status: 422 });
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
    console.error("[squish/describe] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "הכתיבה נכשלה, לנסות שוב" }, { status: 502 });
  }
}
