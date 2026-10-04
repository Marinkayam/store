"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STORE_PICK_KEY, pickStore } from "./use-store";
import { hasUnsaved, setUnsaved, UNSAVED_PROMPT } from "@/lib/unsaved";
import CloseX from "@/app/close-x";

/**
 * באיזה דוכן עובדים — רק למי שיש יותר מאחד (כמה דוכנים, או דוכן + שותפות).
 * לכל השאר הרכיב לא מצייר כלום.
 *
 * פס נקי: האייקון והשם של הדוכן הפתוח, של מי הוא, ו"לדוכן אחר" שפותח רשימה מסודרת
 * (לא select של הדפדפן — מרינה: "ממש מכוער ולא ברור מה זה"). הבחירה
 * נשמרת בטלפון, והדשבורד נטען מחדש על הדוכן שנבחר.
 */
type Row = { id: string; display_name: string; emoji: string; owner_id: string | null };

export default function StoreSwitcher() {
  const [list, setList] = useState<Row[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supa = supabaseBrowser();
    Promise.all([
      supa.from("stores").select("id, display_name, emoji, owner_id").order("created_at", { ascending: true }),
      supa.auth.getUser(),
    ]).then(([{ data }, { data: auth }]) => {
      const rows = (data as Row[] | null) ?? [];
      let picked = "";
      try {
        picked = localStorage.getItem(STORE_PICK_KEY) ?? "";
      } catch {}
      setList(rows);
      setMe(auth.user?.id ?? null);
      setCurrent(rows.some((r) => r.id === picked) ? picked : rows[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (list.length < 2) return null;
  const cur = list.find((r) => r.id === current) ?? list[0];
  const tag = (r: Row) => (r.owner_id === me ? "הדוכן שלי" : "דוכן בשותפות");

  function choose(id: string) {
    if (id === current) {
      setOpen(false);
      return;
    }
    if (hasUnsaved() && !window.confirm(UNSAVED_PROMPT)) return;
    setUnsaved(false);
    pickStore(id);
    window.location.reload();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="store-switcher"
        aria-label={`הדוכן שנבחר עכשיו: ${cur.display_name}. מעבר לדוכן אחר`}
        aria-haspopup="dialog"
        className="w-full bg-white border-b border-[var(--line)] px-4 py-2.5 flex items-center gap-3 text-right"
      >
        <span className="w-9 h-9 shrink-0 bg-[var(--canvas)] flex items-center justify-center text-[20px]" aria-hidden>
          {cur.emoji}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11.5px] text-[var(--muted)] leading-tight">{tag(cur)} · נבחר עכשיו</span>
          <span className="block text-[14.5px] font-bold text-[var(--ink)] truncate leading-snug" data-testid="store-switcher-current">
            {cur.display_name}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-1 border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] font-bold text-[var(--ink)]">
          לדוכן אחר
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="switcher-title"
            data-testid="store-switcher-sheet"
            className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 id="switcher-title" className="text-[16px] font-bold">לאיזה דוכן לעבור?</h2>
              <CloseX onClick={() => setOpen(false)} testid="store-switcher-close" />
            </div>
            <div className="flex flex-col border border-[var(--line)]">
              {list.map((r, i) => {
                const on = r.id === cur.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => choose(r.id)}
                    data-testid="store-option"
                    data-id={r.id}
                    aria-current={on ? "true" : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 min-h-[60px] text-right ${i ? "border-t border-[var(--sand)]" : ""} ${on ? "bg-[var(--canvas)]" : "bg-white"}`}
                  >
                    <span className="w-10 h-10 shrink-0 bg-[var(--canvas)] flex items-center justify-center text-[21px]" aria-hidden>
                      {r.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-bold text-[var(--ink)] truncate">{r.display_name}</span>
                      <span className="block text-[12px] text-[var(--muted)]">{tag(r)}</span>
                    </span>
                    {on && <span className="text-[12.5px] font-bold text-[var(--ok-ink)] shrink-0">✓ נבחר עכשיו</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
