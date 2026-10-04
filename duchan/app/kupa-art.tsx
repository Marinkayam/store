import Icon, { type IconName } from "./icons";

/**
 * האיורים של קופת הדוכן: הדוכן שגדל, המטבע, והמדליות של האותות.
 *
 * אותה שפה כמו איור הדוכן במסך הפתיחה (stall-art.tsx): קו עץ דק סביב כל
 * צורה, מילוי שטוח מהפלטה (שמנת, לבנדר, זית, עץ), בלי צל ובלי מעבר צבע.
 *
 * הדוכן בנוי משכבות לפי רמה. `build` מסמן את הרמה שזה עתה הושגה — החלקים
 * שלה נוחתים למקום אחד אחרי השני (kp-drop), וככה עלייה ברמה נראית כמו
 * בנייה ולא כמו החלפת תמונה.
 */

const W = "var(--wood)";
const INK = "#6f4b28";
const LINE = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SOFT = { ...LINE, strokeWidth: 1 };

function part(lv: number, build: number | undefined, i = 0) {
  return build === lv
    ? { className: "kp-drop", style: { animationDelay: `${0.12 + i * 0.11}s` } as React.CSSProperties }
    : {};
}

/* ── חפצים קטנים, כל אחד מצויר סביב נקודת הבסיס שלו (x = שמאל, y = הקרקע שלו) ── */

function Jar({ x, y }: { x: number; y: number }) {
  return (
    <g {...LINE}>
      <rect x={x} y={y - 21} width="19" height="21" rx="3.5" fill="var(--canvas)" />
      <rect x={x - 2} y={y - 27} width="23" height="7" rx="2.5" fill="var(--lavender)" />
      <g {...SOFT}>
        <rect x={x + 3} y={y - 16} width="6" height="5" rx="1.6" fill="var(--cream)" />
        <rect x={x + 10} y={y - 17} width="6" height="5" rx="1.6" fill="var(--blush)" />
        <rect x={x + 3} y={y - 9} width="6" height="5" rx="1.6" fill="var(--blush)" />
        <rect x={x + 10} y={y - 9} width="6" height="5" rx="1.6" fill="var(--cream)" />
      </g>
    </g>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  const leaves: [number, number, number][] = [
    [x + 3, y - 24, -30], [x + 15, y - 24, 30], [x + 4, y - 32, -25], [x + 14, y - 32, 25], [x + 9, y - 38, 0],
  ];
  return (
    <g {...LINE}>
      {/* העלים מתנדנדים סביב בסיס הגבעול, כמו ברוח קלה */}
      <g className="kp-sway" style={{ transformOrigin: `${x + 9}px ${y - 13}px` }}>
        <path d={`M${x + 9} ${y - 13} v-26`} fill="none" />
        {leaves.map(([cx, cy, r], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx="6.5" ry="3.6" fill="var(--olive)" transform={`rotate(${r} ${cx} ${cy})`} />
        ))}
      </g>
      <path d={`M${x} ${y - 14} h18 l-2.5 14 h-13 z`} fill="var(--blush)" />
      <path d={`M${x - 1} ${y - 14} h20`} fill="none" strokeWidth={2.2} />
    </g>
  );
}

function Basket({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {/* ענבים מאחור, כוכב מחייך לפניהם, הסלסלה מסתירה את התחתית */}
      <g {...SOFT} fill="var(--lavender)">
        {[[x + 28, y - 22], [x + 34, y - 22], [x + 31, y - 27], [x + 25, y - 27], [x + 37, y - 27]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3.4" />
        ))}
      </g>
      <g className="star-bob">
        <path
          d={`M${x + 14} ${y - 38} l3.4 7.4 8 0.8 -6 5.4 1.8 7.9 -7.2 -4.2 -7.2 4.2 1.8 -7.9 -6 -5.4 8 -0.8z`}
          fill="var(--warning)"
          {...LINE}
        />
        <circle cx={x + 11.5} cy={y - 28} r="0.9" fill={INK} />
        <circle cx={x + 16.5} cy={y - 28} r="0.9" fill={INK} />
        <path d={`M${x + 11.5} ${y - 25.5} q2.5 2 5 0`} fill="none" stroke={INK} strokeWidth={0.9} />
      </g>
      <g {...LINE}>
        <path d={`M${x} ${y - 17} h42 l-4 17 h-34 z`} fill="var(--sand)" />
        <path d={`M${x + 2} ${y - 11} h38 M${x + 3} ${y - 5} h36`} fill="none" strokeWidth={0.9} />
        <path d={`M${x + 10} ${y - 17} l1.5 17 M${x + 21} ${y - 17} v17 M${x + 32} ${y - 17} l-1.5 17`} fill="none" strokeWidth={0.7} />
      </g>
    </g>
  );
}

