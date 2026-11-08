"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, confettiBurst } from "./use-store";
import HomeStall from "../home-stall";
import { storePath } from "@/lib/short-link";

/**
 * "התשלום התקבל והדוכן באוויר!" — רגע ההפעלה.
 *
 * מרינה, 11.2026: "כשהדוכן נפתח קונפטי שהתשלום הועבר והדוכן הופעל בהצלחה".
 * ההפעלה קורית אצלנו בחמ"ל, אחרי שבדקנו שהכסף הגיע — כלומר לא מול העיניים
 * של הילד/ה. לכן בפעם הראשונה שנכנסים לדשבורד אחרי ההפעלה, קופץ גיליון
 * חגיגה: הדוכן עם השם על השלט, קונפטי, והלינק לשיתוף.
 *
 * פעם אחת לכל דוכן בכל טלפון (localStorage). דוכנים שהופעלו לפני יותר
 * משבועיים לא מקבלים את החגיגה בדיעבד.
 */

const SEEN = (id: string) => `duchan-live-seen-${id}`;
const FRESH_MS = 14 * 24 * 3600_000;

export default function LiveCelebration() {
  const { store } = useStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!store?.activated_at) return;
    if (Date.now() - new Date(store.activated_at).getTime() > FRESH_MS) return;
    try {
      if (localStorage.getItem(SEEN(store.id))) return;
      localStorage.setItem(SEEN(store.id), "1");
    } catch {
      return; // בלי אחסון אין דרך לדעת שכבר הראינו — עדיף לא להציק בכל כניסה
    }
    setOpen(true);
  }, [store?.id, store?.activated_at]);

  if (!open || !store) return null;
  return <Sheet name={store.display_name} slug={store.slug} onClose={() => setOpen(false)} />;
}

function Sheet({ name, slug, onClose }: { name: string; slug: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLAnchorElement | null>(null);
  const link = typeof window !== "undefined" ? `${window.location.origin}${storePath(slug)}` : "";

  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => confettiBurst(window.innerWidth / 2, window.innerHeight * 0.38), 250 + i * 260);
    }
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[95]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-title"
        data-testid="live-celebration"
        className="kp-sheet-up fixed bottom-0 inset-x-0 max-w-md mx-auto z-[96] bg-white px-gutter pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center flex flex-col gap-3 max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="סגירה"
          className="absolute top-2 left-2 z-10 w-11 h-11 flex items-center justify-center bg-white/85 text-[var(--ink)]"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="-mx-gutter -mt-5">
          <HomeStall name={name} celebrate className="w-full max-w-[360px] mx-auto block" />
        </div>

        <h2 id="live-title" className="text-[22px] font-black leading-tight text-balance">
          התשלום התקבל, הדוכן באוויר!
        </h2>
        <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs mx-auto">
          מעכשיו כל מי שמקבל את הלינק יכול להזמין.
        </p>

        <div className="flex flex-col gap-2 mt-1">
          <a
            ref={first}
            href={`https://wa.me/?text=${encodeURIComponent(`הדוכן שלי פתוח! בואו לראות:\n${link}`)}`}
            target="_blank"
            rel="noreferrer"
            className="bg-[var(--whatsapp)] text-white py-3 text-sm font-bold"
          >
            לשתף את הדוכן בוואטסאפ
          </a>
          <button
            onClick={() => {
              try {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
            className="border-[1.5px] border-[var(--ink)] py-3 text-sm font-bold"
          >
            {copied ? "הלינק הועתק ✓" : "העתקת הלינק"}
          </button>
          {/* מרינה: "צריך כפתור של להמשיך להעלות מוצרים" — הצעד הבא אחרי הפתיחה */}
          <a
            href="/dashboard/products"
            onClick={onClose}
            className="bg-[var(--ink)] text-white py-3 text-sm font-bold"
            data-testid="live-add-products"
          >
            להמשיך להעלות מוצרים ←
          </a>
          <button onClick={onClose} className="text-sm text-[var(--muted)] underline py-2">
            סגירה
          </button>
        </div>
      </div>
    </>
  );
}
