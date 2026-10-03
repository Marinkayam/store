"use client";

import { useState } from "react";
import type { Store } from "@/lib/types";
import { shortStoreLink } from "@/lib/short-link";

/**
 * 🎵 טיקטוק — "רוב הקהל בטיקטוק".
 *
 * מה באמת מותר שם (נבדק 10/2026):
 *   • לינק לחיץ בביו — רק מגיל 18, ורק עם 1,000 עוקבים או חשבון עסקי.
 *     כלומר כמעט אף ילד/ה לא יכול/ה לשים לינק לחיץ.
 *   • לינק בכיתוב או בתגובה — מופיע, אבל לא לחיץ.
 *   • 13–15 בלי הודעות פרטיות.
 * לכן הדרך שעובדת לכולם: לינק קצר שכתוב על הסרטון עצמו, והקונים מקלידים
 * אותו. מכאן הלינק הקצר (duchan.app/qkubk) וכפתור העתקה אחד גדול, ורעיונות
 * לסרטון עם טקסט למסך וכיתוב מוכנים — כי "מה מצלמים?" הוא מה שעוצר.
 */
const IDEAS = [
  {
    key: "pack",
    label: "📦 אורזים הזמנה",
    screen: "אורזים הזמנה מהדוכן שלי 📦💜",
    caption: "עוד הזמנה יוצאת לדרך 💜",
    tags: "#packingorders #smallbusiness #דוכן #עבודתיד",
    tip: "מצלמים מלמעלה את הידיים אורזות. בלי פנים, בלי שמות.",
  },
  {
    key: "three",
    label: "✨ 3 מוצרים ב-10 שניות",
    screen: "3 דברים שאפשר להזמין אצלי ✨",
    caption: "איזה מהם הכי שלכם? 👇",
    tags: "#smallbusiness #handmade #דוכן #עבודתיד",
    tip: "כל מוצר 3 שניות, קרוב למצלמה, באור יום.",
  },
  {
    key: "drop",
    label: "🔥 דרופ חדש",
    screen: "דרופ חדש בדוכן! 🔥 מי ראשון?",
    caption: "יש מעט מכל אחד, אז מהר 🏃",
    tags: "#newdrop #smallbusiness #דוכן",
    tip: "מראים את כל החדשים ביחד, ואז אחד-אחד מקרוב.",
  },
  {
    key: "make",
    label: "🛠️ מכינים מאפס",
    screen: "מכינים מאפס ⏱️ חכו לסוף",
    caption: "ככה זה נראה מההתחלה ועד הסוף ✨",
    tags: "#handmade #satisfying #עבודתיד #דוכן",
    tip: "מצלמים כמה רגעים קצרים בזמן ההכנה, ומחברים לסרטון אחד.",
  },
] as const;

