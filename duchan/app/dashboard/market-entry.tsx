"use client";

import { useEffect, useState } from "react";
import { localityName } from "@/lib/localities";
import CloseX from "@/app/close-x";

/**
 * הכניסה לשוק של העיר ממסך ההזמנות (0077).
 *   • הזמינו אתכם (לינק של חבר): כרטיס בולט.
 *   • כבר בשוק, או מחכים להורים: שורה קטנה.
 *   • עוד לא: כרטיס "חדש" עם איקס, שנעלם ל-30 יום. בלי לחפור.
 */
export default function MarketEntry({ storeId }: { storeId: string }) {
  const [view, setView] = useState<null | { kind: "invite" | "new" | "member" | "wait"; title?: string }>(null);
  const laterKey = `duchan-market-later-${storeId}`;

  useEffect(() => {
    let invited = false;
    try {
      invited = !!JSON.parse(localStorage.getItem("duchan-market-invite") ?? "null")?.c;
    } catch {}
    fetch(`/api/market?storeId=${storeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.unavailable) return;
        if (d.state === "active") return setView({ kind: "member", title: `השוק של ${localityName(d.cityId) ?? "העיר"}` });
        if (d.state === "parent") return setView({ kind: "wait" });
        if (invited) return setView({ kind: "invite" });
        let later = 0;
        try {
          later = Number(localStorage.getItem(laterKey) ?? 0);
        } catch {}
        if (Date.now() - later > 30 * 864e5) setView({ kind: "new" });
      })
      .catch(() => {});
  }, [storeId, laterKey]);

  if (!view) return null;

  if (view.kind === "member" || view.kind === "wait")
    return (
      <a href="/dashboard/market" className="mx-gutter mt-4 flex items-center justify-between bg-white border border-[var(--line)] px-4 min-h-12 text-[13.5px]" data-testid="market-entry-row">
        <span>{view.kind === "member" ? view.title : "השוק של העיר: מחכים לאישור"}</span>
        <span aria-hidden>←</span>
      </a>
    );

  return (
    <section className="mx-gutter mt-4 bg-white border border-[var(--line)] p-4" data-testid="market-entry">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">{view.kind === "invite" ? "הזמינו אתכם לשוק של העיר" : "חדש: השוק של העיר"}</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">הדוכן שלכם, ליד הדוכנים של ילדים מהעיר.</p>
        </div>
        {view.kind === "new" && (
          <CloseX
            onClick={() => {
              try {
                localStorage.setItem(laterKey, String(Date.now()));
              } catch {}
              setView(null);
            }}
            label="לא עכשיו"
            testid="market-entry-close"
          />
        )}
      </div>
      <a href="/dashboard/market" className="mt-3 block text-center bg-[var(--ink)] text-white py-3 text-[14px] font-bold" data-testid="market-entry-go">
        להיכנס לשוק
      </a>
    </section>
  );
}
