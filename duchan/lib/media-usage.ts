import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2Client } from "./r2";
import { cleanMeta } from "./category-style";

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
    db.from("stores").select("cover_key, bg_key, category_meta").eq("id", storeId).maybeSingle(),
    db.from("products").select("image_key, video_key, poster_key").eq("store_id", storeId).is("deleted_at", null),
    listSizes(`${storeId}/`),
  ]);
  if (!sizes) return null;

  const refs = new Set<string>();
  if (store?.cover_key) refs.add(store.cover_key);
  if (store?.bg_key) refs.add(store.bg_key);
  for (const m of Object.values(cleanMeta(store?.category_meta))) if (m.image) refs.add(m.image);
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

/**
 * תפיסת מקום במכסה לפני חתימה — אטומית.
 *
 * קודם: קוראים media_bytes, חותמים, וכותבים media_bytes + bytes. עשר
 * בקשות במקביל קראו כולן את אותו ערך, כולן עברו את הבדיקה, וכל אחת
 * דרסה את הכתיבה של השנייה — המכסה נפרצה והמונה נשאר נמוך.
 *
 * עכשיו: עדכון מותנה אחד, reserve_*_media (0069) —
 *   update … set media_bytes = media_bytes + n where media_bytes + n <= cap
 * בקשה מקבילה ממתינה לנעילת השורה ונבדקת מול הערך החדש.
 *
 * הקוד עולה לפני המיגרציה, ולכן כשהפונקציה עוד לא קיימת נופלים ל-
 * compare-and-set ("עדכן רק אם media_bytes עדיין מה שקראתי") עם ניסיונות
 * חוזרים. גם הוא לא מאפשר לעבור את התקרה; תחת עומס הוא רק עלול לוותר
 * ("busy") במקום לחכות.
 *
 * "full" = אין מקום גם אחרי ספירה מחדש מהאחסון. "busy" = שגיאה או עומס
 * חריג — לנסות שוב.
 */
type MediaTable = "stores" | "squish_profiles";
const RPC: Record<MediaTable, { fn: string; idArg: string }> = {
  stores: { fn: "reserve_store_media", idArg: "p_store" },
  squish_profiles: { fn: "reserve_squish_media", idArg: "p_profile" },
};

/** הפונקציה מ-0069 עוד לא קיימת בדאטהבייס (PostgREST: PGRST202, פוסטגרס: 42883) */
function missingFn(err: { code?: string; message?: string }): boolean {
  return err.code === "PGRST202" || err.code === "42883" || /could not find the function|does not exist/i.test(err.message ?? "");
}

/** ניסיון אחד לתפוס/לשחרר. "ok" · "nope" (אין מקום) · "missing" · "error" */
async function tryReserve(
  db: SupabaseClient,
  table: MediaTable,
  id: string,
  bytes: number,
  cap: number
): Promise<"ok" | "nope" | "missing" | "error"> {
  const { fn, idArg } = RPC[table];
  const { data, error } = await db.rpc(fn, { [idArg]: id, p_bytes: bytes, p_cap: cap });
  if (error) {
    if (missingFn(error)) return "missing";
    console.error(`[media-usage] ${fn} failed:`, error.message);
    return "error";
  }
  return data === null || data === undefined ? "nope" : "ok";
}

/** הנפילה למקרה שהמיגרציה עוד לא רצה: compare-and-set עם המתנה קצרה. */
async function casReserve(
  db: SupabaseClient,
  table: MediaTable,
  id: string,
  bytes: number,
  cap: number
): Promise<"ok" | "nope" | "error"> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * attempt));
    const { data, error } = await db.from(table).select("media_bytes").eq("id", id).maybeSingle();
    if (error || !data) return "error";
    const cur = Number((data as { media_bytes: number }).media_bytes);
    if (bytes > 0 && cur + bytes > cap) return "nope";
    const { data: hit, error: upErr } = await db
      .from(table)
      .update({ media_bytes: Math.max(0, cur + bytes) })
      .eq("id", id)
      .eq("media_bytes", cur)
      .select("id");
    if (upErr) return "error";
    if ((hit?.length ?? 0) > 0) return "ok";
    // מישהי אחרת עדכנה בין הקריאה לכתיבה — קוראים שוב
  }
  return "error";
}

async function reserveOnce(
  db: SupabaseClient,
  table: MediaTable,
  id: string,
  bytes: number,
  cap: number
): Promise<"ok" | "nope" | "error"> {
  const r = await tryReserve(db, table, id, bytes, cap);
  return r === "missing" ? casReserve(db, table, id, bytes, cap) : r;
}

export async function reserveMedia(
  db: SupabaseClient,
  opts: {
    table: MediaTable;
    id: string;
    bytes: number;
    cap: number;
    recount: () => Promise<number | null>;
  }
): Promise<"ok" | "full" | "busy"> {
  const first = await reserveOnce(db, opts.table, opts.id, opts.bytes, opts.cap);
  if (first === "ok") return "ok";
  if (first === "error") return "busy";
  /* המונה רק עולה בהעלאות — החלפות ומחיקות לא הורידו אותו, והמכסה
     "נסתמה" מרוח. לפני שמסרבים, סופרים את האמת מהאחסון (הספירה כותבת
     את הערך לשורה) ומנסים לתפוס שוב, באותו עדכון מותנה. */
  const fresh = await opts.recount();
  if (fresh === null || fresh + opts.bytes > opts.cap) return "full";
  const second = await reserveOnce(db, opts.table, opts.id, opts.bytes, opts.cap);
  return second === "ok" ? "ok" : second === "nope" ? "full" : "busy";
}

/** שחרור מקום שנתפס כשהחתימה עצמה נכשלה. מאמץ סביר, לא הבטחה — הספירה
    מחדש והקרון היומי מתקנים כל סטייה. */
export async function releaseMedia(db: SupabaseClient, table: MediaTable, id: string, bytes: number): Promise<void> {
  await reserveOnce(db, table, id, -bytes, Number.MAX_SAFE_INTEGER);
}
