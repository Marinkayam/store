"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "מי מסתכל" בחמ"ל (0062) — כל הדוכנים יחד: כמה בדוכנים עכשיו, כמה נכנסו,
 * מאיפה, ובאילו דוכנים. אותם מונים אנונימיים כמו אצל הילדים — גם כאן אין
 * מי, רק כמה.
 */
type Range = "today" | "7" | "30";
type Data = {
  live: number;
  totals: { visits: number; visitors: number; newVisitors: number; productOpens: number; carts: number; orders: number };
  series: { key: string; label: string; visits: number }[];
  sources: { source: string; label: string; visits: number }[];
  stores?: { id: string; name: string; slug: string; visits: number; live: number }[];
};

export default function AdminStats() {
  const [range, setRange] = useState<Range>("today");
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/stats?range=${range}`, { cache: "no-store" }).catch(() => null);
    setD(r?.ok ? await r.json().catch(() => null) : null);
  }, [range]);
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  const max = Math.max(1, ...(d?.series ?? []).map((s) => s.visits));
  const srcTotal = Math.max(1, (d?.sources ?? []).reduce((s, x) => s + x.visits, 0));
  return (
    <section className="bg-white border border-[var(--line)] p-3.5" data-testid="admin-stats">
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-bold flex-1">מי מסתכל על הדוכנים</h2>
        <span className={`w-2.5 h-2.5 ${d?.live ? "bg-[var(--olive)] animate-pulse" : "bg-[var(--stone)]"}`} aria-hidden />
        <span className="text-[13px] font-bold" data-testid="admin-stats-live">
          {d ? `${d.live} עכשיו` : "…"}
        </span>
      </div>
      <div className="flex gap-1.5 mt-2.5">
        {(["today", "7", "30"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 text-[12px] border ${range === r ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "border-[var(--line)]"}`}
          >
            {r === "today" ? "היום" : `${r} ימים`}
          </button>
        ))}
      </div>
      {d && (
        <>
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            {[
              [d.totals.visits, "כניסות"],
              [d.totals.visitors, "אנשים"],
              [d.totals.newVisitors, "חדשים"],
              [d.totals.orders, "הזמנות"],
            ].map(([n, l]) => (
              <div key={l as string}>
                <div className="text-[20px] font-bold tabular-nums">{n}</div>
                <div className="text-[11px] text-[var(--muted)]">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-[2px] h-16 border-b border-[var(--stone)]" dir="ltr">
            {d.series.map((s) => (
              <span key={s.key} title={`${s.label}: ${s.visits}`} className="flex-1 h-full flex items-end">
                <span className="block w-full" style={{ height: s.visits ? `${Math.max(4, (s.visits / max) * 100)}%` : 1, background: s.visits ? "#756192" : "var(--sand)" }} />
              </span>
            ))}
          </div>
          {d.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
              {d.sources.map((s) => (
                <span key={s.source} className="bg-[var(--canvas)] border border-[var(--sand)] px-2 py-0.5">
                  {s.label} · {Math.round((s.visits / srcTotal) * 100)}%
                </span>
              ))}
            </div>
          )}
          {!!d.stores?.length && (
            <ul className="mt-3 text-[12.5px]" data-testid="admin-stats-stores">
              {d.stores.map((s) => (
                <li key={s.id} className="flex justify-between py-1 border-t border-[var(--sand)]">
                  <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer" className="truncate">
                    {s.name}
                  </a>
                  <span className="tabular-nums text-[var(--muted)] shrink-0">
                    {s.live ? <b className="text-[var(--ok-ink)]">{s.live} עכשיו · </b> : null}
                    {s.visits} כניסות
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
