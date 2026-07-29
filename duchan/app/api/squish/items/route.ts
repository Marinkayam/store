import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  OPTIONAL_ITEM_FIELDS,
  unknownColumn,
  type OptionalItemField,
} from "@/lib/squish-schema";

/**
 * POST /api/squish/items — יוצר סקווישי אחד, ומחזיר את המזהה שלו.
 *
 * **למה זה עבר לשרת.** קודם הדפדפן כתב ישירות לדאטהבייס, וה-insert
 * ישב בתוך try/catch שכתב לקונסולה וממשיך. כשעמודה חסרה בפרודקשן
 * כל הפריטים נפלו בשקט, הילדה ראתה "האוסף נוצר" ונחתה על גלריה
 * ריקה. מסך הצלחה אחרי כישלון הוא הבאג, לא העמודה החסרה.
 *
 * שלושה דברים שהמסלול הזה מבטיח:
 *
 * 1. **תשובה אמיתית.** הצלחה היא מזהה שורה שחזר מהדאטהבייס, ולא
 *    היעדר חריגה. כישלון הוא 4xx/5xx עם קוד שהלקוח יודע להציג.
 * 2. **נפילה חוזרת רק במקום בטוח.** אם הדאטהבייס אומר במפורש שעמודה
 *    *אופציונלית* לא מוכרת, מנסים שוב בלעדיה — פעם אחת, ומדווחים
 *    ללקוח מה ירד. שדה חובה לא יוסר לעולם כדי "להצליח".
 * 3. **לוג בלי אנשים.** נרשמים שם הפעולה, מה ציפינו למצוא, קוד
 *    השגיאה ומזהה מתאם. לא טלפון, לא כתובת מדיה, ולא טקסט חופשי
 *    שהילדה כתבה.
 */

interface ItemInput {
  name?: string;
  squishy_type?: string;
  custom_type?: string | null;
  size?: string;
  condition?: string;
  condition_note?: string | null;
  trade_status?: string;
  wanted_description?: string | null;
  series?: string | null;
  stickers?: string[];
  image_key?: string | null;
  video_key?: string | null;
  poster_key?: string | null;
  sort_order?: number;
}

/**
 * לוג מובנה, בלי שום דבר שאפשר לזהות לפיו אדם.
 *
 * נכתב גם לדאטהבייס: קונסולה של שרת היא בדיוק המקום שבו הכשל הזה
 * נעלם קודם. המנהלת צריכה לראות "ניסתה לשמור ונכשל" בלי לחפור בלוגים,
 * במיוחד בסשן מלווה שבו ילדה יושבת מולה עכשיו.
 */
async function logFailure(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string | null,
  cid: string,
  code: string | undefined,
  expects: string,
  detail?: string
) {
  console.error(
    JSON.stringify({
      op: "squish.item.create",
      expects,
      code: code ?? "unknown",
      cid,
      detail: detail ?? null,
    })
  );
  // שדות קבועים בלבד — בלי שם הפריט, בלי מפתח מדיה, בלי טלפון
  await db.from("squish_write_failures").insert({
    user_id: userId,
    op: "squish.item.create",
    code: code ?? "unknown",
    expects,
    cid,
  }).then(() => {}, () => {});
}

export async function POST(req: Request) {
  const cid = crypto.randomUUID();
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים", cid }, { status: 401 });

  let body: { profileId?: string; item?: ItemInput };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה", cid }, { status: 400 });
  }
  const item = body.item;
  if (!body.profileId || !item) {
    return NextResponse.json({ error: "בקשה לא תקינה", cid }, { status: 400 });
  }

  const db = supabaseAdmin();

  // הפרופיל חייב להיות שלה. מזהה פרופיל שהגיע מהדפדפן לא נאמן.
  const { data: profile } = await db
    .from("squish_profiles")
    .select("id")
    .eq("id", body.profileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "האוסף לא נמצא", cid }, { status: 404 });
  }

  // סקווישי בלי שם ובלי מדיה הוא לא סקווישי. נבדק כאן ולא רק במסך.
  const name = (item.name ?? "").trim().slice(0, 40) || "סקווישי";
  if (!item.image_key && !item.video_key && !item.poster_key) {
    return NextResponse.json(
      { error: "לסקווישי חייבת להיות תמונה או סרטון", cid },
      { status: 400 }
    );
  }

  const full: Record<string, unknown> = {
    owner_user_id: user.id,
    profile_id: profile.id,
    name,
    squishy_type: item.squishy_type ?? "other",
    custom_type: item.squishy_type === "other" ? (item.custom_type || null) : null,
    size: item.size ?? "medium",
    condition: item.condition ?? "good",
    condition_note: item.condition === "flawed" ? (item.condition_note || null) : null,
    trade_status: item.trade_status === "keep" ? "keep" : "open_for_trade",
    wanted_description: item.wanted_description || null,
    image_key: item.image_key ?? null,
    video_key: item.video_key ?? null,
    poster_key: item.poster_key ?? null,
    series: item.series || null,
    stickers: (item.stickers ?? []).filter((k) => k === "rare" || k === "new"),
    sort_order: typeof item.sort_order === "number" ? item.sort_order : 0,
  };

  const dropped: OptionalItemField[] = [];

  /** ניסיון אחד. מחזיר מזהה, או את השגיאה כדי שנחליט מה לעשות איתה. */
  async function attempt(payload: Record<string, unknown>) {
    return db.from("squish_items").insert(payload).select("id").maybeSingle();
  }

  let { data, error } = await attempt(full);

  /* נפילה חוזרת אחת, ורק על עמודה אופציונלית שהדאטהבייס אמר במפורש
     שאינה מוכרת. זה בדיוק המקרה של פרודקשן שמפגר אחרי הקוד. */
  if (error) {
    const missing = unknownColumn(error.message);
    if (missing && (OPTIONAL_ITEM_FIELDS as readonly string[]).includes(missing)) {
      await logFailure(db, user.id, cid, error.code, `squish_items.${missing}`, "retrying without optional field");
      const reduced = { ...full };
      delete reduced[missing];
      dropped.push(missing as OptionalItemField);
      ({ data, error } = await attempt(reduced));
    }
  }

  if (error || !data?.id) {
    const missing = unknownColumn(error?.message);
    await logFailure(db, user.id, cid, error?.code, missing ? `squish_items.${missing}` : "squish_items.insert");
    return NextResponse.json(
      {
        error: "לא הצלחנו לשמור את הסקווישי",
        // הלקוח לא מקבל את נוסח שגיאת הדאטהבייס — רק מה שהוא צריך
        // כדי להציג מסך נכון, ומזהה שמאפשר למצוא את זה בלוג.
        reason: missing ? "schema_behind" : "write_failed",
        cid,
      },
      { status: 502 }
    );
  }

  /* הצלחה = מזהה שורה שחזר. אם ירדו שדות אופציונליים, זה נאמר ולא
     נבלע: הילדה בחרה את המדבקות האלה, והיא צריכה לדעת שהן לא שם. */
  return NextResponse.json({ id: data.id, dropped, cid });
}
