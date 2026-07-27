import Icon from "./icons";

/**
 * "צריך עזרה?" — קטן ולא בולט בכוונה, קבוע בפינה בכל מסכי ההקמה.
 * לא כפתור מתחרה עם הפעולה הראשית של המסך, רק דרך יציאה שקטה למי שנתקעת.
 */
export default function HelpButton({ context }: { context: string }) {
  const sales = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "972545888471").replace(/\D/g, "");
  const msg = `היי מרינה! 👋 צריכה עזרה ב${context}.`;
  return (
    <a
      href={`https://wa.me/${sales}?text=${encodeURIComponent(msg)}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-3 left-3 z-40 flex items-center gap-1 bg-white border border-[var(--line)] px-2.5 py-1.5 text-[10.5px] text-[var(--muted)]"
      style={{ boxShadow: "0 1px 5px rgba(0,0,0,.08)" }}
    >
      <Icon name="phone" size={13} tone="var(--whatsapp)" />
      צריך עזרה?
    </a>
  );
}
