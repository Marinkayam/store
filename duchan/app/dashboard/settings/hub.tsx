"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * "החנות שלי" — מסך הבית של ההגדרות.
 *
 * קודם כל ההגדרות ישבו בגלילה אחת של 5,000 פיקסלים: יפה, אבל אי אפשר
 * היה למצוא כלום. עכשיו יש כאן רק שלושה דברים:
 *   1. הדוכן עצמו — איך הוא נראה, אם הוא פתוח, ולשתף אותו.
 *   2. קבוצות קצרות של מקטעים, כל אחד שורה עם מה שמוגדר בו עכשיו.
 *   3. פתיחה/סגירה ויציאה.
 * לחיצה על שורה פותחת את המקטע במסך משלו (page.tsx).
 */

export type HubRow = {
  key: string;
  icon: string;
  /** צבע הבועה של האייקון */
  tint: string;
  title: string;
  /** מה מוגדר עכשיו — "שמנת · עגלגל · לבבות" */
  summary: string;
  /** קישור החוצה במקום מקטע (קופונים יושבים ב"להפיץ") */
  href?: string;
  testid?: string;
};

export type HubGroup = { title: string; rows: HubRow[] };

export default function SettingsHub({
  hero,
  status,
  groups,
  onOpen,
  before,
  after,
}: {
  /** הדוכן הקטן בראש המסך */
  hero: ReactNode;
  /** שורת פתיחה/סגירה */
  status: ReactNode;
  groups: HubGroup[];
  onOpen: (key: string) => void;
  /** מה שבא מיד אחרי הדוכן — קריאה לפרסום כשעוד לא פורסם */
  before?: ReactNode;
  after?: ReactNode;
}) {
  let i = 0;
  const delay = (): CSSProperties => ({ animationDelay: `${Math.min(i++, 12) * 45}ms` });

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-5" data-testid="settings-hub">
      <div className="fx-rise" style={delay()}>{hero}</div>
      {before && <div className="fx-rise" style={delay()}>{before}</div>}

      {groups.map((g) => (
        <section key={g.title} className="fx-rise" style={delay()}>
          <h2 className="text-[12px] font-bold text-[var(--faint)] px-1 mb-1.5 tracking-wide">{g.title}</h2>
          <div className="bg-white border border-[var(--line)] overflow-hidden">
            {g.rows.map((r, idx) => {
              const inner = (
                <>
                  <span
                    className="w-10 h-10 shrink-0 flex items-center justify-center text-[19px]"
                    style={{ background: r.tint }}
                    aria-hidden
                  >
                    {r.icon}
                  </span>
                  <span className="flex-1 min-w-0 text-right">
                    <span className="block text-[14px] font-bold text-[var(--ink)]">{r.title}</span>
                    <span className="block text-[12px] text-[var(--muted)] truncate mt-0.5">{r.summary}</span>
                  </span>
                  <span className="text-[var(--faint)] text-[18px] shrink-0" aria-hidden>‹</span>
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
      ))}

      <div className="fx-rise" style={delay()}>{status}</div>
      {after && <div className="fx-rise" style={delay()}>{after}</div>}
    </div>
  );
}
