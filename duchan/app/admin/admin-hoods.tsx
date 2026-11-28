"use client";

import { useCallback, useEffect, useState } from "react";
import { hoodKey } from "@/lib/hood";

/**
 * שכונות לבדיקה (0077). הורה כתב שם של שכונה שלא ברשימה. אפשר:
 * לאשר כשכונה חדשה (ולתקן את השם), לבחור שכונה קיימת באותו יישוב, או
 * לדחות. עד ההחלטה הדוכן לא בשוק. כשאין מה לבדוק, החלק הזה לא מופיע.
 */
type Item = { storeId: string; slug: string; store: string; cityId: number; city: string; name: string };
type Hood = { id: string; name: string; cityId: number; city: string; stalls: number };

export default function AdminHoods() {
  const [items, setItems] = useState<Item[]>([]);
  const [hoods, setHoods] = useState<Hood[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await (await fetch("/api/admin/hoods", { cache: "no-store" })).json();
      setItems(j.items ?? []);
      setHoods(j.hoods ?? []);
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(storeId: string, body: Record<string, string>) {
    setBusy(storeId);
    setErr("");
    try {
      const res = await fetch("/api/admin/hoods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...body }),
      });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "לא נשמר, לנסות שוב");
      else await load();
    } catch {
      setErr("לא נשמר, לנסות שוב");
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return null;

  return (
    <section id="hoods" className="bg-white border border-[var(--line)] p-3" data-testid="admin-hoods">
      <h2 className="text-sm font-bold">שכונות לבדיקה · {items.length}</h2>
      <p className="text-[12px] text-[var(--muted)] leading-snug mt-0.5 mb-3">
        הורה כתב שכונה שלא ברשימה. עד שמחליטים, הדוכן לא בשוק של השכונה.
      </p>
      {err && <p role="alert" className="text-[12.5px] text-[var(--danger)] mb-2">{err}</p>}
      <ul className="flex flex-col gap-4">
        {items.map((s) => {
          const name = names[s.storeId] ?? s.name;
          const inCity = hoods.filter((h) => h.cityId === s.cityId);
          const similar = inCity.filter((h) => {
            const a = hoodKey(h.name), b = hoodKey(s.name);
            return a.includes(b) || b.includes(a);
          });
          return (
            <li key={s.storeId} className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0" data-testid="admin-hood-row">
              <div className="flex items-baseline justify-between gap-2">
                <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-bold underline truncate">{s.store}</a>
                <span className="shrink-0 text-[11.5px] text-[var(--muted)]">{s.city}</span>
              </div>
              <p className="text-[12.5px] mt-1">
                <span className="text-[var(--muted)]">ההורה כתב: </span>
                <bdi className="font-medium break-all" data-testid="admin-hood-name">{s.name}</bdi>
              </p>
              <label className="block mt-2 text-[12px] text-[var(--muted)]">
                השם שיופיע ברשימה
                <input
                  value={name}
                  onChange={(e) => setNames((c) => ({ ...c, [s.storeId]: e.target.value }))}
                  maxLength={40}
                  className="mt-1 w-full border border-[var(--line)] px-3 py-2 text-[13.5px] text-[var(--ink)]"
                />
              </label>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => decide(s.storeId, { action: "create", name })}
                  disabled={busy === s.storeId || name.trim().length < 2}
                  data-testid="admin-hood-create"
                  className="flex-1 min-h-10 bg-[var(--ink)] text-white text-[13px] font-bold disabled:opacity-40"
                >
                  לאשר שכונה חדשה
                </button>
                <button
                  onClick={() => decide(s.storeId, { action: "reject" })}
                  disabled={busy === s.storeId}
                  data-testid="admin-hood-reject"
                  className="min-h-10 px-3 bg-white border border-[var(--line)] text-[13px] disabled:opacity-40"
                >
                  לא שכונה
                </button>
              </div>
              {inCity.length > 0 && (
                <div className="mt-2">
                  <p className="text-[12px] text-[var(--muted)]">{similar.length ? "אולי זו שכונה שכבר יש:" : `שכונות שכבר יש ב${s.city}:`}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(similar.length ? similar : inCity).slice(0, 8).map((h) => (
                      <button
                        key={h.id}
                        onClick={() => decide(s.storeId, { action: "merge", hoodId: h.id })}
                        disabled={busy === s.storeId}
                        className="border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                        data-testid="admin-hood-merge"
                      >
                        {h.name} · {h.stalls}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
