import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignedUpload } from "@/lib/r2";
import { QUOTAS } from "@/lib/quotas";

// POST /api/upload  { kind: 'image'|'video'|'poster'|'cover', contentType, bytes }
// השרת מאמת בעלות ומכסה לפני שהוא חותם, ומעדכן media_bytes.

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg", // ספארי ישן לא מקודד webp, הקנבס נופל ל-JPEG
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const IMAGE_TYPES = ["image/webp", "image/jpeg"];

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברים" }, { status: 401 });

  let body: { kind?: string; contentType?: string; bytes?: number; storeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { kind, contentType, bytes, storeId } = body;
  if (
    !kind || !["image", "video", "poster", "cover", "avatar", "squish", "squish-video", "squish-poster"].includes(kind) ||
    !contentType || !(contentType in EXT) ||
    !bytes || bytes <= 0 || bytes > QUOTAS.maxUploadBytes
  ) {
    // הסוג נכנס להודעה בכוונה: "קובץ לא נתמך" בלי פרטים שלח אותנו לחפש
    // באפלה כשסרטוני אייפון (video/quicktime) נדחו כולם.
    return NextResponse.json(
      { error: `קובץ לא נתמך${contentType ? ` (${contentType})` : ""}` },
      { status: 400 }
    );
  }
  // "squish-video" הוא וידאו לכל דבר. בלי החרגה מפורשת הוא נופל כאן
  // על כך שהוא לא תמונה, והסרטון נשמט בשקט מהפריט.
  const isVideoKind = kind === "video" || kind === "squish-video";
  if (!isVideoKind && !IMAGE_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "תמונות חייבות לעבור עיבוד באפליקציה" }, { status: 400 });
  }

  const db = supabaseAdmin();

  /**
   * סקוויש קלאב מעלה מול פרופיל האוסף ולא מול חנות.
   *
   * עד כאן המסלול היחיד היה "מצא חנות של המשתמשת", ולכן אספנית שאין לה
   * דוכן לא יכלה להעלות כלום. המכסה נספרת בנפרד על squish_profiles, כדי
   * שאוסף לא יאכל את המקום של החנות ולהפך.
   */
  if (kind.startsWith("squish")) {
    /**
     * ולידציה בשרת, לא רק בדפדפן.
     *
     * הבדיקה בקליינט (validateGalleryVideo) קיימת כדי לתת הודעה מיידית,
     * אבל היא רצה בקוד שאפשר לעקוף. החתימה נותנת הרשאת כתיבה לאחסון,
     * ולכן התנאים נאכפים כאן: רק סוגי וידאו מוכרים, ותקרת גודל נפרדת
     * שמתאימה לחמש שניות ב-1.5Mbps ולא ל-25MB של גלריה.
     *
     * משך הסרטון עצמו לא נקרא כאן — השרת חותם לפני שהקובץ קיים. התקרה
     * הזו היא הפרוקסי המעשי לאורך, והפוסטר נוצר בקליינט מהפריים הראשון.
     */
    if (kind === "squish-video") {
      if (!["video/mp4", "video/webm"].includes(contentType)) {
        return NextResponse.json({ error: "אפשר להעלות רק סרטון mp4 או webm" }, { status: 400 });
      }
      if (bytes > 12 * 1024 * 1024) {
        return NextResponse.json({ error: "הסרטון ארוך או כבד מדי, עד 5 שניות" }, { status: 413 });
      }
    } else if (!IMAGE_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "תמונות חייבות לעבור עיבוד באפליקציה" }, { status: 400 });
    }

    const { data: profiles, error } = await db
      .from("squish_profiles")
      .select("id, media_bytes")
      .eq("user_id", user.id)
      .limit(1);
    if (error) {
      console.error("[upload] squish profile lookup failed:", error.message);
      return NextResponse.json({ error: "לא הצלחנו לאמת את האוסף" }, { status: 500 });
    }
    const profile = profiles?.[0];
    if (!profile) return NextResponse.json({ error: "עוד אין לך אוסף" }, { status: 404 });
    if (profile.media_bytes + bytes > QUOTAS.mediaBytesPerStore) {
      return NextResponse.json(
        { error: "נגמר המקום באוסף, אפשר למחוק סרטון ישן כדי לפנות" },
        { status: 413 }
      );
    }
    const squishKey = `squish/items/${profile.id}/${randomUUID()}.${EXT[contentType]}`;
    const squishUrl = await presignedUpload(squishKey, contentType, bytes);
    await db
      .from("squish_profiles")
      .update({ media_bytes: profile.media_bytes + bytes })
      .eq("id", profile.id);
    return NextResponse.json({ url: squishUrl, key: squishKey });
  }

  // storeId מפורש כשיש יותר מחנות אחת לחשבון — אחרת ההעלאה נוחתת בחנות הלא נכונה.
  // הבעלות נאכפת כאן בכל מקרה.
  let query = db.from("stores").select("id, media_bytes").eq("owner_id", user.id);
  query = storeId ? query.eq("id", storeId) : query.order("created_at", { ascending: true });
  const { data: stores } = await query.limit(1);
  const store = stores?.[0];
  if (!store) return NextResponse.json({ error: "אין לך חנות עדיין" }, { status: 404 });

  if (store.media_bytes + bytes > QUOTAS.mediaBytesPerStore) {
    return NextResponse.json(
      { error: "נגמר המקום בחנות, אפשר למחוק סרטון ישן כדי לפנות" },
      { status: 413 }
    );
  }

  const key =
    kind === "cover"
      ? `${store.id}/cover.${EXT[contentType]}`
      : kind === "avatar"
        ? `${store.id}/avatar.${EXT[contentType]}`
        : `${store.id}/products/${randomUUID()}.${EXT[contentType]}`;

  const url = await presignedUpload(key, contentType, bytes);

  // עדכון המכסה בהנחת הצלחה; חתימה שלא מומשה תתוקן בקרון הגיבוי היומי
  await db
    .from("stores")
    .update({ media_bytes: store.media_bytes + bytes })
    .eq("id", store.id);

  return NextResponse.json({ url, key });
}
