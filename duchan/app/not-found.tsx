import Icon from "./icons";
/**
 * דף שלא קיים. הטקסט מדבר על לינק שגוי ולא על "שגיאה 404", כי מי שמגיע
 * לכאן כמעט תמיד הקליד לינק של חנות לא נכון או לחץ על לינק ישן.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-[var(--canvas)]">
      <Icon name="search" size={58} tone="var(--cream)" className="text-[var(--wood)]" />
      <h1 className="text-xl font-bold">הדף הזה לא קיים</h1>
      <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs">
        אולי הלינק השתנה, ואולי נפלה אות בדרך.
      </p>
      <a href="/" className="bg-[var(--ink)] text-white px-6 py-3 text-[14px] font-bold">
        לדף הבית
      </a>
    </main>
  );
}
