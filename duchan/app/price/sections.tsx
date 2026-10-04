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

/* ── להורים: מה לומדים, בהשוואה למה, ובטיחות — עם אייקונים (מרינה: "צריך להיות גם כיפי עם אייקונים") ── */

const TONES = ["var(--lavender)", "var(--olive)", "var(--blush)", "#E3C26F"];
type IconName = import("@/app/icons").IconName;

function IconTile({ name, tone }: { name: IconName; tone: string }) {
  return (
    <span className="w-11 h-11 shrink-0 flex items-center justify-center" style={{ background: `color-mix(in srgb, ${tone} 28%, white)` }}>
      <Icon name={name} size={26} tone={tone} />
    </span>
  );
}

const LEARN_ICONS: Record<string, IconName> = {
  "תמחור": "coins",
  "ניהול מלאי": "box",
  "שיווק": "megaphone",
  "שירות לקוחות": "chat",
  "חשבון של כסף אמיתי": "jar",
  "התמדה": "plant",
};

export function LearnsTable() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="learns">
      {LEARNS.map((l, i) => (
        <div key={l.skill} className="flex items-center gap-3 border border-[var(--line)] bg-white p-3">
          <IconTile name={LEARN_ICONS[l.skill] ?? "star"} tone={TONES[i % TONES.length]} />
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-snug">{l.skill}</div>
            <div className="text-[12.5px] text-[var(--muted)] leading-snug mt-0.5">{l.what}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const ANCHORS: { what: string; price: string; note: string; icon: IconName }[] = [
  { what: "שיעור פרטי אחד", price: "₪150–200", note: "שעה אחת", icon: "pencil" },
  { what: "משחק קונסולה", price: "₪250–350", note: "נגמר אחרי שבועיים", icon: "star" },
  { what: "סט לגו בינוני", price: "₪200–400", note: "נבנה פעם אחת", icon: "box" },
];

export function AnchorTable() {
  return (
    <div className="flex flex-col gap-1.5" data-testid="anchors">
      {ANCHORS.map((row) => (
        <div key={row.what} className="flex items-center gap-3 px-3 py-2.5 border border-[var(--line)] bg-white">
          <IconTile name={row.icon} tone="var(--stone)" />
          <span className="text-[13.5px] font-bold flex-1">{row.what}</span>
          <div className="text-left">
            <div className="text-[14px] font-bold" dir="ltr">{row.price}</div>
            <div className="text-[12px] text-[var(--muted)]">{row.note}</div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 px-3 py-3 border-[1.5px] bg-[var(--ink)] text-white border-[var(--ink)]">
        <span className="w-11 h-11 shrink-0 flex items-center justify-center bg-white/10">
          <Icon name="stall" size={26} tone="var(--lavender)" className="text-white" />
        </span>
        <span className="text-[14px] font-bold flex-1">דוכן</span>
        <div className="text-left">
          <div className="text-[16px] font-bold" dir="ltr">₪{ACTIVATION_PRICE}</div>
          <div className="text-[12px] opacity-80">נשאר, ומחזיר את עצמו</div>
        </div>
      </div>
    </div>
  );
}

const SAFETY: { icon: IconName; title: string; body: React.ReactNode }[] = [
  { icon: "lock", title: "אין שדה כתובת בשום מקום", body: "המסירה מסוכמת בוואטסאפ בין הצדדים." },
  { icon: "search", title: "הדוכן לא מופיע בגוגל", body: "רק מי שקיבל את הלינק יכול להגיע אליו." },
  { icon: "link", title: "לינק אקראי, לא שם", body: <>בלי שם ובלי בית ספר, למשל <bdi dir="ltr">/s/k3m9p</bdi></> },
  { icon: "camera", title: "תמונות בלי מיקום", body: "נתוני ה-GPS של הבית נמחקים אוטומטית." },
  { icon: "coins", title: "לא נוגעים בכסף", body: "אין סליקה ואין עמלה. התשלום ישיר בין הצדדים." },
  { icon: "chat", title: "בלי תגובות ודירוגים", body: "אין פרופיל ציבורי. הערוץ היחיד הוא וואטסאפ." },
];

export function SafetyList() {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="safety">
      {SAFETY.map((s, i) => (
        <div key={s.title} className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <IconTile name={s.icon} tone={TONES[i % TONES.length]} />
            <span className="w-6 h-6 flex items-center justify-center bg-[var(--ok-bg)] text-[var(--ok-ink)] text-[13px] font-bold" aria-hidden>✓</span>
          </div>
          <div className="text-[13.5px] font-bold leading-snug">{s.title}</div>
          <div className="text-[12px] text-[var(--muted)] leading-snug">{s.body}</div>
        </div>
      ))}
    </div>
  );
}
