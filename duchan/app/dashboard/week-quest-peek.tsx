"use client";

import { useEffect, useState } from "react";
import { useKupa } from "./kupa/use-kupa";
import { weekIndex, weekQuest, QUEST_COINS } from "@/lib/kupa";
import { Coin } from "@/app/kupa-art";
import Chevron from "@/app/chevron";

/**
 * "משימת השבוע" גם במסך ההזמנות, לא רק במשחק.
 *
 * מרינה, 11.2026 ("תתחיל הכל", סבב 4 סעיף 4): משימה שבועית שנותנת סיבה
 * לחזור לדוכן. המשימה כבר קיימת במשחק (lib/kupa.ts, weekQuest), אבל במסך
 * שילדים לא תמיד פותחים. כאן שורה אחת שמובילה ישר אליה. מי שדילגו עליה
 * השבוע (באותו טלפון) לא רואים אותה כאן.
 */
export default function WeekQuestPeek({ storeId }: { storeId: string }) {
  const { kupa } = useKupa(storeId);
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const week = weekIndex(new Date());
  useEffect(() => {
    try {
      setSkipped(JSON.parse(localStorage.getItem(`kupa-skip:${storeId}:${week}`) ?? "[]"));
    } catch {
      setSkipped([]);
    }
  }, [storeId, week]);
  if (!kupa || skipped === null) return null;
  const q = weekQuest(kupa, week, skipped);
  if (!q) return null;
  return (
    <a href={q.href} className="mx-gutter mt-4 flex items-center gap-3 bg-white border border-[var(--line)] px-4 py-3.5" data-testid="week-quest-peek">
      <span className="flex-1 min-w-0">
        <span className="block text-[11.5px] font-bold text-[var(--wood)]">משימת השבוע</span>
        <span className="block text-[13.5px] font-bold leading-snug">{q.title}</span>
      </span>
      <span className="flex items-center gap-1 text-[13.5px] font-bold tabular-nums shrink-0">+{QUEST_COINS}<Coin size={15} /></span>
      <Chevron size={14} />
    </a>
  );
}
