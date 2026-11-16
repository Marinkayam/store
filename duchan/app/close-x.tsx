/**
 * ✕ לסגירה — כפתור אחד לכל האפליקציה, תמיד באותו מקום.
 *
 * מרינה, 11.2026: "שים לב למיקומים של האיקס בכל האפליקציה". היו כאן שלושה
 * סימנים שונים (✕, × ו-SVG) בארבעה גדלים, חלקם בפינה וחלקם צפים באמצע שורה.
 * עכשיו: אותו סימן, אזור לחיצה של 44px, ושני מצבים בלבד —
 *
 *   • בשורת כותרת של גיליון (ברירת המחדל): יושב בסוף השורה, והסימן מיושר
 *     לקו השוליים של הגיליון.
 *   • corner: לכרטיסים ולגיליונות בלי שורת כותרת. צמוד לפינה השמאלית
 *     העליונה (בעברית — סוף השורה). ההורה צריך להיות relative.
 *
 * הצבע הוא צבע הטקסט של המסך שבו הוא יושב. מרינה: "גם צריך להיות פה איקס" —
 * לא כולם יודעים שאפשר ללחוץ מחוץ לגיליון.
 */
export default function CloseX({
  onClick,
  label = "סגירה",
  testid,
  corner = false,
  className = "",
}: {
  onClick: () => void;
  label?: string;
  testid?: string;
  corner?: boolean;
  /** תוספות למראה בלבד (רקע מעל תמונה, צבע) — לא למיקום */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testid ?? "sheet-close"}
      data-close-x={corner ? "corner" : "row"}
      className={`w-11 h-11 flex items-center justify-center opacity-70 hover:opacity-100 ${
        corner ? "absolute top-2 left-2 z-10" : "shrink-0 -my-2 -ml-2"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
