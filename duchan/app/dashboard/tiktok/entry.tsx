import Chevron from "@/app/chevron";

/**
 * כניסה ל"לטיקטוק ולאינסטגרם" (/dashboard/tiktok). מרינה, 11.2026: הכרטיס
 * של טיקטוק ישב עמוק בהגדרות ומעט ילדים מצאו אותו, אז יש כניסה ממסך ההזמנות,
 * מהצעדים הראשונים, אחרי מוצר חדש ומהשיתוף.
 */
export default function TikTokEntry({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/dashboard/tiktok"
      className={`flex items-center gap-3 bg-white border border-[var(--line)] ${compact ? "px-3.5 py-2.5" : "px-4 py-3.5"}`}
      data-testid="tiktok-entry"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-bold">לטיקטוק ולאינסטגרם</span>
        {!compact && <span className="block text-[12px] text-[var(--muted)] mt-0.5">תמונות מוכנות להעלאה, ולינק לכל מוצר</span>}
      </span>
      <Chevron size={14} />
    </a>
  );
}
