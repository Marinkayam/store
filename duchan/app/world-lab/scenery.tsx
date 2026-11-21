import { CLASS_NAME, MALL, WORLD, type ClassSize } from "./data";

/**
 * הסביבה של עולם דוכן: עיר קטנה ליד הים, ובמרכזה הקניון של הכיתה.
 *
 * ציור אחד (SVG) ביחידות עולם, במבט מלמעלה-מהצד: רואים את הקרקע מלמעלה,
 * ואת הבתים והדוכנים מהחזית. ככה אותו דוכן מצויר עומד טבעי גם ברחוב וגם
 * כשמתרחקים עד העיר.
 *
 * אותה שפה כמו איורי הדוכן: מילוי שטוח, קו עץ דק, בלי צל ובלי מעבר צבע.
 * כל הצבעים הם משתני CSS (world.css), כדי שיום ולילה יתחלפו בלי לצייר מחדש.
 *
 * עובי הקו קבוע ביחידות עולם ולכן תלוי במרחק שממנו הפרט נועד להיראות:
 * פרטי העיר בקו עבה (נראים מרחוק), פרטי הקניון בקו דק (נראים מקרוב).
 */

const L = "var(--wl-line)";
const city = { stroke: L, strokeWidth: 4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const mall = { stroke: L, strokeWidth: 0.8, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/* ── עיר ── */

function Tree({ x, y, r = 34, alt = false }: { x: number; y: number; r?: number; alt?: boolean }) {
  return (
    <g>
      <rect x={x - 5} y={y - 6} width="10" height="26" fill="var(--wl-trunk)" />
      <circle cx={x} cy={y - r * 0.7} r={r} fill={alt ? "var(--wl-tree2)" : "var(--wl-tree)"} {...city} strokeWidth={3} />
    </g>
  );
}

const ROOFS = ["var(--wl-roof)", "var(--wl-roof2)", "var(--wl-roof3)"];
const WALLS = ["var(--wl-wall)", "var(--wl-wall2)", "var(--wl-wall3)"];

/** בית עם גג רעפים. לחלק מהבתים דוד שמש על הגג. */
function House({ x, y, i }: { x: number; y: number; i: number }) {
  const w = 118;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="40" width={w} height="72" fill={WALLS[i % 3]} {...city} />
      <path d={`M-8 42 L16 0 H${w - 16} L${w + 8} 42 z`} fill={ROOFS[(i * 2 + 1) % 3]} {...city} />
      <rect x="14" y="58" width="24" height="24" className="wl-window" fill="var(--wl-window)" {...city} strokeWidth={3} />
      <rect x={w - 38} y="58" width="24" height="24" className="wl-window" fill="var(--wl-window)" {...city} strokeWidth={3} />
      <rect x={w / 2 - 11} y="76" width="22" height="36" fill="var(--wl-trunk)" {...city} strokeWidth={3} />
      {i % 2 === 0 && (
        <g>
          <path d={`M${w - 52} 30 l26 -12 v14 l-26 12 z`} fill="var(--wl-window)" {...city} strokeWidth={3} />
          <rect x={w - 54} y="6" width="30" height="13" rx="6.5" fill="var(--wl-wall)" {...city} strokeWidth={3} />
        </g>
      )}
    </g>
  );
}

function Palm({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y} q6 -40 0 -78`} fill="none" stroke="var(--wl-trunk)" strokeWidth={9} strokeLinecap="round" />
      <g className="wl-sway" style={{ transformOrigin: `${x}px ${y - 78}px` }} fill="var(--wl-tree)" {...city} strokeWidth={3}>
        <path d={`M${x} ${y - 78} q-34 -26 -62 -2 q30 -8 62 2z`} />
        <path d={`M${x} ${y - 78} q34 -26 62 -2 q-30 -8 -62 2z`} />
        <path d={`M${x} ${y - 78} q-20 -44 -52 -40 q28 8 52 40z`} />
        <path d={`M${x} ${y - 78} q20 -44 52 -40 q-28 8 -52 40z`} />
      </g>
    </g>
  );
}

function Umbrella({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x + 30} y={y + 6} width="64" height="26" fill="var(--wl-wall2)" {...city} strokeWidth={3} />
      <circle cx={x} cy={y} r="34" fill={c} {...city} strokeWidth={3} />
      <path d={`M${x - 34} ${y} h68 M${x} ${y - 34} v68 M${x - 24} ${y - 24} l48 48 M${x - 24} ${y + 24} l48 -48`} stroke="var(--canvas)" strokeWidth={5} opacity=".7" />
    </g>
  );
}

const HOUSE_ROWS: [number, number, number][] = [
  // [x התחלה, y, כמה בתים]
  [90, 360, 3], [680, 360, 7], [1900, 360, 3],
  [90, 660, 3], [680, 660, 7], [1900, 660, 3],
  [1900, 1900, 3], [1900, 2200, 3],
  [1900, 2780, 3], [1900, 3080, 3],
  [90, 3260, 3],
];

const CITY_TREES: [number, number, number?][] = [
  [600, 520], [1830, 520], [600, 830, 28], [1830, 830, 28],
  [140, 1180, 40], [460, 1200], [120, 1760], [480, 1820, 40], [150, 2100], [440, 2280, 30], [260, 2420, 42], [110, 2500, 30],
  [300, 1250, 30], [380, 1990, 36], [200, 1940, 28],
  [1900, 2540, 30], [2300, 2540, 30], [2100, 2540, 36],
  [700, 2740, 30], [1700, 2740, 30], [700, 3380, 30], [1700, 3380, 30],
  [1900, 3400, 30], [2300, 3400, 30],
  [80, 900, 30], [2330, 900, 30],
];

function City() {
  return (
    <g className="wl-city">
      {/* שדות מסביב לעיר, והים בדרום */}
      <rect x="-4000" y="-4000" width="10400" height="7900" fill="var(--wl-field)" />
      <rect x="-4000" y="3900" width="10400" height="4200" fill="var(--wl-water)" />

      {/* צפון: שדות, פרדס ומגדל מים על גבעה */}
      <g>
        <rect x="760" y="30" width="700" height="230" fill="var(--wl-field2)" />
        <rect x="760" y="30" width="700" height="230" fill="url(#wl-orchard)" />
        <rect x="1580" y="50" width="640" height="200" fill="var(--wl-field2)" />
        <path d="M1580 90h640M1580 130h640M1580 170h640M1580 210h640" stroke="var(--wl-field)" strokeWidth={10} />
        <ellipse cx="300" cy="210" rx="230" ry="70" fill="var(--wl-field2)" />
        <g data-surprise-art="tower">
          <path d="M270 210 L282 96 H318 L330 210 z" fill="var(--wl-wall)" {...city} />
          <path d="M292 120 v80 M308 120 v80 M292 140 h16 M292 165 h16 M292 190 h16" stroke={L} strokeWidth={3} fill="none" />
          <rect x="216" y="34" width="168" height="66" rx="30" fill="var(--wl-wall)" {...city} />
          <path d="M226 60 h148" stroke={L} strokeWidth={3} />
        </g>
      </g>

      {/* העיר עצמה: דשא, ואחריו כבישים */}
      <rect x="40" y="300" width="2320" height="3140" fill="var(--wl-grass)" />

      {/* כבישים */}
      <g fill="var(--wl-road)">
        <rect x="550" y="-4000" width="70" height="7520" />
        <rect x="1780" y="300" width="70" height="3220" />
        <rect x="40" y="960" width="2320" height="70" />
        <rect x="40" y="2620" width="2320" height="70" />
        <rect x="-4000" y="3440" width="10400" height="80" />
      </g>
      <g stroke="var(--wl-roadline)" strokeWidth={5} strokeDasharray="30 26" fill="none">
        <path d="M585 320V3430M1815 320V3430M60 995H2340M60 2655H2340M-4000 3480H6400" />
      </g>

      {/* בתים */}
      {HOUSE_ROWS.flatMap(([x0, y, n], r) =>
        Array.from({ length: n }, (_, i) => <House key={`${r}-${i}`} x={x0 + i * 150} y={y} i={r * 3 + i} />)
      )}

      {/* הפארק והאגם */}
      <g>
        <rect x="90" y="1090" width="430" height="1470" rx="70" fill="var(--wl-grass2)" />
        <path d="M300 1100 q-90 240 0 330 M300 1600 q120 300 -40 560 q-60 120 20 380" fill="none" stroke="var(--wl-pave)" strokeWidth={26} strokeLinecap="round" />
        <ellipse cx="300" cy="1500" rx="150" ry="96" fill="var(--wl-water)" {...city} />
        <ellipse cx="270" cy="1480" rx="70" ry="30" fill="var(--wl-water2)" />
        <g data-surprise-art="ducks">
          {[[250, 1490], [320, 1520], [360, 1470]].map(([x, y], i) => (
            <g key={i} className="wl-bob" style={{ animationDelay: `${i * 0.5}s` }}>
              <ellipse cx={x} cy={y} rx="17" ry="11" fill="var(--canvas)" {...city} strokeWidth={3} />
              <circle cx={x + 13} cy={y - 10} r="8" fill="var(--canvas)" {...city} strokeWidth={3} />
              <path d={`M${x + 20} ${y - 10} l10 3 l-10 3z`} fill="var(--warning)" />
            </g>
          ))}
        </g>
        {/* שמיכת פיקניק וספסל */}
        <rect x="150" y="2180" width="90" height="70" fill="var(--wl-wall2)" {...city} strokeWidth={3} />
        <path d="M150 2203h90M150 2226h90M180 2180v70M210 2180v70" stroke="var(--canvas)" strokeWidth={5} opacity=".8" />
        <rect x="350" y="1700" width="80" height="18" fill="var(--wl-trunk)" {...city} strokeWidth={3} />
      </g>

      {/* בית הספר, המגרש וגן המשחקים */}
      <g>
        <rect x="1900" y="1130" width="420" height="210" fill="var(--wl-wall)" {...city} />
        <rect x="1890" y="1100" width="440" height="40" fill="var(--wl-roof2)" {...city} />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={1924 + (i % 6) * 64} y={1160 + Math.floor(i / 6) * 70} width="38" height="38" className="wl-window" fill="var(--wl-window)" {...city} strokeWidth={3} />
        ))}
        <rect x="2086" y="1270" width="48" height="70" fill="var(--wl-trunk)" {...city} strokeWidth={3} />
        <path d="M1930 1100 v-70" stroke={L} strokeWidth={5} />
        <path className="wl-sway" style={{ transformOrigin: "1930px 1040px" }} d="M1930 1030 l52 14 l-52 14 z" fill="var(--wl-wall3)" {...city} strokeWidth={3} />
        <rect x="1900" y="1370" width="420" height="140" fill="var(--wl-roof3)" opacity=".55" />
        <path d="M1900 1370h420v140h-420zM2110 1370v140" stroke="var(--canvas)" strokeWidth={5} fill="none" />
        <circle cx="2110" cy="1440" r="34" stroke="var(--canvas)" strokeWidth={5} fill="none" />
      </g>
      <g>
        <rect x="1900" y="1570" width="420" height="260" rx="50" fill="var(--wl-sand)" />
        <path d="M1960 1640 h110 M1975 1640 v80 M2055 1640 v80" stroke={L} strokeWidth={6} fill="none" />
        <g className="wl-sway" style={{ transformOrigin: "2000px 1640px" }}>
          <path d="M1995 1640 v54 M2005 1640 v54" stroke={L} strokeWidth={3} />
          <rect x="1988" y="1694" width="24" height="8" fill="var(--wl-roof)" />
        </g>
        <g className="wl-sway" style={{ transformOrigin: "2035px 1640px", animationDelay: "1.1s" }}>
          <path d="M2030 1640 v54 M2040 1640 v54" stroke={L} strokeWidth={3} />
          <rect x="2023" y="1694" width="24" height="8" fill="var(--wl-roof2)" />
        </g>
        <path d="M2170 1630 v110 M2230 1630 v60 M2170 1634 h60 M2230 1640 q40 60 70 110" stroke={L} strokeWidth={6} fill="none" />
        <path d="M2228 1640 q40 60 72 112 l-18 8 q-30 -52 -70 -108 z" fill="var(--wl-roof)" {...city} strokeWidth={3} />
        <circle cx="2010" cy="1770" r="34" fill="var(--wl-roof3)" {...city} strokeWidth={3} />
        <path d="M1976 1770h68M2010 1736v68" stroke={L} strokeWidth={3} />
      </g>

      {/* דרום: מגרש כדורגל, מתחם פנוי */}
      <g>
        <rect x="100" y="2760" width="400" height="440" fill="var(--wl-grass2)" />
        <path d="M100 2760h400v440h-400zM100 2980h400M240 2760v50h120v-50M240 3200v-50h120v50" stroke="var(--canvas)" strokeWidth={6} fill="none" />
        <circle cx="300" cy="2980" r="50" stroke="var(--canvas)" strokeWidth={6} fill="none" />
      </g>
      <g>
        <rect x="760" y="2760" width="880" height="600" rx="30" fill="var(--wl-pave2)" stroke={L} strokeWidth={6} strokeDasharray="34 26" />
        <path d="M1200 3110 v-110" stroke={L} strokeWidth={8} />
        <rect x="1080" y="2900" width="240" height="100" fill="var(--canvas)" {...city} />
        <path d="M1200 2925 v50 M1175 2950 h50" stroke={L} strokeWidth={8} strokeLinecap="round" />
      </g>

      {/* עצים */}
      {CITY_TREES.map(([x, y, r], i) => (
        <Tree key={i} x={x} y={y} r={r ?? 34} alt={i % 2 === 0} />
      ))}

      {/* טיילת, חוף וים */}
      <rect x="-4000" y="3520" width="10400" height="110" fill="var(--wl-pave)" />
      <path d="M-4000 3575H6400" stroke="var(--wl-pave2)" strokeWidth={6} strokeDasharray="50 30" />
      <rect x="-4000" y="3630" width="10400" height="280" fill="var(--wl-sand)" />
      {[140, 520, 900, 1280, 1660, 2040, 2330].map((x) => (
        <Palm key={x} x={x} y={3620} />
      ))}
      <Umbrella x={260} y={3760} c="var(--wl-roof)" />
      <Umbrella x={760} y={3790} c="var(--wl-roof2)" />
      <Umbrella x={1320} y={3750} c="var(--wl-roof3)" />
      <Umbrella x={1980} y={3790} c="var(--wl-roof)" />
      <g className="wl-waves" stroke="var(--canvas)" strokeWidth={7} fill="none" strokeLinecap="round" opacity=".75">
        <path d="M-200 3940 q60 -22 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" />
        <path d="M-140 4060 q60 -22 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" opacity=".6" />
        <path d="M-260 4220 q60 -22 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" opacity=".45" />
      </g>
      <g className="wl-bob" data-surprise-art="boat">
        <path d="M1630 4130 h140 l-24 34 h-92 z" fill="var(--wl-wall)" {...city} />
        <path d="M1700 4130 v-120 l66 100 z" fill="var(--canvas)" {...city} />
        <path d="M1694 4130 v-96 l-48 84 z" fill="var(--wl-wall2)" {...city} />
      </g>

      {/* אוטובוס שנוסע בכביש */}
      <g className="wl-bus">
        <rect x="0" y="2626" width="150" height="56" rx="10" fill="var(--wl-wall3)" {...city} />
        <path d="M14 2640h28v20h-28zM52 2640h28v20h-28zM90 2640h28v20h-28z" className="wl-window" fill="var(--wl-window)" stroke={L} strokeWidth={3} />
        <circle cx="34" cy="2684" r="10" fill={L} />
        <circle cx="116" cy="2684" r="10" fill={L} />
      </g>
    </g>
  );
}

/* ── הקניון של הכיתה (קואורדינטות מקומיות של המתחם) ── */

function MallTree({ x, y, r = 30, alt = false }: { x: number; y: number; r?: number; alt?: boolean }) {
  return (
    <g>
      <rect x={x - 4} y={y - 8} width="8" height="24" fill="var(--wl-trunk)" {...mall} />
      <g className="wl-sway" style={{ transformOrigin: `${x}px ${y}px` }}>
        <circle cx={x - r * 0.45} cy={y - r * 0.7} r={r * 0.7} fill="var(--wl-tree)" {...mall} />
        <circle cx={x + r * 0.45} cy={y - r * 0.75} r={r * 0.72} fill="var(--wl-tree)" {...mall} />
        <circle cx={x} cy={y - r * 1.25} r={r * 0.8} fill="var(--wl-tree2)" {...mall} />
      </g>
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className="wl-night-only" cx={x} cy={y - 6} r="92" fill="#FFD966" opacity=".2" />
      <rect x={x - 2} y={y - 78} width="4" height="78" fill="var(--wl-trunk)" {...mall} />
      <path d={`M${x - 9} ${y} h18`} stroke={L} strokeWidth={2.4} strokeLinecap="round" />
      <rect x={x - 8} y={y - 96} width="16" height="18" className="wl-lampglass" fill="var(--wl-window)" {...mall} />
      <path d={`M${x - 11} ${y - 96} h22 l-4 -7 h-14 z`} fill="var(--wl-trunk)" {...mall} />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g {...mall}>
      <rect x={x} y={y - 18} width="64" height="6" fill="var(--wl-trunk)" />
      <rect x={x} y={y - 9} width="64" height="7" fill="var(--wl-trunk)" />
      <path d={`M${x + 6} ${y - 2} v8 M${x + 58} ${y - 2} v8`} strokeWidth={2} />
    </g>
  );
}

const FLAGS = ["var(--lavender)", "var(--warning)", "var(--olive)", "var(--blush)"];

/** שרשרת דגלים בין שני עמודים */
function Bunting({ x1, x2, y, sag = 26, n = 22 }: { x1: number; x2: number; y: number; sag?: number; n?: number }) {
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return [x1 + (x2 - x1) * t, y + sag * 4 * t * (1 - t)];
  });
  return (
    <g>
      <path d={`M${x1} ${y} Q${(x1 + x2) / 2} ${y + sag * 2} ${x2} ${y}`} fill="none" stroke={L} strokeWidth={0.8} />
      {FLAGS.map((c, k) => (
        <path
          key={k}
          d={pts.filter((_, i) => i % 4 === k).map(([px, py]) => `M${px - 7} ${py} h14 l-7 15 z`).join("")}
          fill={c}
          stroke={L}
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** שרשרת פנסים — דולקים בלילה */
function Lanterns({ x1, x2, y, n = 9 }: { x1: number; x2: number; y: number; n?: number }) {
  const sag = 22;
  return (
    <g>
      <path d={`M${x1} ${y} Q${(x1 + x2) / 2} ${y + sag * 2} ${x2} ${y}`} fill="none" stroke={L} strokeWidth={0.8} />
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n;
        const px = x1 + (x2 - x1) * t;
        const py = y + sag * 4 * t * (1 - t);
        return (
          <g key={i}>
            <circle className="wl-night-only" cx={px} cy={py + 12} r="26" fill="#FFD966" opacity=".28" />
            <rect x={px - 6} y={py + 3} width="12" height="18" rx="5" className="wl-lantern" fill={i % 2 ? "var(--blush)" : "var(--warning)"} {...mall} />
            <path d={`M${px - 4} ${py + 3} h8 M${px - 4} ${py + 21} h8`} stroke={L} strokeWidth={1.6} />
          </g>
        );
      })}
    </g>
  );
}

function Flower({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g className="wl-grow">
      <path d={`M${x} ${y} v-16`} stroke="var(--olive)" strokeWidth={1.6} />
      <path d={`M${x} ${y - 6} q-7 -1 -8 -7 q7 0 8 7z`} fill="var(--olive)" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={x} cy={y - 20} r="3.4" fill={c} stroke={L} strokeWidth={0.5} transform={`rotate(${a} ${x} ${y - 16})`} />
      ))}
      <circle cx={x} cy={y - 16} r="2.4" fill={L} />
    </g>
  );
}

const GARDEN_COLORS = ["var(--blush)", "var(--warning)", "var(--lavender)", "var(--canvas)"];

function Mall({ size, flowers, alley, splash, hop }: { size: ClassSize; flowers: number; alley: boolean; splash: number; hop: number }) {
  const W = MALL.w;
  return (
    <g className="wl-mall" transform={`translate(${MALL.x} ${MALL.y})`}>
      {/* המתחם: ריצוף, וגדר חיה מסביב */}
      <rect x="0" y="0" width={W} height={MALL.h} rx="34" fill="var(--wl-pave)" />
      <rect x="9" y="9" width={W - 18} height={MALL.h - 18} rx="27" fill="none" stroke="var(--wl-hedge)" strokeWidth={18} />
      <rect x="0" y="0" width={W} height={MALL.h} rx="34" fill="none" stroke={L} strokeWidth={2.5} />
      <rect x="450" y={MALL.h - 22} width="200" height="26" fill="var(--wl-pave)" />

      {/* ── רחוב הסוככים ── */}
      <rect x="34" y="176" width={W - 68} height="44" rx="22" fill="var(--wl-hedge)" {...mall} />
      {[70, 210, 350, 490, 630, 770, 910, 1040].map((x, i) => (
        <MallTree key={x} x={x} y={196} r={i % 2 ? 26 : 32} alt={i % 2 === 0} />
      ))}
      <g className="wl-detail">
        <path d="M30 300 v-128 M1070 300 v-128" stroke="var(--wl-trunk)" strokeWidth={5} strokeLinecap="round" />
        <Bunting x1={30} x2={1070} y={176} sag={20} n={34} />
      </g>
      <rect x="26" y="322" width={W - 52} height="112" fill="var(--wl-plaza)" />
      <rect x="26" y="322" width={W - 52} height="112" fill="url(#wl-tiles)" />

      {/* עציצים וארגזים לאורך הרחוב */}
      {[30, 1070].map((x) => (
        <g key={x} {...mall}>
          <circle cx={x} cy={352} r="15" fill="var(--wl-tree)" />
          <circle cx={x - 8} cy={346} r="3" fill="var(--blush)" strokeWidth={0.5} />
          <circle cx={x + 7} cy={350} r="3" fill="var(--warning)" strokeWidth={0.5} />
          <path d={`M${x - 14} 356 h28 l-4 20 h-20 z`} fill="var(--wl-roof)" />
        </g>
      ))}
      <g {...mall}>
        <rect x="52" y="394" width="26" height="20" fill="var(--wl-trunk)" />
        <path d="M52 404 h26" strokeWidth={0.5} />
        <circle cx="60" cy="392" r="5" fill="var(--blush)" />
        <circle cx="70" cy="391" r="5" fill="var(--warning)" />
        <path d="M1006 414 l8 -32 h22 l8 32 M1010 400 h30" fill="none" strokeWidth={1.6} />
        <rect x="1014" y="382" width="22" height="16" fill="var(--ink)" />
        <path d="M1019 390 h12" stroke="var(--canvas)" strokeWidth={1.6} />
      </g>

      {/* ── כיכר המזרקה ── */}
      <rect x="60" y="452" width="980" height="476" rx="46" fill="var(--wl-plaza)" />
      <rect x="60" y="452" width="980" height="476" rx="46" fill="url(#wl-tiles)" />
      <circle cx="550" cy="660" r="132" fill="var(--wl-pave2)" />
      <circle cx="550" cy="660" r="132" fill="none" stroke={L} strokeWidth={0.8} strokeDasharray="10 8" />

      <g data-surprise-art="fountain">
        <circle className="wl-night-only" cx="550" cy="660" r="120" fill="#FFD966" opacity=".16" />
        <circle cx="550" cy="660" r="72" fill="var(--wl-wall)" {...mall} strokeWidth={1.4} />
        <circle cx="550" cy="660" r="60" fill="var(--wl-water)" {...mall} />
        <g className="wl-ripple" fill="none" stroke="var(--canvas)" strokeWidth={1.6}>
          <circle cx="550" cy="660" r="24" />
          <circle cx="550" cy="660" r="40" style={{ animationDelay: "1.2s" }} />
        </g>
        <circle cx="550" cy="660" r="15" fill="var(--wl-wall)" {...mall} strokeWidth={1.4} />
        <g className="wl-jets" fill="none" stroke="var(--canvas)" strokeWidth={2.4} strokeLinecap="round">
          <path d="M550 648 q-22 -26 -34 4" />
          <path d="M550 648 q22 -26 34 4" />
          <path d="M550 646 q-8 -34 -4 -8" />
        </g>
        {splash > 0 && (
          <g key={splash} className="wl-splash" fill="none" stroke="var(--canvas)" strokeWidth={2.4} strokeLinecap="round">
            <circle cx="574" cy="672" r="8" />
            <path d="M574 660 v-16 M562 664 l-10 -10 M586 664 l10 -10" />
            <circle cx="574" cy="640" r="4" fill="var(--warning)" stroke={L} strokeWidth={0.8} />
          </g>
        )}
      </g>

      <Bench x={390} y={560} />
      <Bench x={646} y={560} />
      <Bench x={390} y={790} />
      <Bench x={646} y={790} />
      <Lamp x={130} y={520} />
      <Lamp x={970} y={520} />
      <Lamp x={130} y={900} />
      <Lamp x={970} y={900} />
      <MallTree x={330} y={500} r={24} />
      <MallTree x={770} y={500} r={24} alt />
      <MallTree x={470} y={900} r={22} alt />
      <MallTree x={720} y={905} r={24} />

      {/* לוח המודעות */}
      <g data-surprise-art="board">
        <path d="M204 590 v-24 M260 590 v-24" stroke="var(--wl-trunk)" strokeWidth={4} strokeLinecap="round" />
        <rect x="190" y="508" width="84" height="60" fill="var(--wl-trunk)" {...mall} strokeWidth={1.2} />
        <rect x="196" y="514" width="72" height="48" fill="var(--canvas)" {...mall} />
        <g {...mall} strokeWidth={0.6}>
          <rect x="201" y="519" width="26" height="18" fill="var(--blush)" />
          <rect x="232" y="521" width="30" height="14" fill="var(--warning)" />
          <rect x="204" y="541" width="34" height="16" fill="var(--lavender)" />
          <rect x="243" y="540" width="19" height="17" fill="var(--canvas)" />
        </g>
        <path d="M186 508 h92 l-8 -10 h-76 z" fill="var(--wl-roof2)" {...mall} />
      </g>

      {/* קלאס מצויר בגיר על הריצוף */}
      <g data-surprise-art="hopscotch" fill="none" stroke="var(--canvas)" strokeWidth={2.2} strokeLinejoin="round">
        <path d="M800 838 h28 v-28 h-28 z M828 838 h28 v-28 h-28 z M814 810 h28 v-28 h-28 z M800 782 h28 v-28 h-28 z M828 782 h28 v-28 h-28 z M814 754 h28 v-28 h-28 z" />
        <path d="M814 726 a14 14 0 0 1 28 0" />
        {hop > 0 && <circle key={hop} className="wl-hop" cx="828" cy="824" r="6" fill="var(--warning)" stroke={L} strokeWidth={0.8} />}
      </g>

      {/* הגינה של הכיתה: פרח לכל דוכן, ועוד פרחים למי שמשקה */}
      <g data-surprise-art="garden">
        <rect x="100" y="716" width="210" height="160" rx="14" fill="var(--wl-grass2)" {...mall} strokeWidth={1.2} />
        <rect x="112" y="728" width="186" height="136" rx="8" fill="var(--wl-soil)" {...mall} />
        <path d="M112 762h186M112 796h186M112 830h186" stroke={L} strokeWidth={0.5} opacity=".5" />
        {Array.from({ length: Math.min(flowers, 16) }, (_, i) => (
          <Flower key={i} x={130 + (i % 4) * 50} y={756 + Math.floor(i / 4) * 34} c={GARDEN_COLORS[i % 4]} />
        ))}
        <g {...mall}>
          <path d="M322 858 h22 l-3 -20 h-16 z" fill="var(--wl-window)" />
          <path d="M344 846 l14 -10 M325 842 q-12 0 -10 12" fill="none" strokeWidth={1.6} />
        </g>
      </g>

      {/* מתקן אופניים ואופניים */}
      <g {...mall} fill="none" strokeWidth={1.6}>
        <path d="M850 540 v-22 a9 9 0 0 1 18 0 v22 M880 540 v-22 a9 9 0 0 1 18 0 v22 M910 540 v-22 a9 9 0 0 1 18 0 v22" />
        <circle cx="866" cy="566" r="13" />
        <circle cx="906" cy="566" r="13" />
        <path d="M866 566 l12 -18 h16 l12 18 M878 548 l10 18 h-22 M894 548 l-3 -8 h8" stroke="var(--wl-roof)" />
      </g>

      {/* כלב מנמנם */}
      <g {...mall}>
        <ellipse cx="460" cy="600" rx="20" ry="10" fill="var(--wl-wall2)" />
        <circle cx="478" cy="596" r="8" fill="var(--wl-wall2)" />
        <path d="M483 590 l5 -4 l-1 7 M441 602 q-9 -2 -8 -10" fill="var(--wl-wall2)" />
      </g>

      {/* ── סמטת הפנסים ── */}
      <rect x="240" y="972" width="620" height="38" rx="19" fill="var(--wl-hedge)" {...mall} />
      <MallTree x={225} y={1000} r={26} />
      <MallTree x={875} y={1000} r={26} alt />
      <rect x="236" y="1122" width="628" height="90" fill="var(--wl-plaza)" />
      <rect x="236" y="1122" width="628" height="90" fill="url(#wl-tiles)" />
      <g className="wl-detail" opacity={alley ? 1 : 0.45}>
        <path d="M246 1100 v-124 M854 1100 v-124" stroke="var(--wl-trunk)" strokeWidth={5} strokeLinecap="round" />
        <Lanterns x1={246} x2={854} y={980} />
      </g>

      {/* ── מקום לרחוב חדש ── */}
      <rect x="120" y="1240" width="860" height="150" rx="34" fill="var(--wl-grass)" />
      <rect x="120" y="1240" width="860" height="150" rx="34" fill="url(#wl-meadow)" />
      <g {...mall}>
        <rect x="546" y="1300" width="8" height="54" fill="var(--wl-trunk)" />
        <rect x="486" y="1266" width="128" height="40" fill="var(--canvas)" strokeWidth={1.2} />
      </g>
      <text x="550" y="1293" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={700} fontSize="17" fill="#6f4b28">
        {size === 11 ? "כאן ייפתח רחוב" : "שטח לרחוב חדש"}
      </text>
      <g className="wl-butterfly-a">
        <ellipse cx="300" cy="1290" rx="5" ry="6.5" fill="var(--blush)" {...mall} />
        <ellipse cx="310" cy="1290" rx="5" ry="6.5" fill="var(--lavender)" {...mall} />
      </g>
      <g className="wl-butterfly-b">
        <ellipse cx="800" cy="1330" rx="5" ry="6.5" fill="var(--warning)" {...mall} />
        <ellipse cx="810" cy="1330" rx="5" ry="6.5" fill="var(--blush)" {...mall} />
      </g>

      {/* שער הכניסה */}
      <g>
        <rect x="430" y="1404" width="22" height="70" fill="var(--wl-wall)" {...mall} strokeWidth={1.4} />
        <rect x="648" y="1404" width="22" height="70" fill="var(--wl-wall)" {...mall} strokeWidth={1.4} />
        <path d="M424 1408 Q550 1340 676 1408 v-18 Q550 1322 424 1390 z" fill="var(--wl-roof2)" {...mall} strokeWidth={1.4} />
        <rect x="456" y="1392" width="188" height="44" fill="var(--canvas)" {...mall} strokeWidth={1.4} />
        <text x="550" y="1424" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={700} fontSize="24" fill="#6f4b28">
          הקניון של {CLASS_NAME}
        </text>
      </g>
    </g>
  );
}

export function Scenery({ size, flowers, alley, splash, hop }: { size: ClassSize; flowers: number; alley: boolean; splash: number; hop: number }) {
  return (
    <svg className="wl-scenery" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} width={WORLD.w} height={WORLD.h} aria-hidden>
      <defs>
        <pattern id="wl-tiles" width="46" height="46" patternUnits="userSpaceOnUse">
          <path d="M0 0H46M0 0V46" stroke="var(--wl-line)" strokeWidth={0.5} opacity=".22" />
        </pattern>
        <pattern id="wl-orchard" width="50" height="46" patternUnits="userSpaceOnUse">
          <circle cx="25" cy="23" r="15" fill="var(--wl-tree)" />
        </pattern>
        <pattern id="wl-meadow" width="64" height="48" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="2.6" fill="var(--blush)" />
          <circle cx="44" cy="30" r="2.6" fill="var(--warning)" />
          <path d="M28 40 l-2 -7 M30 40 l1 -8 M32 40 l3 -6" stroke="var(--wl-tree)" strokeWidth={1.2} strokeLinecap="round" />
        </pattern>
      </defs>
      <City />
      <Mall size={size} flowers={flowers} alley={alley} splash={splash} hop={hop} />
    </svg>
  );
}

/* ── שכבה קדמית: מה שעובר לפני הדוכנים ── */

function Walker({ c, cls, y }: { c: string; cls: string; y: number }) {
  return (
    <g className={`wl-walker ${cls}`}>
      <g transform={`translate(0 ${y})`}>
        <g className="wl-walker-flip">
          <path className="wl-step" d="M-4 0 v10" stroke="#6f4b28" strokeWidth={3.4} strokeLinecap="round" />
          <path className="wl-step wl-step-b" d="M4 0 v10" stroke="#6f4b28" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M-9 2 q0 -24 9 -24 q9 0 9 24 z" fill={c} stroke="#6f4b28" strokeWidth={0.9} strokeLinejoin="round" />
          <circle cx="0" cy="-29" r="8" fill="#F2D9C4" stroke="#6f4b28" strokeWidth={0.9} />
          <path d="M-8 -31 q8 -12 16 0 q-8 -5 -16 0z" fill="#6f4b28" />
        </g>
      </g>
    </g>
  );
}

export function Foreground({ catJump }: { catJump: number }) {
  return (
    <svg className="wl-front" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} width={WORLD.w} height={WORLD.h} aria-hidden>
      <g transform={`translate(${MALL.x} ${MALL.y})`} className="wl-mall-life">
        {/* פנסי רחוב בין הדוכנים */}
        {[144, 492, 840].map((x) => (
          <g key={x}>
            <circle className="wl-night-only" cx={x} cy={336} r="70" fill="#FFD966" opacity=".18" />
            <rect x={x - 1.6} y={270} width="3.2" height="64" fill="var(--wl-trunk)" stroke="var(--wl-line)" strokeWidth={0.6} />
            <rect x={x - 6} y={256} width="12" height="14" fill="var(--wl-window)" stroke="var(--wl-line)" strokeWidth={0.6} />
            <path d={`M${x - 8.500} 256 h17 l-3 -5 h-11 z`} fill="var(--wl-trunk)" stroke="var(--wl-line)" strokeWidth={0.6} />
          </g>
        ))}
        {/* אנשים שעוברים ברחוב. דמויות רקע, לא משתמשים. */}
        <Walker c="var(--lavender)" cls="wl-walk-a" y={392} />
        <Walker c="var(--olive)" cls="wl-walk-b" y={410} />
        <Walker c="var(--blush)" cls="wl-walk-c" y={1186} />
        {/* החתול של הקניון */}
        <g data-surprise-art="cat" key={catJump} className={catJump ? "wl-cat-jump" : undefined}>
          <path className="wl-sway" style={{ transformOrigin: "624px 898px" }} d="M624 898 q14 -2 11 -18" fill="none" stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round" />
          <path d="M596 902 q-2 -20 13 -22 q15 2 13 22 z" fill="#3a3a3a" />
          <circle cx="609" cy="876" r="10" fill="#3a3a3a" />
          <path d="M600 871 l2 -10 l6 6 M618 871 l-2 -10 l-6 6" fill="#3a3a3a" />
          <circle cx="605" cy="875" r="1.6" fill="#E3C26F" />
          <circle cx="613" cy="875" r="1.6" fill="#E3C26F" />
        </g>
        {/* גחליליות בלילה */}
        <g className="wl-night-only">
          {[[300, 420], [760, 600], [180, 960], [900, 1160], [520, 1300], [640, 250]].map(([x, y], i) => (
            <circle key={i} className="kp-firefly" style={{ animationDelay: `${i * 0.8}s` }} cx={x} cy={y} r="3" fill="#FFE98A" />
          ))}
        </g>
      </g>
      {/* עננים שעוברים מעל העיר. נעלמים כשמתקרבים. */}
      <g className="wl-clouds">
        {[[300, 700, 1], [1500, 1700, 1.3], [700, 3000, 1.1]].map(([x, y, k], i) => (
          <g key={i} className="wl-cloud" style={{ animationDelay: `${-i * 21}s` }}>
            <path
              transform={`translate(${x} ${y}) scale(${k})`}
              d="M0 80 a50 50 0 0 1 70 -46 a70 70 0 0 1 130 10 a46 46 0 0 1 20 88 h-200 a30 30 0 0 1 -20 -52z"
              fill="var(--canvas)"
              opacity=".86"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
