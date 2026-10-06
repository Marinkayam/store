"use client";

import { useEffect, useState } from "react";
import Icon from "@/app/icons";
import { WHATSNEW } from "@/lib/whatsnew";

/**
 * באנר "חדש בדוכן" בראש מסך ההזמנות (היה פופאפ שחוסם את המסך).
 * רצועה אחת: כותרת, X, ושורת פריטים שגוללים הצידה — כל פריט לוקח למקום
 * שלו. ההיגיון (מי רואה ומתי) ב-lib/whatsnew.ts.
 */
export default function WhatsNewBanner({ createdAt }: { createdAt: string }) {
  const key = `duchan-whatsnew-${WHATSNEW.version}`;
  const [show, setShow] = useState(false);
  // מקופל כברירת מחדל: שורה אחת. מי שרוצה לראות את הכרטיסים לוחצת.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (new Date(createdAt) >= new Date(WHATSNEW.releasedAt)) return;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return; // אין אחסון (גלישה פרטית) — לא מציגים, כדי שלא יחזור בכל כניסה
    }
    setShow(true);
  }, [createdAt, key]);

  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(key, "1");
    } catch {}
  };

  return (
    <section className="bg-[#efe7f4] border-b border-[var(--line)]" data-testid="whatsnew-banner" aria-labelledby="whatsnew-title">
      <div className="px-4 flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="whatsnew-toggle"
          className="flex-1 flex items-center gap-2 min-h-11 text-right"
        >
          <Icon name="sparkle" size={18} tone="#E3C26F" />
          <span id="whatsnew-title" className="text-[14px] font-bold">{WHATSNEW.title}</span>
          <span className="text-[12.5px] text-[var(--muted)]">{open ? "סגירה" : `${WHATSNEW.items.length} דברים לנסות`}</span>
        </button>
        <button onClick={close} aria-label="להסתיר" data-testid="whatsnew-close" className="w-11 h-11 flex items-center justify-center text-[20px] text-[var(--muted)]">
          ×
        </button>
      </div>
      <ul hidden={!open} className="pb-3.5 flex gap-2.5 overflow-x-auto px-4 snap-x snap-mandatory [scrollbar-width:none]">
        {WHATSNEW.items.map((it) => (
          <li key={it.key} className="snap-start shrink-0 w-[9.5rem]">
            <a href={it.href} data-testid={`whatsnew-${it.key}`} className="fx-press flex flex-col h-full bg-white border border-[var(--line)] p-3">
              <span className="flex items-center justify-between text-[var(--ink)]">
                <Icon name={it.icon} size={24} />
                {it.fresh && <span className="text-[10.5px] font-bold bg-[var(--ink)] text-white px-1.5 py-0.5">חדש!</span>}
              </span>
              <span className="text-[13px] font-bold leading-tight mt-2">{it.title}</span>
              <span className="text-[11.5px] text-[var(--muted)] leading-snug mt-0.5">{it.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
