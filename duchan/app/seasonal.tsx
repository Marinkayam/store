"use client";

import { useEffect, useState } from "react";

/**
 * חגים בדוכן, מעבר לחנוכה (app/hanukkah.tsx).
 *
 * מרינה, 11.2026 ("תתחיל הכל", סבב 3 סעיף 5): "קישוט לדוכן גם בט״ו בשבט,
 * בפורים ובפסח, כמו בחנוכה". נדלק לבד בימים שלפני החג ונכבה אחריו:
 *   • ט״ו בשבט: שרשרת דגלים ירוקה, ועץ קטן עם פריחה על הארגז.
 *   • פורים: דגלים צבעוניים, מסכה על הדלפק ורעשן.
 *   • פסח: מצות על הדלפק, ופרחי אביב.
 *   • יום העצמאות: דגלים בכחול-לבן ודגל ישראל.
 *   • ראש השנה: תפוח, צנצנת דבש ורימון על הדלפק.
 * בלי טקסט ובלי אימוג'י, באותו קו דק של האיור. התאריכים חושבו מלוח עברי
 * (@hebcal/core, ישראל), 2027–2030. לתצוגה מקדימה: ?season=purim וכו'.
 */

export type Season = "tubishvat" | "purim" | "pesach" | "atzmaut" | "roshhashana";

/** היום של החג (ט״ו בשבט, פורים, פסח א׳, יום העצמאות, ראש השנה א׳) */
const DATES: Record<Season, string[]> = {
  tubishvat: ["2027-01-23", "2028-02-12", "2029-01-31", "2030-01-19"],
  purim: ["2027-03-23", "2028-03-12", "2029-03-01", "2030-03-19"],
  pesach: ["2027-04-22", "2028-04-11", "2029-03-31", "2030-04-18"],
  atzmaut: ["2027-05-12", "2028-05-02", "2029-04-19", "2030-05-08"],
  roshhashana: ["2027-10-02", "2028-09-21", "2029-09-10", "2030-09-28"],
};
/** כמה ימים לפני ואחרי */
const WINDOW: Record<Season, [number, number]> = {
  tubishvat: [-5, 0],
  purim: [-7, 1],
  pesach: [-7, 6],
  atzmaut: [-3, 0],
  roshhashana: [-10, 1],
};

const israelDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

export function seasonOn(now: Date = new Date()): Season | null {
  const t = Date.parse(israelDate(now) + "T00:00:00Z");
  for (const s of Object.keys(DATES) as Season[]) {
    for (const day of DATES[s]) {
      const d = Math.round((t - Date.parse(day + "T00:00:00Z")) / 864e5);
      if (d >= WINDOW[s][0] && d <= WINDOW[s][1]) return s;
    }
  }
  return null;
}

export function useSeason(): Season | null {
  const [s, setS] = useState<Season | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("season");
    setS(q && q in DATES ? (q as Season) : seasonOn());
  }, []);
  return s;
}

const INK = "#4A3B2F";
const WHITE = "#FFFFFF";
const FLAGS: Record<Season, string[]> = {
  tubishvat: ["#8BB174", "#CFE3B8", "#F4C7D3"],
  purim: ["#E58FB0", "#F2C94C", "#B39DDB", "#7FC8C2"],
  pesach: ["#F2D27A", "#FFFFFF", "#B9D98A"],
  atzmaut: ["#3F6FC4", "#FFFFFF"],
  roshhashana: ["#D9534F", "#F2C14E", "#FFFFFF"],
};

function Flags({ season }: { season: Season }) {
  const colors = FLAGS[season];
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const t = 0.08 + (i * 0.84) / 8;
        const x = 70 + 180 * t;
        const y = 81 + 20 * t * (1 - t);
        return <path key={i} d={`M${x - 5.5} ${y} L${x + 5.5} ${y} L${x} ${y + 10} z`} fill={colors[i % colors.length]} strokeWidth={1} />;
      })}
    </>
  );
}

