"use client";

import { useEffect, useRef, useState } from "react";

/**
 * כלים קטנים לסיפור בגלילה של דף הבית.
 *
 * useSceneProgress — כמה מהסצנה כבר נגללה, 0..1. הסצנה גבוהה מהמסך
 * (למשל 300svh) ובתוכה שכבה דביקה בגובה מסך אחד: בזמן שגוללים את הגובה
 * העודף, השכבה עומדת והתוכן בה משתנה לפי p.
 *
 * גלילה היא תנועה שהמשתמש/ת שולט/ת בה, ולכן היא נשארת גם במצב "בלי
 * תנועה". מה שנעצר שם הוא רק מה שזז לבד (ריחוף, ניצנוץ) — globals.css.
 */
export function useSceneProgress<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const calc = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const v = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : r.top < 0 ? 1 : 0;
      if (Math.abs(v - last) > 0.0015) {
        last = v;
        setP(v);
      }
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return { ref, p };
}

/** נכנס/ה למסך פעם אחת — ונשאר כך (בשביל הופעות של כרטיסים ומספרים) */
export function useInView<T extends HTMLElement = HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, seen };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** החלק של p בתוך [a, b], 0..1 */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const ease = (x: number) => 1 - Math.pow(1 - x, 3);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
