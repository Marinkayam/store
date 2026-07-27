"use client";

// הדשבורד שקט בכוונה: אפור-לבן קבוע. כל הצבע שייך לחנויות.

import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "הזמנות", icon: "🧾" },
  { href: "/dashboard/products", label: "מוצרים", icon: "🛍️" },
  { href: "/dashboard/share", label: "להפיץ", icon: "📣" },
  { href: "/dashboard/settings", label: "החנות שלי", icon: "⭐" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col max-w-md mx-auto">
      <div className="flex-1 pb-20">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-[var(--line)] flex pt-1.5 pb-3 z-40">
        {TABS.map((t) => {
          const on = path === t.href;
          return (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 text-[10px] ${on ? "text-[var(--ink)] font-medium" : "text-[var(--muted)]"}`}
            >
              <span className={`text-lg ${on ? "" : "grayscale opacity-60"}`}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
