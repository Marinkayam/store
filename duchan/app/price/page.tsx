import type { Metadata } from "next";
import { ACTIVATION_PRICE, FULL_PRICE, GETS, IS_LAUNCH, LAUNCH_UNTIL_LABEL, LEARNS, PAYBACK } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "מה מקבלים בדוכן",
  description: "חנות אמיתית, לינק לשיתוף, וכל מה שצריך כדי למכור — בתשלום אחד.",
};

/**
 * הדף מדבר לשני קהלים, ולכן הוא מחולק לשניים במפורש — כולל ויזואלית.
 * רוב הדף מדבר **אלייך**, בגוף שני. יש בו בלוק אחד להורים, על רקע כהה,
 * ורק שם עוברים לגוף שלישי. הערבוב בין השניים הוא מה שגרם לגרסה הקודמת
 * להישמע כאילו מישהו מדבר עלייך מעל הראש.
 */

const SAFETY: [string, string][] = [
  ["הכתובת שלך אקראית", "duchan.app/s/k3m9p — בלי שם, בלי בית ספר"],
  ["החנות לא בגוגל", "רק מי שקיבל את הלינק ממך מגיע אליה"],
  ["אין שדה כתובת בכלל", "איפה נפגשים — מסכמות בוואטסאפ"],
  ["התמונות מנוקות", "נתוני המיקום של הבית נמחקים אוטומטית"],
  ["הכסף שלך", "אנחנו לא נוגעים בו ולא לוקחים עמלה"],
  ["בלי תגובות ובלי דירוגים", "אף אחד לא יכול לכתוב לך משהו בחנות"],
];

const ANCHORS = [
  { what: "שיעור פרטי אחד", price: "₪150–200", note: "שעה" },
  { what: "משחק קונסולה", price: "₪250–350", note: "נגמר אחרי שבועיים" },
  { what: "סט לגו בינוני", price: "₪200–400", note: "נבנה פעם אחת" },
];

