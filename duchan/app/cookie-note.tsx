"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 🍪 הודעת עוגיות — פעם אחת, בשפה של ילדים.
 *
 * בדוכן אין עוגיות פרסום ואין מעקב: רק עוגיית ההתחברות (בלעדיה צריך
 * להיכנס מחדש בכל פעם) והגדרות קטנות שנשמרות במכשיר. לכן אין כאן "לאשר
 * הכל / לסרב" — אין מה לסרב לו. רק לספר ביושר, בקצרה, ולתת קישור להסבר.
 *
 * מיקום: למטה ודביק (מרינה, 10.2026). פעם הוא כבר ישב למטה, וכיסה את שורת
 * הניווט, את הסל ואת כפתורי השמירה עד שלחצו "הבנתי". לכן עכשיו:
 *   • הוא יושב *מעל* כל פס תחתון קבוע (מסומנים data-bottom-bar: ניווט
 *     הדשבורד, הסל בדוכן, שמירה, "מוצר חדש") ונמדד מחדש כשהם זזים.
 *   • הדף מקבל ריפוד תחתון בגובה שלו, כך שאפשר לגלול כל דבר אל מעליו.
 *   • גובהו נחשף כ- --cookie-h, וכפתור "עזרה?" עולה מעליו.
 *   • גיליונות (z-40 ומעלה) נפתחים מעליו.
 */
const KEY = "duchan-cookies-ok";

export default function CookieNote() {
  const [show, setShow] = useState(false);
  const [lift, setLift] = useState(0);
  /* גיליון או חלון פתוח (מוצר, סל, הסבר…) — הבאנר מתחבא עד שנסגר.
     בדוכן הגיליונות יושבים בתוך שכבה מבודדת (.s-look), ולכן z-index שלהם
     לא עולה מעל הבאנר; בלי זה הוא כיסה את "הוספה לסל". */
  const [covered, setCovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setShow(!localStorage.getItem(KEY));
    } catch {
      setShow(false); // מצב פרטי בלי אחסון — לא נציק בכל עמוד
    }
  }, []);

  /* כמה להרים: הגובה של הפס התחתון הקבוע הכי גבוה שמוצג עכשיו */
  useEffect(() => {
    if (!show) return;
    const measure = () => {
      const vh = window.innerHeight;
      let top = vh;
      document.querySelectorAll<HTMLElement>("[data-bottom-bar]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < vh - 1 && getComputedStyle(el).visibility !== "hidden") top = Math.min(top, r.top);
      });
      setLift(Math.max(0, Math.round(vh - top)));
      const sheetOpen = [...document.querySelectorAll<HTMLElement>(".s-sheet:not([data-bottom-bar]), [role=dialog], [aria-modal=true]")].some((el) => {
        if (el.closest("[data-testid=cookie-note]")) return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top < vh - 1 && r.bottom > vh - 40 && getComputedStyle(el).visibility !== "hidden";
      });
      setCovered(sheetOpen);
      const h = ref.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--cookie-h", `${h}px`);
      document.body.style.paddingBottom = `${h}px`;
    };
    measure();
    const t = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--cookie-h");
      document.body.style.paddingBottom = "";
    };
  }, [show]);

  if (!show) return null;

  const ok = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label="עוגיות"
      data-testid="cookie-note"
      data-covered={covered ? "1" : undefined}
      aria-hidden={covered || undefined}
      className={`${covered ? "opacity-0 pointer-events-none" : ""} fixed inset-x-0 max-w-md mx-auto z-[35] bg-[var(--cream)] border-t-[1.5px] border-[var(--ink)] px-3 pt-2.5 transition-[bottom,opacity] duration-200`}
      style={{
        bottom: lift,
        // בלי פס תחתון — מתחת לשורת הבית של האייפון
        paddingBottom: lift ? "0.625rem" : "calc(0.625rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center gap-2.5">
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
