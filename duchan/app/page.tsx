"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ACTIVATION_PRICE, FULL_PRICE, IS_LAUNCH, LAUNCH_UNTIL_LABEL } from "@/lib/pricing";
import StallArt from "./stall-art";

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
      {mine && (
        <a
          href="/dashboard"
          className="w-full max-w-sm bg-[var(--ink)] text-white px-4 py-3.5 flex items-center gap-3"
        >
          <span className="text-xl">{mine.emoji}</span>
          <span className="flex-1 text-[13.5px] leading-tight">
            <b>{mine.name}</b>
            <br />
            <span className="opacity-70">הדוכן שלך מחכה — לניהול</span>
          </span>
          <span className="text-lg">←</span>
        </a>
      )}

      {from && (
        <div className="card px-4 py-3 text-[13px] text-center max-w-sm">
          {from.emoji} הגעת מ<span className="font-bold">{from.name}</span> — עכשיו תורך
        </div>
      )}

      {/* הכותרת: איור, שם, ואז המשפט שאומר מה מותר למכור.
          "כל מה שרוצים" היא ההבטחה ו"וההורים מסכימים" הוא הגבול — הם נאמרים
          באותה נשימה בכוונה, כדי שאף אחד מהם לא יישמע כמו תוספת קטנה. */}
      <div className="text-center flex flex-col items-center">
        <StallArt className="w-56 h-auto" />
        <h1 className="text-[44px] leading-none font-bold mt-1">דוכן</h1>
        <div className="flex items-center gap-2 mt-3 text-[var(--lavender)]">
          <span className="text-[10px] tracking-[0.3em]">····</span>
          <span className="text-base">❦</span>
          <span className="text-[10px] tracking-[0.3em]">····</span>
        </div>
        <h2 className="text-[19px] font-bold text-[var(--olive)] mt-3">הדוכן שלך מתחיל כאן</h2>
        <p className="text-[14px] mt-2.5 leading-relaxed text-[var(--muted)] max-w-xs">
          אפשר למכור כאן <span className="font-bold text-[var(--ink)]">כל מה שרוצים</span> —
          סקווישים שכבר לא בשימוש, צמידים שהכנת, בגדים שקטנו, ציורים, עוגיות.
          <br />
          כל דבר שההורים שלך מסכימים לו.
        </p>
      </div>

      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-3">
        <label className="text-[14px] font-semibold">איך יקראו לדוכן שלך?</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: הדברים של נועה"
          maxLength={40}
          autoFocus
          className="field w-full px-4 py-3.5 text-base"
        />
        <button
          disabled={!name.trim()}
          className="btn btn-primary py-4 text-[15px]"
        >
          בואי נבנה את הדוכן ←
        </button>
        {IS_LAUNCH ? (
          <p className="text-[12.5px] text-center leading-relaxed">
            <span className="font-bold">לבנות את הדוכן שלך במחיר מצחיק!</span>
            <br />
            <span className="text-[var(--muted)]">
              מחיר השקה ₪{ACTIVATION_PRICE} במקום ₪{FULL_PRICE}, עד {LAUNCH_UNTIL_LABEL}. לבנות זה
              חינם — משלמים רק כשרוצים לפרסם את הדוכן.{" "}
              <a href="/price" className="underline font-semibold text-[var(--olive)]">
                איך זה עובד?
              </a>
            </span>
          </p>
        ) : (
          <p className="text-[12px] text-center leading-relaxed text-[var(--muted)]">
            לבנות זה חינם. משלמים רק כשרוצים לפרסם את הדוכן.{" "}
            <a href="/price" className="underline font-semibold text-[var(--olive)]">
              איך זה עובד?
            </a>
          </p>
        )}
      </form>

      {/* קו מפריד עדין, ואז הכניסה לחוזרות */}
      <div className="flex items-center gap-3 w-full max-w-sm">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-[var(--lavender)] text-sm">♡</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      {!mine && (
        <p className="text-[14px] text-[var(--muted)] -mt-3">
          כבר פתחת דוכן?{" "}
          <a href="/login" className="font-bold text-[var(--olive)]">
            כניסה לדוכן שלי
          </a>
        </p>
      )}
      <p className="text-[11px] text-[var(--muted)]">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
      </p>
    </main>
  );
}
