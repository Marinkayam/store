"use client";

import { useEffect, useState } from "react";

/**
 * חנוכה בדוכן. מרינה, 11.2026: "תעשה אווירה של חנוכה בדוכן".
 *
 * נדלק לבד בימי חנוכה ונכבה אחריהם, בלי שמישהו יצטרך לזכור:
 *   • באיור של הדוכן: חנוכייה על הדלפק במקום השקית, עם מספר הנרות של
 *     הלילה (והשמש), סופגנייה וסביבון על הארגז, ודגלים בכחול-לבן.
 *   • בראש הדוכן הציבורי ובדשבורד: שרשרת דגלים דקה בכחול-לבן.
 * בלי טקסט ובלי אימוג'י, באותו קו דק של האיור.
 *
 * התאריך נבדק רק בדפדפן (אחרי טעינה), לפי שעון ישראל, כדי שעמוד שנבנה
 * מראש לא "יתקע" על התאריך של הבנייה. לתצוגה מקדימה: ?hanukkah=1 עד 8.
 */

/** הנר הראשון (בערב) של כל שנה */
const FIRST_NIGHT = ["2026-12-04", "2027-12-24", "2028-12-12", "2029-12-01", "2030-12-20"];

const israelDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

/** איזה לילה של חנוכה היום (1–8), או null. היום שאחרי הלילה השמיני עוד נחשב 8. */
export function hanukkahNight(now: Date = new Date()): number | null {
  const today = Date.parse(israelDate(now) + "T00:00:00Z");
  for (const first of FIRST_NIGHT) {
    const day = Math.round((today - Date.parse(first + "T00:00:00Z")) / 864e5);
    if (day >= 0 && day <= 8) return Math.min(8, day + 1);
  }
  return null;
}

export function useHanukkah(): number | null {
  const [night, setNight] = useState<number | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("hanukkah");
    setNight(q && /^[1-8]$/.test(q) ? Number(q) : hanukkahNight());
  }, []);
  return night;
}

const INK = "#4A3B2F";
const BLUE = "#5B8FD6";
const BLUE_PALE = "#BFD7F2";
const WHITE = "#FFFFFF";
const BRASS = "#DDB861";
const FLAME = "#F2A33A";
const FLAME_IN = "#FBE3A0";
const FLAGS = [BLUE, WHITE, BLUE_PALE];

/** ארבעה נרות מימין, שמש באמצע, ארבעה משמאל. מדליקים מימין לשמאל. */
const CANDLES_RTL = [194, 189, 184, 179, 167, 162, 157, 152];

function Flame({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g className="hk-flame" style={{ animationDelay: `${delay}s` }}>
      <path d={`M${x} ${y - 6.5} C${x + 2.6} ${y - 3} ${x + 2.4} ${y} ${x} ${y} C${x - 2.4} ${y} ${x - 2.6} ${y - 3} ${x} ${y - 6.5}z`} fill={FLAME} strokeWidth={0.7} />
      <ellipse cx={x} cy={y - 1.8} rx="0.9" ry="1.6" fill={FLAME_IN} stroke="none" />
    </g>
  );
}

