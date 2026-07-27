"use client";

import Icon from "./icons";

import { useEffect } from "react";

/**
 * מסך שגיאה — מה שרואים כשמשהו נשבר בכל זאת.
 *
 * בלי הקובץ הזה, שגיאה שלא נתפסה מציגה מסך לבן או טקסט באנגלית של Next.
 * ילדה שרואה מסך לבן חושבת שהיא שברה משהו, וקונה חושבת שהחנות מפוקפקת.
 * כאן היא רואה משפט אחד בעברית וכפתור אחד שמנסה שוב באמת — reset טוען
 * מחדש רק את החלק שנפל, בלי לאבד את מה שהיא הקלידה במסכים אחרים.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // נרשם ללוגים של הדפדפן ושל וורסל — בלי זה אין דרך לדעת שזה קרה בכלל
    console.error("[duchan] unhandled:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-[var(--canvas)]">
      <Icon name="cloud" size={58} tone="var(--sand)" className="text-[var(--wood)]" />
      <h1 className="text-xl font-bold">משהו השתבש אצלנו</h1>
      <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs">
        זו לא את — זו תקלה שלנו, והיא נרשמה.
        <br />
        רוב הפעמים ניסיון נוסף פותר את זה.
      </p>
      <button
        onClick={reset}
        className="bg-[var(--ink)] text-white px-6 py-3 text-[14px] font-bold"
      >
        לנסות שוב
      </button>
      <a href="/" className="text-[13px] text-[var(--olive)] underline">
        חזרה לדף הבית
      </a>
    </main>
  );
}
