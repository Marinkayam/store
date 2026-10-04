"use client";

import { useEffect, useState } from "react";

/**
 * "להוסיף את הדוכן למסך הבית" — הדוכן כאפליקציה בטלפון.
 *
 * מזהה את הטלפון ואת הדפדפן ומציג בדיוק מה לעשות שם — לא הוראות כלליות:
 *   • אנדרואיד + כרום (beforeinstallprompt) — כפתור אחד, התקנה אמיתית.
 *   • אנדרואיד בלי האירוע (סמסונג, או שכבר הוצע) — צעדים לתפריט הנכון.
 *   • אייפון בספארי — שלושה צעדים, עם אייקון השיתוף כמו שהוא נראה.
 *   • אייפון בכרום — אותו דבר, אבל כפתור השיתוף יושב למעלה ליד הכתובת.
 *   • דפדפן בתוך אפליקציה (אינסטגרם, פייסבוק, טיקטוק) — משם אי אפשר
 *     להוסיף בכלל. מסבירים לפתוח בספארי/כרום, עם כפתור להעתקת הלינק.
 *   • כבר מותקן (display-mode: standalone) — לא מציגים כלום.
 *   • מחשב — לא מציגים (זה לטלפון).
 *
 * force — להציג גם אם נסגר קודם ("לא עכשיו"). כך המקטע ב"החנות שלי"
 * תמיד זמין, והכרטיס בהזמנות לא מציק למי שסגרה אותו.
 */

type Platform =
  | { kind: "installed" }
  | { kind: "desktop" }
  | { kind: "android" }
  | { kind: "ios"; browser: "safari" | "chrome" | "other" }
  | { kind: "inapp"; ios: boolean };

const DISMISS_KEY = "duchan-install-dismissed";

