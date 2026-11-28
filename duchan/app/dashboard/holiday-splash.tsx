"use client";

import { useEffect, useState } from "react";
import HomeStall from "@/app/home-stall";
import { FIRST_NIGHT } from "@/app/hanukkah";
import { DATES, FLAGS, type Season } from "@/app/seasonal";
import { holidayIdeas } from "@/lib/sell-ideas";
import type { Store } from "@/lib/types";
import StatusImage from "./status-image";
import CloseX from "@/app/close-x";

/**
 * ספלאש של חג, לבעלי הדוכן, פעם אחת בכל חג.
 *
 * מרינה, 11.2026: "יש ספלאש רלוונטי? של חגים? מועדים?" ... "כן תבנה".
 * בשבוע שלפני החג ובחג עצמו, בכניסה לדשבורד: ברכה, הדוכן המצויר מקושט לחג,
 * רעיונות למוצרים לחג (לחיצה פותחת מוצר חדש עם השם), "להוסיף מוצר לחג",
 * ותמונה לסטטוס עם מסגרת של החג. לקונים אין ספלאש: הוא היה עוצר אותם
 * בדרך לקנייה, ומספיק להם הקישוט.
 *
 * פעם אחת לחג בכל שנה, נשמר במכשיר. לתצוגה מקדימה: ?holiday=hanukkah,
 * purim, pesach, tubishvat, atzmaut, roshhashana (מתעלם ממה שנשמר).
 */

export type Holiday = "hanukkah" | Season;

const NAMES: Record<Holiday, { soon: string; now: string; greet: string }> = {
  hanukkah: { soon: "חנוכה מתקרב!", now: "חנוכה שמח!", greet: "חנוכה שמח!" },
  tubishvat: { soon: "ט״ו בשבט מתקרב!", now: "ט״ו בשבט שמח!", greet: "ט״ו בשבט שמח!" },
  purim: { soon: "פורים מתקרב!", now: "פורים שמח!", greet: "פורים שמח!" },
  pesach: { soon: "פסח מתקרב!", now: "חג פסח שמח!", greet: "חג פסח שמח!" },
  atzmaut: { soon: "יום העצמאות מתקרב!", now: "יום עצמאות שמח!", greet: "יום עצמאות שמח!" },
  roshhashana: { soon: "ראש השנה מתקרב!", now: "שנה טובה!", greet: "שנה טובה!" },
};
/** עד כמה ימים אחרי היום של החג עוד מציגים */
const END: Record<Holiday, number> = { hanukkah: 7, tubishvat: 0, purim: 1, pesach: 6, atzmaut: 0, roshhashana: 1 };
const COLORS: Record<Holiday, string[]> = { hanukkah: ["#5B8FD6", "#FFFFFF", "#BFD7F2"], ...FLAGS };

const israelDay = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d) + "T00:00:00Z");

/** איזה חג עכשיו (או בשבוע הקרוב), ובאיזה שלב */
export function holidayNow(now: Date = new Date()): { key: Holiday; soon: boolean; year: number } | null {
  const t = israelDay(now);
  const all: [Holiday, string[]][] = [["hanukkah", FIRST_NIGHT], ...(Object.entries(DATES) as [Season, string[]][])];
  for (const [key, days] of all) {
    for (const day of days) {
      const d = Math.round((t - Date.parse(day + "T00:00:00Z")) / 864e5);
      if (d >= -7 && d <= END[key]) return { key, soon: d < 0, year: Number(day.slice(0, 4)) };
    }
  }
  return null;
}

const seenKey = (h: Holiday, year: number) => `duchan-holiday-splash-${h}-${year}`;

export default function HolidaySplash({ store }: { store: Store }) {
  const [h, setH] = useState<{ key: Holiday; soon: boolean; year: number } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("holiday");
    if (q && q in NAMES) {
      setH({ key: q as Holiday, soon: false, year: 0 });
      return;
    }
    // דפדפן אוטומטי (בדיקות): בלי ספלאש שקופץ באמצע. בתצוגה מקדימה כן, למעלה.
    if (navigator.webdriver) return;
    const cur = holidayNow();
    if (!cur) return;
    try {
      if (localStorage.getItem(seenKey(cur.key, cur.year))) return;
    } catch {
      return;
    }
    // רגע אחרי הטעינה, לא באמצע חגיגה אחרת שקופצת בכניסה
    const t = setTimeout(() => setH(cur), 900);
    return () => clearTimeout(t);
  }, []);

  if (!h) return null;
  const names = NAMES[h.key];
  const ideas = holidayIdeas(h.key).slice(0, 4);
  const close = () => {
    try {
      localStorage.setItem(seenKey(h.key, h.year), "1");
    } catch {}
    setH(null);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/45 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="holiday-title" data-testid="holiday-splash" data-holiday={h.key}>
      <div className="hs-pop bg-[var(--canvas)] w-full max-w-md max-h-[92dvh] overflow-y-auto px-gutter pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <style>{`
          .hs-pop { animation: hs-up .45s cubic-bezier(.2,.9,.3,1.2) both; }
          @keyframes hs-up { from { transform: translateY(40px) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
          @media (prefers-reduced-motion: reduce) { .hs-pop { animation: none } }
        `}</style>
        <div className="flex justify-end">
          <CloseX onClick={close} label="סגירה" testid="holiday-close" />
        </div>
        <HomeStall
          name={store.display_name}
          className="w-full max-w-[280px] mx-auto block -mt-6"
          holiday={h.key === "hanukkah" ? { night: h.soon ? 1 : 8 } : { season: h.key }}
        />
        <h2 id="holiday-title" className="text-[24px] font-bold text-center mt-2">{h.soon ? names.soon : names.now}</h2>
        <p className="text-[14px] text-[var(--muted)] text-center leading-relaxed mt-1">
          {h.soon ? "בחג הדוכן שלכם יתקשט לבד." : "הדוכן שלכם התקשט לחג."} זה זמן טוב למכור משהו לחג:
        </p>
        {ideas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-3" data-testid="holiday-ideas">
            {ideas.map((t) => (
              <a key={t} href={`/dashboard/products?new=1&name=${encodeURIComponent(t)}`} onClick={close} className="border border-[var(--line)] bg-white px-3 py-2 text-[13px]">
                {t}
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2.5 mt-5">
          <a href="/dashboard/products?new=1" onClick={close} className="bg-[var(--ink)] text-white text-center py-3.5 text-[15px] font-bold" data-testid="holiday-add">
            להוסיף מוצר לחג
          </a>
          <StatusImage store={store} frame={{ greet: names.greet, colors: COLORS[h.key] }} label="תמונה לסטטוס, עם ברכה לחג" />
          <button onClick={close} className="text-[13px] underline min-h-10 text-[var(--muted)]">
            אחר כך
          </button>
        </div>
      </div>
    </div>
  );
}
