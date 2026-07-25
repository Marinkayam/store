import "server-only";
import { supabaseServer } from "./supabase/server";

/** אדמין = אימייל שמופיע ב-ADMIN_EMAILS. אין טבלת roles ב-v1. */
export async function requireAdmin(): Promise<{ email: string } | null> {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) return null;

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(user.email.toLowerCase()) ? { email: user.email } : null;
}
