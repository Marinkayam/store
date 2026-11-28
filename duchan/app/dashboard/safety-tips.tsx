"use client";

import { useEffect, useState } from "react";

/**
 * לפני שמוסרים הזמנה: טיפים לבטיחות.
 *
 * מרינה, 11.2026: "להוסיף אזהרה שאם מישהו מזמין מכם, שימו לב לא להיפגש
 * איתו לבד, לוודא שהמזמין אמין, למסור את המוצר רק אחרי קבלת הכסף, ועוד
 * דברים". מופיע במסך ההזמנות כשיש הזמנה שמחכה. בפעם הראשונה ככרטיס פתוח
 * עם "הבנו", ואחר כך כשורה אחת שאפשר לפתוח שוב (כדי שלא יחפור).
 * הרשימה עצמה מוצגת גם להורים, בדף ההורה (app/parent).
 */

export const SAFETY_TIPS: { title: string; body: string }[] = [
  { title: "לא נפגשים לבד עם מי שהזמין", body: "מוסרים עם הורה או עם חבר, במקום שאתם מכירים. לא הולכים למקום שהקונה בחר." },
  { title: "מוסרים רק אחרי שהכסף הגיע", body: "בודקים בעצמכם בביט או בפייבוקס שהכסף נכנס. צילום מסך של תשלום הוא לא הוכחה." },
  { title: "מוודאים שהקונה אמין", body: "קונה שאתם לא מכירים? מראים את ההזמנה להורים לפני שעונים." },
  { title: "לא שולחים פרטים אישיים", body: "לא כתובת, לא שם בית ספר ולא תמונות שלכם. לא צריך את זה כדי למכור." },
  { title: "קוד שמגיע בסמס לא נותנים לאף אחד", body: "גם לא למי שאומר שהוא מדוכן. אנחנו אף פעם לא מבקשים קוד." },
  { title: "משהו מרגיש מוזר? עוצרים ומספרים להורים", body: "מישהו לוחץ, מציע יותר כסף, מבקש להחזיר לו כסף או מבקש תמונה. מותר לבטל הזמנה." },
];

function TipList() {
  return (
    <ol className="flex flex-col gap-3 mt-3">
      {SAFETY_TIPS.map((t, i) => (
        <li key={t.title} className="flex gap-3">
          <span className="w-6 h-6 shrink-0 flex items-center justify-center border border-[var(--line)] text-[12px]" aria-hidden>
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold leading-snug">{t.title}</div>
            <div className="text-[12.5px] text-[var(--muted)] leading-relaxed">{t.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function SafetyTips({ storeId }: { storeId: string }) {
  const key = `duchan-safety-seen-${storeId}`;
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setSeen(!!localStorage.getItem(key));
    } catch {
      setSeen(false);
    }
  }, [key]);
  if (seen === null) return null;

  if (!seen)
    return (
      <section className="bg-white border border-[var(--line)] p-4" data-testid="safety-tips" aria-labelledby="safety-title">
        <h2 id="safety-title" className="text-[15px] font-bold">לפני שמוסרים הזמנה</h2>
        <TipList />
        <button
          onClick={() => {
            try {
              localStorage.setItem(key, "1");
            } catch {}
            setSeen(true);
          }}
          className="mt-4 w-full bg-[var(--ink)] text-white py-3 text-[14px] font-bold"
          data-testid="safety-ok"
        >
          הבנו
        </button>
      </section>
    );

  return (
    <details className="bg-white border border-[var(--line)] -mb-1" data-testid="safety-tips-line">
      <summary className="min-h-11 px-4 flex items-center text-[13px] cursor-pointer">לפני שמוסרים הזמנה: טיפים לבטיחות</summary>
      <div className="px-4 pb-4">
        <TipList />
      </div>
    </details>
  );
}

/** לדף ההורה: אותה רשימה, רק הכותרות */
export function SafetyTipsForParents() {
  return (
    <div className="bg-white border border-[var(--line)] p-4 mt-2" data-testid="parent-safety-tips">
      <div className="text-[14px] font-bold">מה אנחנו אומרים לילדים כשמגיעה הזמנה</div>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed list-disc pr-5">
        {SAFETY_TIPS.map((t) => (
          <li key={t.title}>{t.title}</li>
        ))}
      </ul>
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-2">כדאי לעבור על זה יחד, ולסכם איפה ועם מי מוסרים הזמנות.</p>
    </div>
  );
}
