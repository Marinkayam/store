import { requireAdmin } from "@/lib/admin-auth";
import AdminView from "./admin-view";

// role-gated: אימייל מתוך ADMIN_EMAILS בלבד. כל השאר מקבלים 404-סגנון.

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        אין כאן כלום 🌵
      </div>
    );
  }
  // האם לשרת יש מפתח Anthropic. בלעדיו אפשר להדליק "כתיבה אוטומטית" לחנות,
  // והילדה תלחץ ותקבל שגיאה — אז החמ"ל צריך לדעת את זה ולומר אותו.
  return <AdminView aiConfigured={!!process.env.ANTHROPIC_API_KEY} />;
}
