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

  /* פס דק בראש העמוד, בתוך הזרימה — לא צף מעל. כשהוא צף בתחתית הוא כיסה
     את כפתורי השמירה, הסל ושורת הניווט עד שלחצו "הבנתי". */
  return (
    /* pt עם safe-area: כשנכנסים מוואטסאפ באייפון הדף מתחיל מתחת לשורת השעון
       (viewportFit: cover), והפס "התחבא" שם. ככה הוא תמיד מתחת לה. */
    <div role="region" aria-label="עוגיות" data-testid="cookie-note" className="bg-[var(--cream)] border-b border-[var(--line)] px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <div className="max-w-md mx-auto flex items-center gap-2.5">
        <span className="text-[22px] leading-none" aria-hidden>🍪</span>
        <p className="flex-1 min-w-0 text-[12.5px] leading-snug text-[var(--ink)]">
          <b>ואי עוגיות, יאמי!</b> הן זוכרות שנכנסתם. בלי פרסומות ובלי מעקב.{" "}
          <a href="/privacy#cookies" className="underline whitespace-nowrap">מה זה עוגיות?</a>
        </p>
        <button onClick={ok} data-testid="cookie-ok" className="shrink-0 min-h-11 px-3 bg-[var(--ink)] text-white text-[12.5px] font-bold">
          הבנתי 👍
        </button>
      </div>
    </div>
  );
}
