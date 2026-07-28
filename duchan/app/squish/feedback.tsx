"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { track } from "@/lib/squish-analytics";

/**
 * שאלה אחת אחרי רגע משמעותי, בפיילוט הסגור.
 *
 * שלושה כללים:
 * 1. **פעם אחת לכל רגע.** unique(user_id, moment) בדאטהבייס, ובדיקה
 *    לפני ההצגה — כדי שלא נשאל את אותה שאלה בכל כניסה.
 * 2. **שלוש בחירות ושדה חופשי לא חובה.** סולם 1–10 לא אומר כלום לילדה
 *    בת עשר, ושאלה פתוחה לבדה מקבלת תשובות ריקות.
 * 3. **אפשר לדלג בלי לענות**, וזה נרשם כדילוג ולא חוזר.
 *
 * הטקסט החופשי נשמר בדאטהבייס בלבד ולא נשלח לאנליטיקס אף פעם.
 */

export type Moment =
  | "collection_activated"
  | "first_discover"
  | "first_proposal"
  | "trade_closed";

const QUESTIONS: Record<Moment, { q: string; a: [string, string, string] }> = {
  collection_activated: {
    q: "איך היה לבנות את האוסף?",
    a: ["היה קל", "לקח לי זמן", "היה מבלבל"],
  },
  first_discover: {
    q: 'מה חשבת על "לגלות"?',
    a: ["מצאתי משהו שאני רוצה", "היה נחמד", "לא היה לי מה לראות"],
  },
  first_proposal: {
    q: "איך היה לשלוח הצעת טרייד?",
    a: ["ידעתי בדיוק מה לעשות", "הבנתי אחרי רגע", "לא הייתי בטוחה"],
  },
  trade_closed: {
    q: "איך הלך הטרייד?",
    a: ["מעולה", "בסדר", "לא הצלחנו"],
  },
};

export default function Feedback({ moment }: { moment: Moment }) {
  const [show, setShow] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // מציגים רק בפיילוט, ורק אם לא נשאלה כבר על הרגע הזה
    if (process.env.NEXT_PUBLIC_SQUISH_FEEDBACK !== "1") return;
    (async () => {
      const supa = supabaseBrowser();
      const { data: auth } = await supa.auth.getUser();
      if (!auth.user) return;
      const { data } = await supa
        .from("squish_feedback")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("moment", moment)
        .maybeSingle();
      if (!data) setShow(true);
    })();
  }, [moment]);

  async function save(c: string, text: string) {
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) return;
    await supa
      .from("squish_feedback")
      .upsert({ user_id: auth.user.id, moment, choice: c, note: text.slice(0, 400) || null },
        { onConflict: "user_id,moment" });
    // רק הבחירה נשלחת לאנליטיקס. הטקסט החופשי אף פעם.
    track("squish_feedback_given", { moment, choice: c });
    setDone(true);
    setTimeout(() => setShow(false), 1600);
  }

  if (!show) return null;
  const { q, a } = QUESTIONS[moment];

  if (done)
    return (
      <div className="border border-[var(--line)] bg-white p-3 text-center t-small">
        תודה! זה עוזר לנו מאוד 💛
      </div>
    );

  return (
    <div className="border border-[var(--line)] bg-white p-3 flex flex-col gap-2">
      <div className="t-small font-medium">{q}</div>
      <div className="flex flex-col gap-1.5">
        {a.map((opt) => (
          <button
            key={opt}
            onClick={() => setChoice(opt)}
            aria-pressed={choice === opt}
            className={`border px-3 py-2 text-[13px] text-start ${
              choice === opt ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-[var(--line)]"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {choice && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="רוצה להוסיף משהו? (לא חובה)"
            maxLength={400}
            className="border border-[var(--line)] px-3 py-2 text-[13px]"
          />
          <button
            onClick={() => save(choice, note)}
            className="btn btn-primary t-small"
          >
            לשלוח
          </button>
        </>
      )}
      <button
        onClick={() => save("skipped", "")}
        className="t-small text-[var(--muted)] underline"
      >
        לא עכשיו
      </button>
    </div>
  );
}
