"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore, confettiBurst } from "../use-store";
import { KupaStall, Coin, Medal } from "@/app/kupa-art";
import type { BadgeState } from "@/lib/kupa";
import { storePath } from "@/lib/short-link";
import { fetchKupa, readSeen, writeSeen, useNight, KUPA_CHECK, type KupaData } from "./use-kupa";

/**
 * רגע החגיגה של קופת הדוכן — יושב ב-layout של הדשבורד ובודק אחרי כל
 * מעבר מסך, ואחרי כל פעולה שיורה kupaCheck() (מוצר נשמר, הזמנה שולמה…).
 *
 * שלושה סוגים:
 *   welcome — הפעם הראשונה שהקופה נפתחת בטלפון הזה, לדוכן שכבר עשה דברים
 *   level   — עלייה ברמה: הדוכן נבנה מחדש מול העיניים
 *   badge   — אות חדש: המדליה מסתובבת, מטבעות קופצים לקופה
 *
 * תמיד אחת בכל פעם, אף פעם לא באמצע עריכה (רק אחרי שמירה או מעבר מסך),
 * ואף פעם לא מעל מסך "הדוכן שלך באוויר" של המוצר הראשון.
 */

type Show = {
  kind: "welcome" | "level" | "badge";
  kupa: KupaData;
  fresh: BadgeState[];
  from: number;
};

export default function KupaCelebrate() {
  const { store } = useStore();
  const path = usePathname();
  const [show, setShow] = useState<Show | null>(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!store || busy.current || show) return;
    if (document.querySelector("[data-testid=first-product-celebration]")) return;
    // בדיקות אוטומטיות שלא בודקות את הקופה מדליקות את זה (e2e/helpers/sms.mjs)
    try {
      if (localStorage.getItem("kupa-quiet")) return;
    } catch {}
    busy.current = true;
    try {
      const k = await fetchKupa(store.id);
      if (!k) return;
      const seen = readSeen(store.id);
      const reached = k.badges.filter((b) => b.reached);
      if (!seen) {
        writeSeen(store.id, k);
        setShow({ kind: reached.length > 1 ? "welcome" : "badge", kupa: k, fresh: reached, from: 0 });
        return;
      }
      const fresh = reached.filter((b) => !seen.badges.includes(b.key));
      const levelUp = k.level > seen.level;
      writeSeen(store.id, k);
      if (!fresh.length && !levelUp) return;
      setShow({ kind: levelUp ? "level" : "badge", kupa: k, fresh, from: seen.coins ?? 0 });
    } finally {
      busy.current = false;
    }
  }, [store, show]);

  useEffect(() => {
    const t = setTimeout(check, 700);
    return () => clearTimeout(t);
  }, [path, check]);

  useEffect(() => {
    const onCheck = () => setTimeout(check, 400);
    const onVis = () => document.visibilityState === "visible" && check();
    window.addEventListener(KUPA_CHECK, onCheck);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(KUPA_CHECK, onCheck);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [check]);

  if (!show || !store) return null;
  return <Sheet show={show} published={!!store.activated_at} onClose={() => setShow(null)} />;
}

function useCountUp(from: number, to: number, delay = 450) {
  const [n, setN] = useState(from);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) {
      setN(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      setN(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay]);
  return n;
}