export default function PricePage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)]" style={{ fontFamily: "'Assistant',sans-serif" }}>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(160deg,var(--cream) 0%,var(--cream) 55%,var(--canvas) 100%)" }}
        />
        <div className="relative max-w-lg mx-auto px-6 pt-14 pb-12 text-center">
          <div className="text-[64px] leading-none">🛍️</div>
          <h1
            className="text-[30px] leading-[1.25] font-bold mt-4 text-[var(--ink)]"
            style={{ fontFamily: "'Secular One',sans-serif" }}
          >
            חנות אמיתית משלך.
            <br />
            תשלום אחד, וזהו.
          </h1>
          <p className="text-[15px] text-[var(--muted)] mt-3 leading-relaxed">
            בונה אותה בחינם. משלמים רק כשאת רוצה
            <br />
            לפתוח את הלינק ולשלוח אותו לחברות.
          </p>

          <div className="mt-7 inline-flex flex-col items-center bg-white px-9 py-6">
            {/* המחיר הישן נשאר על המסך ומחוק: מספר לבדו לא אומר "מבצע" */}
            {IS_LAUNCH && (
              <div className="text-[12.5px] font-bold text-[var(--wood)] mb-1.5">
                🎉 מחיר השקה — עד {LAUNCH_UNTIL_LABEL}
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span
                className="text-[54px] leading-none font-bold text-[var(--ink)]"
                style={{ fontFamily: "'Secular One',sans-serif" }}
              >
                ₪{ACTIVATION_PRICE}
              </span>
              {IS_LAUNCH && (
                <span className="text-[22px] text-[var(--faint)] line-through">₪{FULL_PRICE}</span>
              )}
            </div>
            <div className="text-[13px] text-[var(--faint)] mt-1.5">פעם אחת · לתמיד</div>
            {IS_LAUNCH && (
              <div className="text-[13px] font-bold text-[var(--ink)] mt-2">
                לבנות את הדוכן שלך במחיר מצחיק!
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {["בלי מנוי חודשי", "בלי עמלה על מכירות", "הרווחים שלך"].map((t) => (
              <span
                key={t}
                className="bg-white/70 text-[var(--muted)] text-[12px] px-3.5 py-1.5"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-lg mx-auto px-5 pb-16">
        {/* ── מה את מקבלת ── */}
        <h2
          className="text-[22px] font-bold text-[var(--ink)] mt-12 mb-1"
          style={{ fontFamily: "'Secular One',sans-serif" }}
        >
          מה את מקבלת
        </h2>
        <p className="text-[13.5px] text-[var(--muted)] mb-5">הכל נפתח ברגע שהחנות מתפרסמת.</p>

        <div className="grid grid-cols-1 gap-2.5">
          {GETS.map((g) => (
            <div
              key={g.title}
              className="flex gap-3.5 bg-white p-4"
            >
              <div className="w-11 h-11 bg-[var(--cream)] flex items-center justify-center text-[22px] shrink-0">
                {g.icon}
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[15px] font-bold text-[var(--ink)]">{g.title}</div>
                <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">{g.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ההחזר ── */}
        <div className="mt-12 bg-[var(--ink)] text-white p-7 text-center">
          <div className="text-[40px] leading-none">📈</div>
          <h2
            className="text-[22px] font-bold mt-3"
            style={{ fontFamily: "'Secular One',sans-serif" }}
          >
            את מחזירה את זה
          </h2>
          <p className="text-[14px] text-white/70 mt-2 leading-relaxed">
            כמה מכירות וזה כבר שילם על עצמו.
          </p>

          <div className="bg-white/10 p-4 mt-5 text-[14px]">
            {PAYBACK.map((r, i) => (
              <div
                key={r.what}
                className={`flex justify-between items-center py-2.5 ${i ? "border-t border-white/10" : ""}`}
              >
                <span className="text-white/75">
                  {r.qty} {r.what} · ₪{r.unit}
                </span>
                <span className="font-bold text-[var(--wood)]">₪{r.total}</span>
              </div>
            ))}
          </div>

          <p className="text-[13px] text-white/60 mt-4 leading-relaxed">
            ומכאן — הכל שלך. אנחנו לא רואים את הכסף
            <br />
            ולא לוקחים ממנו אגורה.
          </p>
        </div>

        {/* ── בטיחות ── */}
        <h2
          className="text-[22px] font-bold text-[var(--ink)] mt-12 mb-1"
          style={{ fontFamily: "'Secular One',sans-serif" }}
        >
          איך שומרים עלייך
        </h2>
        <p className="text-[13.5px] text-[var(--muted)] mb-5">
          זה לא נוסף אחר כך — ככה זה בנוי מההתחלה.
        </p>

        <div className="bg-white p-5">
          {SAFETY.map(([title, body], i) => (
            <div
              key={title}
              className={`flex gap-3 py-3 ${i ? "border-t border-[var(--line)]" : "pt-0"}`}
            >
              <span className="w-5 h-5 bg-[#E4F3E9] text-[var(--ok-ink)] text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                ✓
              </span>
              <div>
                <div className="text-[14px] font-medium text-[var(--ink)]">{title}</div>
                <div className="text-[12.5px] text-[var(--muted)] mt-0.5">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── להורים — הבלוק היחיד בגוף שלישי ── */}
        <section className="mt-12 border-[1.5px] border-[var(--line)] bg-white p-6">
          <div className="inline-block bg-[var(--cream)] text-[#6B3F7A] text-[12px] font-bold px-3.5 py-1.5">
            לקרוא עם ההורים
          </div>

          <h2
            className="text-[20px] font-bold text-[var(--ink)] mt-4"
            style={{ fontFamily: "'Secular One',sans-serif" }}
          >
            מה היא באמת לומדת כאן
          </h2>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-2">
            לכולנו יש בבית דברים שהם זבל בשבילנו ואוצר בשביל מישהו אחר. דוכן הופך את
            זה לשיעור ראשון ביזמות — כזה שקורה בפועל, לא בתיאוריה.
          </p>

          <div className="mt-4 bg-[var(--canvas)] overflow-hidden">
            {LEARNS.map((l, i) => (
              <div
                key={l.skill}
                className={`flex gap-3 px-4 py-3 text-[13.5px] ${i ? "border-t border-[var(--line)]" : ""}`}
              >
                <span className="font-bold text-[var(--ink)] min-w-[108px]">{l.skill}</span>
                <span className="text-[var(--muted)]">{l.what}</span>
              </div>
            ))}
          </div>

          <div className="text-[14px] font-bold text-[var(--ink)] mt-6 mb-3">
            ₪{ACTIVATION_PRICE} בפרספקטיבה
          </div>
          <div className="flex flex-col gap-1.5">
            {ANCHORS.map((row) => (
              <div
                key={row.what}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--canvas)]"
              >
                <span className="text-[13.5px] flex-1 text-[var(--ink)]">{row.what}</span>
                <div className="text-left">
                  <div className="text-[13.5px] font-bold text-[var(--ink)]">{row.price}</div>
                  <div className="text-[11px] text-[var(--faint)]">{row.note}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--ink)] text-white">
              <span className="text-[13.5px] font-bold flex-1">דוכן</span>
              <div className="text-left">
                <div className="text-[13.5px] font-bold">₪{ACTIVATION_PRICE}</div>
                <div className="text-[11px] text-[var(--wood)]">נשאר, ומחזיר את עצמו</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <div className="mt-12 text-center">
          <a
            href="/onboarding"
            className="block py-4.5 text-[16px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg,var(--wood),#C77DFF)",
              padding: "17px 0",
              fontFamily: "'Secular One',sans-serif",
            }}
          >
            בואי נבנה את החנות שלך
          </a>
          <p className="text-[13px] text-[var(--muted)] mt-4 leading-relaxed">
            בונים קודם. משלמים רק כשרוצים לפרסם —
            <br />
            אפשר לראות הכל בלי להתחייב.
          </p>

          <p className="text-[11.5px] text-[var(--faint)] mt-8">
            <a href="/terms" className="underline">תנאי שימוש</a>
            {" · "}
            <a href="/privacy" className="underline">מדיניות פרטיות</a>
          </p>
        </div>
      </div>
    </main>
  );
}
