"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import StallHero from "./stall-hero";
import HelpButton from "./help-button";
import PromoBurst from "./promo-burst";
import { ACTIVATION_PRICE, DEAL_LABEL, FULL_PRICE, IS_LAUNCH } from "@/lib/pricing";

// עמוד הנחיתה: שדה אחד. בלי אימייל. הבנייה מתחילה לפני ההרשמה.
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

      {/* האיור נושא את המסך, לא הטקסט. השם קטן כי הוא כבר כתוב על האיור,
          והמשפט קצר ובצבע מלא — הגרסה הקודמת הייתה ארוכה ואפורה. */}
      {/* הדוכן על כל רוחב המסך, בלי מסגרת, ועם אור שמדליקים (מרינה) */}
      <div className="self-stretch -mx-6">
        <StallHero name="דוכן" />
      </div>
      <div className="text-center flex flex-col items-center -mt-4">
        {/* "דוכן" כבר כתוב על השלט באיור — מרינה: "אפשר להוריד את המילה דוכן".
            הכותרת נשארת לקוראי מסך. */}
        <h1 className="sr-only">דוכן</h1>
        <p className="text-[15px] leading-relaxed max-w-[19rem] text-[var(--ink)]">
          יש לך אוסף ענקי של סקווישים?
          <br />
          צעצועים, בגדים וספרים שכבר לא צריך?
          <br />
          <span className="font-medium">פותחים דוכן ומוכרים לחברים.</span>
        </p>
      </div>

      {/* בלי שדה שם כאן: השם נשאל ממילא במסך הראשון של ההקמה, ושתי
          שאלות לאותו דבר גרמו לתחושה של טופס כפול. */}
      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-2.5">
        {IS_LAUNCH && (
          <a
            href="/price"
            data-testid="promo-banner"
            className="fx-shine fx-press fx-rise block text-center text-white px-4 pt-3 pb-3.5"
            style={{ background: "var(--wood)", animationDelay: ".1s" }}
          >
            <PromoBurst />
            <span className="relative z-[3] inline-block text-[11.5px] font-bold bg-black/25 px-2.5 py-0.5">
              <span className="fx-wiggle">🎉</span> {DEAL_LABEL}
            </span>
            <span className="relative z-[3] block text-[17px] font-bold leading-snug mt-1">
              רק <bdi className="fx-pop text-[24px] align-[-2px]">₪{ACTIVATION_PRICE}</bdi> לפתוח דוכן!{" "}
              <bdi className="text-[13px] font-medium line-through">₪{FULL_PRICE}</bdi>
            </span>
          </a>
        )}
        <button className="btn btn-primary">לפתוח דוכן ←</button>
        {/* הקישור בשורה נפרדת: כשהוא נגרר לסוף המשפט הוא נשבר באמצע
            ("איך" בשורה אחת ו"זה עובד?" בשנייה) ונראה כמו טעות. */}
        <p className="text-[13px] text-center text-[var(--ink)] leading-relaxed">
          לבנות זה חינם. משלמים פעם אחת רק כשרוצים לפרסם.
          <br />
          <a href="/price" className="underline font-medium">איך זה עובד?</a>
        </p>
      </form>

      {/* הכניסה לדוכן קיים יושבת בתחתית: היא נועדה למי שכבר מכירה את
          המקום ויודעת לחפש אותה, ולמעלה היא רק גנבה מקום מהפעולה הראשית. */}
      {checked && !mine && (
        <a
          href="/login"
          className="w-full max-w-sm border-[1.5px] border-[var(--line)] bg-white px-4 py-3 flex items-center justify-between t-small"
        >
          <span>כבר פתחת דוכן?</span>
          <span className="font-medium text-[var(--ink)]">כניסה לדוכן שלי ←</span>
        </a>
      )}

      <p className="t-small text-[var(--muted)]">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
        {" · "}
        <a href="/accessibility" className="underline">נגישות</a>
      </p>
    </main>
  );
}
