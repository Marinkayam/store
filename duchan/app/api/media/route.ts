import { NextResponse } from "next/server";
import { mediaUrl } from "@/lib/media";

/**
 * תמונת מוצר מאותו דומיין, בשביל "תמונה לסטטוס" (app/dashboard/status-image.tsx).
 *
 * קנבס בדפדפן לא מוכן לייצא תמונה שצייר עליה תמונה מדומיין אחר בלי CORS,
 * והמדיה יושבת ב-R2. כאן מגישים את אותה תמונה מ-duchan.app.
 *
 * רק תמונות מוצר של דוכן (המפתח שנוצר ב-/api/upload), שהן ממילא ציבוריות
 * בדוכן. לא וידאו, לא מפתחות אחרים, ולא כתובת חופשית: אין כאן פרוקסי פתוח.
 */

const KEY = /^[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\.(webp|jpg|jpeg|png)$/;

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!KEY.test(k)) return new NextResponse("bad key", { status: 400 });
  const url = mediaUrl(k);
  if (!url) return new NextResponse("no media", { status: 404 });
  const r = await fetch(url, { cache: "force-cache" }).catch(() => null);
  if (!r || !r.ok) return new NextResponse("not found", { status: 404 });
  const type = r.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return new NextResponse("not an image", { status: 415 });
  return new NextResponse(r.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, immutable",
      "x-robots-tag": "noindex",
    },
  });
}