/** מה יושב על הדלפק (במקום השקית), לפי החג. מרכז בערך x=173, הדלפק ב-y=140. */
function Counter({ season }: { season: Season }) {
  switch (season) {
    case "purim":
      return (
        <g>
          {/* מסכה */}
          <path d="M156 122 Q173 112 190 122 Q192 134 181 136 Q176 136 173 131 Q170 136 165 136 Q154 134 156 122 z" fill="#E58FB0" />
          <ellipse cx="166" cy="125" rx="3.6" ry="2.6" fill={WHITE} strokeWidth={0.8} />
          <ellipse cx="180" cy="125" rx="3.6" ry="2.6" fill={WHITE} strokeWidth={0.8} />
          <line x1="190" y1="122" x2="197" y2="139" strokeWidth={1.4} />
          <circle cx="160" cy="116" r="1.6" fill="#F2C94C" stroke="none" />
          <circle cx="186" cy="114" r="1.6" fill="#7FC8C2" stroke="none" />
          <circle cx="173" cy="110" r="1.6" fill="#B39DDB" stroke="none" />
        </g>
      );
    case "pesach":
      return (
        <g>
          {/* ערימת מצות */}
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={158 + i} y={133 - i * 5} width={30 - i * 2} height="5" rx="1" fill="#F2D9A6" />
              {[0, 1, 2, 3].map((k) => (
                <circle key={k} cx={162 + i + k * 7} cy={135.5 - i * 5} r="0.6" fill={INK} stroke="none" />
              ))}
            </g>
          ))}
        </g>
      );
    case "atzmaut":
      return (
        <g>
          {/* דגל ישראל על מוט */}
          <line x1="173" y1="140" x2="173" y2="106" strokeWidth={1.4} />
          <rect x="174" y="107" width="22" height="15" fill={WHITE} strokeWidth={1} />
          <rect x="174" y="109" width="22" height="2" fill="#3F6FC4" stroke="none" />
          <rect x="174" y="118" width="22" height="2" fill="#3F6FC4" stroke="none" />
          <path d="M185 111.6 l2.2 3.8 h-4.4 z M185 117.4 l2.2 -3.8 h-4.4 z" fill="none" stroke="#3F6FC4" strokeWidth={0.7} />
        </g>
      );
    case "roshhashana":
      return (
        <g>
          {/* תפוח */}
          <circle cx="160" cy="133" r="6.5" fill="#D9534F" />
          <path d="M160 126.5 q1 -3 3 -4" fill="none" strokeWidth={1} />
          <path d="M161.5 125 q3 -2 5 0 q-3 2 -5 0 z" fill="#8BB174" strokeWidth={0.8} />
          {/* צנצנת דבש */}
          <rect x="170" y="125" width="13" height="15" rx="2.5" fill="#F2C14E" />
          <rect x="169" y="122" width="15" height="4" rx="1" fill="#C98F3A" />
          {/* רימון */}
          <circle cx="191" cy="134" r="6" fill="#B83A4B" />
          <path d="M188.5 128.5 l1 -2.5 l1.5 2 l1.5 -2 l1 2.5" fill="#B83A4B" strokeWidth={0.8} />
        </g>
      );
    case "tubishvat":
      return null;
  }
}

/** שכבת החג לאיור הדוכן (app/home-stall.tsx). אותן קואורדינטות. */
export function SeasonStall({ empty = false }: { empty?: boolean }) {
  const season = useSeason();
  if (!season) return null;
  const hidesBag = season !== "tubishvat";
  return (
    <g data-testid="season-stall" data-season={season} aria-hidden stroke={INK} strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round">
      <style>{`.hs-flagset${!empty && hidesBag ? ", .hs-bag" : ""} { display: none; }`}</style>
      <Flags season={season} />
      {!empty && <Counter season={season} />}
      {season === "tubishvat" && (
        /* עץ קטן עם פריחה, ליד הארגז */
        <g>
          <line x1="34" y1="182" x2="34" y2="158" strokeWidth={2} />
          <circle cx="34" cy="152" r="10" fill="#8BB174" />
          {[[29, 148], [38, 147], [33, 156], [40, 154], [27, 155]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.8" fill="#F4C7D3" strokeWidth={0.6} />
          ))}
        </g>
      )}
      {season === "pesach" && (
        /* פרחי אביב על הארגז */
        <g>
          {[[24, 176, "#F2D27A"], [34, 174, "#F4C7D3"], [44, 177, "#B39DDB"]].map(([x, y, c], i) => (
            <g key={i}>
              <line x1={x as number} y1={(y as number) + 3} x2={x as number} y2={(y as number) + 8} strokeWidth={1} />
              <circle cx={x as number} cy={y as number} r="3.2" fill={c as string} strokeWidth={0.8} />
              <circle cx={x as number} cy={y as number} r="1" fill="#F2C14E" stroke="none" />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

/** שרשרת דגלים דקה לראש העמוד, בצבעי החג. */
export function SeasonGarland({ className = "" }: { className?: string }) {
  const season = useSeason();
  if (!season) return null;
  const colors = FLAGS[season];
  const n = 24;
  return (
    <svg viewBox={`0 0 ${n * 20} 22`} preserveAspectRatio="none" className={`block w-full h-[18px] pointer-events-none ${className}`} aria-hidden data-testid="season-garland">
      <path d={`M0 3 ${Array.from({ length: n }, (_, i) => `Q${i * 20 + 10} 8 ${i * 20 + 20} 3`).join(" ")}`} fill="none" stroke={INK} strokeWidth={0.8} />
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * 20 + 4} 4.6 L${i * 20 + 16} 4.6 L${i * 20 + 10} 17 z`} fill={colors[i % colors.length]} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
