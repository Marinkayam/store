"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ♿ תפריט נגישות — בכל עמוד באתר.
 *
 * כל הגדרה היא class על <html> (a11y-*), וה-CSS ב-globals.css עושה את
 * העבודה. נשמר במכשיר (localStorage) ונטען לפני הציור הראשון ע"י
 * A11Y_BOOT בפריסה, כדי שלא יהיה "קפיצה" מגודל רגיל לגדול.
 *
 * השפה פשוטה וקצרה — קוראים את זה גם ילדים בני 9.
 */

type Prefs = { size: 0 | 1 | 2; contrast: boolean; still: boolean; links: boolean; font: boolean };
const DEFAULT: Prefs = { size: 0, contrast: false, still: false, links: false, font: false };
const KEY = "duchan-a11y";

/** נטען ב-<head> לפני הציור — מחיל את ההעדפות השמורות מיד. */
export const A11Y_BOOT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var c=document.documentElement.classList;if(p.size===1)c.add("a11y-size-1");if(p.size===2)c.add("a11y-size-2");if(p.contrast)c.add("a11y-contrast");if(p.still)c.add("a11y-still");if(p.links)c.add("a11y-links");if(p.font)c.add("a11y-font");}catch(e){}`;

function apply(p: Prefs) {
  const c = document.documentElement.classList;
  c.toggle("a11y-size-1", p.size === 1);
  c.toggle("a11y-size-2", p.size === 2);
  c.toggle("a11y-contrast", p.contrast);
  c.toggle("a11y-still", p.still);
  c.toggle("a11y-links", p.links);
  c.toggle("a11y-font", p.font);
}

export default function A11yMenu() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Prefs>(DEFAULT);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setP({ ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") });
    } catch {}
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...p, ...patch };
    setP(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  // Esc סוגר, והמיקוד חוזר לכפתור
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const changed = p.size !== 0 || p.contrast || p.still || p.links || p.font;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="תפריט נגישות"
        aria-expanded={open}
        aria-controls="a11y-panel"
        data-testid="a11y-button"
        className="a11y-fab fixed left-0 top-1/2 -translate-y-1/2 z-[95] w-6 h-11 flex items-center justify-center bg-white/90 border border-l-0 border-[var(--line)] text-[var(--muted)]"
      >
        {/* לשונית צרה בצד ואייקון מצויר — לא אימוג'י גדול וכהה שמכסה כפתורים */}
        <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4" r="1.8" fill="currentColor" stroke="none" />
          <path d="M5 8.5l7 1.5 7-1.5M12 10v5M12 15l-3.5 6.5M12 15l3.5 6.5" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[96] bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            id="a11y-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-title"
            data-testid="a11y-panel"
            className="fixed left-0 top-1/2 -translate-y-1/2 z-[97] w-[min(320px,calc(100vw-24px))] max-h-[90vh] overflow-y-auto bg-white border border-[var(--ink)] p-4 text-[var(--ink)]"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="a11y-title" className="text-[16px] font-bold">♿ נגישות</h2>
              <button
                onClick={() => { setOpen(false); btnRef.current?.focus(); }}
                aria-label="סגירת תפריט הנגישות"
                className="w-11 h-11 -my-2 -ml-2 flex items-center justify-center text-[22px]"
              >
                ✕
              </button>
            </div>

            <div className="text-[13px] font-bold mb-1.5">גודל האותיות</div>
            <div className="grid grid-cols-3 gap-1 mb-4" role="radiogroup" aria-label="גודל האותיות">
              {(["רגיל", "גדול", "ענק"] as const).map((label, i) => (
                <button
                  key={label}
                  role="radio"
                  aria-checked={p.size === i}
                  onClick={() => update({ size: i as 0 | 1 | 2 })}
                  data-testid={`a11y-size-${i}`}
                  className={`min-h-11 border text-[13px] ${p.size === i ? "bg-[var(--ink)] text-white border-[var(--ink)] font-bold" : "border-[var(--line)]"}`}
                  style={{ fontSize: 13 + i * 2 }}
                >
                  א {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              {([
                ["contrast", "🌓", "צבעים חזקים", "שחור-לבן ברור, קל יותר לקרוא"],
                ["still", "⏸️", "בלי תנועה", "עוצר אנימציות וקפיצות"],
                ["links", "🔗", "לסמן קישורים", "קו מתחת לכל מה שאפשר ללחוץ"],
                ["font", "📖", "אותיות פשוטות", "גופן רגיל ורווח בין השורות"],
              ] as const).map(([k, icon, title, hint]) => (
                <button
                  key={k}
                  onClick={() => update({ [k]: !p[k] } as Partial<Prefs>)}
                  aria-pressed={p[k]}
                  data-testid={`a11y-${k}`}
                  className={`flex items-center gap-2.5 border px-3 py-2.5 text-right min-h-11 ${p[k] ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-[var(--line)]"}`}
                >
                  <span aria-hidden className="text-[18px]">{icon}</span>
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-bold">{title}</span>
                    <span className="block text-[11.5px] text-[var(--muted)]">{hint}</span>
                  </span>
                  <span aria-hidden className={`w-5 h-5 flex items-center justify-center text-[12px] ${p[k] ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>
                    {p[k] ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 gap-2">
              <button
                onClick={() => update(DEFAULT)}
                disabled={!changed}
                data-testid="a11y-reset"
                className="min-h-11 px-3 border border-[var(--line)] text-[13px] disabled:opacity-40"
              >
                ↺ לחזור לרגיל
              </button>
              <a href="/accessibility" className="text-[12.5px] underline">הצהרת נגישות</a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
