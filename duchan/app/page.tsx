"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// עמוד הנחיתה: שדה אחד. בלי אימייל. הבנייה מתחילה לפני ההרשמה.

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");

  function start(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem(
      "duchan-draft",
      JSON.stringify({ displayName: name.trim(), step: 2 })
    );
    router.push("/onboarding");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-8">
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
      </form>
      <a href="/login" className="text-xs text-[#7A7D8A] underline">
        כבר יש לי חנות
      </a>
    </main>
  );
}
