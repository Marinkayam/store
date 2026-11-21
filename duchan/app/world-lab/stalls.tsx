import { KupaStall } from "@/app/kupa-art";
import { ART } from "@/app/home/items";
import type { Emblem, LabStore } from "./data";

/**
 * דוכן אחד בעולם, בשלוש רמות פירוט. כולן מצוירות באותו מרחב של הדוכן
 * המקורי (240×176), כך שהמעבר ביניהן לא מזיז שום דבר.
 *
 *   near — הדוכן האמיתי של המשחק (KupaStall), עם המוצרים של החנות על הדלפק.
 *   mid  — אותו דוכן בפחות קווים: סוכך, סמל, שלושה מוצרים, קישוטים.
 *   far  — כתם צבע: סוכך ודלפק. לקניון ולעיר.
 *
 * רמת הבנייה של המשחק (שנגזרת ממכירות) לא מוצגת כאן: כל הדוכנים בעולם
 * באותו מבנה, ומה שמבדיל ביניהם הוא הצבע, הסמל, המוצרים והקישוטים.
 */

const INK = "#6f4b28";
const WOOD = "var(--wood)";
const CANVAS = "var(--canvas)";
const LINE = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** המבנה של כל דוכן בעולם: דוכן, סוכך ושלט. קבוע, לא תלוי במכירות. */
const WORLD_LEVEL = 3;

