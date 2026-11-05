/**
 * הדוכן של מסך הפתיחה (duchan.app).
 *
 * מרינה, 11.2026: "בוא נעצב טוב יותר את האיור הזה". הקודם היה הדוכן של
 * הקופה ברמה הכי גבוהה עם כל הקישוטים — כעשרים פריטים באותו משקל, קווים
 * עבים, ודברים שנחתכו בקצה המסך (ציפורים, לוח "חדש!", בלון). כאן: איור
 * אחד שקט שבנוי למסך הזה — שלט ישר, סוכך גלים, שרשרת דגלים, ארבעה מוצרים
 * עם שתי תוויות מחיר, חתול ליד הדוכן וארגז מהצד השני לאיזון. קו דק
 * (מרינה: "קווים יותר דקים ועדינים"), בלי צללים ובלי מעברי צבע.
 *
 * תנועה קטנה: הדגלים מתנדנדים, הזנב של החתול זז, הניצוצות מנצנצים.
 * מי שביקש פחות תנועה (prefers-reduced-motion) מקבל איור עומד.
 * הדוכן של הקופה (kupa-art.tsx) לא משתנה — הוא בנוי מרמות ומקישוטים שקונים.
 */

const INK = "#4A3B2F";
const WOOD = "#B9875A";
const WOOD_DARK = "#9C6E45";
const CREAM = "#FFFBF4";
const WALL = "#F6EFE4";
const LAV = "#B89AC8";
const LAV_PALE = "#E4D8EC";
const OLIVE = "#A8A46D";
const MUSTARD = "#E9C979";
const PINK = "#F2C9CF";

const FLAG_COLORS = [LAV, MUSTARD, OLIVE, PINK];

