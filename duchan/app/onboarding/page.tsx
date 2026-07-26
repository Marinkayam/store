"use client";

import { useEffect, useState } from "react";
import PhoneVerify from "../phone-verify";

// אונבורדינג מינימלי: שם → מספר → קוד → דוכן.
//
// אין בחירת ערכה, אין קאבר, אין אמוג'י, אין מוצר ראשון. כל אחד מהם היה מסך
// נוסף בין הילדה לבין דוכן קיים, וכל מסך כזה הוא מקום לנטוש בו. הדוכן נוצר
// עם ברירות מחדל, והכל ניתן לשינוי אחר כך מההגדרות — שם, ממילא, היא כבר
// רואה מה היא משנה.

interface Draft {
  step: 1 | 2;
  displayName: string;
  ref: string | null; // הסלאג של הדוכן שממנו הגיעה (?ref= בדף הנחיתה)
}

const EMPTY: Draft = { step: 1, displayName: "", ref: null };

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem("duchan-draft");
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

export default function Onboarding() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    if (draft && !result) sessionStorage.setItem("duchan-draft", JSON.stringify(draft));
  }, [draft, result]);

  if (!draft) return null;

  /**
   * נקרא אחרי שהטלפון אומת בסמס — בשלב הזה כבר יש סשן, ולכן אין כאן הרשמה,
   * רק יצירת הדוכן. הטלפון נלקח בשרת מהמספר שאומת ולא מהלקוח.
   */
  async function save() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: draft!.displayName, ref: draft!.ref }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש, נסי שוב");
        return;
      }
      sessionStorage.removeItem("duchan-draft");
      setResult({ slug: data.slug });
    } catch {
      setErr("אין חיבור — נסי שוב");
    } finally {
      setBusy(false);
    }
  }

  const storeUrl = result ? `${window.location.origin}/s/${result.slug}` : "";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-6 max-w-md mx-auto">
      {/* 1 — שם */}
      {draft.step === 1 && !result && (
        <div className="w-full flex flex-col gap-4">
          <h1 className="text-xl font-bold text-center">איך קוראים לדוכן שלך?</h1>
          <input
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            placeholder="הדוכן של…"
            maxLength={40}
            autoFocus
            className="field w-full px-4 py-3.5 text-center text-base"
          />
          <button
            disabled={!draft.displayName.trim()}
            onClick={() => setDraft({ ...draft, step: 2 })}
            className="btn btn-primary py-3.5 text-[15px]"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 2 — מספר וקוד */}
      {draft.step === 2 && !result && (
        <div className="w-full flex flex-col gap-3">
          {busy ? (
            <p className="text-sm text-center py-10">פותחים את הדוכן…</p>
          ) : (
            <PhoneVerify
              title="עוד רגע והוא באוויר"
              subtitle="המספר שלך — לכאן יגיעו ההזמנות."
              cta="שלחו לי קוד"
              onVerified={save}
            />
          )}
          {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
          <button
            onClick={() => setDraft({ ...draft, step: 1 })}
            className="btn btn-tertiary text-[12px] py-1"
          >
            לשנות את השם
          </button>
        </div>
      )}

      {/* נשמר */}
      {result && (
        <div className="w-full flex flex-col gap-4 text-center">
          <div className="text-5xl">🎊</div>
          <h1 className="text-xl font-bold">הדוכן שלך נפתח</h1>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
            עכשיו מוסיפים מה שמוכרים.
            <br />
            הלינק לשיתוף נפתח כשמפרסמים.
          </p>
          <div className="card px-4 py-3 text-[13px] font-mono text-[var(--muted)]" dir="ltr">
            {storeUrl}
          </div>
          <a href="/dashboard/products" className="btn btn-primary py-3.5 text-[15px]">
            להוסיף מוצר ראשון ←
          </a>
          <a href="/dashboard" className="text-[13px] text-[var(--olive)] font-semibold">
            לניהול הדוכן
          </a>
        </div>
      )}
    </main>
  );
}
