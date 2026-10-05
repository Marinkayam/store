"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import StallHero from "../stall-hero";
import HelpButton from "../help-button";
import Icon from "../icons";
import { ACTIVATION_PRICE } from "@/lib/pricing";
import { BuildScene, DingScene, HeroScene, HowScene } from "../home/scenes";
import { KupaSection, LearnSection, PriceSection, SafetySection } from "../home/sections";

/**
 * אתר השיווק (/story): הסיפור של "מה זה דוכן", בגלילה. דף הבית (/) נשאר
 * כמו שהוא — מרינה: "אני רוצה אתר מרקטינג, לא אתר שיחליף את מה שיש".
 *
 * מרינה: "אתר בסגנון של awwards עם גלילה שמספרת סיפור של מה זה בעצם דוכן,
 * בשפה הגרפית של האפליקציה, עם אפשרות לפתוח דוכן, והכל מותאם מובייל".
 *
 * הסדר: הוק ("לכל אחד יש טונות של צעצועים… עסק!!!") → מעגלה לדוכן → איך זה
 * עובד → דינג, הזמנה ראשונה → מה לומדים (עם חידה אמיתית) → הקופה → בטוח
 * (להורים) → כמה זה עולה → להדליק את האורות ולפתוח דוכן.
 *
 * מה שנשאר מדף הנחיתה הקודם, כמו שהיה:
 *   • ?ref=<slug> — הגיעו מדוכן של חבר/ה. נספר ב-/api/track/ref ועובר ליצירת הדוכן.
 *   • מי שכבר מחובר/ת עם דוכן רואה "כבר יש לך דוכן", ולא "כבר פתחת דוכן?".
 *   • הכפתור "לפתוח דוכן" מתחיל את ההקמה (/onboarding) — בלי שדה שם כאן.
 */

