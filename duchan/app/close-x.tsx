/**
 * ✕ לסגירת גיליון. גדול מספיק לאצבע (44px), בפינה השמאלית העליונה
 * (בעברית — סוף השורה), בצבע הטקסט של המסך שבו הוא יושב.
 * מרינה: "גם צריך להיות פה איקס" — לא כולם יודעים שאפשר ללחוץ מחוץ לגיליון.
 */
export default function CloseX({ onClick, label = "סגירה", testid }: { onClick: () => void; label?: string; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testid ?? "sheet-close"}
      className="shrink-0 w-11 h-11 -my-2 -ml-2 flex items-center justify-center text-[22px] leading-none opacity-70 hover:opacity-100"
    >
      ✕
    </button>
  );
}
