"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// עמוד הנחיתה: שדה אחד. בלי אימייל. הבנייה מתחילה לפני ההרשמה.
// ?ref=<slug> — הגיעה מחנות של חברה. השיוך נשמר בטיוטה ועובר ליצירת החנות.

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const [from, setFrom] = useState<{ name: string; emoji: string } | null>(null);

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
      JSON.stringify({ displayName: name.trim(), step: 2, ref })
    );
    router.push("/onboarding");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-8">
      {from && (
        <div className="bg-[#FFF9EE] border border-[#F5E3C2] rounded-xl px-4 py-2.5 text-[12.5px] text-[#A85B00] text-center">
          {from.emoji} הגעת מ<span className="font-bold">{from.name}</span> — עכשיו תורך
        </div>
      )}

      <div className="text-center">
        <div className="text-5xl mb-3">🛍️</div>
        <h1 className="text-2xl font-bold">דוכן</h1>
        <p className="text-sm text-[#7A7D8A] mt-2 leading-relaxed">
          חנות קטנה שאת מקימה בעצמך.
          <br />
          מוצרים מהטלפון, לינק לשיתוף — וזהו.
        </p>
      </div>
      <form onSubmit={start} className="w-full max-w-sm flex flex-col gap-3">
        <label className="text-sm font-medium text-center">מה שם החנות שלך?</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="החנות של…"
          maxLength={40}
          autoFocus
          className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-center text-base"
        />
        <button
          disabled={!name.trim()}
          className="bg-[#15161B] text-white rounded-xl py-3.5 text-sm font-medium disabled:opacity-30"
        >
          בואי נבנה אותה ←
        </button>
        <p className="text-[11.5px] text-[#A2A5B0] text-center leading-relaxed">
          הבנייה חינם. משלמים רק כשרוצים לפרסם —{" "}
          <a href="/price" className="underline">
            כמה, וכולל מה
          </a>
        </p>
      </form>
      <a href="/login" className="text-xs text-[#7A7D8A] underline">
        כבר יש לי חנות
      </a>
      <p className="text-[11px] text-[#A2A5B0]">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
      </p>
    </main>
  );
}