function Bag({ x, y }: { x: number; y: number }) {
  return (
    <g {...LINE}>
      <path d={`M${x + 4} ${y - 25} a6 6 0 0 1 12 0`} fill="none" />
      <path d={`M${x} ${y} v-25 h20 v25 z`} fill="var(--canvas)" />
      <path d={`M${x + 20} ${y - 25} l5 4 v25 l-5 -4 z`} fill="var(--sand)" />
      <path d={`M${x + 10} ${y - 5} v-11`} fill="none" strokeWidth={1} />
      <ellipse cx={x + 6} cy={y - 13} rx="4" ry="2.2" fill="var(--olive)" transform={`rotate(-26 ${x + 6} ${y - 13})`} />
      <ellipse cx={x + 14} cy={y - 10} rx="4" ry="2.2" fill="var(--olive)" transform={`rotate(26 ${x + 14} ${y - 10})`} />
    </g>
  );
}

function Squishy({ x, y }: { x: number; y: number }) {
  return (
    <g className="kp-squish" style={{ transformOrigin: `${x + 10}px ${y}px` }}>
      <path d={`M${x} ${y} q0 -16 10 -16 q10 0 10 16 z`} fill="var(--blush)" {...LINE} />
      <circle cx={x + 7} cy={y - 8} r="1" fill={INK} />
      <circle cx={x + 13} cy={y - 8} r="1" fill={INK} />
      <path d={`M${x + 7.5} ${y - 5} q2.5 2 5 0`} fill="none" stroke={INK} strokeWidth={0.9} />
      <circle cx={x + 4.5} cy={y - 5.5} r="1.6" fill="var(--lavender)" opacity=".6" />
      <circle cx={x + 15.5} cy={y - 5.5} r="1.6" fill="var(--lavender)" opacity=".6" />
    </g>
  );
}

function Bracelets({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <g {...LINE}>
        <path d={`M${x + 8} ${y - 2} v-28`} fill="none" strokeWidth={1.8} />
        <rect x={x} y={y - 3} width="16" height="3" rx="1" fill={W} />
      </g>
      {[["var(--lavender)", 0], ["var(--olive)", 7], ["var(--warning)", 14]].map(([c, dy], i) => (
        <ellipse
          key={String(dy)}
          className="kp-jiggle"
          style={{ animationDelay: `${i * 0.25}s` }}
          cx={x + 8}
          cy={y - 24 + Number(dy)}
          rx="6.5"
          ry="2.6"
          fill="none"
          stroke={String(c)}
          strokeWidth={2.4}
        />
      ))}
    </g>
  );
}

/** תווית מחיר תלויה — מתנדנדת קצת */
function Tag({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g className="kp-swing" style={{ transformOrigin: `${x}px ${y}px` }}>
      <path d={`M${x} ${y} v5`} stroke={INK} strokeWidth={0.8} />
      <path d={`M${x - 7} ${y + 5} h14 v9 h-14 z`} fill="var(--canvas)" {...SOFT} />
      <text x={x} y={y + 12} textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={800} fontSize="6" fill={INK}>
        {text}
      </text>
    </g>
  );
}

function Wheel({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="kp-wheel" style={{ transformOrigin: `${cx}px ${cy}px` }} {...LINE}>
      <circle cx={cx} cy={cy} r="11" fill="var(--canvas)" />
      <circle cx={cx} cy={cy} r="7.5" fill="none" strokeWidth={0.8} />
      {[0, 60, 120].map((a) => (
        <path key={a} d={`M${cx} ${cy - 11} v22`} transform={`rotate(${a} ${cx} ${cy})`} strokeWidth={1.1} />
      ))}
      <circle cx={cx} cy={cy} r="2.4" fill={W} />
    </g>
  );
}

/** מטבע שקופץ מדי פעם מהסלסלה (או מהצנצנת בעגלה) ונופל בחזרה */
function HopCoin({ x, y }: { x: number; y: number }) {
  return (
    <g className="kp-hop" aria-hidden>
      <circle cx={x} cy={y} r="4.2" fill="#E3C26F" stroke={INK} strokeWidth={1} />
      <path d={`M${x - 1.8} ${y - 0.8} h3.6`} stroke={INK} strokeWidth={0.8} />
    </g>
  );
}

