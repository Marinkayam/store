"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OopsStall from "./oops-stall";

/**
 * מסך שגיאה — מה שרואים כשמשהו נשבר בכל זאת.
 *
 * בלי הקובץ הזה, שגיאה שלא נתפסה מציגה מסך לבן או טקסט באנגלית של Next.
 * ילד/ה שרואה מסך לבן חושב/ת ששבר/ה משהו, וקונה חושב/ת שהדוכן מפוקפק.
 * כאן רואים דוכן קטן שהתפרק (שלט "אופס!" על חוט אחד), משפט אחד, וכפתור
 * "לרענן" שמיישר את הדוכן באנימציה ואז באמת מנסה שוב: reset טוען מחדש רק
 * את החלק שנפל, ו-router.refresh מביא נתונים טריים מהשרת.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    // נרשם ללוגים של הדפדפן ושל וורסל — בלי זה אין דרך לדעת שזה קרה בכלל
    console.error("[duchan] unhandled:", error.message, error.digest ?? "");
    setFixing(false); // שגיאה חדשה (גם אחרי ניסיון שנכשל) — הדוכן שוב עקום
  }, [error]);

  function retry() {
    if (fixing) return;
    setFixing(true);
    // רגע לאנימציה של הדוכן שמתיישר — ואז ניסיון אמיתי
    setTimeout(() => {
      router.refresh();
      reset();
    }, 900);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-[var(--canvas)]">
      <OopsStall fixing={fixing} />
      <h1 className="text-xl font-bold">אופס! משהו השתבש אצלנו</h1>
      <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs">
        זו לא אשמתכם, זו תקלה שלנו, והיא כבר נרשמה.
        <br />
        רוב הפעמים רענון אחד מסדר את זה.
      </p>
      <button
        onClick={retry}
        disabled={fixing}
        data-testid="error-retry"
        aria-live="polite"
        className="fx-press bg-[var(--ink)] text-white px-6 min-h-12 text-[14px] font-bold flex items-center gap-2 disabled:opacity-90"
      >
        <svg
          aria-hidden
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={fixing ? "oops-spin" : ""}
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
        {fixing ? "מסדרים את הדוכן…" : "לרענן"}
      </button>
      <a href="/" className="text-[13px] text-[var(--muted)] underline">
        חזרה לדף הבית
      </a>
    </main>
  );
}
