/**
 * חץ "לפתוח" בסוף שורה — תמיד מצביע שמאלה (קדימה בעברית).
 *
 * לא תו טקסט: "‹" ו-"›" הם תווים ש"מתהפכים" לבד בטקסט מימין לשמאל, ואז
 * החץ יצא הפוך. ציור קטן לא מתהפך.
 */
export default function Chevron({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      data-chevron="left"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
