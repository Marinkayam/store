"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import StallHero from "./stall-hero";
import HelpButton from "./help-button";

// עמוד הנחיתה: איור, משפט אחד, כפתור אחד. בלי מחיר ובלי צעצועים.
// מרינה, 10.2026, אחרי שנכנסה כמו ילדה: "איזה עמוס זה ולא מובן מה לעשות...
// זה אמור להיות ממש ממש פשוט בלי המחיר אפילו בשלב הזה". המחיר מוסבר
// במקום שבו הוא רלוונטי: במסך הפרסום, בסוף ההקמה.
// ?ref=<slug> — הגיעה מחנות של חברה. השיוך נשמר בטיוטה ועובר ליצירת החנות.

export default function Landing() {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [from, setFrom] = useState<{ name: string; emoji: string } | null>(null);
  // יש כבר דוכן ומחוברת? הדף הזה חייב לומר את זה לפני הכל.
  const [mine, setMine] = useState<{ name: string; emoji: string } | null>(null);
  /* האם כבר בדקנו אם יש דוכן. עד אז לא מציגים "כבר פתחת דוכן?" — אחרת מי
     שכבר יש לה דוכן רואה את השאלה הזו לשנייה (מרינה: "אם כבר פתחתי דוכן
     אז אתה יודע"). */
  const [checked, setChecked] = useState(false);

  /**
   * מי שכבר מחוברת נחתה כאן וראתה "איך קוראים לדוכן שלך?" — כאילו המערכת
   * לא מכירה אותה. הסשן היה שם כל הזמן; פשוט אף אחד לא שאל אותו.
   */
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

  function start(e: React.FormEvent) {
    e.preventDefault();
    // רק ההפניה נשמרת. השם נשאל במסך הראשון של ההקמה ולא כאן.
    sessionStorage.setItem("duchan-draft", JSON.stringify({ step: 1, ref }));
    router.push("/onboarding");
  }

  return (
    // ריפוד תחתון גדול מהעליון: התוכן ממורכז, אז זה מה שמרים את הדוכן
    // מעט מעל אמצע המסך במקום להשאיר אותו בדיוק במרכז.
    <main className="min-h-screen flex flex-col items-center justify-center px-6 pt-6 pb-24 gap-7 bg-[var(--canvas)]">
      <HelpButton context="פתיחת דוכן" />
      {mine && (
        // כרטיס בתוך זרימת הדף, לא רצועה שחורה שנתלשת ממנה. הרצועה השחורה
        // המקורית התנגשה עם האיור הרך שמתחתיה ונראתה כמו שני אתרים שונים.
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
          {from.emoji} הגעת מ<span className="font-bold">{from.name}</span>, עכשיו תורך
        </div>
      )}

      <div className="self-stretch -mx-6">
        <StallHero name="דוכן" still />
      </div>
      <div className="text-center -mt-2">
        {/* "דוכן" כבר כתוב על השלט באיור. הכותרת נשארת לקוראי מסך. */}
        <h1 className="sr-only">דוכן</h1>
        <p className="text-[17px] leading-relaxed max-w-[19rem] text-[var(--ink)]">
          יש לך דברים שכבר לא צריך?
          <br />
          <span className="font-medium">פותחים דוכן ומוכרים לחברים.</span>
        </p>
      </div>

      <form onSubmit={start} className="w-full max-w-sm">
        <button className="btn btn-primary w-full" data-testid="home-start">
          לפתוח דוכן ←
        </button>
      </form>

      {checked && !mine && (
        <a href="/login" className="t-small text-[var(--ink)] -mt-3 py-2">
          כבר פתחת דוכן? <span className="underline font-medium">כניסה</span>
        </a>
      )}

      <p className="text-[12px] text-[var(--muted)] mt-2">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
        {" · "}
        <a href="/accessibility" className="underline">נגישות</a>
      </p>
    </main>
  );
}
