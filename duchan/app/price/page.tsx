import type { Metadata } from "next";
import { ACTIVATION_PRICE } from "@/lib/pricing";
import { AnchorTable, GetsList, LearnsTable, PaybackCard, SafetyList } from "./sections";

export const metadata: Metadata = {
  title: "מה מקבלים בדוכן",
  description: "חנות אמיתית, לינק לשיתוף, וכל מה שצריך כדי למכור — במחיר חד-פעמי.",
};

// דף שמדבר לשני קהלים בו-זמנית: הילדה (התרגשות) וההורה (הצדקה).
// הסדר מכוון — קודם מה היא מקבלת, ואז למה זה שווה להורה.

export default function PricePage() {
  return (
    <main className="min-h-screen bg-[#F5F6F9]">
      <div className="max-w-md mx-auto px-5 py-10">
        {/* Hero */}
        <div className="text-center">
          <div className="text-5xl mb-3">🛍️</div>
          <h1 className="text-[26px] font-bold leading-tight">
            חנות אמיתית משלה,
            <br />
            בתשלום אחד
          </h1>
          <div className="mt-5 inline-flex items-baseline gap-1.5">
            <span className="text-5xl font-bold">₪{ACTIVATION_PRICE}</span>
            <span className="text-sm text-[#7A7D8A]">חד-פעמי</span>
          </div>
          <p className="text-[13px] text-[#7A7D8A] mt-2 leading-relaxed">
            בלי מנוי חודשי · בלי עמלה על מכירות
            <br />
            כל שקל שהיא מרוויחה נשאר אצלה
          </p>
        </div>

        <h2 className="text-lg font-bold mt-11 mb-3">מה נכלל במחיר</h2>
        <GetsList />

        <div className="mt-11">
          <PaybackCard />
        </div>

        <h2 className="text-lg font-bold mt-11 mb-1">להורים: מה היא באמת לומדת</h2>
        <p className="text-[13px] text-[#7A7D8A] mb-3 leading-relaxed">
          לכולנו יש בבית דברים שהם זבל בשבילנו ואוצר בשביל מישהו אחר. דוכן הופך את זה לשיעור ראשון
          ביזמות — כזה שקורה בפועל, לא בתיאוריה.
        </p>
        <LearnsTable />

        <h2 className="text-lg font-bold mt-11 mb-3">₪{ACTIVATION_PRICE} בפרספקטיבה</h2>
        <AnchorTable />

        <h2 className="text-lg font-bold mt-11 mb-3">מה שחשוב לדעת על בטיחות</h2>
        <SafetyList />

        {/* CTA */}
        <div className="mt-11 text-center">
          <a
            href="/onboarding"
            className="block bg-[#15161B] text-white rounded-2xl py-4 text-[15px] font-bold"
          >
            בואי נבנה את החנות שלך
          </a>
          <p className="text-[12px] text-[#7A7D8A] mt-3 leading-relaxed">
            בונים קודם, משלמים רק כשרוצים לפרסם.
            <br />
            אפשר לבנות את כל החנות ולראות אותה בלי להתחייב.
          </p>
          <p className="text-[11px] text-[#A2A5B0] mt-6">
            <a href="/terms" className="underline">
              תנאי שימוש
            </a>
            {" · "}
            <a href="/privacy" className="underline">
              מדיניות פרטיות
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
