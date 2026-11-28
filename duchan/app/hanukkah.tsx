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
export const FIRST_NIGHT = ["2026-12-04", "2027-12-24", "2028-12-12", "2029-12-01", "2030-12-20"];

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
const CX = 185; // מרכז החנוכייה, בין הפרצוף לקיר הימני
const CANDLES_RTL = [38, 29, 20, 11, -11, -20, -29, -38].map((d) => CX + d);

function Flame({ x, y, delay, s = 1.3 }: { x: number; y: number; delay: number; s?: number }) {
  const h = 6.5 * s, w = 2.6 * s;
  return (
    <g className="hk-flame" style={{ animationDelay: `${delay}s` }}>
      <path d={`M${x} ${y - h} C${x + w} ${y - h * 0.46} ${x + w * 0.92} ${y} ${x} ${y} C${x - w * 0.92} ${y} ${x - w} ${y - h * 0.46} ${x} ${y - h}z`} fill={FLAME} strokeWidth={0.8} />
      <ellipse cx={x} cy={y - h * 0.28} rx={0.9 * s} ry={1.6 * s} fill={FLAME_IN} stroke="none" />
    </g>
  );
}

/** שכבת חנוכה לאיור הדוכן (app/home-stall.tsx). אותן קואורדינטות של ה-viewBox שם. */
export function HanukkahStall({ empty = false, night: forced }: { empty?: boolean; night?: number }) {
  const auto = useHanukkah();
  const night = forced ?? auto;
  if (!night) return null;
  const flags = Array.from({ length: 9 }, (_, i) => {
    const t = 0.08 + (i * 0.84) / 8;
    return { x: 70 + 180 * t, y: 81 + 20 * t * (1 - t), c: FLAGS[i % FLAGS.length] };
  });
  const lit = CANDLES_RTL.slice(0, night);
  return (
    <g data-testid="hanukkah-stall" data-night={night} aria-hidden stroke={INK} strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round">
      <style>{`
        .hs-flagset${empty ? "" : ", .hs-bag, .hs-jar, .hs-crate-items"} { display: none; }
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
          {/* חנוכייה על הדלפק, במקום השקית והצנצנת */}
          <path d={`M${CX - 11} 140 L${CX + 11} 140 L${CX + 7} 133 L${CX - 7} 133 z`} fill={BRASS} />
          <line x1={CX} y1="133" x2={CX} y2="122.5" strokeWidth={2.2} />
          <rect x={CX - 41} y="119" width="82" height="3.5" rx="1.75" fill={BRASS} />
          {CANDLES_RTL.map((x) => (
            <rect key={x} x={x - 3} y="115.5" width="6" height="3.5" rx="1" fill={BRASS} strokeWidth={0.9} />
          ))}
          <line x1={CX} y1="119" x2={CX} y2="113" strokeWidth={1.6} />
          <rect x={CX - 3} y="109.5" width="6" height="3.5" rx="1" fill={BRASS} strokeWidth={0.9} />
          {/* השמש, גבוה באמצע */}
          <rect x={CX - 1.8} y="99.5" width="3.6" height="10" rx="0.8" fill={WHITE} strokeWidth={0.9} />
          <Flame x={CX} y={99} delay={0} />
          {/* הנרות של הלילה */}
          {lit.map((x, i) => (
            <g key={x}>
              <rect x={x - 1.8} y="105.5" width="3.6" height="10" rx="0.8" fill={i % 2 ? BLUE_PALE : WHITE} strokeWidth={0.9} />
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

      {/* החתול מחזיק סופגנייה */}
      <ellipse cx="288" cy="193" rx="8" ry="5.6" fill="#E3A75F" />
      <path d="M282 191.5 Q288 187.5 294 191.5" fill="none" stroke={WHITE} strokeWidth={2} />
      <circle cx="288" cy="189.2" r="1.8" fill="#C9403A" strokeWidth={0.7} />
      <ellipse cx="281" cy="195.5" rx="2.6" ry="2" fill="#3B3734" stroke="none" />
      <ellipse cx="295" cy="195.5" rx="2.6" ry="2" fill="#3B3734" stroke="none" />
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
