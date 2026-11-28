"use client";

import { useEffect } from "react";
import HomeStall from "@/app/home-stall";

export default function HoodInvite() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = q.get("h");
    if (!h || !/^[0-9a-f-]{36}$/.test(h)) return;
    try {
      localStorage.setItem("duchan-hood-invite", JSON.stringify({ h, from: (q.get("from") ?? "").slice(0, 40) }));
    } catch {}
  }, []);

  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <div className="w-full max-w-md mx-auto px-gutter pt-8 pb-10 text-center" data-testid="hood-invite-page">
        <HomeStall name="השוק של השכונה" className="w-full max-w-[300px] mx-auto block" />
        <h1 className="text-[26px] font-black leading-tight mt-2">מזמינים אתכם לשוק של השכונה!</h1>
        <p className="text-[14.5px] text-[var(--muted)] leading-relaxed mt-2">
          פותחים דוכן קטן באינטרנט, מוכרים מה שבא לכם, ועומדים ליד הדוכנים של השכנים.
        </p>
        <div className="flex flex-col gap-2.5 mt-6">
          <a href="/onboarding" className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold" data-testid="hood-invite-open">
            לפתוח דוכן
          </a>
          <a href="/dashboard/hood" className="border-[1.5px] border-[var(--ink)] py-3 text-[14px] font-bold" data-testid="hood-invite-have">
            כבר יש לנו דוכן
          </a>
        </div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-5">ההורים מאשרים לפני שהדוכן נכנס לשוק.</p>
      </div>
    </main>
  );
}
