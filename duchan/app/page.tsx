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
  const [name, setName] = useState("");
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
    if (!name.trim()) return;
    sessionStorage.setItem(
      "duchan-draft",
      // step 1 ולא 2: השם עובר מכאן, אבל התמונה והרקע עדיין לפניה.
      // עם step 2 היא הייתה מדלגת על כל מסך הזהות בלי לדעת שהוא קיים.
      JSON.stringify({ displayName: name.trim(), step: 1, ref })
    );
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

      {/* הכותרת: איור, שם, ואז המשפט שאומר מה מותר למכור.
          "כל מה שרוצים" היא ההבטחה ו"וההורים מסכימים" הוא הגבול — הם נאמרים
          באותה נשימה בכוונה, כדי שאף אחד מהם לא יישמע כמו תוספת קטנה. */}
      <div className="text-center flex flex-col items-center">
        <StallArt className="w-56 h-auto stall-sway" />
        <h1 className="text-[2.75rem] leading-none font-semibold tracking-[-0.03em] mt-2">דוכן</h1>
        <p className="t-sub mt-4 max-w-[19rem]">
          יש צעצועים שכבר לא משחקים בהם? בגדים עם התווית שעוד לא לבשו? ספר
          שכבר קראו, או סקוויש שכבר מעכו עד הסוף?
          <br />
          <span className="font-medium text-[var(--ink)]">
            כאן פותחים דוכן אמיתי, עם עמוד וקישור לשלוח לכולם
          </span>
          , ומוכרים את זה לחברים. כל דבר שההורים מסכימים לו.
        </p>
      </div>

      {/* מי שכבר פתחה דוכן וחזרה בלי להיות מחוברת רואה את זה *לפני* טופס
          הפתיחה, לא אחריו: אחרת יש סיכוי שהיא תתחיל למלא "דוכן חדש" מתוך
          בלבול, בזמן שכל מה שהיא רצתה זה לחזור ולערוך את הדוכן הקיים. */}
      {!mine && (
        <a
          href="/login"
          className="w-full max-w-sm border-[1.5px] border-[var(--line)] bg-white px-4 py-3 flex items-center justify-between t-small"
        >
          <span>כבר פתחת דוכן?</span>
          <span className="font-medium text-[var(--ink)]">כניסה לדוכן שלי ←</span>
        </a>
      )}

      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-3">
        <label className="t-body font-medium">איך יקראו לדוכן שלך?</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: הדברים של נועה"
          maxLength={40}
          autoFocus
          className="field w-full px-4 py-4 t-body"
        />
        <button
          disabled={!name.trim()}
          className="btn btn-primary"
        >
          נבנה את הדוכן ←
        </button>
        {/* פירוט המחיר עבר כולו ל-/price. כאן נשאר משפט אחד שמסיר את החשש
            המיידי ("זה עולה לי כסף עכשיו?"), והקישור עצמו הוא כפתור ולא
            שורה קטנה בתחתית — זו השאלה הראשונה שכל הורה שואל. */}
        <p className="t-small text-center text-[var(--muted)]">
          לבנות זה חינם. תשלום חד-פעמי רק כשרוצים לפרסם.
        </p>
        <a href="/price" className="btn btn-secondary">
          איך זה עובד?
        </a>
      </form>

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
