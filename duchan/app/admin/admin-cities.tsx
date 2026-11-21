"use client";

import { useCallback, useEffect, useState } from "react";
import CityPicker from "@/app/city-picker";
import { localityName } from "@/lib/localities";

/**
 * ערים לבדיקה — דוכנים שבשדה העיר הישן שלהם יש טקסט שלא זוהה בוודאות.
 *
 * לכל דוכן: מה נכתב במקור, בוחר עיר מהרשימה, ו"להשאיר בלי עיר". עד
 * להחלטה הדוכן מוצג בלי עיר. הטקסט הישן לא נמחק בשום מקרה.
 * כשאין מה לבדוק, החלק הזה לא מופיע בכלל.
 */
type Item = { id: string; slug: string; name: string; oldText: string; published: boolean };

export default function AdminCities() {
  const [items, setItems] = useState<Item[]>([]);
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cities", { cache: "no-store" });
      const j = await res.json();
      setItems(j.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, body: { cityId?: number; leaveEmpty?: boolean }) {
    setBusy(id);
    setErr("");
    try {
      const res = await fetch("/api/admin/cities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: id, ...body }),
      });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "לא נשמר, לנסות שוב");
      else setItems((cur) => cur.filter((x) => x.id !== id));
    } catch {
      setErr("לא נשמר, לנסות שוב");
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return null;

  return (
    <section className="bg-white border border-[var(--line)] p-3" data-testid="admin-cities">
      <h2 className="text-sm font-bold">ערים לבדיקה · {items.length}</h2>
      <p className="text-[12px] text-[var(--muted)] leading-snug mt-0.5 mb-3">
        מה שנכתב פעם בשדה העיר ולא זוהה בוודאות. עד שמחליטים, הדוכן מוצג בלי עיר.
      </p>
      {err && <p role="alert" className="text-[12.5px] text-[var(--danger)] mb-2">{err}</p>}
      <ul className="flex flex-col gap-4">
        {items.map((s) => {
          const pick = picks[s.id] ?? null;
          return (
            <li key={s.id} className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0" data-testid="admin-city-row">
              <div className="flex items-baseline justify-between gap-2">
                <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-bold underline truncate">{s.name}</a>
                <span className="shrink-0 text-[11.5px] text-[var(--muted)]">{s.published ? "פורסם" : "לא פורסם"}</span>
              </div>
              <p className="text-[12.5px] mt-1">
                <span className="text-[var(--muted)]">נכתב: </span>
                <bdi data-testid="admin-city-old" className="font-medium break-all">{s.oldText}</bdi>
              </p>
              <div className="mt-2">
                <CityPicker
                  value={pick}
                  onChange={(id) => setPicks((cur) => ({ ...cur, [s.id]: id }))}
                  label="העיר הנכונה"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => pick && decide(s.id, { cityId: pick })}
                  disabled={!pick || busy === s.id}
                  data-testid="admin-city-save"
                  className="flex-1 min-h-10 bg-[var(--ink)] text-white text-[13px] font-bold disabled:opacity-40"
                >
                  {pick ? `לשמור: ${localityName(pick)}` : "בוחרים עיר מהרשימה"}
                </button>
                <button
                  onClick={() => decide(s.id, { leaveEmpty: true })}
                  disabled={busy === s.id}
                  data-testid="admin-city-empty"
                  className="min-h-10 px-3 bg-white border border-[var(--line)] text-[13px] disabled:opacity-40"
                >
                  להשאיר בלי עיר
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
