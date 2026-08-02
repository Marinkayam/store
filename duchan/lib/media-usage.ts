import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2Client } from "./r2";

/**
 * ספירת מדיה מחדש — התיקון לבאג "נגמר המקום" שלא משתחרר.
 *
 * media_bytes עלה בכל העלאה ולא ירד לעולם: החלפת תמונה נספרה פעמיים,
 * מחיקת מוצר לא פינתה כלום, וההודעה "אפשר למחוק סרטון ישן כדי לפנות"
 * הבטיחה דבר שלא קרה. ים נתקעה ככה עם חנות "מלאה" שרובה רוח.
 *
 * הגישה: לא לרדוף אחרי כל מחיקה והחלפה עם ניכוי — אלא לספור מחדש את
 * האמת מהאחסון עצמו כשזה משנה. נקראת ממסלול ההעלאה בדיוק כשמכסה
 * נתפסת מלאה: סופרים מה באמת קיים, ורק אם גם האמת מלאה — מסרבים.
 *
 * מה נספר: מדיה שמקושרת לשורות חיות בלבד. מוצר שנמחק (מחיקה רכה)
 * שומר את הקבצים שלו ל-30 ימי שחזור, אבל לא תופס מכסה — האחסון עצמו
 * זול; המכסה קיימת לבלימת שימוש חי מוגזם, לא לחשבונאות קבצים.
 */

async function listSizes(prefix: string): Promise<Map<string, number> | null> {
  try {
    const client = r2Client();
    const sizes = new Map<string, number>();
    let token: string | undefined;
    do {
      const out = await client.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET!,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const o of out.Contents ?? []) if (o.Key) sizes.set(o.Key, o.Size ?? 0);
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return sizes;
  } catch (e) {
    // אין רשימה — אין ספירה. המכסה הישנה נשארת, וזה כשל שקט במתכוון:
    // עדיף סירוב שמרני מאשר מכסה שנפתחת בגלל תקלת רשת.
    console.error("[media-usage] list failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** סופרת מחדש את מדיית החנות. מחזירה את הערך החדש, או null אם אי אפשר לדעת. */
export async function recountStoreMedia(db: SupabaseClient, storeId: string): Promise<number | null> {
  const [{ data: store }, { data: products }, sizes] = await Promise.all([
    db.from("stores").select("cover_key").eq("id", storeId).maybeSingle(),
    db.from("products").select("image_key, video_key, poster_key").eq("store_id", storeId).is("deleted_at", null),
    listSizes(`${storeId}/`),
  ]);
  if (!sizes) return null;

  const refs = new Set<string>();
  if (store?.cover_key) refs.add(store.cover_key);
  for (const p of products ?? []) {
    for (const k of [p.image_key, p.video_key, p.poster_key]) if (k) refs.add(k);
  }

  let total = 0;
  for (const [key, size] of sizes) {
    /* קאבר ואווטאר יושבים במפתח קבוע ותמיד חיים; השאר לפי הפניה */
    if (refs.has(key) || /\/(cover|avatar)\.[a-z0-9]+$/.test(key)) total += size;
  }
  await db.from("stores").update({ media_bytes: total }).eq("id", storeId);
  return total;
}

/** אותו דבר לאוסף סקוויש — המכסה שם יושבת על הפרופיל. */
export async function recountSquishMedia(
  db: SupabaseClient,
  profileId: string,
  ownerUserId: string
): Promise<number | null> {
  const [{ data: profile }, { data: items }, sizes] = await Promise.all([
    db.from("squish_profiles").select("cover_key, avatar_key").eq("id", profileId).maybeSingle(),
    db.from("squish_items").select("image_key, video_key, poster_key").eq("owner_user_id", ownerUserId),
    listSizes(`squish/items/${profileId}/`),
  ]);
  if (!sizes) return null;

  const refs = new Set<string>();
  for (const k of [profile?.cover_key, profile?.avatar_key]) if (k) refs.add(k);
  for (const it of items ?? []) {
    for (const k of [it.image_key, it.video_key, it.poster_key]) if (k) refs.add(k);
  }

  let total = 0;
  for (const [key, size] of sizes) if (refs.has(key)) total += size;
  await db.from("squish_profiles").update({ media_bytes: total }).eq("id", profileId);
  return total;
}