/** פרפר: מסלול לולאה איטי, והכנפיים מתקפלות */
function Butterfly() {
  return (
    <g className="kp-butterfly" aria-hidden>
      <g transform="translate(14 96)">
        <g className="kp-wings" style={{ transformOrigin: "0px 0px" }}>
          <ellipse cx="-3.2" cy="-1.5" rx="3.4" ry="4.4" fill="var(--blush)" stroke={INK} strokeWidth={0.8} />
          <ellipse cx="3.2" cy="-1.5" rx="3.4" ry="4.4" fill="var(--lavender)" stroke={INK} strokeWidth={0.8} />
        </g>
        <path d="M0 -4 v7" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** נקודה על עקומה ריבועית — לשרשראות דגלים ונורות */
function onCurve(t: number, [x0, y0]: number[], [cx, cy]: number[], [x1, y1]: number[]) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** כוכבים בשמי הלילה — מקומות קבועים, כדי שלא יקפצו ברינדור */
const NIGHT_STARS: [number, number, number][] = [
  [12, 10, 1.6], [34, 30, 1.1], [58, 8, 1.3], [82, 26, 1], [104, 6, 1.5], [128, 20, 1.1],
  [150, 9, 1.3], [176, 28, 1], [192, 6, 1.2], [232, 40, 1.1], [6, 44, 1], [64, 44, 1.2], [160, 42, 0.9],
];

export function KupaStall({
  level,
  name,
  build,
  night = false,
  className = "",
}: {
  level: number;
  name?: string;
  /** הרמה שזה עתה הושגה — החלקים שלה נבנים באנימציה */
  build?: number;
  /** לילה: שמיים כהים, ירח וכוכבים, הנורות זוהרות, גחליליות במקום ציפורים */
  night?: boolean;
  className?: string;
}) {
  const sign = (name ?? "הדוכן שלי").slice(0, 14);
  const lights = { a: [26, 57], c: [120, 63], b: [214, 57] };
  const day = !night;
  return (
    <svg viewBox="0 0 240 176" className={className} role="img" aria-label={`איור הדוכן ברמה ${level + 1}${night ? ", בלילה" : ""}`} data-night={night ? "1" : undefined}>
      <rect x="0" y="0" width="240" height="176" className="kp-sky" style={{ fill: night ? "#2E3150" : "var(--cream)" }} />

      {/* לילה: כוכבים מנצנצים וירח */}
      <g className="kp-fade" style={{ opacity: night ? 1 : 0 }} aria-hidden>
        {NIGHT_STARS.map(([x, y, r], i) => (
          <circle key={i} className="kp-twinkle" style={{ animationDelay: `${(i % 4) * 0.4}s` }} cx={x} cy={y} r={r} fill="#FFF3C4" />
        ))}
        <path d="M212 8 a12 12 0 1 0 12 16 a9 9 0 1 1 -12 -16z" fill="#F6E7BF" stroke="#E3C26F" strokeWidth={1} />
      </g>

      {/* שמש עם קרניים, וענן שזז לאט */}
      <g className="kp-fade" style={{ opacity: day ? 0.75 : 0 }}>
        <circle cx="214" cy="20" r="9" fill="var(--warning)" />
        <g className="kp-spin-slow" style={{ transformOrigin: "214px 20px" }}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} d="M214 6 v-3" stroke="var(--warning)" strokeWidth={2} strokeLinecap="round" transform={`rotate(${a} 214 20)`} />
          ))}
        </g>
      </g>
      {/* שתי ציפורים שחוצות את השמיים מדי פעם (ביום) */}
      <g className="kp-bird" aria-hidden style={{ display: day ? undefined : "none" }}>
        <path className="kp-flap" d="M0 0 q3 -3 6 0 q3 -3 6 0" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" style={{ transformOrigin: "6px 0px" }} transform="translate(0 0)" />
        <path className="kp-flap" d="M14 6 q2.5 -2.5 5 0 q2.5 -2.5 5 0" fill="none" stroke={INK} strokeWidth={1} strokeLinecap="round" style={{ transformOrigin: "19px 6px", animationDelay: ".2s" }} />
      </g>
      {level < 5 && (
        <g className="kp-drift">
          <path d="M14 24 a6 6 0 0 1 10 -5 a8 8 0 0 1 15 2 a5 5 0 0 1 1 10 h-24 a4 4 0 0 1 -2 -7z" fill="var(--canvas)" stroke={INK} strokeWidth={1} opacity={night ? 0.35 : 0.9} className="kp-fade" />
        </g>
      )}

      {/* קרקע: אדמה, כמה גבעולי דשא, וצל רך מתחת לדוכן */}
      <rect x="0" y="150" width="240" height="26" className="kp-sky" style={{ fill: night ? "#4A4560" : "var(--sand)" }} />
      <path d="M0 150 h240" stroke={INK} strokeWidth={1} opacity=".5" />
      <g stroke="var(--olive)" strokeWidth={1.4} strokeLinecap="round" fill="none">
        <path className="kp-sway" style={{ transformOrigin: "16px 162px" }} d="M14 162 l-2 -5 M16 162 l1 -6 M18 162 l3 -4" />
        <path className="kp-sway" style={{ transformOrigin: "224px 166px", animationDelay: "1s" }} d="M222 166 l-2 -5 M224 166 l1 -6 M226 166 l3 -4" />
        <path className="kp-sway" style={{ transformOrigin: "111px 170px", animationDelay: ".5s" }} d="M110 170 l-2 -4 M112 170 l2 -4" />
      </g>
      <ellipse cx="120" cy="153" rx="96" ry="3.5" fill={INK} opacity=".1" />
      {night && (
        <g aria-hidden>
          {[[18, 120], [222, 104], [60, 140], [182, 136], [120, 90]].map(([x, y], i) => (
            <circle key={i} className="kp-firefly" style={{ animationDelay: `${i * 0.9}s` }} cx={x} cy={y} r="1.8" fill="#FFE98A" />
          ))}
        </g>
      )}

      {level === 0 ? (
        <g className={build === 0 ? "kp-roll" : ""}>
        <g className="kp-bob">
          {/* שמשייה קטנה על העגלה — מתנדנדת סביב הבסיס של המוט */}
          <g {...LINE} className="kp-sway" style={{ transformOrigin: "70px 100px" }}>
            <path d="M70 100 v-44" fill="none" strokeWidth={1.8} />
            <path d="M44 62 Q70 34 96 62 z" fill="var(--lavender)" />
            <path d="M57 62 Q63 46 70 41 Q77 46 83 62" fill="var(--canvas)" />
            <path d="M44 62 a6.5 4 0 0 0 13 0 a6.5 4 0 0 0 13 0 a6.5 4 0 0 0 13 0 a6.5 4 0 0 0 13 0" fill="none" strokeWidth={1.1} />
          </g>
          <Plant x={80} y={100} />
          <Squishy x={104} y={100} />
          <Jar x={130} y={100} />
          <HopCoin x={140} y={74} />
          {/* העגלה: קרשים, ידית וגלגלים */}
          <g {...LINE}>
            <rect x="60" y="100" width="112" height="34" fill={W} />
            <path d="M60 111 h112 M60 122 h112" fill="none" strokeWidth={0.8} opacity=".7" />
            <path d="M88 100 v34 M116 100 v34 M144 100 v34" fill="none" strokeWidth={0.6} opacity=".5" />
            <path d="M172 106 l22 -15" fill="none" strokeWidth={3.2} />
            <path d="M190 89 l8 -2" fill="none" strokeWidth={4.5} />
          </g>
          <Tag x={117} y={134} text="₪5" />
        </g>
          <Wheel cx={84} cy={142} />
          <Wheel cx={150} cy={142} />
        </g>
      ) : (
        <>
          {/* רמה 2: דוכן — עמודים, מדף אחורי, דלפק עם בד מפוספס, ארגז תפוחים */}
          <g {...part(1, build, 0)}>
            <g {...LINE}>
              <rect x="36" y="38" width="9" height="112" fill={W} />
              <rect x="195" y="38" width="9" height="112" fill={W} />
              <path d="M39 50 v20 M198 60 v24" stroke={INK} strokeWidth={0.6} opacity=".6" />
            </g>
            {/* ארגז תפוחים על הקרקע */}
            <g {...LINE}>
              {[[9, 124], [17, 122], [25, 124]].map(([cx, cy]) => (
                <circle key={cx} cx={cx} cy={cy} r="4.6" fill="var(--blush)" />
              ))}
              <rect x="3" y="126" width="30" height="24" fill={W} />
              <path d="M3 138 h30" fill="none" strokeWidth={0.8} opacity=".7" />
            </g>
          </g>
          <g {...part(1, build, 1)}>
            {/* בד מפוספס מתחת לדלפק */}
            <g {...SOFT}>
              {Array.from({ length: 12 }, (_, i) => (
                <rect key={i} x={30 + i * 15} y="118" width="15" height="30" fill={i % 2 ? "var(--canvas)" : "var(--lavender)"} />
              ))}
            </g>
            <g {...LINE}>
              <rect x="24" y="108" width="192" height="10" fill={W} />
              <path d="M24 113 h192" fill="none" strokeWidth={0.6} opacity=".6" />
            </g>
            <Tag x={70} y={118} text="₪8" />
            <Tag x={168} y={118} text="₪12" />
          </g>
          <g {...part(1, build, 2)}>
            <Plant x={46} y={108} />
            <Basket x={70} y={108} />
            <HopCoin x={100} y={80} />
            <Bag x={120} y={108} />
            <Jar x={152} y={108} />
            <Bracelets x={180} y={108} />
          </g>

          {/* פרפר שמרחף ליד ארגז התפוחים, מרמה 3 */}
          {level >= 2 && day && <Butterfly />}

          {/* רמה 3: סוכך עם שוליים מסולסלים */}
          {level >= 2 && (
            <g {...part(2, build, 0)}>
              <g {...LINE} className="awning-flap">
                <rect x="24" y="30" width="192" height="9" fill={W} />
                {Array.from({ length: 8 }, (_, i) => {
                  const x = 24 + i * 24;
                  const c = i % 2 ? "var(--canvas)" : "var(--lavender)";
                  return <path key={i} d={`M${x} 39 h24 v12 a12 9 0 0 1 -24 0 z`} fill={c} />;
                })}
                <path d="M24 44 h192" fill="none" strokeWidth={0.6} opacity=".5" />
              </g>
            </g>
          )}

          {/* רמה 4: שלט עם השם, ולוח גיר "חדש!" */}
          {level >= 3 && (
            <g {...part(3, build, 0)}>
              <g className="kp-swing" style={{ transformOrigin: "120px 30px" }}>
                <path d="M96 30 l4 -8 M144 30 l-4 -8" stroke={INK} strokeWidth={1.2} />
                <rect x="68" y="4" width="104" height="20" rx="3" fill={W} {...LINE} />
                <rect x="71" y="7" width="98" height="14" rx="2" fill="var(--canvas)" {...SOFT} />
                <text x="120" y="17.5" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={800} fontSize="10" fill="var(--ink)">
                  {sign}
                </text>
              </g>
              {/* לוח גיר קטן על הקרקע */}
              <g {...LINE}>
                <path d="M212 150 l6 -26 M232 150 l-6 -26" fill="none" strokeWidth={1.6} />
                <rect x="210" y="122" width="24" height="18" fill="var(--ink)" />
                <text x="222" y="134" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={800} fontSize="6.5" fill="var(--canvas)" stroke="none">
                  חדש!
                </text>
              </g>
            </g>
          )}

          {/* רמה 5: נורות לאורך הסוכך ופנס על העמוד */}
          {level >= 4 && (
            <g {...part(4, build, 0)}>
              <path d={`M${lights.a} Q${lights.c} ${lights.b}`} fill="none" stroke={INK} strokeWidth={0.9} />
              {Array.from({ length: 11 }, (_, i) => {
                const [px, py] = onCurve((i + 0.5) / 11, lights.a, lights.c, lights.b);
                return (
                  <g key={i}>
                    <rect x={px - 1.4} y={py - 0.5} width="2.8" height="2.5" fill={INK} />
                    {night && <circle className="kp-twinkle" style={{ animationDelay: `${(i % 3) * 0.5}s` }} cx={px} cy={py + 4.5} r="7" fill="#FFD966" opacity=".4" />}
                    <circle className="kp-twinkle" style={{ animationDelay: `${(i % 3) * 0.5}s` }} cx={px} cy={py + 4.5} r="2.8" fill={night ? "#FFE98A" : i % 2 ? "var(--warning)" : "var(--blush)"} stroke={INK} strokeWidth={0.8} />
                  </g>
                );
              })}
              <g className="kp-swing" style={{ transformOrigin: "209px 92px" }}>
                <path d="M204 92 h5 v6" fill="none" stroke={INK} strokeWidth={1} />
                <rect x="204" y="98" width="10" height="3" fill={W} {...SOFT} />
                {night && <circle cx="209" cy="106" r="11" fill="#FFD966" opacity=".35" />}
                <rect x="205" y="101" width="8" height="10" rx="1.5" fill={night ? "#FFE98A" : "var(--warning)"} {...SOFT} />
                <rect x="204" y="111" width="10" height="2.5" fill={W} {...SOFT} />
              </g>
            </g>
          )}

          {/* רמה 6: דגל, כוכב מחייך על הסוכך ובלון */}
          {level >= 5 && (
            <g {...part(5, build, 0)}>
              <g {...LINE}>
                <path d="M22 30 v-28" fill="none" />
                <path d="M22 2 l18 5 l-18 5 z" fill="var(--warning)" className="kp-swing" style={{ transformOrigin: "22px 7px" }} />
              </g>
              <g className="star-bob">
                <path d="M54 4 l4.6 9.4 10.3 1.2 -7.6 7.1 2 10.2 -9.3 -5.1 -9.3 5.1 2 -10.2 -7.6 -7.1 10.3 -1.2z" fill="var(--lavender)" {...LINE} />
                <circle cx="51" cy="17" r="1.1" fill={INK} />
                <circle cx="57" cy="17" r="1.1" fill={INK} />
                <path d="M51 20.5 q3 2.4 6 0" fill="none" stroke={INK} strokeWidth={1} />
              </g>
              <g className="star-bob" style={{ animationDelay: ".7s" }}>
                <path d="M204 112 q14 -20 22 -40" fill="none" stroke={INK} strokeWidth={0.8} />
                <ellipse cx="226" cy="62" rx="9" ry="11" fill="var(--blush)" {...LINE} />
                <path d="M224 73 h4 l-2 3 z" fill="var(--blush)" {...SOFT} />
                <path d="M222 56 q2 -3 5 -3" fill="none" stroke="var(--canvas)" strokeWidth={1.4} strokeLinecap="round" />
              </g>
            </g>
          )}
        </>
      )}
    </svg>
  );
}

