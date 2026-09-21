"use client";

import { useEffect, useState } from "react";
import { WHATSNEW } from "@/lib/whatsnew";

/**
 * פופאפ "מה חדש" חד-פעמי אחרי עדכון גדול — נפרד מפעמון העדכונים (✨,
 * whats-new.tsx): הפעמון מציג הודעות שמרינה כותבת מהחמ"ל, והפופאפ הזה
 * קופץ מעצמו פעם אחת ומספר על פיצ'רים חדשים בקוד.
 *
 * ההיגיון המלא ב-lib/whatsnew.ts: פעם אחת לגרסה (localStorage), ורק
 * לחנות שנוצרה לפני העדכון — חנות חדשה לא צריכה "מה חדש".
 */
export default function ReleasePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `duchan-whatsnew-${WHATSNEW.version}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return; // אין אחסון (גלישה פרטית וכו') — פשוט לא מציגים
    }
    let alive = true;
    (async () => {
      const { supabaseBrowser } = await import("@/lib/supabase/client");
      const { data } = await supabaseBrowser()
        .from("stores")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!alive || !data) return;
      if (new Date(data.created_at) < new Date(WHATSNEW.releasedAt)) setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(`duchan-whatsnew-${WHATSNEW.version}`, "1");
    } catch {}
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={dismiss} />
      <div
        data-testid="release-popup"
        className="fixed bottom-0 inset-x-0 z-[80] max-w-md mx-auto bg-white px-5 pt-5 pb-6 max-h-[85%] overflow-y-auto"
      >
        <div className="w-9 h-1 bg-black/15 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-center mb-3">{WHATSNEW.title}</h2>
        <div className="flex flex-col gap-3 mb-4">
          {WHATSNEW.items.map((it) => (
            <div key={it.title} className="flex gap-2.5 items-start">
              <span className="text-2xl shrink-0" aria-hidden>
                {it.emoji}
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{it.title}</div>
                <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">{it.text}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={dismiss}
          className="w-full bg-[var(--ink)] text-white py-3 text-[14px] font-bold"
        >
          מגניב, הבנתי!
        </button>
      </div>
    </>
  );
}
