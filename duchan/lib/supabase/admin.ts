import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service role — שרת בלבד, עוקף RLS. משמש את הקריאה הפומבית של דף החנות
 * (שמחזירה שדות מפורשים בלבד), את API ההזמנות ואת האדמין.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
