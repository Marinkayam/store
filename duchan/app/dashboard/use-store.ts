"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";

/** החנות של המשתמשת המחוברת (הראשונה, אם ההורה פתח כמה). RLS מסנן. */
export function useStore() {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supa = supabaseBrowser();
    supa
      .from("stores")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setStore((data as Store) ?? null);
        setLoading(false);
      });
  }, []);

  return { store, setStore, loading };
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