export function EmblemMark({ kind, x, y, size, fill }: { kind: Emblem; x: number; y: number; size: number; fill: string }) {
  const k = size / 24;
  const common = { fill, stroke: INK, strokeWidth: 1.1 / k, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${k})`}>
      {kind === "heart" && <path d="M12 20.5s-8-5-8-10.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 5.6-8 10.6-8 10.6z" {...common} />}
      {kind === "star" && <path d="M12 2.6l2.8 6 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.1 1.2-6.4L2.8 9.4l6.4-.8z" {...common} />}
      {kind === "sun" && (
        <>
          <circle cx="12" cy="12" r="5" {...common} />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke={INK} strokeWidth={1.4 / k} strokeLinecap="round" fill="none" />
        </>
      )}
      {kind === "leaf" && <path d="M4.5 19.5C4.5 10 10 4.5 19.5 4.5c0 9.5-5.5 15-15 15zM4.5 19.5l8.5-8.5" {...common} />}
      {kind === "gem" && <path d="M6.5 4h11l4 6L12 21 2.5 10zM2.5 10h19M9 4l-1 6 4 11 4-11-1-6" {...common} />}
      {kind === "flower" && (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx="12" cy="6.2" r="4.1" transform={`rotate(${a} 12 12)`} {...common} />
          ))}
          <circle cx="12" cy="12" r="2.8" fill={INK} />
        </>
      )}
      {kind === "moon" && <path d="M15.5 3a9.2 9.2 0 1 0 5.6 15.3A7.6 7.6 0 0 1 15.5 3z" {...common} />}
      {kind === "drop" && <path d="M12 2.8c4.2 5.2 6.4 8.4 6.4 11.4a6.4 6.4 0 0 1-12.8 0c0-3 2.2-6.200 6.4-11.400z" {...common} />}
    </g>
  );
}

/** שלוש תמונות מוצר ממוסגרות על הדלפק — במקום החפצים המצוירים של המשחק */
function ProductShelf({ store }: { store: LabStore }) {
  return (
    <g data-shelf="1">
      {store.products.slice(0, 3).map((p, i) => {
        const x = 54 + i * 47;
        return (
          <g key={i}>
            <rect x={x} y={72} width="38" height="36" fill={CANVAS} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
            {p.image ? (
              <image href={p.image} x={x + 2.500} y={74.500} width="33" height="31" preserveAspectRatio="xMidYMid slice" />
            ) : (
              <svg x={x + 4} y={75} width="30" height="30" dangerouslySetInnerHTML={{ __html: ART[p.art] }} />
            )}
          </g>
        );
      })}
    </g>
  );
}

const MID_PRODUCT_FILL: Record<string, string> = {
  squishy: "#F2D9DC", slime: "#A8A46D", ball: "#F2D9DC", teddy: "#D9B48A", painting: "#FBF8F3",
  mug: "#B89AC8", car: "#A8A46D", necklace: "#E3C26F", bracelets: "#B89AC8",
};

function MidProduct({ art, x, image }: { art: string; x: number; image?: string | null }) {
  const f = MID_PRODUCT_FILL[art] ?? "#F2D9DC";
  const cx = x + 19;
  if (image) {
    return (
      <g>
        <rect x={x} y={72} width="38" height="36" fill={CANVAS} {...LINE} />
        <image href={image} x={x + 2.500} y={74.500} width="33" height="31" preserveAspectRatio="xMidYMid slice" />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={72} width="38" height="36" fill={CANVAS} {...LINE} />
      {art === "painting" ? (
        <path d={`M${x + 6} 100 l9 -11 l6 6 l5 -5 l7 10 z`} fill="#A8A46D" {...LINE} strokeWidth={1} />
      ) : art === "car" ? (
        <path d={`M${x + 6} 98 v-6 h5 l5 -8 h10 l5 8 h3 v6 z`} fill={f} {...LINE} strokeWidth={1} />
      ) : art === "necklace" || art === "bracelets" ? (
        <ellipse cx={cx} cy={90} rx="11" ry="8" fill="none" stroke={f} strokeWidth={4} />
      ) : art === "mug" ? (
        <path d={`M${x + 9} 80 h18 v14 q0 5 -5 5 h-8 q-5 0 -5 -5 z M${x + 27} 84 h4 v7 h-4`} fill={f} {...LINE} strokeWidth={1} />
      ) : art === "ball" ? (
        <circle cx={cx} cy={90} r="11" fill={f} {...LINE} strokeWidth={1} />
      ) : (
        <path d={`M${x + 7} 101 q0 -22 12 -22 q12 0 12 22 z`} fill={f} {...LINE} strokeWidth={1} />
      )}
    </g>
  );
}

function StallMid({ store }: { store: LabStore }) {
  const AW = "var(--aw)";
  return (
    <svg viewBox="0 0 240 176" className="wl-stall-svg" aria-hidden>
      <ellipse cx="120" cy="153" rx="96" ry="3.5" fill={INK} opacity=".1" />
      <g {...LINE}>
        <rect x="36" y="38" width="9" height="112" fill={WOOD} />
        <rect x="195" y="38" width="9" height="112" fill={WOOD} />
      </g>
      <g stroke={INK} strokeWidth={1} strokeLinejoin="round">
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={30 + i * 30} y="118" width="30" height="30" fill={i % 2 ? CANVAS : AW} />
        ))}
      </g>
      <rect x="24" y="108" width="192" height="10" fill={WOOD} {...LINE} />
      {store.products.slice(0, 3).map((p, i) => (
        <MidProduct key={i} art={p.art} x={54 + i * 47} image={p.image} />
      ))}
      <g {...LINE} className="awning-flap">
        <rect x="24" y="30" width="192" height="9" fill={WOOD} />
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M${24 + i * 24} 39 h24 v12 a12 9 0 0 1 -24 0 z`} fill={i % 2 ? CANVAS : AW} />
        ))}
      </g>
      <path d="M96 30 l4 -6 M144 30 l-4 -6" stroke={INK} strokeWidth={1.2} />
      <rect x="84" y="0" width="72" height="25" fill={CANVAS} {...LINE} />
      {store.avatar ? (
        <image href={store.avatar} x="109" y="1.500" width="22" height="22" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <EmblemMark kind={store.emblem} x={120} y={12.5} size={19} fill={AW} />
      )}
      {store.deco.flowers && (
        <g>
          <path d="M184 140 v-12 M188 140 v-16 M192 140 v-11" stroke="var(--olive)" strokeWidth={1.4} fill="none" />
          <circle cx="184" cy="126" r="3" fill="var(--blush)" stroke={INK} strokeWidth={0.8} />
          <circle cx="188" cy="122" r="3" fill="var(--warning)" stroke={INK} strokeWidth={0.8} />
          <circle cx="192" cy="127" r="3" fill="var(--lavender)" stroke={INK} strokeWidth={0.8} />
          <path d="M178 140 h20 l-2.5 10 h-15 z" fill="var(--blush)" {...LINE} />
        </g>
      )}
      {store.deco.cat && (
        <g>
          <path className="kp-sway" style={{ transformOrigin: "64px 147px" }} d="M64 147 q9 -1 7 -12" fill="none" stroke="#3a3a3a" strokeWidth={2} strokeLinecap="round" />
          <path d="M50 150 q-1 -14 8 -15 q9 1 8 15 z" fill="#3a3a3a" />
          <circle cx="58" cy="132" r="6.5" fill="#3a3a3a" />
          <path d="M52.500 129 l1 -6.500 l4 4 M63.500 129 l-1 -6.500 l-4 4" fill="#3a3a3a" />
        </g>
      )}
      {store.deco.openSign && (
        <g>
          <path d="M14 86 l7 -6 l7 6" fill="none" stroke={INK} strokeWidth={0.9} />
          <rect x="8" y="86" width="26" height="12" fill="var(--ok-bg, #EEF3EC)" stroke={INK} strokeWidth={1} />
          <path d="M14 92 h14" stroke="#4A6B4A" strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function StallFar() {
  const AW = "var(--aw)";
  return (
    <svg viewBox="0 0 240 176" className="wl-stall-svg" aria-hidden>
      <rect x="36" y="38" width="9" height="112" fill={WOOD} />
      <rect x="195" y="38" width="9" height="112" fill={WOOD} />
      <rect x="28" y="110" width="184" height="40" fill={AW} />
      <rect x="24" y="106" width="192" height="12" fill={WOOD} />
      <rect x="20" y="28" width="200" height="30" fill={AW} />
      <path d="M45 28v30M95 28v30M145 28v30M195 28v30" stroke={CANVAS} strokeWidth={24} opacity=".85" />
      <rect x="86" y="0" width="68" height="24" fill={CANVAS} />
    </svg>
  );
}

export type Lod = "near" | "mid" | "far";

export function WorldStall({ store, lod }: { store: LabStore; lod: Lod }) {
  if (lod === "far") return <StallFar />;
  if (lod === "mid") return <StallMid store={store} />;
  return (
    <KupaStall
      level={WORLD_LEVEL}
      name={store.sign}
      bare
      deco={{ awning: "lavender", flowers: store.deco.flowers, openSign: store.deco.openSign, cat: store.deco.cat }}
      shelf={<ProductShelf store={store} />}
      className="wl-stall-svg wl-near"
    />
  );
}

/** מקום פנוי: חלקה מסומנת ושלט. לא דוכן, ולא נראה כמו דוכן. */
export function EmptyPlot({ lod, invited }: { lod: Lod; invited: boolean }) {
  if (lod === "far") {
    return (
      <svg viewBox="0 0 240 176" className="wl-stall-svg" aria-hidden>
        <path d="M34 150 h172 l-14 -30 h-144 z" fill="none" stroke={INK} strokeWidth={5} strokeDasharray="14 10" opacity=".6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 176" className="wl-stall-svg" aria-hidden>
      <path d="M34 150 h172 l-14 -30 h-144 z" fill="var(--wl-pave2)" stroke={INK} strokeWidth={1.6} strokeDasharray="7 6" strokeLinejoin="round" />
      <g {...LINE}>
        <rect x="116" y="74" width="8" height="66" fill={WOOD} />
        <rect x="66" y="42" width="108" height="38" fill={CANVAS} />
      </g>
      <text x="120" y="67" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={700} fontSize="17" fill={INK}>
        {invited ? "הזמנה נשלחה" : "מקום פנוי"}
      </text>
      {invited ? (
        <g className="kp-swing" style={{ transformOrigin: "174px 44px" }}>
          <path d="M174 44 v-22" stroke={INK} strokeWidth={1.4} />
          <path d="M174 22 l20 6 l-20 6 z" fill="var(--warning)" {...LINE} />
        </g>
      ) : (
        <g className="star-bob">
          <circle cx="120" cy="22" r="13" fill="var(--warning)" {...LINE} />
          <path d="M120 15 v14 M113 22 h14" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      )}
      <g {...LINE}>
        <rect x="46" y="128" width="26" height="20" fill={WOOD} />
        <path d="M46 138 h26" fill="none" strokeWidth={0.8} />
        <path d="M186 148 v-12 q-7 -3 -7 -10 M186 136 q7 -3 7 -10" fill="none" stroke="var(--olive)" strokeWidth={2} />
      </g>
    </svg>
  );
}

/** חלקה שעוד לא נפתחה: אדנית עם שיחים. ממלאת את הרחוב בלי להעמיד פני דוכן. */
export function GardenPlot({ lod }: { lod: Lod }) {
  return (
    <svg viewBox="0 0 240 176" className="wl-stall-svg" aria-hidden>
      <g stroke={lod === "far" ? "none" : INK} strokeWidth={1.3} strokeLinejoin="round">
        <circle cx="78" cy="118" r="24" fill="var(--wl-tree)" />
        <circle cx="120" cy="108" r="30" fill="var(--wl-tree2)" />
        <circle cx="164" cy="118" r="24" fill="var(--wl-tree)" />
        <rect x="46" y="128" width="148" height="22" fill={WOOD} />
      </g>
      {lod !== "far" && (
        <g stroke={INK} strokeWidth={0.8}>
          <circle cx="92" cy="104" r="4" fill="var(--blush)" />
          <circle cx="130" cy="92" r="4" fill="var(--warning)" />
          <circle cx="152" cy="110" r="4" fill="var(--lavender)" />
          <circle cx="108" cy="118" r="4" fill="var(--canvas)" />
        </g>
      )}
    </svg>
  );
}