export default function StoryPage() {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [from, setFrom] = useState<{ name: string; emoji: string } | null>(null);
  const [mine, setMine] = useState<{ name: string; emoji: string } | null>(null);
  /* עד שבדקנו אם יש דוכן — לא מציגים "כבר פתחת דוכן?" (גם לא לרגע) */
  const [checked, setChecked] = useState(false);
  const [scrolled, setScrolled] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const endRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const supa = supabaseBrowser();
    supa.auth.getUser().then(({ data }) => {
      if (!data.user) return setChecked(true);
      supa
        .from("stores")
        .select("display_name, emoji")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data: store }) => {
          if (store) setMine({ name: store.display_name, emoji: store.emoji ?? "🛍️" });
          setChecked(true);
        });
    });
  }, []);

  // קוראים מ-window ולא מ-useSearchParams כדי לא לעטוף את הדף ב-Suspense
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (!r || !/^[a-z0-9]{3,12}$/i.test(r)) return;
    setRef(r);
    fetch("/api/track/ref", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: r }),
    })
      .then((res) => res.json())
      .then((d) => d?.name && setFrom({ name: d.name, emoji: d.emoji ?? "🛍️" }))
      .catch(() => {});
  }, []);

  // פס ההתקדמות למעלה, והכפתור הדביק למטה (אחרי ההוק, ולא כשהסוף כבר על המסך)
  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      const end = endRef.current?.getBoundingClientRect();
      setShowBar(window.scrollY > window.innerHeight * 1.6 && !!end && end.top > window.innerHeight * 0.85);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, []);

  function start(e?: React.FormEvent) {
    e?.preventDefault();
    // רק ההפניה נשמרת. השם נשאל במסך הראשון של ההקמה ולא כאן.
    sessionStorage.setItem("duchan-draft", JSON.stringify({ step: 1, ref }));
    router.push("/onboarding");
  }

  return (
    <main id="top" className="story-site bg-[var(--canvas)] text-[var(--ink)]">
      <h1 className="sr-only">דוכן</h1>

      {/* ── כותרת קבועה + פס התקדמות ── */}
      <header className="fixed top-0 inset-x-0 z-40 bg-[var(--canvas)] border-b border-[var(--line)] pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-1.5 text-[17px] font-medium" aria-label="דוכן, לתחילת הדף">
            <span className="text-[var(--ink)]">
              <Icon name="stall" size={22} />
            </span>
            דוכן
          </a>
          <nav className="flex items-center gap-3.5 text-[13.5px]" aria-label="ראשי">
            <a href="/price" className="hidden sm:inline">
              מה מקבלים
            </a>
            {checked &&
              (mine ? (
                <a href="/dashboard" className="font-medium">
                  לדוכן שלי ←
                </a>
              ) : (
                <a href="/login" className="font-medium">
                  כניסה
                </a>
              ))}
            <button onClick={() => start()} className="bg-[var(--ink)] text-white px-3 py-1.5 font-medium" data-testid="home-header-start">
              לפתוח דוכן
            </button>
          </nav>
        </div>
        <div className="h-[3px] bg-[var(--lavender-deep)] origin-right" style={{ transform: `scaleX(${scrolled})` }} aria-hidden />
      </header>
      <div className="h-[calc(3rem+env(safe-area-inset-top))]" aria-hidden />

      <HelpButton context="פתיחת דוכן" lift={showBar ? 68 : 0} />

      {/* מי שכבר יש לו/ה דוכן, ומי שהגיע/ה מדוכן של חבר/ה — לפני הסיפור */}
      {(mine || from) && (
        <div className="px-4 pt-3 flex flex-col items-center gap-2">
          {mine && (
            <a
              href="/dashboard"
              data-testid="my-store-card"
              className="w-full max-w-sm border-[1.5px] border-[var(--olive)] bg-white px-4 py-3 flex items-center gap-3"
            >
              <span className="text-xl">{mine.emoji}</span>
              <span className="flex-1 t-small leading-snug">
                <span className="text-[var(--muted)]">כבר יש לך דוכן</span>
                <br />
                <b>{mine.name}</b>
              </span>
              <span className="t-small font-medium text-[var(--ink)]">לניהול ←</span>
            </a>
          )}
          {from && (
            <div data-testid="referred-from" className="card px-4 py-3 t-small text-center max-w-sm">
              {from.emoji} הגעת מ<span className="font-medium">{from.name}</span>, עכשיו תורך
            </div>
          )}
        </div>
      )}

      <HeroScene />
      <BuildScene />
      <HowScene />
      <DingScene />
      <LearnSection />
      <KupaSection />
      <SafetySection />
      <PriceSection />

      {/* ── הסוף: להדליק את האורות ולפתוח דוכן ── */}
      <section ref={endRef} className="pt-20 pb-28 flex flex-col items-center gap-6 bg-[var(--canvas)]" aria-labelledby="end-title" data-testid="home-end">
        <div className="text-center px-5">
          <div className="text-[13px] font-medium tracking-wide text-[var(--muted)]">ועכשיו</div>
          <h2 id="end-title" className="home-display mt-1">
            להדליק את האורות.
          </h2>
        </div>
        <div className="self-stretch">
          <StallHero name="הדוכן שלך" />
        </div>
        <form onSubmit={start} className="w-full max-w-sm px-5 flex flex-col gap-2.5">
          <button className="btn btn-primary text-[16px]" data-testid="home-start">
            קדימה, בואו נקים את הדוכן ←
          </button>
          <p className="text-[13px] text-center leading-relaxed">
            לבנות זה חינם. משלמים פעם אחת, <bdi>₪{ACTIVATION_PRICE}</bdi>, רק כשרוצים לקבל הזמנות.
          </p>
        </form>
        {checked && !mine && (
          <a
            href="/login"
            className="w-[calc(100%-2.5rem)] max-w-sm border-[1.5px] border-[var(--line)] bg-white px-4 py-3 flex items-center justify-between t-small"
          >
            <span>כבר פתחת דוכן?</span>
            <span className="font-medium text-[var(--ink)]">כניסה לדוכן שלי ←</span>
          </a>
        )}
        <p className="t-small text-[var(--muted)] mt-4">
          <a href="/terms" className="underline">תנאי שימוש</a>
          {" · "}
          <a href="/privacy" className="underline">מדיניות פרטיות</a>
          {" · "}
          <a href="/accessibility" className="underline">נגישות</a>
        </p>
      </section>

      {/* כפתור דביק למטה — מופיע אחרי ההוק ונעלם כשמגיעים לסוף */}
      <div
        data-bottom-bar={showBar ? "" : undefined}
        aria-hidden={!showBar}
        className={`md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--canvas)] border-t border-[var(--line)] px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] transition-transform duration-300 ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <button onClick={() => start()} tabIndex={showBar ? 0 : -1} className="btn btn-primary w-full max-w-sm mx-auto block" data-testid="home-sticky-start">
          לפתוח דוכן ←
        </button>
      </div>
    </main>
  );
}
