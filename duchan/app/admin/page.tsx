import { requireAdmin } from "@/lib/admin-auth";
import AdminView from "./admin-view";

// role-gated: אימייל מתוך ADMIN_EMAILS בלבד. כל השאר מקבלים 404-סגנון.

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#7A7D8A]">
        אין כאן כלום 🌵
      </div>
    );
  }
  return <AdminView />;
}
