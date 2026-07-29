"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BRAND } from "@/lib/squish";
import { SquishOutline, SquishPlaceholder, SwapGlyph, useBrokenImage } from "./components";

/**
 * מסך הפתיחה של סקוויש קלאב — שני מסכים, אחד אחרי השני.
 *
 * **מסך, לא מקטע בגלילה.** בכל רגע נתון מרונדר אחד בלבד: הראשון הוא
 * לוגו והזמנה, והשני מחליף אותו כשלוחצים. הגרסה הקודמת שמה את שניהם
 * בדף אחד ארוך, וזה הפך את השני להמשך של הראשון במקום לתחנה בפני
 * עצמה — בדיוק מה שהפיצול נועד למנוע.
 *
 * **הכפתור הראשי נשאר בראשון.** מי שכבר יודעת מה היא רוצה לא צריכה
 * לעבור דרך ההוכחה כדי להתחיל; המסך השני הוא בשביל מי שעוד מתלבטת,
 * והוא נמצא מאחורי לחיצה אחת ולא מאחורי גלילה שאולי לא תקרה.
 */
export default function SquishLanding() {
  const [mine, setMine] = useState<{ title: string; count: number } | null>(null);
  const [screen, setScreen] = useState<1 | 2>(1);

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

  const cta = mine ? "להוסיף סקווישי ←" : "לבנות את האוסף שלי ←";

  /* ══ מסך 1 — לוגו והזמנה ══ */
  if (screen === 1) {
    return (
      <main
        data-testid="squish-hero"
        className="min-h-[calc(100svh-5rem)] flex flex-col items-center justify-center px-6 py-10 gap-6 text-center"
      >
        {mine && (
          <a
            href="/squish/collection"
            className="w-full max-w-sm border-[1.5px] border-[var(--lavender)] bg-white px-4 py-3 flex items-center gap-3 text-start"
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

        <Logo />

        <p className="text-[17px] leading-relaxed font-semibold max-w-[19rem]">
          אנחנו יודעים שיש לכם אוסף סקווישים מטורף
        </p>
        <p className="text-[15px] leading-relaxed max-w-[19rem] text-[var(--ink)] -mt-3">
          תעלו את האוסף שלכם, תשתתפו באתגרים, תעשו טריידים ובעיקר תשוויצו
        </p>

        <div className="w-full max-w-sm flex flex-col gap-2.5">
          <a href="/squish/new" className="btn btn-primary" data-testid="hero-cta">
            {cta}
          </a>
          <button
            onClick={() => setScreen(2)}
            data-testid="to-preview"
            className="text-[13.5px] underline text-[var(--ink)] py-1"
          >
            לראות איך זה נראה
          </button>
          <p className="text-[13px] text-[var(--ink)] leading-relaxed">
            הגלריה פרטית. רואות אותה רק החברות שהזמנת.
          </p>
        </div>
      </main>
    );
  }

  /* ══ מסך 2 — ההוכחה: איך זה נראה כשזה שלך ══ */
  return (
    <main
      data-testid="squish-preview"
      className="min-h-[calc(100svh-5rem)] px-5 pt-4 pb-10 flex flex-col items-center gap-5"
    >
      <div className="w-full max-w-sm flex items-center">
        <button
          onClick={() => setScreen(1)}
          data-testid="back-to-hero"
          aria-label="חזרה"
          className="p-1 -me-1 text-[var(--muted)]"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M14 6 L8 12 L14 18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="flex-1 text-[1.3rem] leading-tight font-semibold tracking-[-0.02em] text-center pe-5">
          ככה זה ייראה אצלכם
        </h1>
      </div>

      <DemoCollection />

      <ol className="w-full max-w-sm flex flex-col gap-3 text-[13px]">
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

      <a href="/squish/new" className="btn btn-primary w-full max-w-sm" data-testid="preview-cta">
        {cta}
      </a>

      <p className="t-small text-[var(--muted)] text-center mt-auto pt-2">
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
 * הלוגו. קובץ בנתיב קבוע, ואם הוא עוד לא הועלה — סימן המותג הווקטורי
 * במקומו. מסך פתיחה עם אייקון תמונה שבורה גרוע ממסך פתיחה בלי לוגו.
 */
function Logo() {
  const [broken, setBroken] = useState(false);
  const check = useBrokenImage(setBroken);
  if (broken) {
    return (
      <div className="flex flex-col items-center gap-2" data-testid="squish-logo">
        <SquishOutline size={96} />
        <span className="text-[1.5rem] font-semibold tracking-[-0.02em]">{BRAND}</span>
      </div>
    );
  }
  return (
    <img
      ref={check}
      src="/squish-logo.png"
      alt={BRAND}
      data-testid="squish-logo"
      onError={() => setBroken(true)}
      className="w-52 max-w-[62%] h-auto"
    />
  );
}

/**
 * הגלריה לדוגמה.
 *
 * זו לא הדמיה מופשטת אלא **אותו כרטיס שהמסך האמיתי מרנדר** — אותו
 * ריבוע, אותה כותרת מתחת, אותה מדבקת טרייד בפינה. אם הכרטיס האמיתי
 * ישתנה, ההבטחה כאן תשתנה איתו במקום להישאר תמונה ישנה של המוצר.
 */
function DemoCollection() {
  const items = [
    { name: "צפרדע ענקית", trade: true },
    { name: "אבוקדו", trade: false },
    { name: "חד-קרן ורוד", trade: false },
    { name: "דונאט", trade: true },
    { name: "חתול שמן", trade: false },
    { name: "ענן", trade: false },
  ];
  const open = items.filter((i) => i.trade).length;

  return (
    <div className="w-full max-w-sm bg-white border border-[var(--line)] p-4 pb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold">האוסף של נועה</span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--muted)]">
          <SwapGlyph />
          {open} פתוחים לטרייד
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((it, i) => (
          <div key={i} className="squish-card text-start flex flex-col">
            <div className="relative aspect-square bg-[var(--cream)] flex items-center justify-center overflow-hidden">
              <SquishPlaceholder />
              {it.trade && (
                <span
                  className="absolute top-1 start-1 w-5 h-5 bg-[var(--lavender)] text-white flex items-center justify-center"
                  style={{ borderRadius: "999px" }}
                  aria-hidden
                >
                  <SwapGlyph size={11} />
                </span>
              )}
            </div>
            <div className="pt-1.5 px-0.5">
              <div className="text-[12.5px] font-medium truncate">{it.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
