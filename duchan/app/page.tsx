"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import StallArt from "./stall-art";
import HelpButton from "./help-button";

// עמוד הנחיתה: שדה אחד. בלי אימייל. הבנייה מתחילה לפני ההרשמה.
// ?ref=<slug> — הגיעה מחנות של חברה. השיוך נשמר בטיוטה ועובר ליצירת החנות.

export default function Landing() {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [from, setFrom] = useState<{ name: string; emoji: string } | null>(null);
  // יש כבר דוכן ומחוברת? הדף הזה חייב לומר את זה לפני הכל.
  const [mine, setMine] = useState<{ name: string; emoji: string } | null>(null);

  /**
   * מי שכבר מחוברת נחתה כאן וראתה "איך קוראים לדוכן שלך?" — כאילו המערכת
   * לא מכירה אותה. הסשן היה שם כל הזמן; פשוט אף אחד לא שאל אותו.
   */
  useEffect(() => {
    const supa = supabaseBrowser();
    supa.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supa
        .from("stores")
        .select("display_name, emoji")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data: store }) => {
          if (store) setMine({ name: store.display_name, emoji: store.emoji ?? "🛍️" });
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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-8 bg-[var(--canvas)]">
      <HelpButton context="פתיחת דוכן" />
      {mine && (
        // כרטיס בתוך זרימת הדף, לא רצועה שחורה שנתלשת ממנה. הרצועה השחורה
        // המקורית התנגשה עם האיור הרך שמתחתיה ונראתה כמו שני אתרים שונים.
        <a
          href="/dashboard"
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
        <div className="card px-4 py-3 t-small text-center max-w-sm">
          {from.emoji} הגעת מ<span className="font-bold">{from.name}</span>, עכשיו תורך
        </div>
      )}

      {/* האיור נושא את המסך, לא הטקסט. השם קטן כי הוא כבר כתוב על האיור,
          והמשפט קצר ובצבע מלא — הגרסה הקודמת הייתה ארוכה ואפורה. */}
      <div className="text-center flex flex-col items-center">
        <StallArt className="w-64 h-auto stall-sway" />
        <h1 className="text-[1.5rem] leading-none font-semibold tracking-[-0.02em] mt-3">דוכן</h1>
        <p className="text-[15px] leading-relaxed mt-3 max-w-[19rem] text-[var(--ink)]">
          יש לך אוסף ענקי של סקוושי?
          <br />
          צעצועים, בגדים וספרים שכבר לא צריך?
          <br />
          <span className="font-medium">פותחים דוכן ומוכרים לחברים.</span>
        </p>
      </div>

      {/* בלי שדה שם כאן: השם נשאל ממילא במסך הראשון של ההקמה, ושתי
          שאלות לאותו דבר גרמו לתחושה של טופס כפול. */}
      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-2.5">
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
      {!mine && (
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