export default function TikTokCard({ store, onToast }: { store: Store; onToast: (m: string) => void }) {
  const [idea, setIdea] = useState<(typeof IDEAS)[number]["key"]>("pack");
  const host = typeof window !== "undefined" ? window.location.host : "duchan.app";
  const short = shortStoreLink(host, store.slug);
  const cur = IDEAS.find((i) => i.key === idea) ?? IDEAS[0];
  const onScreen = `${cur.screen}\n👇 ${short}`;
  const caption = `${cur.caption}\nהדוכן: ${short}\n${cur.tags}`;

  const copy = (t: string, msg: string) =>
    navigator.clipboard?.writeText(t).then(() => onToast(msg), () => onToast("לא הצלחנו להעתיק"));

  return (
    <div className="bg-[var(--ink)] text-white p-4" data-testid="tiktok-card">
      <div className="text-[15px] font-bold">🎵 לשתף בטיקטוק</div>
      <p className="text-[12.5px] text-white/80 leading-relaxed mt-1">
        כותבים את הלינק <b className="text-white">על הסרטון</b>, והקונים מקלידים אותו. בגלל זה הוא קצר.
      </p>

      {/* הלינק — גדול, ולוחצים עליו כדי להעתיק */}
      <button
        onClick={() => copy(short, "הלינק הועתק 🎵 עכשיו מדביקים על הסרטון")}
        data-testid="tiktok-copy-link"
        aria-label={`העתקת הלינק ${short}`}
        className="fx-press mt-3 w-full bg-white text-[var(--ink)] px-4 py-3.5 flex items-center justify-between gap-3"
      >
        <span className="text-[20px] font-extrabold tracking-tight truncate" dir="ltr" data-testid="tiktok-link">
          {short}
        </span>
        <span className="shrink-0 text-[12.5px] font-bold border border-[var(--ink)] px-2.5 py-1">📋 העתקה</span>
      </button>

      {/* איפה שמים — לפי מה שטיקטוק באמת מאפשר */}
      <ul className="mt-4 flex flex-col gap-2.5 text-[12.5px] leading-relaxed" data-testid="tiktok-where">
        <li className="flex gap-2.5">
          <span className="shrink-0 w-6 text-center" aria-hidden>✅</span>
          <span><b>על הסרטון</b> <span className="text-white/75">— בעריכה לוחצים על Aa ומדביקים. עובד לכולם.</span></span>
        </li>
        <li className="flex gap-2.5">
          <span className="shrink-0 w-6 text-center" aria-hidden>✅</span>
          <span><b>בכיתוב</b> <span className="text-white/75">— לא לחיץ, אבל רואים אותו ואפשר להעתיק.</span></span>
        </li>
        <li className="flex gap-2.5">
          <span className="shrink-0 w-6 text-center" aria-hidden>🔒</span>
          <span>
            <b>לינק לחיץ בביו</b>{" "}
            <span className="text-white/75">— בטיקטוק רק מגיל 18, עם 1,000 עוקבים או חשבון עסקי.</span>
          </span>
        </li>
      </ul>

      {/* רעיונות לסרטון */}
      <div className="mt-5 border-t border-white/20 pt-4">
        <div className="text-[13.5px] font-bold">🎬 מה מצלמים?</div>
        <div className="flex flex-wrap gap-1.5 mt-2.5" role="radiogroup" aria-label="רעיון לסרטון">
          {IDEAS.map((i) => (
            <button
              key={i.key}
              role="radio"
              aria-checked={idea === i.key}
              onClick={() => setIdea(i.key)}
              data-testid={`tiktok-idea-${i.key}`}
              className={`px-2.5 py-1.5 text-[12.5px] border ${
                idea === i.key ? "bg-white text-[var(--ink)] border-white font-bold" : "border-white/35 text-white"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-white/75 leading-relaxed mt-2.5" data-testid="tiktok-tip">💡 {cur.tip}</p>

        <div className="mt-3 text-[11.5px] font-bold text-white/70">טקסט על המסך</div>
        <div className="mt-1 bg-white/10 px-3 py-2.5 text-[13.5px] font-bold leading-relaxed whitespace-pre-line" data-testid="tiktok-screen">
          {onScreen}
        </div>
        <button
          onClick={() => copy(onScreen, "הטקסט הועתק — מדביקים ב-Aa")}
          data-testid="tiktok-copy-screen"
          className="fx-press mt-1.5 w-full bg-white text-[var(--ink)] py-2.5 text-[12.5px] font-bold"
        >
          העתקת הטקסט למסך
        </button>

        <div className="mt-3 text-[11.5px] font-bold text-white/70">כיתוב</div>
        <div className="mt-1 bg-white/10 px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-line" data-testid="tiktok-caption">
          {caption}
        </div>
        <button
          onClick={() => copy(caption, "הכיתוב הועתק ✨")}
          data-testid="tiktok-copy-caption"
          className="fx-press mt-1.5 w-full border border-white/50 py-2.5 text-[12.5px] font-bold"
        >
          העתקת הכיתוב
        </button>
      </div>

      <p className="text-[11px] text-white/60 leading-relaxed mt-4">
        טיקטוק מותר מגיל 13. בסרטונים לא מראים פנים, בית ספר או כתובת. רק את המוצרים.
      </p>
    </div>
  );
}
