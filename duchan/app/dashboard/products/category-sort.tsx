"use client";

import { useRef, useState } from "react";
import Icon from "@/app/icons";

/**
 * סידור הקטגוריות — גוררים באצבע, כמו סידור המוצרים (sort-list.tsx).
 *
 * בקשה של בעלת דוכן, 11.2026: "תיכף חנוכה … כדי שחנוכה יהיה בקטגוריה
 * הראשונה אני צריכה למחוק את הכל ולשים אותו ראשון". הסדר ברשימה הוא הסדר
 * שבו הקטגוריות מופיעות לקונים בדוכן, ועד עכשיו הוא היה סדר ההוספה בלבד.
 *
 * תופסים את הידית וגוררים, או "לראש" בלחיצה אחת. נשמר יחד ב"שמירה".
 * נגישות: הידית היא כפתור; חץ למעלה / למטה מזיזים מקלדת וקורא מסך.
 */
export default function CategorySort({
  categories,
  counts,
  onDone,
  onCancel,
}: {
  categories: string[];
  counts: Map<string, number>;
  onDone: (next: string[]) => Promise<unknown> | void;
  onCancel: () => void;
}) {
  const [order, setOrder] = useState(categories);
  const [drag, setDrag] = useState<{ c: string; dy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const g = useRef<{ c: string; startY: number; rowH: number; base: number } | null>(null);
  const changed = order.some((c, i) => c !== categories[i]);

  const moveTo = (c: string, to: number) =>
    setOrder((cur) => {
      const from = cur.indexOf(c);
      const t = Math.max(0, Math.min(cur.length - 1, to));
      if (from === t) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(t, 0, c);
      return next;
    });

  function onDown(e: React.PointerEvent, c: string) {
    const row = (e.currentTarget as HTMLElement).closest("li");
    if (!row) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const gap = 6;
    g.current = { c, startY: e.clientY, rowH: row.getBoundingClientRect().height + gap, base: order.indexOf(c) };
    setDrag({ c, dy: 0 });
  }

  function onMove(e: React.PointerEvent) {
    const s = g.current;
    if (!s) return;
    // ליד קצה המסך — גוללים, כדי שאפשר לגרור גם ברשימה ארוכה
    if (e.clientY < 90) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
    const dy = e.clientY - s.startY;
    const target = s.base + Math.round(dy / s.rowH);
    if (target !== order.indexOf(s.c)) moveTo(s.c, target);
    const placed = Math.max(0, Math.min(order.length - 1, target));
    setDrag({ c: s.c, dy: dy - (placed - s.base) * s.rowH });
  }

  function onUp() {
    g.current = null;
    setDrag(null);
  }

  async function done() {
    if (!changed) return onCancel();
    setSaving(true);
    try {
      await onDone(order);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="category-sort">
      <div className="sticky top-0 z-20 bg-white py-2 flex items-center gap-2 border-b border-[var(--line)] mb-3">
        <p className="flex-1 text-[12.5px] leading-snug text-[var(--muted)]">
          מה שלמעלה מופיע ראשון בדוכן
        </p>
        <button onClick={onCancel} className="min-h-10 px-3 text-[13px] text-[var(--muted)]" data-testid="category-sort-cancel">
          ביטול
        </button>
        <button
          onClick={done}
          disabled={saving}
          className="min-h-10 px-4 bg-[var(--ink)] text-white text-[13px] font-bold disabled:opacity-50"
          data-testid="category-sort-done"
        >
          {saving ? "שומרים…" : changed ? "שמירה" : "סיימתי"}
        </button>
      </div>

      <ol className="flex flex-col gap-1.5" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {order.map((c, i) => {
          const dragging = drag?.c === c;
          return (
            <li
              key={c}
              data-testid="category-sort-row"
              className={`bg-white border flex items-center gap-2 pe-2 h-12 select-none ${
                dragging ? "border-[var(--ink)] relative z-10 bg-[var(--canvas)]" : "border-[var(--line)] transition-transform"
              }`}
              style={dragging ? { transform: `translateY(${drag!.dy}px)` } : undefined}
            >
              <button
                type="button"
                onPointerDown={(e) => onDown(e, c)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") { e.preventDefault(); moveTo(c, i - 1); }
                  if (e.key === "ArrowDown") { e.preventDefault(); moveTo(c, i + 1); }
                }}
                aria-label={`גרירה: ${c}. מקום ${i + 1} מתוך ${order.length}. חצים להזזה`}
                data-testid="category-sort-handle"
                className="w-11 h-full flex items-center justify-center text-[var(--muted)] cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
              >
                <Icon name="drag" size={18} tone="none" />
              </button>
              <span className="w-5 text-center text-[12.5px] font-bold text-[var(--muted)] tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{c}</span>
              <span className="text-[11.5px] text-[var(--muted)] shrink-0">{counts.get(c) ?? 0}</span>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => moveTo(c, 0)}
                  className="shrink-0 min-h-9 px-2.5 border border-[var(--line)] text-[12px] font-medium"
                  data-testid="category-sort-top"
                  aria-label={`${c} לראש הרשימה`}
                >
                  לראש ↑
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
