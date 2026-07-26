import "server-only";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import { normalizePhone } from "./phone";

/**
 * אדמין לפי ADMIN_PHONES או ADMIN_EMAILS. אין טבלת roles ב-v1.
 *
 * הטלפון נבדק גם הוא כי הכניסה עברה לסמס: משתמשת שנכנסה עם מספר מקבלת כתובת
 * פנימית מסוג 972…@phone.duchan.app, שלעולם לא תתאים לרשימת האימיילים. בלי
 * הבדיקה הזו המנהלת ננעלת מחוץ לחמ"ל שלה עצמה ברגע שהיא נכנסת בטלפון.
 *
 * ADMIN_EMAILS נשאר עבור חשבונות שנפתחו לפני המעבר.
 */
export async function requireAdmin(): Promise<{ email: string } | null> {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  const list = (raw: string | undefined) =>
    (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const emails = list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  if (user.email && emails.includes(user.email.toLowerCase())) return { email: user.email };

  // הרשימה מנורמלת כדי ש-050-123-4567 ו-972501234567 יהיו אותו דבר
  const phones = list(process.env.ADMIN_PHONES)
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p);
  if (phones.length === 0) return null;

  const { data: acct } = await supabaseAdmin()
    .from("phone_accounts")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();

  if (acct?.phone && phones.includes(acct.phone)) {
    return { email: user.email ?? acct.phone };
  }
  return null;
}
