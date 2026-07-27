/**
 * "עזרה?" — עיגול קטן וקבוע בפינה בכל מסכי ההקמה.
 * מילה אחת ובלי אייקון: הוא לא אמור להתחרות בפעולה הראשית של המסך,
 * רק להיות שם למי שנתקע/ת.
 */
export default function HelpButton({ context }: { context: string }) {
  const sales = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "972545888471").replace(/\D/g, "");
  const msg = `היי מרינה! 👋 צריך עזרה ב${context}.`;
  return (
    <a
      href={`https://wa.me/${sales}?text=${encodeURIComponent(msg)}`}
      target="_blank"
      rel="noreferrer"
      aria-label="עזרה בוואטסאפ"
      className="fixed bottom-4 left-4 z-40 w-12 h-12 flex items-center justify-center bg-white border border-[var(--line)] text-[13px] font-medium text-[var(--muted)]"
      style={{ borderRadius: "999px", boxShadow: "0 2px 8px rgba(0,0,0,.10)" }}
    >
      עזרה?
    </a>
  );
}
