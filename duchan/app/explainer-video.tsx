"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * סרטוני הסבר קצרים, בקול של מרינה, עם המסכים האמיתיים של האפליקציה.
 *
 * - open: איך פותחים את הדוכן. מרינה, 11.2026: "ילדים לא מבינים שצריך לשלם
 *   בביט 20 שח כדי שהדוכן ייפתח". שולחים להורים, ההורים משלמים בביט,
 *   לוחצים "שילמנו", אנחנו בודקים, והדוכן נפתח.
 * - products: איך מוסיפים מוצרים ומה אפשר לעשות איתם (צבעים ומידות, מבצע,
 *   שקית הפתעה, דרופ, כמה בבת אחת) — "כדי שילדים יתלהבו לפתוח".
 * - parents: להורים, בדף שהם מקבלים בלינק. מה זה דוכן, מה לומדים מלנהל
 *   אותו ("תסביר להורים מה לומדים בזה שמקימים את הדוכן"), בטיחות, ואיך
 *   משלמים בביט. שם הנפילה הגדולה: דוכנים עם מוצרים שלא הגיעו לתשלום.
 *
 * סגור כברירת מחדל: שורה אחת עם כפתור ניגון, כדי לא להאריך את המסך. בלחיצה
 * הסרטון נפתח במקום ומתנגן עם קול. הקובץ (כ-3MB) לא נטען עד שלוחצים.
 * הכתוביות צרובות בסרטון, כך שאפשר לצפות גם בלי קול.
 */
const VIDEOS = {
  open: { file: "how-to-open", title: "איך פותחים את הדוכן?", length: "45 שניות" },
  products: { file: "how-to-add-products", title: "איך מוסיפים מוצרים, ומה אפשר לעשות?", length: "48 שניות" },
  parents: { file: "for-parents", title: "מה זה דוכן, מה לומדים בו, ואיך משלמים", length: "דקה" },
} as const;

export default function ExplainerVideo({ which, className = "" }: { which: keyof typeof VIDEOS; className?: string }) {
  const v = VIDEOS[which];
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
    <div className={`w-full bg-white border border-[var(--line)] ${className}`} data-testid={`video-${which}`}>
      {!open && (
        <button onClick={play} data-testid={`video-${which}-play`} className="w-full flex items-center gap-3 p-3 text-start">
          <span className="w-12 h-12 shrink-0 bg-[var(--ink)] flex items-center justify-center" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-snug">{v.title}</span>
            <span className="block text-[12.5px] text-[var(--muted)] mt-0.5">סרטון של {v.length}</span>
          </span>
        </button>
      )}
      {/* הסרטון נשאר בדף גם כשהוא סגור (preload="none" — לא נטען), כדי
          שהלחיצה תוכל להפעיל אותו מיד */}
      <div className={open ? "p-3" : "hidden"}>
        <video
          ref={video}
          src={`/video/${v.file}.mp4`}
          poster={`/video/${v.file}.webp`}
          preload="none"
          controls
          playsInline
          aria-label={`סרטון הסבר: ${v.title}`}
          className="block mx-auto w-auto max-w-full max-h-[70vh] aspect-[9/16] bg-[var(--canvas)]"
        />
        <button onClick={close} className="mt-1 w-full min-h-11 text-[13px] text-[var(--muted)] underline">
          סגירת הסרטון
        </button>
      </div>
    </div>
  );
}
