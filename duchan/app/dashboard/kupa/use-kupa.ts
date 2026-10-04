"use client";

import { useCallback, useEffect, useState } from "react";
import type { Kupa } from "@/lib/kupa";
import type { Sample } from "@/lib/kupa-lessons";

export type KupaData = Kupa & {
  slug: string;
  name: string;
  sample: Sample;
  /** חידות שנפתרו במסד (0058). null = הטבלה עוד לא קיימת — נשענים על הטלפון */
  solved: string[] | null;
};

/** אירוע שמסכים יורים אחרי פעולה שעשויה לתת אות (מוצר נשמר, הזמנה שולמה,
 *  הגדרות נשמרו) — וככה החגיגה מגיעה מיד ולא רק במעבר מסך. */
export const KUPA_CHECK = "kupa:check";
export function kupaCheck() {
  try {
    window.dispatchEvent(new Event(KUPA_CHECK));
  } catch {}
}

export async function fetchKupa(storeId: string): Promise<KupaData | null> {
  try {
    const r = await fetch(`/api/kupa?storeId=${encodeURIComponent(storeId)}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as KupaData) : null;
  } catch {
    return null;
  }
}

export function useKupa(storeId: string | undefined) {
  const [kupa, setKupa] = useState<KupaData | null>(null);
  const refresh = useCallback(async () => {
    if (!storeId) return;
    const k = await fetchKupa(storeId);
    if (k) setKupa(k);
  }, [storeId]);
  useEffect(() => {
    refresh();
    window.addEventListener(KUPA_CHECK, refresh);
    return () => window.removeEventListener(KUPA_CHECK, refresh);
  }, [refresh]);
  return { kupa, refresh };
}

/* ── מה כבר חגגנו (בטלפון הזה) ──
   החגיגה היא רגע, לא נתון: אם היא קופצת שוב בטלפון אחר, לא קרה כלום.
   מה שחשוב הוא שהיא לא תקפוץ פעמיים באותו טלפון. */
export interface Seen {
  badges: string[];
  level: number;
  /** כמה מטבעות היו — כדי שהמונה בחגיגה יעלה מהמספר הקודם */
  coins?: number;
}
const seenKey = (storeId: string) => `kupa-seen:${storeId}`;
export function readSeen(storeId: string): Seen | null {
  try {
    const raw = localStorage.getItem(seenKey(storeId));
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}
export function writeSeen(storeId: string, k: Kupa) {
  try {
    localStorage.setItem(
      seenKey(storeId),
      JSON.stringify({
        badges: k.badges.filter((b) => b.reached).map((b) => b.key),
        level: k.level,
        coins: k.coins,
      } satisfies Seen)
    );
  } catch {}
}

/** שמירת חידה שנפתרה במסד (השרת בודק את התשובה), או העברה חד-פעמית של
 *  הכוכבים מהטלפון. מחזיר את כל מה שנפתר בדוכן, או null אם נכשל. */
export async function postSolve(
  storeId: string,
  payload: { riddleId: string; answer: string } | { import: string[] }
): Promise<string[] | null> {
  try {
    const r = await fetch("/api/kupa/solve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, ...payload }),
    });
    return r.ok ? ((await r.json()).solved as string[]) : null;
  } catch {
    return null;
  }
}

/* ── עותק בטלפון של החידות שנפתרו ──
   המקור הוא המסד (kupa_solved). העותק כאן הוא גיבוי: כשאין רשת, וכשמגיעים
   מגרסה קודמת שבה הכוכבים נשמרו רק בטלפון (הם עולים למסד בפעם הראשונה). */
const solvedKey = (storeId: string) => `kupa-solved:${storeId}`;
export function readSolved(storeId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(solvedKey(storeId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}
export function writeSolved(storeId: string, list: string[]) {
  try {
    localStorage.setItem(solvedKey(storeId), JSON.stringify(list));
  } catch {}
}
export function addSolved(storeId: string, key: string): string[] {
  const next = [...new Set([...readSolved(storeId), key])];
  try {
    localStorage.setItem(solvedKey(storeId), JSON.stringify(next));
  } catch {}
  return next;
}

/* ── יום ולילה באיור הדוכן ──
   בחירה בכפתור נשמרת בטלפון. בלי בחירה — לפי השעה בישראל: לילה מ-19:00
   עד 06:00, כדי שמי שנכנס/ת בערב יראה את הדוכן מואר בחושך. */
const NIGHT_KEY = "kupa-night";
export function useNight(): [boolean, (v: boolean) => void] {
  const [night, setNightState] = useState(false);
  useEffect(() => {
    let v: boolean | null = null;
    try {
      const raw = localStorage.getItem(NIGHT_KEY);
      if (raw === "1" || raw === "0") v = raw === "1";
    } catch {}
    if (v === null) {
      const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }));
      v = h >= 19 || h < 6;
    }
    setNightState(v);
  }, []);
  const setNight = (v: boolean) => {
    setNightState(v);
    try {
      localStorage.setItem(NIGHT_KEY, v ? "1" : "0");
    } catch {}
  };
  return [night, setNight];
}