function detect(): Platform {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return { kind: "installed" };
  const ua = window.navigator.userAgent;
  // אייפד חדש מדווח על עצמו כמק — לכן בודקים גם מגע
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (/FBAN|FBAV|Instagram|TikTok|musical_ly|Snapchat|Line\//.test(ua)) return { kind: "inapp", ios };
  if (ios) return { kind: "ios", browser: /CriOS/.test(ua) ? "chrome" : /FxiOS|EdgiOS|OPiOS/.test(ua) ? "other" : "safari" };
  if (android) return { kind: "android" };
  return { kind: "desktop" };
}

export default function InstallCard({ force = false }: { force?: boolean }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detect());
    try {
      setDismissed(!!localStorage.getItem(DISMISS_KEY));
    } catch {
      /* מצב פרטי — פשוט מציגים */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform) return null;
  if (platform.kind === "installed" || done) {
    return force ? (
      <div className="bg-white border border-[var(--line)] p-3.5 text-[13px]" data-testid="install-done">
        ✅ הדוכן כבר על מסך הבית — נכנסים מהאייקון, כמו כל אפליקציה.
      </div>
    ) : null;
  }
  if (platform.kind === "desktop") {
    return force ? (
      <div className="bg-white border border-[var(--line)] p-3.5 text-[13px] text-[var(--muted)]" data-testid="install-desktop">
        זה עובד בטלפון: פותחים את הדוכן בטלפון, ושם מופיעות ההוראות לאייפון או לאנדרואיד.
      </div>
    ) : null;
  }
  if (dismissed && !force) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setDone(true);
    setPrompt(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/dashboard");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const device = platform.kind === "android" || (platform.kind === "inapp" && !platform.ios) ? "אנדרואיד" : "אייפון";

  return (
    <div className="bg-white border-[1.5px] border-[var(--olive)] p-3.5" data-testid="install-card" data-platform={platform.kind}>
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="w-11 h-11 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold">📲 הדוכן כאפליקציה בטלפון</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            אייקון במסך הבית — נכנסים בלחיצה אחת, בלי לחפש את הקישור.
          </p>
          <span className="inline-block mt-1.5 text-[11px] font-bold bg-[var(--canvas)] border border-[var(--line)] px-2 py-0.5" data-testid="install-device">
            זיהינו: {device}
          </span>
        </div>
        {!force && (
          <button onClick={dismiss} aria-label="לא עכשיו" className="shrink-0 w-8 h-8 text-[var(--muted)] text-[17px] leading-none">
            ×
          </button>
        )}
      </div>

      {/* דפדפן בתוך אפליקציה — קודם לצאת ממנו */}
      {platform.kind === "inapp" && (
        <div className="mt-3" data-testid="install-inapp">
          <p className="text-[12.5px] leading-relaxed">
            מתוך {platform.ios ? "אינסטגרם / פייסבוק" : "האפליקציה הזו"} אי אפשר להוסיף למסך הבית. פותחים את הדוכן ב
            {platform.ios ? <b>ספארי</b> : <b>כרום</b>}:
          </p>
          <Steps
            items={[
              <>לוחצים על <b>⋯</b> בפינה, ובוחרים <b>&quot;פתיחה ב{platform.ios ? "ספארי" : "דפדפן"}&quot;</b></>,
              <>שם מופיעות ההוראות להוספה</>,
            ]}
          />
          <button onClick={copyLink} className="mt-2.5 w-full border border-[var(--line)] py-2.5 text-[13px] font-semibold min-h-11">
            {copied ? "✓ הלינק הועתק" : "📋 להעתיק את הלינק (ולהדביק בדפדפן)"}
          </button>
        </div>
      )}

      {/* אנדרואיד עם התקנה אמיתית */}
      {platform.kind === "android" && prompt && (
        <button
          onClick={install}
          data-testid="install-now"
          className="mt-3 w-full bg-[var(--ink)] text-white py-3 text-[14px] font-bold min-h-11"
        >
          📲 להוסיף למסך הבית
        </button>
      )}

      {/* אנדרואיד בלי האירוע */}
      {platform.kind === "android" && !prompt && (
        <div data-testid="install-android-steps">
          <Steps
            items={[
              <>לוחצים על <b>⋮</b> (שלוש נקודות) למעלה בדפדפן</>,
              <>בוחרים <b>&quot;הוספה למסך הבית&quot;</b> או <b>&quot;התקנת אפליקציה&quot;</b></>,
              <>לוחצים <b>&quot;הוספה&quot;</b> — וזהו</>,
            ]}
          />
          <p className="text-[11.5px] text-[var(--muted)] mt-1.5">בסמסונג: התפריט ☰ למטה ← &quot;הוספת דף ל&quot; ← &quot;מסך הבית&quot;.</p>
        </div>
      )}

      {/* אייפון */}
      {platform.kind === "ios" && (
        <div data-testid="install-ios-steps" data-browser={platform.browser}>
          {platform.browser === "other" ? (
            <p className="mt-3 text-[12.5px] leading-relaxed">
              בדפדפן הזה אין הוספה למסך הבית. פותחים את הדוכן ב<b>ספארי</b>, ושם מופיעות ההוראות.
            </p>
          ) : (
            <Steps
              items={[
                <>
                  לוחצים על כפתור השיתוף <ShareGlyph />{" "}
                  {platform.browser === "chrome" ? "למעלה, ליד הכתובת" : "בתחתית המסך (או ליד הכתובת)"}
                </>,
                <>גוללים ובוחרים <b>&quot;הוספה למסך הבית&quot;</b></>,
                <>לוחצים <b>&quot;הוספה&quot;</b> — וזהו</>,
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-2 text-[12.5px] leading-relaxed">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="w-5 h-5 shrink-0 bg-[var(--ink)] text-white flex items-center justify-center text-[11px] mt-0.5">{i + 1}</span>
          <span className="flex-1">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** אייקון השיתוף של אייפון — ריבוע עם חץ למעלה. */
function ShareGlyph() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 border border-[var(--line)] align-middle bg-white" aria-label="כפתור השיתוף">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0a84ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 v11" />
        <path d="M8.5 6.5 L12 3 l3.5 3.5" />
        <path d="M6 11 H4.5 v9.5 h15 V11 H18" />
      </svg>
    </span>
  );
}

/** האירוע של כרום באנדרואיד — עוד לא בטיפוסים הסטנדרטיים של TypeScript. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
