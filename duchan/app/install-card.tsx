"use client";

import { useEffect, useState } from "react";

/**
 * "להוסיף למסך הבית" — הכרטיס שהופך את הדוכן לאפליקציה על הטלפון.
 *
 * למה זה בכלל צריך רכיב ולא רק manifest: באנדרואיד הדפדפן מציע את זה לבד
 * רק אחרי כמה ביקורים, ובאייפון הוא לא מציע את זה אף פעם — שם זה קיים רק
 * בתוך תפריט השיתוף של ספארי, ואף ילדה לא תמצא אותו לבד.
 *
 * שלושה מצבים:
 * 1. כבר מותקן (display-mode: standalone) — לא מציגים כלום.
 * 2. אנדרואיד/כרום — תופסים את beforeinstallprompt ומתקינים בלחיצה אחת.
 * 3. אייפון — אין API להתקנה, אז מסבירים בשלושה צעדים עם האייקון הנכון.
 */
export default function InstallCard() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // כבר במסך הבית? אין מה להציע.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem("duchan-install-dismissed")) return;

    const ua = window.navigator.userAgent;
    // אייפד חדש מדווח על עצמו כמק, אז בודקים גם מגע
    const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setIos(isIos);
    setHidden(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem("duchan-install-dismissed", "1");
    setHidden(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setHidden(true);
    setPrompt(null);
  }

  if (hidden) return null;

  return (
    <div className="bg-white border-[1.5px] border-[var(--olive)] p-3">
      <div className="flex items-start gap-3">
        <img src="/icon.svg" alt="" className="w-10 h-10 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold">להוסיף את הדוכן למסך הבית</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            ואז נכנסים בלחיצה אחת, כמו כל אפליקציה, בלי לחפש את הקישור בכל פעם.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="לא עכשיו"
          className="shrink-0 w-6 h-6 text-[var(--muted)] text-[15px] leading-none"
        >
          ×
        </button>
      </div>

      {/* אנדרואיד: התקנה אמיתית בלחיצה */}
      {!ios && prompt && (
        <button onClick={install} className="mt-2.5 w-full bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold">
          להוסיף עכשיו
        </button>
      )}

      {/* אייפון: אין התקנה אוטומטית, רק הוראות */}
      {ios && !open && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2.5 w-full bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold"
        >
          איך עושים את זה באייפון?
        </button>
      )}
      {ios && open && (
        <ol className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-relaxed">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 bg-[var(--ink)] text-white flex items-center justify-center text-[11px]">1</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              לוחצים על כפתור השיתוף למטה במסך
              <ShareGlyph />
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 bg-[var(--ink)] text-white flex items-center justify-center text-[11px]">2</span>
            <span>גוללים ובוחרים <b>&quot;הוספה למסך הבית&quot;</b></span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 bg-[var(--ink)] text-white flex items-center justify-center text-[11px]">3</span>
            <span>לוחצים <b>&quot;הוספה&quot;</b>, וזהו</span>
          </li>
        </ol>
      )}

      {/* אין beforeinstallprompt ולא אייפון: דפדפן שלא תומך, או שכבר הוצע */}
      {!ios && !prompt && (
        <p className="mt-2 text-[12px] text-[var(--muted)] leading-relaxed">
          בתפריט הדפדפן (שלוש נקודות) בוחרים <b>&quot;הוספה למסך הבית&quot;</b>.
        </p>
      )}
    </div>
  );
}

/** אייקון השיתוף של אייפון — ריבוע עם חץ למעלה. */
function ShareGlyph() {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 border border-[var(--line)] align-middle"
      aria-label="כפתור השיתוף"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0a84ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 v11" />
        <path d="M8.5 6.5 L12 3 l3.5 3.5" />
        <path d="M6 11 H4.5 v9.5 h15 V11 H18" />
      </svg>
    </span>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
