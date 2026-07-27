"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

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

      {/* שם המותג בפונט התצוגה, בלי בלוק צבע ובלי אמוג'י ענק —
          האופי מגיע מהטיפוגרפיה ומהצבע, לא מקישוט. */}
      <div className="text-center">
        <h1 className="text-[40px] leading-none font-bold">דוכן</h1>
        <p className="text-[15px] mt-4 leading-relaxed text-[var(--muted)]">
          החנות שלך. הקהל שלך.
          <br />
          מוכרים, משתפים, נהנים.
        </p>
        <div className="mt-4 text-[var(--lavender)] text-lg">❦</div>
      </div>

      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-3">
        <label className="text-[14px] font-semibold">איך קוראים לדוכן שלך?</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="הדוכן של…"
          maxLength={40}
          autoFocus
          className="field w-full px-4 py-3.5 text-base"
        />
        <button
          disabled={!name.trim()}
          className="btn btn-primary py-4 text-[15px]"
        >
          יאללה, בונים ←
        </button>
        <p className="text-[12px] text-center leading-relaxed text-[var(--muted)]">
          לבנות זה חינם. משלמים רק כשרוצים לפרסם —{" "}
          <a href="/price" className="underline font-semibold text-[var(--olive)]">
            כמה וכולל מה
          </a>
        </p>
      </form>

      {!mine && (
        <a href="/login" className="text-[14px] font-semibold text-[var(--olive)]">
          כבר יש לי דוכן
        </a>
      )}
      <p className="text-[11px] text-[var(--muted)]">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
      </p>
    </main>
  );
}
