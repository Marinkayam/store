import type { Metadata } from "next";
import { ACTIVATION_PRICE, FULL_PRICE, IS_LAUNCH, LAUNCH_UNTIL_LABEL } from "@/lib/pricing";
import { GetsList, PaybackCard, LearnsTable, AnchorTable, SafetyList } from "./sections";
import Icon from "@/app/icons";

export const metadata: Metadata = {
  title: "מה מקבלים בדוכן",
  description: "חנות אמיתית, לינק לשיתוף, וכל מה שצריך כדי למכור — בתשלום אחד.",
};

/**
 * הדף מדבר לשני קהלים, ולכן הוא מחולק לשניים במפורש — כולל ויזואלית.
 * רוב הדף כללי ולא פונה במפורש לאף צד. יש בו בלוק אחד להורים, על רקע כהה,
 * ורק שם עוברים לגוף שלישי.
 *
 * העיצוב פה לא ממציא שפה חדשה — הוא מושך את אותם רכיבים (GetsList,
 * PaybackCard, LearnsTable, AnchorTable, SafetyList) שמסך ההפעלה /activate
 * כבר משתמש בהם. שני הדפים שמדברים על המחיר חייבים להיראות כמו אותו אתר.
 */
export default function PricePage() {
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      {/* ── Hero ── */}
      <section className="border-b border-[var(--line)] bg-white">
        <div className="max-w-lg mx-auto px-6 pt-12 pb-10 text-center">
          <Icon name="shop" size={44} tone="var(--wood)" className="mx-auto" />
          <h1 className="text-[26px] leading-[1.3] font-bold mt-3 text-[var(--ink)]">
            דוכן אמיתי משלך.
            <br />
            תשלום אחד, וזהו.
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-3 leading-relaxed">
            בונים בחינם. משלמים רק כשרוצים
            <br />
            לפתוח את הלינק ולשלוח אותו לחברים.
          </p>

          <div className="mt-6 inline-flex flex-col items-center card px-8 py-5">
            {IS_LAUNCH && (
              <div className="text-[12px] font-bold text-[var(--wood)] mb-1">
                🎉 מחיר השקה · עד {LAUNCH_UNTIL_LABEL}
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] leading-none font-bold text-[var(--ink)]">
                ₪{ACTIVATION_PRICE}
              </span>
              {IS_LAUNCH && (
                <span className="text-[17px] text-[var(--faint)] line-through">₪{FULL_PRICE}</span>
              )}
            </div>
            <div className="text-[12px] text-[var(--faint)] mt-1">פעם אחת · לתמיד</div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {["בלי מנוי חודשי", "בלי עמלה על מכירות", "הרווחים שלכם"].map((t) => (
              <span key={t} className="bg-[var(--cream)] text-[var(--muted)] text-[11.5px] px-3 py-1.5">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-lg mx-auto px-5 pb-16">
        {/* ── מה מקבלים ── */}
        <h2 className="text-[19px] font-bold text-[var(--ink)] mt-10 mb-1">מה מקבלים</h2>
        <p className="text-[13px] text-[var(--muted)] mb-4">הכל נפתח ברגע שהדוכן מתפרסם.</p>
        <GetsList />

        {/* ── ההחזר ── */}
        <div className="mt-10">
          <PaybackCard />
        </div>

        {/* ── בטיחות ── */}
        <h2 className="text-[19px] font-bold text-[var(--ink)] mt-10 mb-1">איך שומרים על הבטיחות</h2>
        <p className="text-[13px] text-[var(--muted)] mb-4">
          זה לא נוסף אחר כך — ככה זה בנוי מההתחלה.
        </p>
        <SafetyList />

        {/* ── להורים — הבלוק היחיד בגוף שלישי ── */}
        <section className="mt-10 border-[1.5px] border-[var(--line)] bg-white p-5">
          <div className="inline-block bg-[var(--cream)] text-[#6B3F7A] text-[11.5px] font-bold px-3 py-1.5">
            לקרוא עם ההורים
          </div>

          <h2 className="text-[18px] font-bold text-[var(--ink)] mt-3.5">מה באמת לומדים כאן</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-2">
            לכולם יש בבית דברים שהם זבל בשבילם ואוצר בשביל מישהו אחר. דוכן הופך את
            זה לשיעור ראשון ביזמות — כזה שקורה בפועל, לא בתיאוריה.
          </p>

          <div className="mt-4">
            <LearnsTable />
          </div>

          <div className="text-[13.5px] font-bold text-[var(--ink)] mt-5 mb-2.5">
            ₪{ACTIVATION_PRICE} בפרספקטיבה
          </div>
          <AnchorTable />
        </section>

        {/* ── CTA ── */}
        <div className="mt-10 text-center">
          <a href="/onboarding" className="btn btn-primary block py-4 text-[15px]">
            נבנה את הדוכן ←
          </a>
          <p className="text-[12.5px] text-[var(--muted)] mt-3 leading-relaxed">
            בונים קודם. משלמים רק כשרוצים לפרסם —
            <br />
            אפשר לראות הכל בלי להתחייב.
          </p>

          <p className="text-[11px] text-[var(--faint)] mt-7">
            <a href="/terms" className="underline">תנאי שימוש</a>
            {" · "}
            <a href="/privacy" className="underline">מדיניות פרטיות</a>
            {" · "}
            <a href="/accessibility" className="underline">נגישות</a>
          </p>
        </div>
      </div>
    </main>
  );
}
