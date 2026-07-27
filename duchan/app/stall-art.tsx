/**
 * הדוכן — האיור של מסך הפתיחה.
 *
 * SVG בקוד ולא קובץ תמונה: אפס בייטים להורדה, חד בכל מסך, והצבעים נמשכים
 * מאותם טוקנים כמו כל השאר — אם הפלטה תשתנה, האיור משתנה איתה במקום להישאר
 * תקוע בגוון ישן.
 *
 * הקו הדק סביב כל צורה הוא מה שמחזיק את זה יחד: בלעדיו אלה כתמי צבע, ואיתו
 * זה ציור. אותו קו, אותו עובי, בכל אלמנט.
 *
 * מה מוצג על המדף: צמח, סלסלה עם דברים, צנצנת ושקית — בכוונה לא סקווישים
 * בלבד. המסך אומר "אפשר למכור כל מה שרוצים", והאיור צריך לומר את זה קודם.
 */
export default function StallArt({ className = "" }: { className?: string }) {
  const line = { stroke: "var(--wood)", strokeWidth: 1.6, strokeLinejoin: "round" as const };

  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role="img"
      aria-label="דוכן קטן עם סוכך, צמח, סלסלה, צנצנת ושקית"
    >
      {/* סוכך */}
      <g {...line}>
        <rect x="46" y="26" width="228" height="11" fill="var(--wood)" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M${46 + i * 38} 37 h38 v16 a19 16 0 0 1 -38 0 z`}
            fill={i % 2 ? "var(--lavender)" : "var(--cream)"}
          />
        ))}
      </g>

      {/* מבנה */}
      <g {...line}>
        <rect x="56" y="53" width="10" height="94" fill="var(--wood)" />
        <rect x="254" y="53" width="10" height="94" fill="var(--wood)" />
        <rect x="46" y="141" width="228" height="12" fill="var(--wood)" />
        <rect x="66" y="153" width="10" height="14" fill="var(--wood)" />
        <rect x="244" y="153" width="10" height="14" fill="var(--wood)" />
      </g>

      {/* צמח */}
      <g {...line}>
        <path d="M84 141 l5 -28 h26 l5 28 z" fill="var(--cream)" />
        <path d="M102 113 v-26" fill="none" />
        <ellipse cx="91" cy="94" rx="11" ry="6.5" fill="var(--olive)" transform="rotate(-18 91 94)" />
        <ellipse cx="113" cy="99" rx="10" ry="6" fill="var(--olive)" transform="rotate(16 113 99)" />
        <ellipse cx="102" cy="82" rx="9" ry="5.5" fill="var(--olive)" />
      </g>

      {/* סלסלה + מה שבתוכה */}
      <g {...line}>
        <path
          d="M150 96 l4.5 8.6 9.5 1.3 -7 6.7 1.7 9.4 -8.7 -4.5 -8.7 4.5 1.7 -9.4 -7 -6.7 9.5 -1.3 z"
          fill="var(--lavender)"
        />
        <circle cx="171" cy="112" r="11" fill="var(--olive)" />
        <path d="M171 101 v22 M160 112 h22" fill="none" strokeWidth="1.2" />
        <path d="M129 141 l6 -24 h58 l6 24 z" fill="var(--sand)" />
        <path d="M136 129 h56" fill="none" strokeWidth="1.2" />
      </g>

      {/* צנצנת */}
      <g {...line}>
        <rect x="204" y="104" width="30" height="37" fill="var(--white)" />
        <rect x="200" y="97" width="38" height="9" fill="var(--lavender)" />
        <circle cx="213" cy="123" r="5" fill="var(--cream)" />
        <circle cx="225" cy="129" r="5" fill="var(--cream)" />
        <circle cx="219" cy="114" r="4.5" fill="var(--cream)" />
      </g>

      {/* שקית ותווית */}
      <g {...line}>
        <path d="M243 141 v-38 h30 v38 z" fill="var(--cream)" />
        <path d="M250 103 a8 8 0 0 1 16 0" fill="none" />
        <path d="M258 114 v14" fill="none" strokeWidth="1.2" />
        <ellipse cx="252" cy="120" rx="5" ry="3" fill="var(--olive)" transform="rotate(-20 252 120)" />
        <ellipse cx="264" cy="124" rx="5" ry="3" fill="var(--olive)" transform="rotate(20 264 124)" />
      </g>

      {/* קרקע */}
      <ellipse cx="160" cy="176" rx="112" ry="6" fill="var(--sand)" opacity="0.5" />
    </svg>
  );
}
