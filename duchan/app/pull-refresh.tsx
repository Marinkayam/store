"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { hasUnsaved } from "@/lib/unsaved";

/**
 * משיכה למטה ← רענון, עם הגג של הדוכן שמציץ מלמעלה.
 *
 * באפליקציה שבמסך הבית (במיוחד באייפון) אין רענון במשיכה — אז זה שלנו.
 * הגג (הקשתות סגול/שמנת והקורה מעץ, כמו בציור של הדוכן) יורד עם האצבע,
 * שקוף בהתחלה ומתמלא ככל שמושכים. אחרי הסף: "לשחרר לרענון". בשחרור —
 * הגג מתנדנד קלות והעמוד מתרענן.
 *
 * לא מתחיל:
 *   • כשהעמוד לא בראש (גוללים רגיל)
 *   • בתוך גיליון/חלון (מוצר, סל, עורך — הם fixed) ובשדות טקסט
 *   • בסקוויש קלאב (מוצר נפרד, תנועות משלו)
 * ולא מרענן כשיש שינויים שלא נשמרו ב"הדוכן שלי" — אומר את זה במקום.
 *
 * html.ptr-on מכבה את הרענון של הדפדפן עצמו (overscroll-behavior), כדי
 * שלא יהיו שניים בבת אחת.
 */
const THRESHOLD = 72;
const MAX = 120;
const SCALLOPS = 9;

export default function PullRefresh() {
  const path = usePathname() ?? "";
  const off = path.startsWith("/squish");
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<"idle" | "loading" | "blocked">("idle");
  const pullRef = useRef(0);

  useEffect(() => {
    if (off) return;
    document.documentElement.classList.add("ptr-on");
    let startY: number | null = null;
    let active = false;

    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.target as Element | null;
      if (t?.closest(".fixed, [role=dialog], input, textarea, select, [data-no-ptr]")) return;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0);
        return;
      }
      // התנגדות: ככל שמושכים יותר, זז פחות
      set(Math.min(MAX, dy * 0.55));
      if (dy > 8 && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      startY = null;
      if (pullRef.current < THRESHOLD) return set(0);
      if (hasUnsaved()) {
        setPhase("blocked");
        set(64);
        setTimeout(() => { setPhase("idle"); set(0); }, 1800);
        return;
      }
      setPhase("loading");
      set(64);
      // רגע קצר לגג שמתנדנד — ואז רענון אמיתי של העמוד
      setTimeout(() => window.location.reload(), 450);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      document.documentElement.classList.remove("ptr-on");
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [off]);

  if (off || (pull === 0 && phase === "idle")) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = pull >= THRESHOLD;
  const label =
    phase === "loading" ? "מרעננים…" : phase === "blocked" ? "יש שינויים שלא נשמרו — שומרים קודם" : ready ? "לשחרר לרענון ↑" : "למשוך לרענון ↓";
  const w = 390 / SCALLOPS;

  return (
    <div
      aria-hidden={phase === "idle"}
      role={phase === "loading" ? "status" : undefined}
      data-testid="pull-refresh"
      data-phase={phase}
      className="fixed top-0 inset-x-0 z-[94] pointer-events-none flex flex-col items-center"
      style={{ height: pull, transition: active(phase) ? "height .2s ease" : undefined }}
    >
      <svg
        viewBox="0 0 390 40"
        preserveAspectRatio="none"
        className={`w-full max-w-md h-10 ${phase === "loading" ? "ptr-sway" : ""}`}
        style={{ opacity: 0.25 + progress * 0.65, transform: `translateY(${Math.min(0, pull - 40)}px)` }}
      >
        <rect x="0" y="0" width="390" height="7" fill="var(--wood)" />
        {Array.from({ length: SCALLOPS }, (_, i) => (
          <path
            key={i}
            d={`M${i * w} 7 h${w} v14 a${w / 2} ${w / 2.6} 0 0 1 ${-w} 0 z`}
            fill={i % 2 ? "var(--cream)" : "var(--lavender)"}
            stroke="var(--wood)"
            strokeWidth="1.2"
          />
        ))}
      </svg>
      <span
        className="mt-1 text-[11.5px] font-bold text-[var(--ink)] bg-white/90 px-2 py-0.5"
        style={{ opacity: progress }}
        data-testid="pull-refresh-label"
      >
        {label}
      </span>
    </div>
  );
}

const active = (phase: string) => phase !== "idle";
