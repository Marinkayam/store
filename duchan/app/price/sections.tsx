import { ACTIVATION_PRICE, GETS, GET_GROUPS, LEARNS } from "@/lib/pricing";
import Icon from "@/app/icons";
import PaybackCalc from "./payback-calc";

// חלקי התוכן של מסך ההפעלה (/activate) ושל דף המחיר (/price). שניהם
// שואבים מאותו `lib/pricing.ts`.
//
// גוף שני בכל מה שמופיע בזרימה הראשית — הילדה היא שקוראת את המסך הזה.
// LearnsTable ו-AnchorTable יושבים בתוך הבלוק "להראות להורה" ולכן הם בגוף שלישי.

function GetRow({ g, compact }: { g: (typeof GETS)[number]; compact?: boolean }) {
  return (
    <div className="flex gap-3 items-start border border-[var(--line)] p-3 bg-white">
      <span className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--canvas)]">
        <Icon name={g.icon} size={24} tone="var(--lavender)" />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-bold leading-snug">{g.title}</div>
        {!compact && <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5">{g.body}</p>}
      </div>
    </div>
  );
}

export function GetsList({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <div className="flex flex-col gap-2">
        {GETS.slice(0, 6).map((g) => <GetRow key={g.title} g={g} compact />)}
        <p className="text-[12px] text-[var(--muted)] text-center">
          ועוד: קופונים · דרופים · קופת הדוכן עם מטבעות וחידות · דוכן משותף ·{" "}
          <a href="/price" target="_blank" className="underline">
            כל מה שמקבלים
          </a>
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-7">
      {GET_GROUPS.map((grp) => (
        <section key={grp.key} aria-labelledby={`gets-${grp.key}`} data-testid={`gets-${grp.key}`}>
          <h3 id={`gets-${grp.key}`} className="flex items-center gap-2.5 text-[16px] font-bold mb-2.5">
            <span className="w-2.5 h-6" style={{ background: grp.tone }} aria-hidden />
            {grp.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {grp.items.map((g) => <GetRow key={g.title} g={g} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** "תוך כמה מכירות זה חוזר?" — מחשבון לילדים (קודם: טבלה סטטית) */
export function PaybackCard() {
  return <PaybackCalc />;
}

export function LearnsTable() {
  return (
    <div className="border border-[var(--line)] overflow-hidden bg-white">
      {LEARNS.map((l, i) => (
        <div
          key={l.skill}
          className={`flex gap-3 px-3.5 py-2.5 text-[13px] ${i ? "border-t border-[var(--line)]" : ""}`}
        >
          <span className="font-bold min-w-[104px]">{l.skill}</span>
          <span className="text-[var(--muted)]">{l.what}</span>
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
          className="flex items-center gap-3 px-3.5 py-3 border border-[var(--line)] bg-white"
        >
          <span className="text-[13.5px] font-bold flex-1">{row.what}</span>
          <div className="text-left">
            <div className="text-[14px] font-bold">{row.price}</div>
            <div className="text-[12px] text-[var(--muted)]">{row.note}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 px-3.5 py-3 border bg-[var(--ink)] text-white border-[var(--ink)]">
        <span className="text-[13.5px] font-bold flex-1">דוכן</span>
        <div className="text-left">
          <div className="text-[14px] font-bold">₪{ACTIVATION_PRICE}</div>
          <div className="text-[12px] opacity-70">נשאר, ומחזיר את עצמו</div>
        </div>
      </div>
    </div>
  );
}

const SAFETY: [string, string][] = [
  ["אין שדה כתובת בשום מקום במערכת", "המסירה מסוכמת בוואטסאפ בין הצדדים"],
  ["הדוכן לא מופיע בגוגל", "רק מי שקיבל את הלינק יכול להגיע אליו"],
  ["הלינק לדוכן אקראי, לא שם", "‎/s/k3m9p, בלי שם ובלי בית ספר"],
  ["תמונות מנוקות ממידע מיקום", "נתוני ה-GPS של הבית נמחקים אוטומטית"],
  ["אנחנו לא נוגעים בכסף של המכירות", "אין סליקה ואין עמלה. התשלום ישיר בין הצדדים"],
  ["אין תגובות, דירוגים או פרופיל ציבורי", "הערוץ היחיד הוא וואטסאפ"],
];

export function SafetyList() {
  return (
    <div className="border border-[var(--line)] p-4 flex flex-col gap-2.5 text-[13px] leading-relaxed bg-white">
      {SAFETY.map(([title, body]) => (
        <div key={title} className="flex gap-2.5">
          <span className="text-[var(--ok-ink)] leading-none pt-0.5">✓</span>
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-[12px] text-[var(--muted)]">{body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
