"use client";

// הדשבורד שקט בכוונה: אפור-לבן קבוע. כל הצבע שייך לחנויות.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "./use-store";
import Icon, { type IconName } from "../icons";
import StoreSwitcher from "./store-switcher";
import { hasUnsaved, setUnsaved, UNSAVED_PROMPT } from "@/lib/unsaved";
import KupaCelebrate from "./kupa/celebrate";
import LiveCelebration from "./live-celebration";
import HolidaySplash from "./holiday-splash";
import { HanukkahGarland } from "@/app/hanukkah";
import { SeasonGarland } from "@/app/seasonal";

// אייקונים משלנו ולא אימוג'י: אימוג'י נראה אחרת בכל מכשיר, ואז שורת
// הניווט — הדבר שהילדה רואה בכל מסך — לא בשליטתנו.
// "הדוכן שלי" ראשון = מימין למטה (RTL), איפה שהאגודל נוח.
// המשחק (עד 11.2026 "הקופה"; מרינה: "בוא נשנה את השם של הקופה למשחק") בטאב
// משלו, אחרון: הוא הכיף, לא העבודה, אז הוא לא דוחק את השאר.
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/settings", label: "הדוכן שלי", icon: "shop" },
  { href: "/dashboard/products", label: "מוצרים", icon: "bag" },
  { href: "/dashboard", label: "הזמנות", icon: "receipt" },
  { href: "/dashboard/kupa", label: "משחק", icon: "coin" },
];

/**
 * כמה הזמנות חדשות מחכות (status = sent, אותו מספר כמו "חדשות" במסך
 * ההזמנות). מרינה, 11.2026: "שאם יש הזמנה אני רואה אייקון על ההזמנות".
 * נבדק בכניסה, במעבר בין מסכים, כשחוזרים לאפליקציה, ופעם בדקה.
 */
function useNewOrders(storeId: string | undefined, path: string | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    const load = () =>
      supabaseBrowser()
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "sent")
        .then(({ count: n }) => alive && setCount(n ?? 0));
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    const timer = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    // מסך ההזמנות מודיע כשהזמנה סומנה או בוטלה, כדי שהמספר יתעדכן מיד
    window.addEventListener("duchan-orders-changed", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("duchan-orders-changed", load);
    };
  }, [storeId, path]);
  return count;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { store } = useStore();
  const newOrders = useNewOrders(store?.id, path);

  /* מעבר בין מסכים מתחיל מלמעלה: אזור הגלילה משותף לכל הטאבים, ובלי זה
     מסך חדש היה נפתח באמצע, איפה שהקודם נעצר. */
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [path]);

  return (
    /* מעטפת אפליקציה: גובה המסך קבוע, התוכן נגלל באזור משלו, והתפריט
       התחתון יושב מתחתיו בזרימה רגילה ולא ב-position: fixed. מרינה, 11.2026:
       "התפריט לא סטיקי למטה וזה מעצבן … שיהיה סטיקי ולא זז". תפריט fixed
       על דף שנגלל זז באייפון עם הקפיצה של סוף הגלילה ועם הסרגל של ספארי;
       כשהדף עצמו לא נגלל, אין לו ממה לזוז.
       pt באזור הבטיחות: כלום לא מתחיל מתחת לשורת השעון של האייפון. */
    <div className="dash-shell bg-[var(--canvas)] flex flex-col max-w-md mx-auto pt-[env(safe-area-inset-top)] overflow-hidden">
      {/* חגיגות של קופת הדוכן: אות חדש, עלייה ברמה */}
      {/* "התשלום התקבל, הדוכן באוויר!" — פעם אחת אחרי ההפעלה */}
      <LiveCelebration />
      <KupaCelebrate />
      {/* ספלאש של חג, פעם אחת בכל חג (holiday-splash.tsx) */}
      {store && <HolidaySplash store={store} />}
      <div ref={scroller} data-scroll-root className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-2">
        <HanukkahGarland />
        <SeasonGarland />
        <StoreSwitcher />
        {children}
      </div>
      {/* כפתורי הפעולה של העמוד (מוצר חדש, שמירה) נכנסים לכאן דרך <Dock>:
          חלק מהמעטפת, צמודים לניווט, ושום תוכן לא מציץ מתחתם */}
      <div id="dash-dock" className="shrink-0 empty:hidden" />
      {/* באייפון: רק כמה פיקסלים מעל פס הבית, לא כל אזור הבטיחות + ריווח —
          אחרת נשאר רווח לבן גדול מתחת לשורה */}
      <nav data-bottom-bar className="shrink-0 relative z-40 bg-white border-t border-[var(--line)] flex pt-1.5 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.875rem))]">
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
              {/* קופסה קבועה: ארבעת האייקונים יושבים על אותה שורה, גם עם התג */}
              <span className="relative flex items-center justify-center w-[21px] h-[21px]">
                <Icon
                  name={t.icon}
                  size={21}
                  tone={on ? "var(--lavender)" : "var(--sand)"}
                />
                {t.href === "/dashboard" && newOrders > 0 && (
                  <span
                    data-testid="orders-badge"
                    /* מרובע, כמו כל השאר בדשבורד (e2e-square: בלי פינות מעוגלות) */
                    className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[var(--danger)] text-white text-[11px] font-bold leading-none"
                  >
                    <span dir="ltr">{newOrders > 9 ? "9+" : newOrders}</span>
                    <span className="sr-only"> הזמנות חדשות</span>
                  </span>
                )}
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
