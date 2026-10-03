/**
 * שקית הפתעה (0056) — מה שמופיע במקום תמונה כשאין תמונה למוצר הפתעה.
 * שקית נייר מקופלת עם סימן שאלה, בצבעי הערכה של הדוכן.
 */
export default function MysteryBag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="שקית הפתעה">
      <path d="M24 34 h52 l-4 52 h-44 z" fill="var(--s-surface, #fff)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 34 l6 -10 h40 l6 10" fill="var(--s-thumb, #eee)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 34 v-6 a12 12 0 0 1 24 0 v6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <text x="50" y="72" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--s-primary-text, currentColor)">?</text>
    </svg>
  );
}
