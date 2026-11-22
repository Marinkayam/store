"use client";

import { useEffect, useState } from "react";
import HomeStall from "./home-stall";
import { KupaStall } from "./kupa-art";

/**
 * מסך הפתיחה: הדוכן שלכם הוא אחד מהרבה דוכנים.
 *
 * מרינה, 11.2026: "בדף הבית צריך גם לעשות את האנימציה שהדוכן שלך הוא חלק
 * מהרבה דוכנים". נפתחים על הדוכן הגדול, כמו קודם. אחרי רגע המבט מתרחק
 * לאט, ומגלה שהוא עומד ברחוב: דוכן מכל צד, ושורה של דוכנים קטנים מאחור.
 * תנועה אחת, רכה, פעם אחת. אין לולאה ואין קפיצות.
 *
 * הדוכנים מסביב מומצאים (שמות כלליים, בלי ילדים אמיתיים).
 * מי שביקש פחות תנועה מקבל מיד את התמונה הסופית.
 */
const SIDE = [
  { name: "צמידים", awning: "olive" as const, level: 3 },
  { name: "ציורים", awning: "blush" as const, level: 4 },
];
const BACK = [
  { name: "קלפים", awning: "gold" as const, level: 2, left: 4 },
  { name: "סלים", awning: "lavender" as const, level: 3, left: 40 },
  { name: "בובות", awning: "olive" as const, level: 2, left: 76 },
];

export default function StallStreet({ name = "דוכן" }: { name?: string }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setWide(true);
    const t = setTimeout(() => setWide(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="ss" data-testid="stall-hero" data-wide={wide ? "1" : "0"} data-night="0">
      <style>{`
        .ss { position: relative; width: 100%; overflow: hidden; aspect-ratio: 320 / 250; }
        .ss-cam { position: absolute; inset: 0; transform-origin: 50% 52%; transform: scale(1.9); transition: transform 2.8s cubic-bezier(.45,.05,.25,1); }
        .ss[data-wide="1"] .ss-cam { transform: scale(1); }
        .ss-back, .ss-side { position: absolute; opacity: 0; transition: opacity 1.8s ease .6s; }
        .ss[data-wide="1"] .ss-side { opacity: 1; }
        .ss[data-wide="1"] .ss-back { opacity: .4; }
        .ss-back { top: 5%; width: 20%; }
        .ss-side { top: 45%; width: 30%; }
        .ss-main { position: absolute; left: 25%; top: 30%; width: 50%; }
        @media (prefers-reduced-motion: reduce) { .ss-cam, .ss-back, .ss-side { transition: none; } }
      `}</style>
      <div className="ss-cam" aria-hidden={false}>
        {BACK.map((s) => (
          <div key={s.name} className="ss-back" style={{ left: `${s.left}%` }} aria-hidden>
            <KupaStall level={s.level} name={s.name} bare deco={{ awning: s.awning, flowers: false, openSign: false, cat: false }} className="w-full block" />
          </div>
        ))}
        {SIDE.map((s, i) => (
          <div key={s.name} className="ss-side" style={i === 0 ? { right: "-6%" } : { left: "-6%" }} aria-hidden>
            <KupaStall level={s.level} name={s.name} bare deco={{ awning: s.awning, flowers: i === 1, openSign: false, cat: false }} className="w-full block" />
          </div>
        ))}
        <div className="ss-main">
          <HomeStall name={name} className="w-full block" />
        </div>
      </div>
    </div>
  );
}
