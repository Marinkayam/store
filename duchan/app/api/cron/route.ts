import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

// קרון יומי (Cloudflare Cron → GET עם Authorization: Bearer CRON_SECRET):
// 1. פינג ל-Supabase — פרויקטים חינמיים מושהים אחרי שבוע ללא פעילות
// 2. ייצוא 3 הטבלאות ל-JSON ב-R2 — בתוכנית החינמית אין גיבוי אוטומטי

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseAdmin();
  const [stores, products, orders] = await Promise.all([
    db.from("stores").select("*"),
    db.from("products").select("*"),
    db.from("orders").select("*"),
  ]);

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const day = new Date().toISOString().slice(0, 10);
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: `_backups/${day}.json`,
      ContentType: "application/json",
      Body: JSON.stringify({
        day,
        stores: stores.data ?? [],
        products: products.data ?? [],
        orders: orders.data ?? [],
      }),
    })
  );

  return NextResponse.json({
    ok: true,
    counts: {
      stores: stores.data?.length ?? 0,
      products: products.data?.length ?? 0,
      orders: orders.data?.length ?? 0,
    },
  });
}
