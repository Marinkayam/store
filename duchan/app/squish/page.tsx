"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BRAND } from "@/lib/squish";
import { SquishOutline, SwapGlyph } from "./components";

/**
 * מסך הפתיחה של סקוויש קלאב.
 *
 * ההבטחה היא "האוסף שלך, במקום אחד, ואפשר להראות אותו" — ולכן המסך
 * *מראה* גלריה במקום לתאר אותה. מדף עם שישה סקווישים, אחד מהם מסומן
 * פתוח לטרייד, וזה כל ההסבר שצריך.
 */
export default function SquishLanding() {
  const [mine, setMine] = useState<{ title: string; count: number } | null>(null);

  useEffect(() => {
    const supa = supabaseBrowser();
    supa.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      // סינון מפורש: ה-RLS מחזיר גם את הפרופילים והפריטים של החברות
      supa
        .from("squish_profiles")
        .select("collection_title, nickname")
        .eq("user_id", data.user.id)
        .maybeSingle()
        .then(async ({ data: p }) => {
          if (!p) return;
          const { count } = await supa
            .from("squish_items")
            .select("id", { count: "exact", head: true })
            .eq("owner_user_id", data.user!.id)
            .is("deleted_at", null);
          setMine({ title: p.collection_title || `האוסף של ${p.nickname}`, count: count ?? 0 });
        });
    });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-5 pt-8 pb-14 gap-6">
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

      <div className="text-center">
        <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.02em]">
          כל הסקווישים שלך,
          <br />
          במקום אחד
        </h1>
        <p className="text-[15px] leading-relaxed mt-2.5 max-w-[20rem] text-[var(--ink)] mx-auto">
          בונים גלריה, משתפים עם חברות ומוצאים טריידים חדשים.
        </p>
      </div>

      {/* הדגמה: מדף אמיתי, לא איור מופשט */}
      <DemoShelf />

      <div className="w-full max-w-sm flex flex-col gap-2.5">
        <a href="/squish/new" className="btn btn-primary">
          {mine ? "להוסיף סקווישי ←" : "לבנות את הגלריה שלי ←"}
        </a>
        <p className="text-[13px] text-center text-[var(--ink)] leading-relaxed">
          הגלריה פרטית. רואות אותה רק החברות שהזמנת.
        </p>
      </div>

      <ol className="w-full max-w-sm flex flex-col gap-2 text-[13px]">
        {[
          ["בונים גלריה", "מצלמים את הסקווישים, ורואים אותם על מדף"],
          ["מסמנים מה פתוח לטרייד", "רק מה שאת בוחרת מוצע להחלפה"],
          ["מזמינים חברות", "רואות מה יש לכן, ומציעות טרייד"],
        ].map(([t, d], i) => (
          <li key={i} className="flex items-start gap-2.5">
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
        {BRAND} הוא חלק מ
        <a href="/" className="underline">דוכן</a>
        {" · "}
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">פרטיות</a>
      </p>
    </main>
  );
}

/**
 * מדף לדוגמה. שישה סקווישים בצבעי המותג, אחד עם תגית טרייד — זו
 * ההדגמה של המוצר, ולכן היא ראויה למקום המרכזי במסך.
 */
function DemoShelf() {
  const row1 = [
    { c: "var(--lavender)", d: 0 },
    { c: "var(--olive)", d: 0.7 },
    { c: "var(--blush)", d: 1.4 },
  ];
  const row2 = [
    { c: "var(--cream)", d: 0.4 },
    { c: "var(--lavender)", d: 1.1 },
    { c: "var(--olive)", d: 1.8 },
  ];
  return (
    <div className="w-full max-w-sm bg-white border border-[var(--line)] p-4 pb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold">האוסף של נועה</span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--muted)]">
          <SwapGlyph />2 פתוחים לטרייד
        </span>
      </div>
      {[row1, row2].map((row, ri) => (
        <div key={ri} className={`squish-shelf grid grid-cols-3 gap-3 ${ri ? "mt-6" : ""}`}>
          {row.map((s, i) => (
            <div key={i} className="relative aspect-square bg-[var(--cream)] flex items-center justify-center">
              <Blob color={s.c} delay={s.d} />
              {ri === 0 && i === 0 && (
                <span
                  className="absolute top-1 start-1 w-5 h-5 bg-[var(--lavender)] text-white flex items-center justify-center"
                  style={{ borderRadius: "999px" }}
                  aria-hidden
                >
                  <SwapGlyph size={11} />
                </span>
              )}
              {ri === 1 && i === 1 && (
                <span
                  className="absolute top-1 start-1 w-5 h-5 bg-[var(--lavender)] text-white flex items-center justify-center"
                  style={{ borderRadius: "999px" }}
                  aria-hidden
                >
                  <SwapGlyph size={11} />
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Blob({ color, delay }: { color: string; delay: number }) {
  return (
    <svg viewBox="0 0 48 48" className="w-3/4 h-3/4 squish-breathe" style={{ animationDelay: `${delay}s` }} aria-hidden>
      <path
        d="M24 9 c9 0 15.5 6.5 15.5 15 c0 9 -6.5 15.5 -15.5 15.5 s-15.5 -6.5 -15.5 -15.5 c0 -8.5 6.5 -15 15.5 -15 z"
        fill={color}
        stroke="var(--wood)"
        strokeWidth="1.5"
      />
      <circle cx="19.5" cy="23" r="1.5" fill="var(--ink)" />
      <circle cx="28.5" cy="23" r="1.5" fill="var(--ink)" />
      <path d="M20.5 28 a4 4 0 0 0 7 0" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
