import { hasContact } from "@/lib/public-text";

/**
 * הסבר קצר מתחת לשדה טקסט ציבורי, רק כשיש בו מספר טלפון, מייל או קישור:
 * הם לא יוצגו בדוכן (lib/public-text.ts). הטקסט עצמו נשמר כמו שנכתב.
 */
export default function ContactNote({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!hasContact(text)) return null;
  return (
    <p role="status" data-testid="contact-note" className={`text-[12px] leading-snug text-[var(--warn-ink)] ${className}`}>
      מספר טלפון או קישור לא יופיעו בדוכן. הקונים מקבלים את המספר שלכם אחרי שהם מזמינים.
    </p>
  );
}
