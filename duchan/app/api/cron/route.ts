import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { r2Client } from "@/lib/r2";

// קרון יומי — GET עם Authorization: Bearer CRON_SECRET.
// ב-Vercel זה מוגדר ב-vercel.json; היא שולחת את הכותרת הזו לבד כשקיים
// משתנה סביבה בשם CRON_SECRET. אפשר גם Cloudflare Worker עם Cron Trigger.
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

  const s3 = r2Client();

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
