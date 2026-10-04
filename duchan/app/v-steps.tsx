import type { ReactNode } from "react";

/**
 * שלבים ממוספרים עם פס התקדמות אנכי — מרינה: "אם יש 1,2,3 אולי שיהיה עם
 * איזה פרוגרס ורטיקלי יפה".
 *
 * ריבוע ממוספר לכל שלב, וקו אנכי שמחבר אותו לשלב הבא. שלב שנעשה מקבל ✓
 * בזית, והקו שיוצא ממנו נצבע — כך רואים במבט אחד כמה כבר עברנו.
 * בלי פינות מעוגלות, כמו כל השפה של הדוכן.
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

export default function VSteps({ steps, testid, compact = false }: { steps: VStep[]; testid?: string; compact?: boolean }) {
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
            className="flex gap-3"
          >
            <div className="flex flex-col items-center shrink-0" aria-hidden>
              <span
                className={`w-8 h-8 flex items-center justify-center text-[14px] font-bold transition-colors ${
                  done ? "bg-[var(--olive)] text-white" : dark ? "bg-[var(--ink)] text-white" : "bg-[var(--sand)] text-[var(--muted)]"
                }`}
              >
                {done ? "✓" : state === "waiting" ? "⏳" : i + 1}
              </span>
              {!last && (
                <span
                  className="w-[3px] flex-1 min-h-3 my-1 transition-colors"
                  style={{ background: done ? "var(--olive)" : "var(--sand)" }}
                />
              )}
            </div>
            <div className={`flex-1 min-w-0 pt-1 ${last ? "" : compact ? "pb-3" : "pb-5"}`}>
              <div className={`text-[14.5px] font-bold leading-snug ${done ? "text-[var(--muted)]" : ""}`}>
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
