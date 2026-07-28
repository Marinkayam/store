"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SquishOutline } from "./components";

/**
 * מסך הפתיחה של Squish Club.
 *
 * בונים לפני שנרשמים, בדיוק כמו בדוכן: השאלה הראשונה היא "איזה סקווישים
 * יש לך?", לא "מה המספר שלך". מי שכבר יש לה אוסף מגיעה ישר אליו.
 */
export default function SquishLanding() {
  const [mine, setMine] = useState<{ title: string; count: number } | null>(null);

  useEffect(() => {
    const supa = supabaseBrowser();
    supa.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supa
        .from("squish_profiles")
        .select("collection_title, nickname")
        .maybeSingle()
        .then(async ({ data: p }) => {
          if (!p) return;
          const { count } = await supa
            .from("squish_items")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null);
          setMine({ title: p.collection_title || `האוסף של ${p.nickname}`, count: count ?? 0 });
        });
    });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 pt-6 pb-16 gap-6">
      {mine && (
        <a
          href="/squish/collection"
          className="w-full max-w-sm border-[1.5px] border-[var(--lavender)] bg-white px-4 py-3 flex items-center gap-3"
        >
          <SquishOutline size={30} />
          <span className="flex-1 t-small leading-snug">
            <span className="text-[var(--muted)]">האוסף שלך</span>
            <br />
            <b>{mine.title}</b>
          </span>
          <span className="t-small font-medium">{mine.count} פריטים ←</span>
        </a>
      )}

      <div className="text-center flex flex-col items-center">
        <ClubArt />
        <h1 className="text-[1.5rem] leading-none font-semibold tracking-[-0.02em] mt-3">
          Squish Club
        </h1>
        <p className="text-[15px] leading-relaxed mt-3 max-w-[19rem] text-[var(--ink)]">
          יש לך אוסף סקווישים?
          <br />
          <span className="font-medium">בונים גלריה, ומחליפים עם החברות.</span>
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-2.5">
        <a href="/squish/new" className="btn btn-primary">
          {mine ? "להוסיף סקווישי ←" : "איזה סקווישים יש לך? ←"}
        </a>
        <p className="text-[13px] text-center text-[var(--ink)] leading-relaxed">
          האוסף פרטי. רואים אותו רק מי שהזמנת.
        </p>
      </div>

      {/* שלושת השלבים, כדי שיהיה ברור לאן זה הולך */}
      <ol className="w-full max-w-sm flex flex-col gap-2 text-[13px]">
        {[
          ["בונים גלריה", "מצלמים את הסקווישים ומוסיפים שם וסוג"],
          ["מסמנים מה פתוח לטרייד", "רק מה שאת בוחרת מוצע להחלפה"],
          ["מזמינים חברות", "רואות מה יש לכן, ומציעות טרייד"],
        ].map(([t, d], i) => (
          <li key={i} className="bg-white border border-[var(--line)] px-3 py-2.5 flex items-start gap-2.5">
            <span className="w-5 h-5 shrink-0 bg-[var(--ink)] text-white flex items-center justify-center text-[11px]">
              {i + 1}
            </span>
            <span>
              <b>{t}</b>
              <br />
              <span className="text-[var(--muted)] text-[12.5px]">{d}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="t-small text-[var(--muted)] text-center">
        חלק מ
        <a href="/" className="underline">
          דוכן
        </a>
        {" · "}
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">פרטיות</a>
      </p>
    </main>
  );
}

/** שלושה סקווישים על מדף, עם סימן הטרייד */
function ClubArt() {
  return (
    <svg viewBox="0 0 200 130" className="w-56 h-auto" role="img" aria-label="שלושה סקווישים על מדף">
      <g stroke="var(--wood)" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M40 78 c0 -14 8 -24 20 -24 s20 10 20 24 c0 12 -9 20 -20 20 s-20 -8 -20 -20 z" fill="var(--lavender)" />
        <path d="M84 82 c0 -11 6 -19 16 -19 s16 8 16 19 c0 10 -7 16 -16 16 s-16 -6 -16 -16 z" fill="var(--olive)" />
        <path d="M120 78 c0 -14 8 -24 20 -24 s20 10 20 24 c0 12 -9 20 -20 20 s-20 -8 -20 -20 z" fill="var(--cream)" />
        <rect x="24" y="98" width="152" height="9" fill="var(--sand)" />
        <path d="M36 107 v10 M164 107 v10" fill="none" />
      </g>
      <g fill="var(--ink)">
        <circle cx="54" cy="74" r="1.9" />
        <circle cx="66" cy="74" r="1.9" />
        <circle cx="134" cy="74" r="1.9" />
        <circle cx="146" cy="74" r="1.9" />
      </g>
      <path d="M55 80 a5 5 0 0 0 10 0 M135 80 a5 5 0 0 0 10 0" fill="none" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" />
      <g transform="translate(92 22)" color="var(--lavender)">
        <SwapMark />
      </g>
    </svg>
  );
}

function SwapMark() {
  return (
    <g stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 6 h14 l-4 -4" />
      <path d="M18 14 h-14 l4 4" />
    </g>
  );
}
