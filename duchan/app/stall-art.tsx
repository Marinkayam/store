/**
 * הדוכן — האיור של מסך הפתיחה.
 *
 * מצויר לפי האיור שמרינה שלחה: כרטיס מרובע עם פינות מעוגלות, סוכך סגול-שמנת,
 * צמח בעציץ, סלסלת קש עם כוכב מחייך, דלעת וענבים, שקית נייר עם עלה ותווית לב,
 * וצנצנת מרשמלו.
 *
 * SVG בקוד ולא קובץ תמונה: אפס בייטים להורדה, חד בכל מסך, והצבעים נמשכים
 * מאותם טוקנים כמו כל השאר — אם הפלטה תשתנה, האיור משתנה איתה במקום להישאר
 * תקוע בגוון ישן.
 *
 * הקו הדק סביב כל צורה הוא מה שמחזיק את זה יחד: בלעדיו אלה כתמי צבע, ואיתו
 * זה ציור. אותו קו, אותו עובי, בכל אלמנט.
 *
 * מה שעל המדף מצויר לפני הסלסלה בכוונה, כדי שהיא תסתיר את התחתית שלו
 * ונראה שהדברים באמת יושבים בתוכה ולא לידה.
 */
export default function StallArt({ className = "" }: { className?: string }) {
  const line = { stroke: "var(--wood)", strokeWidth: 1.7, strokeLinejoin: "round" as const };
  const soft = { ...line, strokeWidth: 1.2 };

  return (
    <svg
      viewBox="0 0 320 320"
      className={className}
      role="img"
      aria-label="דוכן קטן עם סוכך, צמח, סלסלה עם כוכב מחייך, שקית וצנצנת"
    >
      {/* הכרטיס שמאחורי הכל — מה שנותן לאיור את המראה של אייקון אפליקציה.
          הוא נשאר מחוץ לקבוצה שזזה, אחרת כל התמונה רועדת במקום הדוכן. */}
      <rect x="6" y="6" width="308" height="308" rx="74" fill="var(--cream)" />

      <g className="stall-rock">
      {/* סוכך: חמש קשתות לסירוגין, סגול בקצוות */}
      <g {...line} className="awning-flap">
        <rect x="44" y="58" width="232" height="12" fill="var(--wood)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${44 + i * 46.4} 70 h46.4 v24 a23.2 21 0 0 1 -46.4 0 z`}
            fill={i % 2 ? "var(--cream)" : "var(--lavender)"}
          />
        ))}
      </g>

      {/* מבנה: שני עמודים, מדף ובסיס */}
      <g {...line}>
        <rect x="52" y="100" width="11" height="132" fill="var(--wood)" />
        <rect x="257" y="100" width="11" height="132" fill="var(--wood)" />
        <rect x="32" y="232" width="256" height="16" fill="var(--wood)" />
        <rect x="40" y="248" width="240" height="10" fill="var(--sand)" />
      </g>

      {/* צמח: גבעול אחד ושלושה זוגות עלים, בעציץ עגלגל */}
      <g {...line}>
        <path d="M78 202 v-54" fill="none" strokeWidth="1.5" />
        {[
          [67, 190, -28], [89, 190, 28],
          [68, 173, -28], [88, 173, 28],
          [71, 157, -24], [85, 157, 24],
        ].map(([cx, cy, rot], i) => (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx="11"
            ry="6"
            fill="var(--olive)"
            transform={`rotate(${rot} ${cx} ${cy})`}
          />
        ))}
        <path d="M64 202 h28 l3 19 a17 11 0 0 1 -34 0 z" fill="var(--sand)" />
      </g>

      {/* מה שיושב בסלסלה */}
      <g {...line}>
        {/* ענבים — קודם, כדי שהדלעת והכוכב יהיו לפניהם */}
        <g fill="var(--lavender)" {...soft}>
          {[
            [176, 176], [188, 176],
            [170, 185], [182, 185], [194, 185],
            [176, 194], [188, 194],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="6" />
          ))}
        </g>

        {/* דלעת */}
        <ellipse cx="161" cy="200" rx="19" ry="16" fill="var(--olive)" />
        <path
          d="M152 185.5 a19 16 0 0 0 0 29 M170 185.5 a19 16 0 0 1 0 29"
          fill="none"
          strokeWidth="1.2"
        />
        <path d="M161 184 v-9" fill="none" strokeWidth="1.5" />

        {/* כוכב מחייך */}
        <g className="star-bob">
          <path
            d="M134 159 L139.6 174.3 L155.9 174.9 L143 184.9 L147.5 200.6 L134 191.5 L120.5 200.6 L125 184.9 L112.1 174.9 L128.4 174.3 Z"
            fill="var(--lavender)"
          />
          <g fill="var(--ink)" stroke="none">
            <circle cx="128" cy="180" r="1.7" />
            <circle cx="140" cy="180" r="1.7" />
          </g>
          <path
            d="M129 186 a5 5 0 0 0 10 0"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      </g>

      {/* סלסלת קש */}
      <g {...line}>
        <path d="M100 200 h94 l-9 32 h-76 z" fill="var(--sand)" />
        <path d="M102 210 h90 M105 221 h84" fill="none" strokeWidth="1.1" />
      </g>

      {/* שקית נייר עם עלה ותווית לב */}
      <g {...line}>
        <path d="M208 186 a10 9 0 0 1 20 0" fill="none" strokeWidth="1.5" />
        <path d="M202 232 v-46 h32 v46 z" fill="var(--white)" />
        <path d="M234 186 l8 7 v39 l-8 -7 z" fill="var(--sand)" />
        <path d="M218 220 v-18" fill="none" strokeWidth="1.2" />
        <ellipse cx="211" cy="209" rx="6" ry="3.4" fill="var(--olive)" transform="rotate(-26 211 209)" />
        <ellipse cx="225" cy="213" rx="6" ry="3.4" fill="var(--olive)" transform="rotate(26 225 213)" />
        <path d="M226 184 q7 6 4 12" fill="none" strokeWidth="1" />
        <path d="M226 196 h13 v12 h-13 l-4.5 -6 z" fill="var(--white)" />
        <path
          d="M229.5 200.5 a1.9 1.9 0 0 1 3.3 -1.1 a1.9 1.9 0 0 1 3.3 1.1 c0 2.2 -3.3 4 -3.3 4 s-3.3 -1.8 -3.3 -4 z"
          fill="var(--lavender)"
          stroke="none"
        />
      </g>

      {/* צנצנת מרשמלו */}
      <g {...line}>
        <rect x="248" y="194" width="36" height="38" rx="4" fill="var(--white)" />
        <rect x="244" y="182" width="44" height="13" rx="4" fill="var(--lavender)" />
        <g {...soft}>
          <rect x="253" y="204" width="12" height="9" rx="3" fill="var(--cream)" />
          <rect x="267" y="202" width="12" height="9" rx="3" fill="var(--cream)" />
          <rect x="252" y="216" width="12" height="9" rx="3" fill="var(--cream)" />
          <rect x="266" y="215" width="12" height="9" rx="3" fill="var(--blush)" />
        </g>
      </g>
      </g>

      {/* צל רך על הקרקע — קבוע, כדי שהדוכן ייראה מתנדנד עליו ולא איתו */}
      <ellipse cx="160" cy="264" rx="110" ry="6" fill="var(--sand)" opacity="0.7" />
    </svg>
  );
}
