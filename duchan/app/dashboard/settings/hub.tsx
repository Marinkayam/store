"use client";

import Chevron from "@/app/chevron";
import Icon, { type IconName } from "@/app/icons";
import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * "החנות שלי" — מסך הבית של ההגדרות.
 *
 * קודם כל ההגדרות ישבו בגלילה אחת של 5,000 פיקסלים: יפה, אבל אי אפשר
 * היה למצוא כלום. עכשיו יש כאן רק שלושה דברים:
 *   1. הדוכן עצמו — איך הוא נראה, אם הוא פתוח, ולשתף אותו.
 *   2. קבוצות קצרות של מקטעים, כל אחד שורה עם מה שמוגדר בו עכשיו.
 *   3. פתיחה/סגירה ויציאה.
 * לחיצה על שורה פותחת את המקטע במסך משלו (page.tsx).
 *
 * מרינה, 10.2026, אחרי שנכנסה כמו ילדה: "איזה עמוס זה ולא מובן מה לעשות".
 * היו כאן 11 שורות בחמש קבוצות. עכשיו למעלה רק מה שצריך כדי להתחיל
 * (groups), וכל השאר מקופל מתחת ל"עוד הגדרות" (more). הקבוצות המקופלות
 * נשארות בדף (hidden) — קישורים ישירים (#coupons) ממשיכים לעבוד.
 */

export type HubRow = {
  key: string;
  icon: IconName;
  title: string;
  /** מה מוגדר עכשיו — "שמנת · עגלגל · לבבות" */
  summary: string;
  /** קישור החוצה במקום מקטע */
  href?: string;
  /** שותף/ה (0057): השורה נראית, אבל רק ראש הדוכן נכנס. הטקסט מסביר למה. */
  locked?: string;
  testid?: string;
};

export type HubGroup = { title: string; rows: HubRow[] };

export default function SettingsHub({
  hero,
  status,
  groups,
  more = [],
  onOpen,
  before,
  optional,
  after,
}: {
  /** הדוכן הקטן בראש המסך */
  hero: ReactNode;
  /** שורת פתיחה/סגירה — רק לדוכן שכבר פורסם */
  status?: ReactNode;
  groups: HubGroup[];
  /** מקופל מתחת ל"עוד הגדרות" */
  more?: HubGroup[];
  onOpen: (key: string) => void;
  /** מה שבא מיד אחרי הדוכן — קריאה לפרסום כשעוד לא פורסם */
  before?: ReactNode;
  /** אזור נפרד בסוף, לדברים שאינם חובה (לנהל ביחד) */
  optional?: ReactNode;
  after?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  let i = 0;
  const delay = (): CSSProperties => ({ animationDelay: `${Math.min(i++, 12) * 45}ms` });

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5" data-testid="settings-hub">
      {/* מה המסך הזה — במשפט אחד, לפני הכל */}
      <header className="fx-rise" style={delay()}>
        <h1 className="text-[20px] font-bold text-[var(--ink)]">הדוכן שלי</h1>
      </header>
      <div className="fx-rise" style={delay()}>{hero}</div>
      {before && <div className="fx-rise" style={delay()}>{before}</div>}

      {groups.map((g) => (
        <Group key={g.title} g={g} onOpen={onOpen} style={delay()} />
      ))}

      {status && <div className="fx-rise" style={delay()}>{status}</div>}

      {(more.length > 0 || optional) && (
        <div className="fx-rise" style={delay()}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            data-testid="hub-more"
            className="w-full flex items-center justify-center gap-2 min-h-11 text-[14px] font-medium text-[var(--ink)]"
          >
            {open ? "פחות הגדרות" : "עוד הגדרות"}
            <Chevron className={`transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
          </button>
          <div hidden={!open} className="flex flex-col gap-5 mt-3" data-testid="hub-more-panel">
            {more.map((g) => (
              <Group key={g.title} g={g} onOpen={onOpen} />
            ))}
            {optional}
          </div>
        </div>
      )}
      {after && <div className="fx-rise" style={delay()}>{after}</div>}
    </div>
  );
}

function Group({ g, onOpen, style }: { g: HubGroup; onOpen: (key: string) => void; style?: CSSProperties }) {
  return (
    <section className={style ? "fx-rise" : ""} style={style}>
      {g.title && <h2 className="text-[12px] font-bold text-[var(--faint)] px-1 mb-1.5 tracking-wide">{g.title}</h2>}
      <div className="bg-white border border-[var(--line)] overflow-hidden">
        {g.rows.map((r, idx) => {
          const inner = (
            <>
              <span className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--canvas)]" aria-hidden>
                <Icon name={r.icon} size={22} />
              </span>
              <span className="flex-1 min-w-0 text-right">
                <span className="block text-[14px] font-bold text-[var(--ink)]">{r.title}</span>
                <span className="block text-[12px] text-[var(--muted)] truncate mt-0.5">{r.locked ?? r.summary}</span>
              </span>
              {r.locked ? <Icon name="lock" size={18} tone="var(--faint)" /> : <Chevron className="text-[var(--faint)]" />}
            </>
          );
          const cls = `fx-press w-full flex items-center gap-3 px-3.5 py-3 min-h-[60px] ${
            idx ? "border-t border-[var(--sand)]" : ""
          } active:bg-[var(--canvas)]`;
          return r.href ? (
            <a key={r.key} href={r.href} className={cls} data-testid={r.testid}>
              {inner}
            </a>
          ) : (
            <button
              key={r.key}
              onClick={() => onOpen(r.key)}
              className={cls}
              data-testid={r.testid ?? `hub-${r.key}`}
              aria-label={r.title}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}
