import type { ReactNode } from "react";

/**
 * שלבים ממוספרים עם פס התקדמות אנכי — מרינה: "אם יש 1,2,3 אולי שיהיה עם
 * איזה פרוגרס ורטיקלי יפה", ואז: "מאוד גס, הקווים והרווחים בכלל לא שווים".
 *
 * לכן:
 *   • הקו רציף — כל קטע יוצא ממרכז הסימן ויורד בדיוק עד מרכז הסימן הבא,
 *     מאחורי הסימנים. בלי רווחים מתחת לסימן שגדלים ומתכווצים לפי הטקסט.
 *   • כל שלב באותו גובה מינימלי ובאותו ריווח, כך שהמרחקים בין הסימנים שווים
 *     כשאין בשלב תוכן נוסף.
 *   • סימן קטן ועדין (24px) וקו דק (2px): שלב שנעשה — זית מלא עם ✓, השלב
 *     של עכשיו — דיו מלא, שלבים שעוד לא הגיעו — לבן עם מסגרת דקה.
 *   • בלי פינות מעוגלות, כמו כל השפה של הדוכן.
 */
export type VStep = {
  key: string;
  title: ReactNode;
  sub?: ReactNode;
  /** done = ✓ · current = השלב שעכשיו · waiting = מחכים (⏳) · later = עוד לא הגיע */
  state?: "done" | "current" | "waiting" | "later";
  body?: ReactNode;
  testid?: string;
};

const MARK = 24; // גודל הסימן — הקו עובר במרכזו

export default function VSteps({ steps, testid, compact = false }: { steps: VStep[]; testid?: string; compact?: boolean }) {
  const gap = compact ? 14 : 18; // ריווח קבוע בין שלבים
  return (
    <ol data-testid={testid} className="flex flex-col">
      {steps.map((s, i) => {
        const state = s.state ?? "current";
        const done = state === "done";
        const dark = state === "current" || state === "waiting";
        const last = i === steps.length - 1;
        return (
          <li
            key={s.key}
            data-testid={s.testid}
            data-state={s.state}
            aria-current={state === "current" && s.state ? "step" : undefined}
            className="relative flex gap-3"
            style={{ paddingBottom: last ? 0 : gap, minHeight: last ? undefined : MARK + gap + 6 }}
          >
            {/* הקטע עד השלב הבא: ממרכז הסימן הזה ועד מרכז הסימן הבא */}
            {!last && (
              <span
                aria-hidden
                className="absolute w-[2px]"
                style={{
                  right: MARK / 2 - 1,
                  top: MARK / 2,
                  bottom: -MARK / 2,
                  background: done ? "var(--olive)" : "var(--sand)",
                }}
              />
            )}
            <span
              aria-hidden
              className={`relative z-[1] shrink-0 flex items-center justify-center text-[12px] font-bold ${
                done
                  ? "bg-[var(--olive)] text-white"
                  : dark
                    ? "bg-[var(--ink)] text-white"
                    : "bg-white text-[var(--muted)] border-[1.5px] border-[var(--stone)]"
              }`}
              style={{ width: MARK, height: MARK }}
            >
              {done ? "✓" : state === "waiting" ? "⏳" : i + 1}
            </span>
            <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
              <div
                className={`text-[14px] leading-[20px] ${done ? "text-[var(--muted)] font-medium" : state === "later" ? "text-[var(--muted)] font-semibold" : "font-bold"}`}
              >
                {s.title}
                {done && <span className="sr-only"> (נעשה)</span>}
              </div>
              {s.sub && <div className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5">{s.sub}</div>}
              {s.body && <div className="mt-2.5">{s.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