/** שכבת חנוכה לאיור הדוכן (app/home-stall.tsx). אותן קואורדינטות של ה-viewBox שם. */
export function HanukkahStall({ empty = false }: { empty?: boolean }) {
  const night = useHanukkah();
  if (!night) return null;
  const flags = Array.from({ length: 9 }, (_, i) => {
    const t = 0.08 + (i * 0.84) / 8;
    return { x: 70 + 180 * t, y: 81 + 20 * t * (1 - t), c: FLAGS[i % FLAGS.length] };
  });
  const lit = CANDLES_RTL.slice(0, night);
  return (
    <g data-testid="hanukkah-stall" data-night={night} aria-hidden stroke={INK} strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round">
      <style>{`
        .hs-flagset${empty ? "" : ", .hs-bag, .hs-crate-items"} { display: none; }
        .hk-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: hk-flicker 1.4s ease-in-out infinite; }
        .hk-dreidel { transform-box: fill-box; transform-origin: 50% 100%; animation: hk-spin 2.2s ease-in-out infinite; }
        @keyframes hk-flicker { 0%, 100% { transform: scale(1, 1) rotate(0deg); } 30% { transform: scale(.92, 1.08) rotate(-4deg); } 60% { transform: scale(1.05, .94) rotate(3deg); } }
        @keyframes hk-spin { 0%, 100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } }
        @media (prefers-reduced-motion: reduce) { .hk-flame, .hk-dreidel { animation: none; } }
      `}</style>

      {/* דגלים בכחול-לבן, במקום הדגלים הצבעוניים */}
      {flags.map((f, i) => (
        <path
          key={i}
          className="hs-flag"
          style={{ animationDelay: `${(i % 3) * 0.35}s` }}
          d={`M${f.x - 5.5} ${f.y} L${f.x + 5.5} ${f.y} L${f.x} ${f.y + 10} z`}
          fill={f.c}
          strokeWidth={1}
        />
      ))}

      {!empty && (
        <>
          {/* חנוכייה על הדלפק */}
          <path d="M165 140 L181 140 L178 134 L168 134 z" fill={BRASS} />
          <line x1="173" y1="134" x2="173" y2="119" strokeWidth={1.6} />
          <rect x="149" y="116.5" width="48" height="3" rx="1.5" fill={BRASS} />
          {[152, 157, 162, 167, 179, 184, 189, 194].map((x) => (
            <rect key={x} x={x - 2} y="113.5" width="4" height="3" rx="0.8" fill={BRASS} strokeWidth={0.9} />
          ))}
          <rect x="170.5" y="106.5" width="5" height="3" rx="0.8" fill={BRASS} strokeWidth={0.9} />
          <line x1="173" y1="109.5" x2="173" y2="116.5" strokeWidth={1.2} />
          {/* השמש, גבוה באמצע */}
          <rect x="171.6" y="98.5" width="2.8" height="8" rx="0.6" fill={WHITE} strokeWidth={0.8} />
          <Flame x={173} y={98} delay={0} />
          {/* הנרות של הלילה */}
          {lit.map((x, i) => (
            <g key={x}>
              <rect x={x - 1.4} y="105.5" width="2.8" height="8" rx="0.6" fill={i % 2 ? BLUE_PALE : WHITE} strokeWidth={0.8} />
              <Flame x={x} y={105} delay={0.15 + i * 0.17} />
            </g>
          ))}

          {/* סופגנייה וסביבון על הארגז */}
          <ellipse cx="27" cy="177" rx="8.5" ry="6" fill="#E3A75F" />
          <path d="M20.5 175.5 Q27 171 33.5 175.5" fill="none" stroke={WHITE} strokeWidth={2.2} />
          <circle cx="27" cy="172.6" r="2" fill="#C9403A" strokeWidth={0.8} />
          <g className="hk-dreidel">
            <line x1="42" y1="166" x2="42" y2="170" strokeWidth={1.4} />
            <path d="M36.5 170 h11 v5 l-5.5 7 l-5.5 -7 z" fill={BLUE} />
            <text x="42" y="176.4" textAnchor="middle" fontSize="5" fontWeight={800} fill={WHITE} stroke="none" style={{ fontFamily: "var(--font-body), Heebo, sans-serif" }}>נ</text>
          </g>
        </>
      )}
    </g>
  );
}

/** שרשרת דגלים דקה בכחול-לבן לראש העמוד. רק בחנוכה. */
export function HanukkahGarland({ className = "" }: { className?: string }) {
  const night = useHanukkah();
  if (!night) return null;
  const n = 24;
  return (
    <svg
      viewBox={`0 0 ${n * 20} 22`}
      preserveAspectRatio="none"
      className={`block w-full h-[18px] pointer-events-none ${className}`}
      aria-hidden
      data-testid="hanukkah-garland"
    >
      <path d={`M0 3 ${Array.from({ length: n }, (_, i) => `Q${i * 20 + 10} 8 ${i * 20 + 20} 3`).join(" ")}`} fill="none" stroke={INK} strokeWidth={0.8} />
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * 20 + 4} 4.6 L${i * 20 + 16} 4.6 L${i * 20 + 10} 17 z`} fill={FLAGS[i % FLAGS.length]} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
