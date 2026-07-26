import type { Metadata } from "next";
import { ACTIVATION_PRICE, GETS, LEARNS, PAYBACK } from "@/lib/pricing";

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
    <main className="min-h-screen bg-[#FFFBF3]" style={{ fontFamily: "'Assistant',sans-serif" }}>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(160deg,#FFE3EF 0%,#F3E2FB 55%,#FFFBF3 100%)" }}
        />
        <div className="relative max-w-lg mx-auto px-6 pt-14 pb-12 text-center">
          <div className="text-[64px] leading-none">🛍️</div>
          <h1
            className="text-[30px] leading-[1.25] font-bold mt-4 text-[#3B1E33]"
            style={{ fontFamily: "'Secular One',sans-serif" }}
          >
            חנות אמיתית משלך.
            <br />
            תשלום אחד, וזהו.
          </h1>
          <p className="text-[15px] text-[#7A5468] mt-3 leading-relaxed">
            בונה אותה בחינם. משלמים רק כשאת רוצה
            <br />
            לפתוח את הלינק ולשלוח אותו לחברות.
          </p>

          <div className="mt-7 inline-flex flex-col items-center bg-white rounded-3xl px-9 py-6 shadow-[0_8px_30px_rgba(180,90,140,.14)]">
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[54px] leading-none font-bold text-[#3B1E33]"
                style={{ fontFamily: "'Secular One',sans-serif" }}
              >
                ₪{ACTIVATION_PRICE}
              </span>
            </div>
            <div className="text-[13px] text-[#9A7488] mt-1.5">פעם אחת · לתמיד</div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {["בלי מנוי חודשי", "בלי עמלה על מכירות", "הרווחים שלך"].map((t) => (
              <span
                key={t}
                className="bg-white/70 text-[#7A5468] text-[12px] rounded-full px-3.5 py-1.5"
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
          className="text-[22px] font-bold text-[#3B1E33] mt-12 mb-1"
          style={{ fontFamily: "'Secular One',sans-serif" }}
        >
          מה את מקבלת
        </h2>
        <p className="text-[13.5px] text-[#8A6A7C] mb-5">הכל נפתח ברגע שהחנות מתפרסמת.</p>

        <div className="grid grid-cols-1 gap-2.5">
          {GETS.map((g) => (
            <div
              key={g.title}
              className="flex gap-3.5 bg-white rounded-2xl p-4 shadow-[0_2px_10px_rgba(150,110,130,.06)]"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#FFF0F6] flex items-center justify-center text-[22px] shrink-0">
                {g.icon}
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[15px] font-bold text-[#3B1E33]">{g.title}</div>
                <p className="text-[13.5px] text-[#7A6472] leading-relaxed mt-1">{g.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ההחזר ── */}
        <div className="mt-12 rounded-3xl bg-[#3B1E33] text-white p-7 text-center">
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

          <div className="bg-white/10 rounded-2xl p-4 mt-5 text-[14px]">
            {PAYBACK.map((r, i) => (
              <div
                key={r.what}
                className={`flex justify-between items-center py-2.5 ${i ? "border-t border-white/10" : ""}`}
              >
                <span className="text-white/75">
                  {r.qty} {r.what} · ₪{r.unit}
                </span>
                <span className="font-bold text-[#FFC53D]">₪{r.total}</span>
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
          className="text-[22px] font-bold text-[#3B1E33] mt-12 mb-1"
          style={{ fontFamily: "'Secular One',sans-serif" }}
        >
          איך שומרים עלייך
        </h2>
        <p className="text-[13.5px] text-[#8A6A7C] mb-5">
          זה לא נוסף אחר כך — ככה זה בנוי מההתחלה.
        </p>

        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_rgba(150,110,130,.06)]">
          {SAFETY.map(([title, body], i) => (
            <div
              key={title}
              className={`flex gap-3 py-3 ${i ? "border-t border-[#F6EEF2]" : "pt-0"}`}
            >
              <span className="w-5 h-5 rounded-full bg-[#E4F3E9] text-[#1F7A42] text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                ✓
              </span>
              <div>
                <div className="text-[14px] font-medium text-[#3B1E33]">{title}</div>
                <div className="text-[12.5px] text-[#8A6A7C] mt-0.5">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── להורים — הבלוק היחיד בגוף שלישי ── */}
        <section className="mt-12 rounded-3xl border-[1.5px] border-[#E8DCE4] bg-white p-6">
          <div className="inline-block bg-[#F3E2FB] text-[#6B3F7A] text-[12px] font-bold rounded-full px-3.5 py-1.5">
            לקרוא עם ההורים
          </div>

          <h2
            className="text-[20px] font-bold text-[#3B1E33] mt-4"
            style={{ fontFamily: "'Secular One',sans-serif" }}
          >
            מה היא באמת לומדת כאן
          </h2>
          <p className="text-[13.5px] text-[#7A6472] leading-relaxed mt-2">
            לכולנו יש בבית דברים שהם זבל בשבילנו ואוצר בשביל מישהו אחר. דוכן הופך את
            זה לשיעור ראשון ביזמות — כזה שקורה בפועל, לא בתיאוריה.
          </p>

          <div className="mt-4 rounded-2xl bg-[#FBF7F9] overflow-hidden">
            {LEARNS.map((l, i) => (
              <div
                key={l.skill}
                className={`flex gap-3 px-4 py-3 text-[13.5px] ${i ? "border-t border-[#F0E6EC]" : ""}`}
              >
                <span className="font-bold text-[#3B1E33] min-w-[108px]">{l.skill}</span>
                <span className="text-[#7A6472]">{l.what}</span>
              </div>
            ))}
          </div>

          <div className="text-[14px] font-bold text-[#3B1E33] mt-6 mb-3">
            ₪{ACTIVATION_PRICE} בפרספקטיבה
          </div>
          <div className="flex flex-col gap-1.5">
            {ANCHORS.map((row) => (
              <div
                key={row.what}
                className="flex items-center gap-3 rounded-xl px-4 py-3 bg-[#FBF7F9]"
              >
                <span className="text-[13.5px] flex-1 text-[#3B1E33]">{row.what}</span>
                <div className="text-left">
                  <div className="text-[13.5px] font-bold text-[#3B1E33]">{row.price}</div>
                  <div className="text-[11px] text-[#9A7488]">{row.note}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-[#3B1E33] text-white">
              <span className="text-[13.5px] font-bold flex-1">דוכן</span>
              <div className="text-left">
                <div className="text-[13.5px] font-bold">₪{ACTIVATION_PRICE}</div>
                <div className="text-[11px] text-[#FFC53D]">נשאר, ומחזיר את עצמו</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <div className="mt-12 text-center">
          <a
            href="/onboarding"
            className="block rounded-2xl py-4.5 text-[16px] font-bold text-white shadow-[0_8px_24px_rgba(255,111,165,.35)]"
            style={{
              background: "linear-gradient(135deg,#FF6FA5,#C77DFF)",
              padding: "17px 0",
              fontFamily: "'Secular One',sans-serif",
            }}
          >
            בואי נבנה את החנות שלך
          </a>
          <p className="text-[13px] text-[#8A6A7C] mt-4 leading-relaxed">
            בונים קודם. משלמים רק כשרוצים לפרסם —
            <br />
            אפשר לראות הכל בלי להתחייב.
          </p>

          <p className="text-[11.5px] text-[#B49AA8] mt-8">
            <a href="/terms" className="underline">תנאי שימוש</a>
            {" · "}
            <a href="/privacy" className="underline">מדיניות פרטיות</a>
          </p>
        </div>
      </div>
    </main>
  );
}
