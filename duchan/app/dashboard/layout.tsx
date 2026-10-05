"use client";

// הדשבורד שקט בכוונה: אפור-לבן קבוע. כל הצבע שייך לחנויות.

import { usePathname, useRouter } from "next/navigation";
import Icon, { type IconName } from "../icons";
import StoreSwitcher from "./store-switcher";
import { hasUnsaved, setUnsaved, UNSAVED_PROMPT } from "@/lib/unsaved";
import KupaCelebrate from "./kupa/celebrate";

// אייקונים משלנו ולא אימוג'י: אימוג'י נראה אחרת בכל מכשיר, ואז שורת
// הניווט — הדבר שהילדה רואה בכל מסך — לא בשליטתנו.
// "הדוכן שלי" ראשון = מימין למטה (RTL), איפה שהאגודל נוח.
// הקופה בטאב משלה, אחרונה: היא הכיף, לא העבודה, אז היא לא דוחקת את השאר.
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/settings", label: "הדוכן שלי", icon: "shop" },
  { href: "/dashboard/products", label: "מוצרים", icon: "bag" },
  { href: "/dashboard", label: "הזמנות", icon: "receipt" },
  { href: "/dashboard/kupa", label: "הקופה", icon: "coin" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  return (
    /* pt באזור הבטיחות: כלום לא מתחיל מתחת לשורת השעון של האייפון. הפס הקבוע
       בצבע הדף מכסה את האזור הזה גם כשגוללים (אחרת התוכן עובר מתחת לשעון). */
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col max-w-md mx-auto pt-[env(safe-area-inset-top)]">
      <div aria-hidden className="fixed top-0 inset-x-0 h-[env(safe-area-inset-top)] bg-[var(--canvas)] z-[45]" />
      {/* חגיגות של קופת הדוכן: אות חדש, עלייה ברמה */}
      <KupaCelebrate />
      <StoreSwitcher />
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
      {/* באייפון: רק כמה פיקסלים מעל פס הבית, לא כל אזור הבטיחות + ריווח —
          אחרת נשאר רווח לבן גדול מתחת לשורה */}
      <nav data-bottom-bar className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-[var(--line)] flex pt-1.5 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.875rem))] z-40">
        {TABS.map((t) => {
          const on = path === t.href;
          return (
            <button
              key={t.href}
              aria-current={on ? "page" : undefined}
              onClick={() => {
                if (hasUnsaved() && !window.confirm(UNSAVED_PROMPT)) return;
                setUnsaved(false);
                router.push(t.href);
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 text-[11px] ${on ? "text-[var(--ink)] font-medium" : "text-[var(--muted)]"}`}
            >
              <Icon
                name={t.icon}
                size={21}
                tone={on ? "var(--lavender)" : "var(--sand)"}
              />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