/** המטבע: עיגול זהב עם סוכך קטן מוטבע. לא ₪ — כדי שלא יתבלבל עם כסף אמיתי. */
export function Coin({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="10.6" fill="#E3C26F" stroke="#6f4b28" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7.7" fill="none" stroke="#6f4b28" strokeWidth="1" opacity=".45" />
      <path d="M7.2 9.3h9.6v1.2H7.2z" fill="#6f4b28" />
      <path
        d="M7.2 10.5h2.4v1.4a1.2 1.1 0 0 1-2.4 0zM9.6 10.5H12v1.4a1.2 1.1 0 0 1-2.4 0zM12 10.5h2.4v1.4a1.2 1.1 0 0 1-2.4 0zM14.4 10.5h2.4v1.4a1.2 1.1 0 0 1-2.4 0z"
        fill="#FFF8E6"
        stroke="#6f4b28"
        strokeWidth=".6"
      />
      <path d="M8.4 12.6v3.4M15.6 12.6v3.4M7.4 16h9.2" stroke="#6f4b28" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** מדליה של אות: מטבע גדול עם האייקון. נעול = קו מקווקו ואייקון אפור. */
export function Medal({
  icon,
  reached,
  size = 56,
  className = "",
}: {
  icon: IconName;
  reached: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 56 56" width={size} height={size} className="absolute inset-0">
        {reached ? (
          <>
            <circle cx="28" cy="28" r="26" fill="#E3C26F" stroke="#6f4b28" strokeWidth="1.8" />
            <circle cx="28" cy="28" r="20.5" fill="#F6E7BF" stroke="#6f4b28" strokeWidth="1" opacity=".9" />
          </>
        ) : (
          <circle cx="28" cy="28" r="25.5" fill="var(--canvas)" stroke="var(--stone)" strokeWidth="1.6" strokeDasharray="4 3.5" />
        )}
      </svg>
      <span className={`relative ${reached ? "text-[#6f4b28]" : "text-[var(--stone)]"}`}>
        <Icon name={icon} size={Math.round(size * 0.46)} tone={reached ? "var(--lavender)" : "transparent"} />
      </span>
    </span>
  );
}
