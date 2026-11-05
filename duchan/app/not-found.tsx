import HomeStall from "./home-stall";
/**
 * דף שלא קיים. הטקסט מדבר על לינק שגוי ולא על "שגיאה 404", כי מי שמגיע
 * לכאן כמעט תמיד הקליד לינק של חנות לא נכון או לחץ על לינק ישן.
 *
 * האיור: דוכן ריק, עם "?" מתנדנד וכדור אבק שמתגלגל (מרינה, 11.2026:
 * "עיצוב מגניב של דוכן ריק").
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-[var(--canvas)]">
      <HomeStall name="אופס" empty className="w-full max-w-[320px] block" />
      <h1 className="text-[22px] font-black">הדוכן הזה ריק</h1>
      <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs">
        אין כאן כלום. אולי הלינק השתנה, ואולי נפלה אות בדרך.
      </p>
      <a href="/" className="bg-[var(--ink)] text-white px-6 py-3 text-[14px] font-bold">
        לדף הבית
      </a>
    </main>
  );
}
