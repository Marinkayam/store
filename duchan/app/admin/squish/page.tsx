import { requireAdmin } from "@/lib/admin-auth";
import SquishAdmin from "./squish-admin";

// role-gated כמו שאר החמ"ל. דיווחים לא נראים לאף אחד אחר.

export const metadata = { robots: { index: false, follow: false } };

export default async function SquishAdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        אין כאן כלום 🌵
      </div>
    );
  }
  return <SquishAdmin />;
}
