"use client";

import { useEffect, useState } from "react";
import Icon from "@/app/icons";
import Chevron from "@/app/chevron";

/**
 * שורה אחת בראש ההזמנות: "היום נכנסו 5 · עכשיו 1 בדוכן", ולחיצה פותחת את
 * "מי מסתכל על הדוכן" (0062). בלי קופסה — שורה עם קו מתחת, כמו שאר הרשימות.
 */
export default function StatsPeek({ storeId }: { storeId: string }) {
  const [d, setD] = useState<{ live: number; visits: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/stats?storeId=${storeId}&range=today`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && setD({ live: j.live, visits: j.totals.visits }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [storeId]);

  return (
    <a href="/dashboard/stats" data-testid="stats-peek" className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)] bg-[var(--canvas)]">
      <span className="text-[var(--ink)]">
        <Icon name="chart" size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-bold">מי מסתכל על הדוכן</span>
        <span className="block text-[12px] text-[var(--muted)]" data-testid="stats-peek-text">
          {!d
            ? "כמה נכנסו, מאיפה ומה הכי מעניין"
            : `היום ${d.visits === 1 ? "נכנס אחד" : `נכנסו ${d.visits}`}${d.live ? ` · עכשיו ${d.live === 1 ? "מישהו" : d.live} בדוכן` : ""}`}
        </span>
      </span>
      {!!d?.live && <span className="w-2.5 h-2.5 bg-[var(--olive)] animate-pulse" aria-hidden />}
      <Chevron />
    </a>
  );
}
