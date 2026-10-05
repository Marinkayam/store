/**
 * "עזרה?" — עיגול קטן וקבוע בפינה בכל מסכי ההקמה.
 * מילה אחת ובלי אייקון: הוא לא אמור להתחרות בפעולה הראשית של המסך,
 * רק להיות שם למי שנתקע/ת.
 */
/** lift — כמה להרים מעל פס תחתון קבוע של המסך (למשל כפתור "לפתוח דוכן" בדף הבית) */
export default function HelpButton({ context, lift = 0 }: { context: string; lift?: number }) {
  const sales = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "972545888471").replace(/\D/g, "");
  const msg = `היי! 👋 צריך עזרה ב${context}.`;
  return (
    <a
      href={`https://wa.me/${sales}?text=${encodeURIComponent(msg)}`}
      target="_blank"
      rel="noreferrer"
      aria-label="עזרה בוואטסאפ"
      style={{ bottom: `calc(1rem + var(--cookie-h, 0px) + ${lift}px)` }}
      className="fixed left-4 z-40 transition-[bottom] duration-300 w-12 h-12 flex items-center justify-center bg-white border border-[var(--line)] text-[13px] font-medium text-[var(--muted)]"
    >
      עזרה?
    </a>
  );
}
