"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * "איך פותחים את הדוכן?" — סרטון הסבר של 45 שניות, בקול של מרינה.
 *
 * מרינה, 11.2026: "ילדים לא מבינים שצריך לשלם בביט 20 שח כדי שהדוכן ייפתח".
 * הסרטון מראה את המסכים האמיתיים: שולחים להורים, ההורים משלמים בביט,
 * לוחצים "שילמנו", אנחנו בודקים, והדוכן נפתח.
 *
 * סגור כברירת מחדל: שורה אחת עם כפתור ניגון, כדי לא להאריך את המסך. בלחיצה
 * הסרטון נפתח במקום ומתנגן עם קול. הקובץ (3MB) לא נטען עד שלוחצים.
 * הכתוביות צרובות בסרטון, כך שאפשר לצפות גם בלי קול.
 */
export default function HowToOpenVideo({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);

  function play() {
    // flushSync: הסרטון חייב להיות על המסך ולהתחיל לנגן בתוך אותה לחיצה,
    // אחרת ספארי באייפון חוסם ניגון עם קול.
    flushSync(() => setOpen(true));
    video.current?.play().catch(() => {});
  }

  function close() {
    video.current?.pause();
    setOpen(false);
  }

  return (
    <div className={`bg-white border border-[var(--line)] ${className}`} data-testid="how-to-open">
      {!open && (
        <button
          onClick={play}
          data-testid="how-to-open-play"
          className="w-full flex items-center gap-3 p-3 text-start"
        >
          <span className="relative w-12 h-12 shrink-0 bg-[var(--ink)] flex items-center justify-center" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">איך פותחים את הדוכן?</span>
            <span className="block text-[12.5px] text-[var(--muted)] mt-0.5">סרטון של 45 שניות</span>
          </span>
        </button>
      )}
      {/* הסרטון נשאר בדף גם כשהוא סגור (preload="none" — לא נטען), כדי
          שהלחיצה תוכל להפעיל אותו מיד */}
      <div className={open ? "p-3" : "hidden"}>
        <video
          ref={video}
          src="/video/how-to-open.mp4"
          poster="/video/how-to-open.webp"
          preload="none"
          controls
          playsInline
          aria-label="סרטון הסבר: איך פותחים את הדוכן"
          className="block mx-auto w-auto max-w-full max-h-[70vh] aspect-[9/16] bg-[var(--canvas)]"
        />
        <button onClick={close} className="mt-1 w-full min-h-11 text-[13px] text-[var(--muted)] underline">
          סגירת הסרטון
        </button>
      </div>
    </div>
  );
}
