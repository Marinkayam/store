/**
 * "מה אני יכול/ה לעשות בדוכן" — לילדים, ברור, באייקונים.
 *
 * מרינה: "אני צריכה באופן מסודר וברור מה אני יכול/ה לעשות בדוכן. זה ילדים".
 * אז לא פסקה — שתי רשימות קצרות, שורה לכל דבר, אייקון + פועל:
 *   • שותף/ה רואה "✅ מה אני יכול/ה לעשות" ו-"🔒 את זה עושה ראש הדוכן"
 *   • ראש הדוכן רואה "✅ מה כל הצוות יכול" ו-"👑 רק את/ה, ראש הדוכן"
 *   • בהזמנה (לפני שהצטרפו) — "✅ מה תוכלו לעשות" ו-"🔒 ראש הדוכן מחליט/ה"
 * אותה רשימה בכל מקום, כדי שילד/ה יראה אותה שוב ושוב ויזכור.
 */
export const EVERYONE = [
  { icon: "🛍️", text: "להוסיף מוצרים ולערוך אותם" },
  { icon: "📦", text: "לראות הזמנות ולסמן \"שולם\" ו\"נמסר\"" },
  { icon: "🎨", text: "לעצב את הדוכן" },
  { icon: "🏷️", text: "ליצור קופונים" },
  { icon: "🚚", text: "לקבוע אם יש משלוח וכמה הוא עולה" },
  { icon: "🔗", text: "לשתף את הדוכן" },
  { icon: "⏸️", text: "לפתוח את הדוכן או לשים אותו בהפסקה" },
] as const;

export const HEAD_ONLY = [
  { icon: "💳", text: "לקבוע איך משלמים (ביט, פייבוקס, מזומן)" },
  { icon: "📲", text: "לקבוע לאיזה טלפון מגיעות ההזמנות" },
  { icon: "👥", text: "להזמין שותפים לצוות או להוציא מהצוות" },
  { icon: "💰", text: "לשלם על הדוכן ולפתוח אותו להזמנות" },
] as const;

type Who = "owner" | "partner" | "invitee";

const TITLES: Record<Who, { can: string; cant: string; cantIcon: string }> = {
  owner: { can: "✅ מה כל הצוות יכול לעשות", cant: "רק את/ה, ראש הדוכן", cantIcon: "👑" },
  partner: { can: "✅ מה אני יכול/ה לעשות", cant: "את זה עושה ראש הדוכן", cantIcon: "🔒" },
  invitee: { can: "✅ מה תוכלו לעשות", cant: "את זה עושה ראש הדוכן", cantIcon: "🔒" },
};

export default function RoleGuide({ who, compact = false }: { who: Who; compact?: boolean }) {
  const t = TITLES[who];
  const row = "flex items-center gap-2.5 py-2 text-[13.5px] leading-snug";
  return (
    <div className="flex flex-col gap-2.5 text-right" data-testid="role-guide" data-who={who}>
      <section className="border border-[var(--ok-line,var(--line))] bg-white" aria-label={t.can}>
        <h3 className="px-3.5 py-2.5 text-[14px] font-bold bg-[var(--ok-bg)] text-[var(--ok-ink)]">{t.can}</h3>
        <ul className={`px-3.5 ${compact ? "py-0.5" : "py-1"}`}>
          {EVERYONE.map((r, i) => (
            <li key={r.text} className={`${row} ${i ? "border-t border-[var(--sand)]" : ""}`}>
              <span className="w-7 text-center text-[18px] shrink-0" aria-hidden>{r.icon}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="border border-[var(--line)] bg-white" aria-label={t.cant}>
        <h3 className="px-3.5 py-2.5 text-[14px] font-bold bg-[var(--sand)] text-[var(--ink)]">
          {t.cantIcon} {t.cant}
        </h3>
        <ul className={`px-3.5 ${compact ? "py-0.5" : "py-1"}`}>
          {HEAD_ONLY.map((r, i) => (
            <li key={r.text} className={`${row} ${i ? "border-t border-[var(--sand)]" : ""}`}>
              <span className="w-7 text-center text-[18px] shrink-0" aria-hidden>{r.icon}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
