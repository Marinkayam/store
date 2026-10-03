"use client";

import { useEffect, useState } from "react";

/**
 * 🍪 הודעת עוגיות — פעם אחת, בשפה של ילדים.
 *
 * בדוכן אין עוגיות פרסום ואין מעקב: רק עוגיית ההתחברות (בלעדיה צריך
 * להיכנס מחדש בכל פעם) והגדרות קטנות שנשמרות במכשיר. לכן אין כאן "לאשר
 * הכל / לסרב" — אין מה לסרב לו. רק לספר ביושר, בקצרה, ולתת קישור להסבר.
 */
const KEY = "duchan-cookies-ok";

export default function CookieNote() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(!localStorage.getItem(KEY));
    } catch {
      setShow(false); // מצב פרטי בלי אחסון — לא נציק בכל עמוד
    }
  }, []);

  if (!show) return null;

  const ok = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="עוגיות"
      data-testid="cookie-note"
      className="fixed inset-x-0 bottom-0 z-[90] max-w-md mx-auto px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="bg-white border border-[var(--ink)] p-3.5 flex items-start gap-3">
        <span className="text-[26px] leading-none" aria-hidden>🍪</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-relaxed text-[var(--ink)]">
            <b>עוגיות? רק הקטנות שצריך.</b> הן זוכרות שנכנסתם, כדי שלא תצטרכו קוד בכל פעם.
            בלי פרסומות ובלי מעקב.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={ok} data-testid="cookie-ok" className="min-h-11 px-4 bg-[var(--ink)] text-white text-[13px] font-bold">
              הבנתי 👍
            </button>
            <a href="/privacy#cookies" className="text-[12.5px] underline text-[var(--ink)]">
              מה זה עוגיות?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
