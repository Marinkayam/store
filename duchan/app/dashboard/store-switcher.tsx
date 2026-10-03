"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STORE_PICK_KEY, pickStore } from "./use-store";
import { hasUnsaved, setUnsaved, UNSAVED_PROMPT } from "@/lib/unsaved";

/**
 * בחירת דוכן — רק למי שיש יותר מאחד (דוכן משלי + שותפות, 0057).
 * לכל השאר הרכיב לא מצייר כלום. הבחירה נשמרת בטלפון, והדשבורד נטען מחדש
 * על הדוכן שנבחר — כל מסך קורא אותה דרך useStore.
 */
type Row = { id: string; display_name: string; emoji: string; owner_id: string | null };

export default function StoreSwitcher() {
  const [list, setList] = useState<Row[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>("");

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

  if (list.length < 2) return null;

  return (
    <div className="bg-white border-b border-[var(--line)] px-4 py-2 flex items-center gap-2" data-testid="store-switcher">
      <label htmlFor="store-pick" className="text-[12px] text-[var(--muted)] shrink-0">הדוכן:</label>
      <select
        id="store-pick"
        value={current}
        onChange={(e) => {
          if (hasUnsaved() && !window.confirm(UNSAVED_PROMPT)) return;
          setUnsaved(false);
          pickStore(e.target.value);
          window.location.reload();
        }}
        className="flex-1 min-w-0 bg-[var(--canvas)] border border-[var(--line)] px-2 py-2 text-[14px] font-bold"
      >
        {list.map((r) => (
          <option key={r.id} value={r.id}>
            {r.emoji} {r.display_name} {r.owner_id === me ? "· 👑 שלי" : "· 🤝 שותפות"}
          </option>
        ))}
      </select>
    </div>
  );
}
