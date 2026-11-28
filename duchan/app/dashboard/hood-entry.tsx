"use client";

import { useEffect, useState } from "react";
import { hoodTitle } from "@/lib/hood";
import CloseX from "@/app/close-x";

/**
 * הכניסה לשוק של השכונה ממסך ההזמנות (0077).
 *   • הזמינו אתכם (לינק של שכן): כרטיס בולט.
 *   • כבר בשוק: שורה קטנה עם שם השכונה.
 *   • עוד לא: כרטיס "חדש" עם איקס, שנעלם ל-30 יום. בלי לחפור.
 */
export default function HoodEntry({ storeId }: { storeId: string }) {
  const [view, setView] = useState<null | { kind: "invite" | "new" | "member" | "wait"; title?: string }>(null);
  const laterKey = `duchan-hood-later-${storeId}`;

  useEffect(() => {
    let invited = false;
    try {
      invited = !!JSON.parse(localStorage.getItem("duchan-hood-invite") ?? "null")?.h;
    } catch {}
    fetch(`/api/hood?storeId=${storeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.unavailable) return;
        if (d.state === "active" && d.hood) return setView({ kind: "member", title: hoodTitle(d.hood.name) });
        if (d.state === "parent" || d.state === "review") return setView({ kind: "wait" });
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
      <a href="/dashboard/hood" className="mx-gutter mt-4 flex items-center justify-between bg-white border border-[var(--line)] px-4 min-h-12 text-[13.5px]" data-testid="hood-entry-row">
        <span>{view.kind === "member" ? view.title : "השוק של השכונה: מחכים לאישור"}</span>
        <span aria-hidden>←</span>
      </a>
    );

  return (
    <section className="mx-gutter mt-4 bg-white border border-[var(--line)] p-4" data-testid="hood-entry">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">{view.kind === "invite" ? "הזמינו אתכם לשוק של השכונה" : "חדש: השוק של השכונה"}</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">הדוכן שלכם, ליד הדוכנים של ילדים מהשכונה.</p>
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
            testid="hood-entry-close"
          />
        )}
      </div>
      <a href="/dashboard/hood" className="mt-3 block text-center bg-[var(--ink)] text-white py-3 text-[14px] font-bold" data-testid="hood-entry-go">
        להיכנס לשוק
      </a>
    </section>
  );
}