function Sheet({ show, published, onClose }: { show: Show; published: boolean; onClose: () => void }) {
  const { kupa, fresh, kind } = show;
  const count = useCountUp(show.from, kupa.coins);
  const [night] = useNight();
  const first = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    confettiBurst(window.innerWidth / 2, window.innerHeight * 0.42);
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // האות "הכי גדול" מבין החדשים — הוא שקובע את הכותרת והשיתוף
  const top = [...fresh].sort((a, b) => b.coins - a.coins)[0];
  const gained = kind === "welcome" ? kupa.coins : Math.max(0, kupa.coins - show.from);
  const title =
    kind === "welcome" ? "פתחנו לך קופה!" : kind === "level" ? `הדוכן עלה רמה: ${kupa.levelName}` : top?.title ?? "אות חדש";
  const text =
    kind === "welcome"
      ? `על כל מה שכבר עשית בדוכן אספת ${kupa.coins} מטבעות דוכן. כל צעד חדש מוסיף עוד, והדוכן גדל.`
      : kind === "level"
        ? "המטבעות שאספת שדרגו את הדוכן. ככה הוא נראה עכשיו."
        : top?.lesson ?? "";
  const shareLine = kind === "level" ? `הדוכן שלי עלה לרמה ${kupa.level + 1}: ${kupa.levelName} 🎪 בואו לראות 👇` : top?.share;
  const link = typeof window !== "undefined" ? `${window.location.origin}${storePath(kupa.slug)}` : "";
  const canShare = published && !!shareLine && kind !== "welcome";
  const lessonKey = kind === "badge" && top ? `?badge=${top.key}` : "";

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[90]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kupa-cele-title"
        data-testid="kupa-celebrate"
        data-kind={kind}
        className="kp-sheet-up fixed bottom-0 inset-x-0 max-w-md mx-auto z-[91] bg-white px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center flex flex-col gap-3 max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="סגירה"
          data-testid="kupa-x"
          className="absolute top-2 left-2 z-10 w-11 h-11 flex items-center justify-center bg-white/85 text-[var(--ink)]"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className={kind === "badge" && top ? "relative mx-auto" : "-mx-5 -mt-5"}>
          {kind === "badge" && top ? (
            <div className="relative w-[96px] h-[96px] mx-auto">
              <Medal icon={top.icon} reached size={96} className="kp-flip" />
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className="kp-coin-pop top-8 left-9"
                  style={{ ["--dx" as string]: `${(i - 2) * 26}px`, animationDelay: `${0.5 + i * 0.08}s` } as React.CSSProperties}
                >
                  <Coin size={22} />
                </span>
              ))}
            </div>
          ) : (
            /* האיור פרוס על כל רוחב הדף, בלי מסגרת — מרינה */
            <KupaStall level={kupa.level} name={kupa.name} build={kupa.level} night={night} deco={kupa.deco} className="w-full block" />
          )}
        </div>

        <h2 id="kupa-cele-title" className="text-[21px] font-black leading-tight text-balance">{title}</h2>

        <div className="flex items-center justify-center gap-3" aria-live="polite">
          {gained > 0 && (
            <span className="flex items-center gap-1 text-[18px] font-black text-[var(--wood)] tabular-nums">
              +{gained}
              <Coin size={20} />
            </span>
          )}
          <span className="text-[13px] text-[var(--muted)] tabular-nums" data-testid="kupa-celebrate-total">
            בקופה: <b className="text-[var(--ink)]">{count}</b>
          </span>
        </div>

        {text && <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs mx-auto">{text}</p>}

        {fresh.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1.5" aria-label="האותות החדשים">
            {fresh.map((b) => (
              <span key={b.key} className="flex items-center gap-1 bg-[var(--canvas)] px-2 py-1 text-[12px] font-bold">
                <Medal icon={b.icon} reached size={18} />
                {b.title}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          {canShare ? (
            <a
              ref={(el) => {
                first.current = el;
              }}
              href={`https://wa.me/?text=${encodeURIComponent(`${shareLine}\n${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="kupa-share"
              className="bg-[var(--whatsapp)] text-white py-3.5 text-[15px] font-bold"
            >
              לשתף בוואטסאפ
            </a>
          ) : null}
          <a
            ref={(el) => {
              if (!canShare) first.current = el;
            }}
            href={`/dashboard/kupa${lessonKey}`}
            data-testid="kupa-open"
            className={canShare ? "border-[1.5px] border-[var(--ink)] py-3 text-[14px] font-bold" : "bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold"}
          >
            {kind === "badge" ? "לפתור את החידה של האות" : "לראות את הקופה"}
          </a>
          <button onClick={onClose} data-testid="kupa-close" className="py-2 text-[13px] text-[var(--muted)] underline">
            סגירה
          </button>
        </div>
      </div>
    </>
  );
}
