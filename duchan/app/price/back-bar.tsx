"use client";

/**
 * חץ חזרה בראש דף המחיר — מרינה: "אין בדף הזה חץ חזרה אחורה".
 * אם הגיעו מתוך האתר חוזרים אחורה; אם נכנסו ישר מלינק — לדף הבית.
 */
export default function BackBar() {
  return (
    <div className="sticky top-0 z-20 bg-white/95 border-b border-[var(--line)]">
      <div className="max-w-lg mx-auto px-3 h-12 flex items-center">
        <a
          href="/"
          onClick={(e) => {
            if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
              e.preventDefault();
              window.history.back();
            }
          }}
          className="flex items-center gap-1.5 min-h-11 px-2 text-[14px] font-medium"
          data-testid="price-back"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
          חזרה
        </a>
      </div>
    </div>
  );
}
