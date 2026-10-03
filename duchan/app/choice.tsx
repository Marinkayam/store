"use client";

/**
 * בחירה בין שתי אפשרויות, כשהמילים כתובות על הכפתורים.
 *
 * בא במקום מתגי ה"טוגל": מתג קטן בלי מילים לא אמר מה דלוק ומה כבוי
 * (ירוק = פתוח? = מוסתר?), ובחלק מהמסכים הוא גם נחתך בקצה. כאן רואים
 * את שתי האפשרויות, מה נבחר מסומן ב-✓ ובהדגשה — לא רק בצבע — וכל
 * כפתור הוא משטח לחיצה מלא של 44px.
 *
 * value=true היא האפשרות הראשונה (מימין). למבחנים: הקבוצה נושאת
 * data-on, והכפתורים data-testid={testid}-on / {testid}-off.
 */
export default function Choice({
  value,
  onChange,
  on,
  off,
  label,
  testid,
  disabled = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  /** הטקסט של "כן" — למשל "🟢 פתוח" */
  on: string;
  /** הטקסט של "לא" — למשל "⏸️ בהפסקה" */
  off: string;
  /** שם הבחירה לקורא מסך — "הדוכן פתוח או בהפסקה" */
  label: string;
  testid?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testid}
      data-on={String(value)}
      className="grid grid-cols-2 gap-1 p-1 bg-[var(--sand)]"
    >
      {([true, false] as const).map((v) => {
        const sel = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={disabled}
            data-testid={testid ? `${testid}-${v ? "on" : "off"}` : undefined}
            onClick={() => !sel && onChange(v)}
            className={`min-h-11 px-2 text-[13px] leading-tight transition disabled:opacity-50 ${
              /* בלי קו מתאר: הנבחר הוא משטח לבן על הפס, עם ✓ ובהדגשה */
              sel ? "bg-white font-bold text-[var(--ink)]" : "text-[var(--muted)] font-medium"
            }`}
          >
            {sel && <span aria-hidden className="text-[var(--ok-ink)]">✓ </span>}
            {v ? on : off}
          </button>
        );
      })}
    </div>
  );
}
