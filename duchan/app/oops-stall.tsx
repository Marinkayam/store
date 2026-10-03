/**
 * הדוכן שהתפרק — האיור של מסך השגיאה.
 *
 * הסוכך עקום, השלט "אופס!" נשאר תלוי על חוט אחד ומתנדנד, והצנצנת נפלה על
 * הצד. כשלוחצים "לרענן" (fixing) הכל מתיישר בקפיצה קטנה: השלט חוזר לשני
 * חוטים, הסוכך מתיישר, והשלט אומר "עוד רגע".
 *
 * האנימציות ב-globals.css (oops-*). "בלי תנועה" בתפריט הנגישות ו-
 * prefers-reduced-motion עוצרים אותן — האיור נשאר, רק בלי נדנוד.
 */
export default function OopsStall({ fixing = false }: { fixing?: boolean }) {
  const line = { stroke: "var(--wood)", strokeWidth: 2, strokeLinejoin: "round" as const };
  const w = 36;

  return (
    <svg
      viewBox="0 0 240 210"
      className={`w-[200px] h-auto ${fixing ? "oops-fixing" : ""}`}
      role="img"
      aria-label={fixing ? "הדוכן מתיישר" : "דוכן עם סוכך עקום ושלט אופס שתלוי על חוט אחד"}
      data-testid="oops-stall"
    >
      {/* עמודים */}
      <rect x="40" y="40" width="8" height="112" fill="var(--wood)" />
      <rect x="192" y="40" width="8" height="112" fill="var(--wood)" />

      {/* סוכך — עקום, ומתיישר כשמתקנים */}
      <g className="oops-awning" {...line}>
        <rect x="30" y="34" width="180" height="10" fill="var(--wood)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${30 + i * w} 44 h${w} v14 a${w / 2} 15 0 0 1 ${-w} 0 z`}
            fill={i % 2 ? "var(--cream)" : "var(--lavender)"}
          />
        ))}
      </g>

      {/* השלט — תלוי על החוט השמאלי ומתנדנד. החוט הימני קרוע (קטע קצר) */}
      <line x1="145" y1="58" x2="145" y2="66" stroke="var(--wood)" strokeWidth="1.6" className="oops-stub" />
      <g className="oops-sign">
        <line x1="95" y1="58" x2="95" y2="80" stroke="var(--wood)" strokeWidth="1.6" />
        <line x1="145" y1="58" x2="145" y2="80" stroke="var(--wood)" strokeWidth="1.6" className="oops-string2" />
        <rect x="78" y="80" width="84" height="34" fill="white" {...line} />
        <text x="120" y="103" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--ink)">
          {fixing ? "עוד רגע" : "אופס!"}
        </text>
      </g>

      {/* הדלפק */}
      <rect x="18" y="146" width="204" height="10" fill="var(--wood)" />
      <rect x="26" y="156" width="188" height="44" fill="var(--cream)" {...line} />
      <path d="M26 178 h188" stroke="var(--wood)" strokeWidth="1.2" opacity=".5" />

      {/* מה שעל הדלפק: צנצנת שנפלה על הצד, ושני כדורים שהתגלגלו */}
      <g className="oops-jar" {...line}>
        <rect x="150" y="128" width="30" height="18" fill="white" />
        <rect x="180" y="131" width="6" height="12" fill="var(--lavender)" />
      </g>
      <circle cx="62" cy="139" r="7" fill="var(--lavender)" {...line} className="oops-ball" />
      <circle cx="80" cy="141" r="5" fill="var(--cream)" {...line} className="oops-ball oops-ball2" />
    </svg>
  );
}
