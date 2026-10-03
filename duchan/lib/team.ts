import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayPhone } from "./phone";

/**
 * דוכן משותף (0057) — הכללים, במקום אחד.
 *
 * ראש הדוכן = stores.owner_id. שותפים = store_members. שותף/ה אחד/ת לכל
 * היותר — 2 אנשים בדוכן, ראש הדוכן ועוד אחד/ת (מרינה: "רק 2 גג"). כל פעולה על הצוות עוברת ב-/api/team, בשרת, עם
 * service role — הדפדפן לא כותב לטבלאות האלה בכלל.
 */
export const MAX_PARTNERS = 1;
export const INVITE_DAYS = 7;

export type Role = "owner" | "partner";

export async function storeRole(db: SupabaseClient, storeId: string, userId: string): Promise<Role | null> {
  const { data: s } = await db.from("stores").select("owner_id").eq("id", storeId).maybeSingle();
  if (!s) return null;
  if (s.owner_id === userId) return "owner";
  const { data: m } = await db
    .from("store_members")
    .select("user_id")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  return m ? "partner" : null;
}

/** ראש הדוכן או שותף/ה. לשימוש בכל מסלול בשרת שעד היום בדק owner_id בלבד. */
export async function canManage(db: SupabaseClient, storeId: string, userId: string): Promise<boolean> {
  return (await storeRole(db, storeId, userId)) !== null;
}

/** המספר המאומת של המשתמש/ת (מהכניסה בסמס) */
export async function phoneOf(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from("phone_accounts").select("phone").eq("user_id", userId).limit(1).maybeSingle();
  return data?.phone ?? null;
}

/** "050-•••-4567" — מספיק כדי לזהות, בלי לחשוף את כל המספר */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = displayPhone(e164);
  return d.length >= 10 ? `${d.slice(0, 3)}-•••-${d.slice(-4)}` : d;
}
