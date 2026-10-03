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
const LINE = { stroke: "#6f4b28", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function part(lv: number, build: number | undefined, i = 0) {
  return build === lv
    ? { className: "kp-drop", style: { animationDelay: `${0.12 + i * 0.09}s` } as React.CSSProperties }
    : {};
}

export function KupaStall({
  level,
  name,
  build,
  className = "",
}: {
  level: number;
  name?: string;
  /** הרמה שזה עתה הושגה — החלקים שלה נבנים באנימציה */
  build?: number;
  className?: string;
}) {
  const sign = (name ?? "הדוכן שלי").slice(0, 14);
  return (
    <svg viewBox="0 0 240 176" className={className} role="img" aria-label={`איור הדוכן ברמה ${level + 1}`}>
      <rect x="0" y="0" width="240" height="176" fill="var(--cream)" />
      <rect x="0" y="154" width="240" height="22" fill="var(--sand)" />
      {/* שמש קטנה — תמיד שם, כדי שגם העגלה הקטנה תרגיש כמו יום טוב בשוק */}
      <circle cx="210" cy="26" r="11" fill="var(--warning)" opacity=".55" />

      {level === 0 ? (
        <g className={build === 0 ? "kp-roll" : ""}>
          <g {...LINE}>
            <rect x="70" y="104" width="100" height="34" fill={W} />
            <rect x="74" y="92" width="92" height="12" fill="var(--canvas)" />
            <path d="M170 108 l24 -16" fill="none" strokeWidth={3.2} />
            <g className="kp-wheel" style={{ transformOrigin: "92px 146px" }}>
              <circle cx="92" cy="146" r="9" fill="var(--canvas)" />
              <path d="M92 137 v18 M83 146 h18" />
            </g>
            <g className="kp-wheel" style={{ transformOrigin: "148px 146px" }}>
              <circle cx="148" cy="146" r="9" fill="var(--canvas)" />
              <path d="M148 137 v18 M139 146 h18" />
            </g>
          </g>
          <g {...LINE}>
            <rect x="84" y="78" width="14" height="14" fill="var(--lavender)" />
            <circle cx="114" cy="84" r="8" fill="var(--blush)" />
            <rect x="128" y="74" width="12" height="18" fill="var(--olive)" />
          </g>
        </g>
      ) : (
        <>
          {/* רמה 2: דוכן — עמודים, דלפק ומוצרים */}
          <g {...LINE} {...part(1, build, 0)}>
            <rect x="40" y="58" width="9" height="96" fill={W} />
            <rect x="191" y="58" width="9" height="96" fill={W} />
            <rect x="28" y="114" width="184" height="14" fill={W} />
            <rect x="34" y="128" width="172" height="26" fill="var(--canvas)" />
          </g>
          <g {...LINE} {...part(1, build, 1)}>
            <rect x="56" y="96" width="16" height="18" fill="var(--lavender)" />
            <circle cx="88" cy="105" r="9" fill="var(--blush)" />
            <rect x="104" y="92" width="14" height="22" fill="var(--olive)" />
            <path d="M128 114 l8 -20 l8 20z" fill="var(--warning)" />
            <rect x="152" y="98" width="18" height="16" fill="var(--canvas)" />
            <circle cx="182" cy="106" r="8" fill="var(--lavender)" />
          </g>
          {/* רמה 3: סוכך */}
          {level >= 2 && (
            <g {...part(2, build, 0)}>
              <g {...LINE} className="awning-flap">
                <rect x="28" y="36" width="184" height="10" fill={W} />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <path
                    key={i}
                    d={`M${28 + i * 30.67} 46 h30.67 v14 a15.3 13 0 0 1 -30.67 0 z`}
                    fill={i % 2 ? "var(--canvas)" : "var(--lavender)"}
                  />
                ))}
              </g>
            </g>
          )}
          {/* רמה 4: שלט עם השם */}
          {level >= 3 && (
            <g {...part(3, build, 0)}>
              <g className="kp-swing">
                <path d="M98 36 v-8 M142 36 v-8" stroke="#6f4b28" strokeWidth={1.4} />
                <rect x="70" y="8" width="100" height="21" fill="var(--canvas)" {...LINE} />
                <text x="120" y="23" textAnchor="middle" fontFamily="Heebo, system-ui, sans-serif" fontWeight={800} fontSize="11" fill="var(--ink)">
                  {sign}
                </text>
              </g>
            </g>
          )}
          {/* רמה 5: שרשרת נורות */}
          {level >= 4 && (
            <g {...part(4, build, 0)}>
              <path d="M28 70 Q120 88 212 70" fill="none" stroke="#6f4b28" strokeWidth={1} />
              {Array.from({ length: 9 }, (_, i) => (
                <circle
                  key={i}
                  className="kp-twinkle"
                  style={{ animationDelay: `${(i % 3) * 0.5}s` }}
                  cx={34 + i * 21.5}
                  cy={72 + Math.sin((i / 8) * Math.PI) * 7}
                  r="3.2"
                  fill={i % 2 ? "var(--warning)" : "var(--blush)"}
                  stroke="#6f4b28"
                  strokeWidth={0.8}
                />
              ))}
            </g>
          )}
          {/* רמה 6: דגל וכוכב מחייך */}
          {level >= 5 && (
            <g {...part(5, build, 0)}>
              <g {...LINE}>
                <path d="M200 36 v-26" fill="none" />
                <path d="M200 10 l24 7 l-24 7z" fill="var(--warning)" className="kp-swing" />
              </g>
              <g className="star-bob">
                <path
                  d="M22 8 l4.5 9.2 10 1.4 -7.3 7 1.8 10 -9 -4.8 -9 4.8 1.8 -10 -7.3 -7 10 -1.4z"
                  fill="var(--warning)"
                  {...LINE}
                />
                <circle cx="19.5" cy="20" r="1" fill="#6f4b28" />
                <circle cx="24.5" cy="20" r="1" fill="#6f4b28" />
                <path d="M19.5 23.5 q2.5 2 5 0" fill="none" stroke="#6f4b28" strokeWidth={1} />
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
