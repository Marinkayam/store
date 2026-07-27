import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, presignedUpload } from "@/lib/r2";

// GET /api/upload-status?key=<CRON_SECRET>
//
// אבחון להעלאת קבצים. הבעיה כאן כמעט תמיד אחת משתיים, והן דורשות תיקון
// במקומות שונים לגמרי:
//
//   1. השרת לא מצליח לדבר עם האחסון — מפתח, דלי או חשבון שגויים.
//   2. השרת בסדר, אבל *הדפדפן* נחסם — הגדרת CORS בדלי לא מרשה לכתובת
//      של האתר לכתוב אליו. זו הבעיה הנפוצה, והיא בלתי נראית מהשרת.
//
// לכן כאן בודקים את (1) בפועל — כותבים אובייקט אמיתי ומוחקים אותו — וגם
// מחזירים כתובת חתומה שהדפדפן ינסה לכתוב אליה בעצמו, כדי לבדוק את (2).
// הבדיקה מהדפדפן יושבת ב-/diag/upload.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  }

  const present = (v?: string) => (v && v.trim().length > 0 ? "✓ קיים" : "✗ חסר");
  const env = {
    R2_ACCOUNT_ID: present(process.env.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: present(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: present(process.env.R2_SECRET_ACCESS_KEY),
    R2_BUCKET: present(process.env.R2_BUCKET),
    NEXT_PUBLIC_R2_PUBLIC_URL: present(process.env.NEXT_PUBLIC_R2_PUBLIC_URL),
  };

  // R2_ENDPOINT הוא override לבדיקות מקומיות. בפרודקשן הוא אמור להיות ריק,
  // ואם הוא הוגדר שם בטעות — כל החתימות הולכות לכתובת הלא נכונה.
  const endpointOverride = (process.env.R2_ENDPOINT ?? "").trim();
  const endpoint = endpointOverride
    ? `⚠ R2_ENDPOINT מוגדר (${endpointOverride}), בפרודקשן הוא אמור להיות ריק`
    : "✓ ברירת מחדל (cloudflarestorage.com)";

  const bucket = process.env.R2_BUCKET ?? "";
  const probeKey = `_diag/probe-${Date.now()}.txt`;
  let serverWrite: string;
  try {
    const c = r2Client();
    await c.send(
      new PutObjectCommand({ Bucket: bucket, Key: probeKey, Body: "duchan", ContentType: "text/plain" })
    );
    await c.send(new GetObjectCommand({ Bucket: bucket, Key: probeKey }));
    await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));
    serverWrite = "✓ השרת כותב וקורא מהאחסון";
  } catch (e) {
    serverWrite = `✗ השרת לא מצליח לכתוב, ${(e as Error).message}`;
  }

  // הכתובת הפומבית: מכאן הדפדפן *קורא* את התמונות. אם היא שגויה, ההעלאה
  // מצליחה והתמונה לא מופיעה — תסמין אחר לגמרי, ולכן נבדק בנפרד.
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  let publicRead: string;
  if (!base) publicRead = "✗ חסרה כתובת ציבורית לתמונות";
  else {
    try {
      const c = r2Client();
      const k = `_diag/public-${Date.now()}.txt`;
      await c.send(new PutObjectCommand({ Bucket: bucket, Key: k, Body: "duchan", ContentType: "text/plain" }));
      const res = await fetch(`${base}/${k}`, { cache: "no-store" });
      publicRead = res.ok
        ? "✓ הכתובת הציבורית מחזירה קבצים"
        : `✗ הכתובת הציבורית מחזירה ${res.status}, הדלי כנראה לא פתוח לקריאה`;
      await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })).catch(() => {});
    } catch (e) {
      publicRead = `✗ הכתובת הציבורית לא נענית, ${(e as Error).message}`;
    }
  }

  // כתובת חתומה לבדיקה מהדפדפן. אובייקט זמני בתיקיית אבחון, לא בחנות.
  let browserProbe: { url: string; key: string } | null = null;
  try {
    const k = `_diag/browser-${Date.now()}.webp`;
    browserProbe = { url: await presignedUpload(k, "image/webp", 8), key: k };
  } catch {
    browserProbe = null;
  }

  return NextResponse.json({
    env,
    endpoint,
    serverWrite,
    publicRead,
    browserProbe,
    next: "לפתוח /diag/upload?key=… מהטלפון, זו הבדיקה שמגלה אם הדפדפן נחסם ב-CORS",
  });
}
