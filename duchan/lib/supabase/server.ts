import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl } from "./url";

/** קליינט בשם המשתמשת המחוברת — RLS חל. לשימוש בדשבורד. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // קריאה מתוך Server Component — הרענון יקרה ב-middleware
          }
        },
      },
    }
  );
}
