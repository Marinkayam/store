"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";

/**
 * הדוכן שעובדים עליו עכשיו. RLS מסנן: דוכנים שאני ראש שלהם, ומאז 0057 גם
 * דוכנים שאני שותף/ה בהם.
 *
 * מי שיש לו/ה יותר מדוכן אחד בוחר/ת בראש הדשבורד (StoreSwitcher), והבחירה
 * נשמרת בטלפון. בלי בחירה — הדוכן הראשון שנפתח, כמו תמיד.
 */
export const STORE_PICK_KEY = "duchan-store-id";

export type StoreRole = "owner" | "partner";

export function pickStore(id: string) {
  try {
    localStorage.setItem(STORE_PICK_KEY, id);
  } catch {}
}

export function useStore() {
  const [store, setStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [role, setRole] = useState<StoreRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supa = supabaseBrowser();
    Promise.all([
      supa.from("stores").select("*").order("created_at", { ascending: true }),
      supa.auth.getUser(),
    ]).then(([{ data }, { data: auth }]) => {
      const list = (data as Store[] | null) ?? [];
      let picked: string | null = null;
      try {
        picked = localStorage.getItem(STORE_PICK_KEY);
      } catch {}
      // בחירה שכבר לא קיימת (יצאתי מהדוכן, הוציאו אותי) — חוזרים לראשון
      const s = list.find((x) => x.id === picked) ?? list[0] ?? null;
      setStores(list);
      setStore(s);
      setRole(s ? (s.owner_id === auth.user?.id ? "owner" : "partner") : null);
      setLoading(false);
    });
  }, []);

  return { store, setStore, stores, role, loading };
}

export function confettiBurst(x: number, y: number) {
  const cols = ["#FF6FA5", "#6FF0BC", "#FFC53D", "#7CA9F5", "#C77DFF"];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("div");
    s.className = "confetti";
    s.style.background = cols[i % cols.length];
    s.style.left = `${x + (Math.random() * 50 - 25)}px`;
    s.style.top = `${y}px`;
    s.style.animationDelay = `${Math.random() * 0.12}s`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}
