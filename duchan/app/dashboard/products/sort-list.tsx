"use client";

import { useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { mediaUrl } from "@/lib/media";
import Icon from "@/app/icons";

/**
 * סידור מוצרים — גוררים באצבע.
 *
 * מרינה, 11.2026: "לשנות להם את הסדר … ממש סזיפי וידני". קודם היו ▲▼ ליד
 * כל מוצר, צעד אחד בכל לחיצה: להביא את המוצר ה-20 לראש = 19 לחיצות.
 * עכשיו: תופסים את הידית ⠿ וגוררים, או "לראש" בלחיצה אחת. הכל נשמר
 * יחד ב"סיימתי" — לא כתיבה לדאטהבייס בכל צעד.
 *
 * נגישות: הידית היא כפתור; חץ למעלה / למטה מזיזים מקלדת וקורא מסך.
 */
export default function SortList({
  products,
  onDone,
  onCancel,
}: {
  products: Product[];
  onDone: (ids: string[]) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [ids, setIds] = useState(() => products.map((p) => p.id));
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const g = useRef<{ id: string; startY: number; rowH: number; base: number } | null>(null);
  const byId = new Map(products.map((p) => [p.id, p]));
  const changed = ids.some((id, i) => id !== products[i]?.id);

  const moveTo = (id: string, to: number) =>
    setIds((cur) => {
      const from = cur.indexOf(id);
      const t = Math.max(0, Math.min(cur.length - 1, to));
      if (from === t) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(t, 0, id);
      return next;
    });

  function onDown(e: React.PointerEvent, id: string) {
    const row = (e.currentTarget as HTMLElement).closest("li");
    if (!row) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const gap = 8;
    g.current = { id, startY: e.clientY, rowH: row.getBoundingClientRect().height + gap, base: ids.indexOf(id) };
    setDrag({ id, dy: 0 });
  }

  function onMove(e: React.PointerEvent) {
    const s = g.current;
    if (!s) return;
    // ליד קצה המסך — גוללים, כדי שאפשר לגרור גם לרשימה ארוכה
    if (e.clientY < 90) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 12);
    const dy = e.clientY - s.startY;
    const target = s.base + Math.round(dy / s.rowH);
    const cur = ids.indexOf(s.id);
    if (target !== cur) moveTo(s.id, target);
    const placed = Math.max(0, Math.min(ids.length - 1, target));
    setDrag({ id: s.id, dy: dy - (placed - s.base) * s.rowH });
  }

  function onUp() {
    g.current = null;
    setDrag(null);
  }

  async function done() {
    setSaving(true);
    try {
      await onDone(ids);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="sort-list">
      <div className="sticky top-0 z-20 -mx-gutter px-gutter py-2.5 bg-[var(--canvas)] border-b border-[var(--line)] flex items-center gap-2">
        <p className="flex-1 text-[13px] leading-snug">
          <b>תופסים את</b> <Icon name="drag" size={14} tone="none" className="inline-block align-[-2px]" /> <b>וגוררים</b>
          <span className="text-[var(--muted)]"> · מה שלמעלה מופיע ראשון בדוכן</span>
        </p>
        <button onClick={onCancel} className="min-h-10 px-3 text-[13px] text-[var(--muted)]" data-testid="sort-cancel">
          ביטול
        </button>
        <button
          onClick={done}
          disabled={saving}
          className="min-h-10 px-4 bg-[var(--ink)] text-white text-[13px] font-bold disabled:opacity-50"
          data-testid="sort-done"
        >
          {saving ? "שומרים…" : changed ? "שמירה" : "סיימתי"}
        </button>
      </div>

      <ol ref={listRef} className="flex flex-col gap-2" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {ids.map((id, i) => {
          const p = byId.get(id);
          if (!p) return null;
          const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
          const dragging = drag?.id === id;
          return (
            <li
              key={id}
              data-testid="sort-row"
              data-id={id}
              className={`bg-white border flex items-center gap-3 pe-2 h-16 select-none ${
                dragging ? "border-[var(--ink)] relative z-10" : "border-[var(--line)] transition-transform"
              }`}
              style={dragging ? { transform: `translateY(${drag!.dy}px)`, boxShadow: "0 6px 18px rgba(0,0,0,.12)" } : undefined}
            >
              <button
                type="button"
                onPointerDown={(e) => onDown(e, id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") { e.preventDefault(); moveTo(id, i - 1); }
                  if (e.key === "ArrowDown") { e.preventDefault(); moveTo(id, i + 1); }
                }}
                aria-label={`גרירה: ${p.name}. מקום ${i + 1} מתוך ${ids.length}. חצים להזזה`}
                data-testid="sort-handle"
                className="w-12 h-full flex items-center justify-center text-[var(--muted)] cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
              >
                <Icon name="drag" size={20} tone="none" />
              </button>
              <span className="w-6 text-center text-[13px] font-bold text-[var(--muted)] tabular-nums">{i + 1}</span>
              <span className="w-11 h-11 shrink-0 bg-[var(--canvas)] overflow-hidden flex items-center justify-center">
                {img ? <img src={img} alt="" className="w-full h-full object-cover" draggable={false} /> : <Icon name="bag" size={16} />}
              </span>
              <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{p.name}</span>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => moveTo(id, 0)}
                  className="shrink-0 min-h-10 px-2.5 border border-[var(--line)] text-[12px] font-medium"
                  data-testid="sort-top"
                  aria-label={`${p.name} לראש הרשימה`}
                >
                  לראש ↑
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
