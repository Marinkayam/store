"use client";

import { KupaStall, Coin, Medal } from "@/app/kupa-art";
import Chevron from "@/app/chevron";
import { nextBadge } from "@/lib/kupa";
import { useKupa } from "./use-kupa";

/**
 * הכרטיס של קופת הדוכן ב"הדוכן שלי": הדוכן המצויר ברמה הנוכחית, כמה
 * מטבעות יש, כמה חסר לרמה הבאה, ומה הצעד הבא. כל הכרטיס הוא קישור לקופה.
 *
 * בזמן הטעינה הכרטיס שומר את המקום שלו (שלד), כדי שהמסך לא יקפוץ.
 */
export default function KupaCard({ storeId }: { storeId: string }) {
  const { kupa } = useKupa(storeId);

  if (!kupa) {
    return <div className="h-[132px] bg-white border border-[var(--line)]" aria-hidden data-testid="kupa-card-loading" />;
  }
  const nb = nextBadge(kupa);
  return (
    <a
      href="/dashboard/kupa"
      data-testid="kupa-card"
      aria-label={`קופת הדוכן: ${kupa.coins} מטבעות, ${kupa.levelName}`}
      className="fx-press block bg-white border border-[var(--line)] text-right"
    >
      <div className="flex items-stretch">
        <div className="w-[118px] shrink-0 border-l border-[var(--line)]">
          <KupaStall level={kupa.level} name={kupa.name} className="w-full h-full block" />
        </div>
        <div className="flex-1 min-w-0 px-3.5 py-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14.5px] font-bold text-[var(--ink)]">קופת הדוכן</span>
            <span className="flex items-center gap-1 text-[15px] font-black tabular-nums" data-testid="kupa-card-coins">
              {kupa.coins}
              <Coin size={18} />
            </span>
          </div>
          <span className="text-[12px] text-[var(--muted)] leading-tight">
            רמה {kupa.level + 1} · {kupa.levelName}
          </span>
          {kupa.next && (
            <div className="h-2 bg-[var(--sand)] relative overflow-hidden" aria-hidden>
              <i className="kp-fill absolute inset-y-0 right-0 bg-[var(--wood)]" style={{ width: `${Math.round(kupa.next.progress * 100)}%` }} />
            </div>
          )}
          {nb ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ink)] leading-tight mt-0.5">
              <Medal icon={nb.icon} reached={false} size={22} />
              <span className="min-w-0">
                הצעד הבא: <b>{nb.title}</b>
              </span>
              <span className="shrink-0 text-[var(--wood)] font-bold">+{nb.coins}</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-[var(--ok-ink)] font-bold">כל האותות אצלך!</span>
          )}
        </div>
        <span className="flex items-center pl-2.5">
          <Chevron className="text-[var(--faint)]" />
        </span>
      </div>
    </a>
  );
}
