/**
 * ערימת שקיות מתנה — האיור של "לשתף את הדוכן".
 *
 * מרינה: "איזה איור של דוכן שקשור בלהזמין, או הרבה שקיות מתנה". אותה שפה
 * כמו שאר האיורים: קו עץ דק, מילוי שטוח בצבעי הדוכן, בלי צל ובלי מעבר צבע.
 * שתי שקיות מתנדנדות קלות ונצנוצים מהבהבים (kp-*) — וכל זה נעצר אצל מי
 * שביקש פחות תנועה (globals.css).
 */
const INK = "#6f4b28";
const L = { stroke: INK, strokeWidth: 1.1, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Bag({ x, y, w, h, fill, flap, children, className, origin }: {
  x: number; y: number; w: number; h: number; fill: string; flap?: string;
  children?: React.ReactNode; className?: string; origin?: string;
}) {
  const f = w * 0.06; // השקית מתרחבת קצת למטה
  return (
    <g className={className} style={origin ? { transformOrigin: origin } : undefined}>
      {/* ידיות */}
      <path d={`M${x + w * 0.3} ${y} v-5 a${w * 0.2} ${w * 0.22} 0 0 1 ${w * 0.4} 0 v5`} fill="none" {...L} strokeWidth={1.4} />
      <path d={`M${x} ${y} h${w} l${f} ${h} h${-(w + 2 * f)} z`} fill={fill} {...L} />
      {flap && <path d={`M${x} ${y} h${w} l-2 6 h${-(w - 4)} z`} fill={flap} {...L} />}
      {children}
    </g>
  );
}

const Heart = ({ x, y, s = 1, fill = "#F2D9DC" }: { x: number; y: number; s?: number; fill?: string }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 6 q-7 -5 -4 -9 q2.5 -3 4 0.5 q1.5 -3.5 4 -0.5 q3 4 -4 9z" fill={fill} {...L} />
);

const Spark = ({ x, y, d = 0, s = 1 }: { x: number; y: number; d?: number; s?: number }) => (
  <path
    className="kp-twinkle"
    style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }}
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z"
    fill="#E3C26F"
    stroke={INK}
    strokeWidth={0.6}
  />
);

export default function GiftBagsArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} role="img" aria-label="ערימה של שקיות מתנה צבעוניות עם לבבות ונצנוצים">
      {/* צל רך מתחת לערימה */}
      <ellipse cx="120" cy="131" rx="104" ry="4" fill={INK} opacity=".1" />

      {/* מאחור */}
      <Bag x={44} y={62} w={46} h={66} fill="#F2D9DC" flap="#E9B8BF" className="kp-sway" origin="67px 128px">
        <path d={`M58 84 l9 6 l9 -6 v12 l-9 -6 l-9 6z`} fill="var(--lavender)" {...L} />
      </Bag>
      <Bag x={150} y={56} w={44} h={72} fill="var(--olive)" flap="#C3C08F">
        {/* תווית מחיר תלויה */}
        <path d="M184 70 l10 10" fill="none" {...L} strokeWidth={0.8} />
        <path d="M190 78 h14 v9 h-14 l-4 -4.5z" fill="var(--white)" {...L} />
        <text x="197" y="85.5" fontSize="6.5" fontWeight="700" textAnchor="middle" fill={INK} fontFamily="Heebo, sans-serif">₪</text>
      </Bag>

      {/* באמצע — השקית הגדולה */}
      <Bag x={88} y={40} w={64} h={88} fill="var(--lavender)" flap="#CDB6DA" className="kp-bob" origin="120px 128px">
        <Heart x={120} y={80} s={1.6} />
        <path d="M98 108 h44" fill="none" {...L} strokeWidth={0.8} opacity=".5" />
        {/* נייר משי שמציץ מלמעלה */}
        <path d="M100 40 q4 -10 10 -2 q4 -12 10 -1 q5 -11 10 0 q6 -9 9 3" fill="var(--white)" {...L} />
      </Bag>

      {/* מלפנים — קטנות */}
      <Bag x={18} y={92} w={34} h={36} fill="#E3C26F" flap="#EDD498">
        <circle cx="35" cy="110" r="4" fill="var(--white)" {...L} />
      </Bag>
      <Bag x={190} y={88} w={34} h={40} fill="var(--white)" flap="var(--cream)" className="kp-sway" origin="207px 128px">
        {[[198, 104], [210, 100], [204, 114], [216, 116]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.8" fill="var(--lavender)" />
        ))}
      </Bag>

      {/* לבבות ונצנוצים באוויר */}
      <Heart x={70} y={30} s={1.1} />
      <Heart x={178} y={34} s={0.9} fill="var(--lavender)" />
      <Spark x={44} y={44} d={0} />
      <Spark x={200} y={22} d={0.7} s={1.2} />
      <Spark x={150} y={18} d={1.4} s={0.8} />
      <Spark x={20} y={74} d={1.0} s={0.7} />
    </svg>
  );
}
