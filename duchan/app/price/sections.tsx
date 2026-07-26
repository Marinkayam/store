import { ACTIVATION_PRICE, GETS, LEARNS, PAYBACK } from "@/lib/pricing";

// חלקי התוכן של "מה מקבלים במחיר". משותפים לדף המחיר הפומבי (/price)
// ולמסך ההפעלה בתוך האפליקציה (/activate) — כדי שהשניים לא יסתרו זה את זה.

export function GetsList({ compact = false }: { compact?: boolean }) {
  const rows = compact ? GETS.slice(0, 6) : GETS;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((g) => (
        <div key={g.title} className="flex gap-3 border border-[#E6E7EC] rounded-xl p-3 bg-white">
          <span className="text-xl leading-none pt-0.5">{g.icon}</span>
          <div>
            <div className="text-[14px] font-bold">{g.title}</div>
            {!compact && (
              <p className="text-[12.5px] text-[#5B5E6B] leading-relaxed mt-0.5">{g.body}</p>
            )}
          </div>
        </div>
      ))}
      {compact && (
        <p className="text-[12px] text-[#7A7D8A] text-center">
          ועוד: המסע שלי · עוזרת כתיבה · בלי מנוי, לתמיד ·{" "}
          <a href="/price" target="_blank" className="underline">
            הפירוט המלא
          </a>
        </p>
      )}
    </div>
  );
}

export function PaybackCard() {
  return (
    <div className="rounded-2xl bg-[#F6FBF7] border border-[#CBE8D4] p-5 text-center">
      <div className="text-3xl">📈</div>
      <h2 className="text-lg font-bold mt-2">היא מחזירה את זה</h2>
      <p className="text-[13.5px] text-[#3A3C46] mt-1.5 leading-relaxed">
        זו לא הוצאה — זו השקעה שהיא מחזירה בעצמה.
      </p>
      <div className="bg-white rounded-xl border border-[#CBE8D4] p-3.5 mt-3.5 text-[13px]">
        {PAYBACK.map((r, i) => (
          <div
            key={r.what}
            className={`flex justify-between py-1 ${i ? "border-t border-[#EAF3EC]" : ""}`}
          >
            <span className="text-[#5B5E6B]">
              {r.qty} {r.what} ב-₪{r.unit}
            </span>
            <span className="font-bold">₪{r.total}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-[#5B5E6B] mt-3 leading-relaxed">
        מכאן והלאה — הכל רווח. ואין לנו נגיעה בכסף שלה.
      </p>
    </div>
  );
}

export function LearnsTable() {
  return (
    <div className="border border-[#E6E7EC] rounded-xl overflow-hidden bg-white">
      {LEARNS.map((l, i) => (
        <div
          key={l.skill}
          className={`flex gap-3 px-3.5 py-2.5 text-[13px] ${i ? "border-t border-[#F0F1F4]" : ""}`}
        >
          <span className="font-bold min-w-[104px]">{l.skill}</span>
          <span className="text-[#5B5E6B]">{l.what}</span>
        </div>
      ))}
    </div>
  );
}

const ANCHORS = [
  { what: "שיעור פרטי אחד", price: "₪150–200", note: "שעה אחת" },
  { what: "משחק קונסולה", price: "₪250–350", note: "נגמר אחרי שבועיים" },
  { what: "סט לגו בינוני", price: "₪200–400", note: "נבנה פעם אחת" },
];

export function AnchorTable() {
  return (
    <div className="flex flex-col gap-1.5">
      {ANCHORS.map((row) => (
        <div
          key={row.what}
          className="flex items-center gap-3 rounded-xl px-3.5 py-3 border border-[#E6E7EC] bg-white"
        >
          <span className="text-[13.5px] font-bold flex-1">{row.what}</span>
          <div className="text-left">
            <div className="text-[14px] font-bold">{row.price}</div>
            <div className="text-[11px] text-[#7A7D8A]">{row.note}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 rounded-xl px-3.5 py-3 border bg-[#15161B] text-white border-[#15161B]">
        <span className="text-[13.5px] font-bold flex-1">דוכן</span>
        <div className="text-left">
          <div className="text-[14px] font-bold">₪{ACTIVATION_PRICE}</div>
          <div className="text-[11px] opacity-70">נשאר, ומחזיר את עצמו</div>
        </div>
      </div>
    </div>
  );
}

const SAFETY: [string, string][] = [
  ["אין שדה כתובת בשום מקום במערכת", "המסירה מסוכמת בוואטסאפ בין הצדדים"],
  ["החנות לא מופיעה בגוגל", "רק מי שקיבל את הלינק יכול להגיע אליה"],
  ["הכתובת אקראית, לא שם", "‎/s/k3m9p — בלי שם, בלי בית ספר"],
  ["תמונות מנוקות ממידע מיקום", "נתוני ה-GPS של הבית נמחקים אוטומטית"],
  ["אנחנו לא נוגעים בכסף של המכירות", "אין סליקה ואין עמלה. התשלום ישיר ביניהן"],
  ["אין תגובות, דירוגים או פרופיל ציבורי", "הערוץ היחיד הוא וואטסאפ"],
];

export function SafetyList() {
  return (
    <div className="border border-[#E6E7EC] rounded-xl p-4 flex flex-col gap-2.5 text-[13px] leading-relaxed bg-white">
      {SAFETY.map(([title, body]) => (
        <div key={title} className="flex gap-2.5">
          <span className="text-[#1F7A42] leading-none pt-0.5">✓</span>
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-[12px] text-[#7A7D8A]">{body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
