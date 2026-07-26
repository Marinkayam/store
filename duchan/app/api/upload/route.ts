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
  "image/jpeg": "jpg", // ספארי ישן לא מקודד webp — הקנבס נופל ל-JPEG
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const IMAGE_TYPES = ["image/webp", "image/jpeg"];

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחוברת" }, { status: 401 });

  let body: { kind?: string; contentType?: string; bytes?: number; storeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const { kind, contentType, bytes, storeId } = body;
  if (
    !kind || !["image", "video", "poster", "cover", "avatar"].includes(kind) ||
    !contentType || !(contentType in EXT) ||
    !bytes || bytes <= 0 || bytes > QUOTAS.maxUploadBytes
  ) {
    return NextResponse.json({ error: "קובץ לא נתמך" }, { status: 400 });
  }
  if (kind !== "video" && !IMAGE_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "תמונות חייבות לעבור עיבוד באפליקציה" }, { status: 400 });
  }

  // storeId מפורש כשיש יותר מחנות אחת לחשבון — אחרת ההעלאה נוחתת בחנות הלא נכונה.
  // הבעלות נאכפת כאן בכל מקרה.
  const db = supabaseAdmin();
  let query = db.from("stores").select("id, media_bytes").eq("owner_id", user.id);
  query = storeId ? query.eq("id", storeId) : query.order("created_at", { ascending: true });
  const { data: stores } = await query.limit(1);
  const store = stores?.[0];
  if (!store) return NextResponse.json({ error: "אין לך חנות עדיין" }, { status: 404 });

  if (store.media_bytes + bytes > QUOTAS.mediaBytesPerStore) {
    return NextResponse.json(
      { error: "נגמר המקום בחנות — אפשר למחוק סרטון ישן כדי לפנות" },
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