export default function HomeStall({ name = "דוכן", className = "" }: { name?: string; className?: string }) {
  // סוכך: שישה גלים בין 56 ל-264
  const scW = 208 / 6;
  // שרשרת דגלים: קשת עדינה מתחת לסוכך
  const flags = Array.from({ length: 9 }, (_, i) => {
    const t = 0.08 + (i * 0.84) / 8;
    return { x: 70 + 180 * t, y: 81 + 20 * t * (1 - t), c: FLAG_COLORS[i % FLAG_COLORS.length] };
  });

  return (
    <svg
      viewBox="0 0 320 222"
      className={className}
      role="img"
      aria-label={`איור של ${name}: דוכן עם סוכך, מוצרים וחתול`}
      data-testid="home-stall"
    >
      <style>{`
        .hs-flag { transform-box: fill-box; transform-origin: 50% 0; animation: hs-sway 3.2s ease-in-out infinite; }
        .hs-tail { transform-box: fill-box; transform-origin: 0% 100%; animation: hs-tail 2.6s ease-in-out infinite; }
        .hs-spark { transform-box: fill-box; transform-origin: center; animation: hs-twinkle 2.4s ease-in-out infinite; }
        @keyframes hs-sway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        @keyframes hs-tail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-14deg); } }
        @keyframes hs-twinkle { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.55); opacity: .5; } }
        @media (prefers-reduced-motion: reduce) { .hs-flag, .hs-tail, .hs-spark { animation: none; } }
      `}</style>

      <g stroke={INK} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
        {/* קרקע */}
        <ellipse cx="160" cy="208" rx="146" ry="6" fill="#EFE6DA" stroke="none" />

        {/* ניצוצות ליד השלט */}
        {[
          [104, 22, 5],
          [222, 16, 4],
          [234, 34, 3],
        ].map(([x, y, r], i) => (
          <path
            key={i}
            className="hs-spark"
            style={{ animationDelay: `${i * 0.7}s` }}
            d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}z`}
            fill={MUSTARD}
            strokeWidth={0.9}
          />
        ))}

        {/* קיר אחורי */}
        <rect x="66" y="70" width="188" height="72" fill={WALL} stroke="none" />

        {/* עמודים */}
        <rect x="58" y="58" width="10" height="146" rx="2" fill={WOOD} />
        <rect x="252" y="58" width="10" height="146" rx="2" fill={WOOD} />

        {/* שלט — ישר, על שתי רגליים */}
        <line x1="134" y1="44" x2="134" y2="52" />
        <line x1="186" y1="44" x2="186" y2="52" />
        <rect x="114" y="12" width="92" height="34" rx="8" fill={CREAM} />
        <text
          x="160"
          y="36"
          textAnchor="middle"
          fontSize="19"
          fontWeight={800}
          fill={INK}
          stroke="none"
          style={{ fontFamily: "var(--font-body), Heebo, sans-serif" }}
        >
          {name.slice(0, 10)}
        </text>

        {/* קורת גג */}
        <rect x="50" y="50" width="220" height="10" rx="3" fill={WOOD_DARK} />

        {/* סוכך גלים */}
        {Array.from({ length: 6 }, (_, i) => {
          const x0 = 56 + i * scW;
          return (
            <path
              key={i}
              d={`M${x0} 60 h${scW} v12 a${scW / 2} 10 0 0 1 ${-scW} 0 z`}
              fill={i % 2 ? CREAM : LAV}
            />
          );
        })}

        {/* שרשרת דגלים */}
        <path d={`M66 81 Q160 101 254 81`} fill="none" strokeWidth={1} />
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

        {/* עציץ */}
        <path d="M76 122 h22 l-3 18 h-16 z" fill={PINK} />
        <path d="M87 122 C87 116 87 112 87 108" fill="none" />
        <ellipse cx="80" cy="114" rx="7.5" ry="4.2" fill={OLIVE} transform="rotate(-25 80 114)" />
        <ellipse cx="94" cy="111" rx="7.5" ry="4.2" fill={OLIVE} transform="rotate(25 94 111)" />
        <ellipse cx="87" cy="106" rx="4.2" ry="6.5" fill={OLIVE} />

        {/* סקוויש עם פרצוף */}
        <path d="M107 140 C103 128 110 114 124 114 C138 114 145 128 141 140 z" fill={MUSTARD} />
        <circle cx="119" cy="127" r="1.5" fill={INK} stroke="none" />
        <circle cx="129" cy="127" r="1.5" fill={INK} stroke="none" />
        <path d="M121 131.5 Q124 134.5 127 131.5" fill="none" strokeWidth={1} />
        <ellipse cx="115" cy="131" rx="2.4" ry="1.4" fill={PINK} stroke="none" />
        <ellipse cx="133" cy="131" rx="2.4" ry="1.4" fill={PINK} stroke="none" />

        {/* שקית */}
        <path d="M165 116 a8 8 0 0 1 16 0" fill="none" />
        <rect x="158" y="116" width="30" height="24" rx="2" fill={CREAM} />
        <path d="M168 129 q5 -7 10 0 q-5 7 -10 0z" fill={OLIVE} strokeWidth={1} />

        {/* צנצנת סוכריות */}
        <rect x="206" y="108" width="26" height="7" rx="2" fill={LAV} />
        <rect x="204" y="115" width="30" height="25" rx="6" fill={CREAM} />
        <circle cx="213" cy="126" r="3.4" fill={PINK} strokeWidth={1} />
        <circle cx="223" cy="124" r="3.4" fill={MUSTARD} strokeWidth={1} />
        <circle cx="218" cy="133" r="3.4" fill={LAV} strokeWidth={1} />
        <circle cx="227" cy="133" r="3.4" fill={OLIVE} strokeWidth={1} />

        {/* דלפק */}
        <rect x="50" y="140" width="220" height="9" rx="3" fill={WOOD_DARK} />
        <rect x="62" y="149" width="196" height="55" fill={CREAM} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={74 + i * 46} y="149" width="22" height="55" fill={LAV_PALE} stroke="none" />
        ))}
        <rect x="62" y="149" width="196" height="55" fill="none" />

        {/* תוויות מחיר */}
        <line x1="124" y1="149" x2="124" y2="155" strokeWidth={1} />
        <rect x="113" y="155" width="22" height="12" rx="2" fill="#fff" strokeWidth={1} transform="rotate(-4 124 161)" />
        <text x="124" y="164.5" textAnchor="middle" fontSize="7.5" fontWeight={700} fill={INK} stroke="none" transform="rotate(-4 124 161)" style={{ fontFamily: "var(--font-body), Heebo, sans-serif" }}>₪8</text>
        <line x1="219" y1="149" x2="219" y2="155" strokeWidth={1} />
        <rect x="207" y="155" width="24" height="12" rx="2" fill="#fff" strokeWidth={1} transform="rotate(3 219 161)" />
        <text x="219" y="164.5" textAnchor="middle" fontSize="7.5" fontWeight={700} fill={INK} stroke="none" transform="rotate(3 219 161)" style={{ fontFamily: "var(--font-body), Heebo, sans-serif" }}>₪12</text>

        {/* ארגז משמאל, עם שני סקווישים */}
        <circle cx="27" cy="178" r="7" fill={PINK} />
        <circle cx="41" cy="179" r="6.5" fill={LAV} />
        <rect x="16" y="182" width="36" height="22" rx="2" fill={WOOD} />
        <line x1="16" y1="193" x2="52" y2="193" strokeWidth={1} />

        {/* חתול מימין */}
        <path className="hs-tail" d="M298 200 C310 196 312 184 304 180" fill="none" stroke="#3B3734" strokeWidth={3.2} />
        <path d="M276 204 C274 186 280 176 288 176 C296 176 302 186 300 204 z" fill="#3B3734" />
        <path d="M279 170 l3 -9 l5 6 z M297 170 l-3 -9 l-5 6 z" fill="#3B3734" />
        <circle cx="288" cy="172" r="10" fill="#3B3734" />
        <circle cx="284.5" cy="171" r="1.7" fill={MUSTARD} stroke="none" />
        <circle cx="291.5" cy="171" r="1.7" fill={MUSTARD} stroke="none" />
        <path d="M286.5 175.5 q1.5 1.2 3 0" fill="none" stroke={PINK} strokeWidth={0.9} />
      </g>
    </svg>
  );
}
