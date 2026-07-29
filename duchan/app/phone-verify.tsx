"use client";

import { useEffect, useRef, useState } from "react";
import { displayPhone } from "@/lib/phone";

/**
 * אימות טלפון בשני מסכים קטנים: מספר → קוד.
 *
 * זה הרכיב היחיד שמאמת מספר, והוא משמש גם בהרשמה וגם בכניסה — כי מבחינת
 * הילד/ה זו אותה פעולה בדיוק. אין לו/לה מושג אם יש כבר חשבון, ואין סיבה
 * שהיא תצטרך לדעת.
 */
export default function PhoneVerify({
  title,
  subtitle,
  cta,
  onVerified,
}: {
  title: string;
  subtitle: string;
  cta: string;
  onVerified: (r: { isNew: boolean; hasStore: boolean; phone: string }) => void | Promise<void>;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showFindHelp, setShowFindHelp] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  /* המספר האחרון שאומת *במכשיר הזה*, כדי שלא יצטרכו להקליד אותו שוב
     בכל כניסה. הוא נשמר מקומית בלבד ולעולם לא נשלח לשום מקום — אנחנו
     כבר יודעים אותו, זה בדיוק המספר שאליו נשלח הקוד. */
  useEffect(() => {
    try {
      const last = localStorage.getItem("duchan-last-phone");
      if (last) setPhone(last);
    } catch {
      /* דפדפן שחוסם אחסון מקומי — פשוט לא ממלאים מראש */
    }
  }, []);

  // ספירה לאחור לכפתור "לא קיבלתי" — בלי זה היא לוחצת שוב ושוב ומקבלת שגיאה
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "לא הצלחנו לשלוח קוד");
        return;
      }
      setStep("code");
      setCode("");
      setCooldown(60);
    } catch {
      setErr("אין חיבור, לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "הקוד לא נכון");
        setCode("");
        return;
      }
      /* נשמר רק אחרי אימות מוצלח: מספר שהוקלד בטעות לא נדבק למכשיר */
      try { localStorage.setItem("duchan-last-phone", phone); } catch { /* אין אחסון */ }
      await onVerified(data);
    } catch {
      setErr("אין חיבור, לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <>
      <div className="w-full flex flex-col gap-3">
        <h1 className="t-title text-center">{title}</h1>
        <p className="t-sub text-center">{subtitle}</p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="050-123-4567"
          aria-label="מספר טלפון"
          className="field w-full px-4 py-4 text-center t-body tracking-wide"
          onKeyDown={(e) => e.key === "Enter" && phone.trim() && sendCode()}
        />
        {err && <p className="t-small text-[var(--danger)] text-center">{err}</p>}
        <button
          onClick={sendCode}
          disabled={busy || phone.replace(/\D/g, "").length < 9}
          className="btn btn-primary disabled:opacity-30"
        >
          {busy ? "שולחים…" : cta}
        </button>

        {/* לא כל ילד/ה יש לו/לה טלפון משלו/משלה — המספר יכול להיות של הורה,
            וזה בכוונה לא הערת שוליים אלא תיבה עצמאית */}
        <div className="bg-[var(--canvas)] border border-[var(--line)] px-3.5 py-3">
          <div className="t-body font-medium">אפשר גם מספר של אמא או אבא</div>
          <p className="t-small text-[var(--muted)] mt-1.5">
            הקוד צריך להגיע בהודעה שאפשר לראות. אם זה מספר של מבוגר,
            ההודעות על ההזמנות יגיעו אליו.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowFindHelp(true)}
          className="t-small text-[var(--muted)] underline"
        >
          לא יודעים מה המספר?
        </button>
      </div>

      {showFindHelp && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setShowFindHelp(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-6 max-h-[85%] overflow-y-auto">
            <div className="w-9 h-1 bg-black/15 mx-auto mb-3.5" />
            <div className="flex items-start justify-between mb-1">
              <h2 className="t-heading">איך מוצאים את המספר</h2>
              <button
                onClick={() => setShowFindHelp(false)}
                aria-label="סגירה"
                className="w-7 h-7 shrink-0 flex items-center justify-center text-[var(--muted)]"
              >
                ✕
              </button>
            </div>
            <p className="t-sub mb-5">שתי דרכים, לפי הטלפון:</p>

            <FindNumberSteps
              title="באייפון"
              steps={["פותחים הגדרות", "גוללים ונכנסים לאפליקציות ואז לטלפון", "המספר מופיע בשורה ‘המספר שלי’"]}
            />
            <FindNumberSteps
              title="באנדרואיד"
              steps={["פותחים הגדרות", "נכנסים לאודות הטלפון", "המספר מופיע בשורה ‘מספר הטלפון שלי’"]}
            />

            <button
              onClick={() => setShowFindHelp(false)}
              className="btn btn-primary w-full mt-2"
            >
              מצאנו, אפשר להמשיך
            </button>
          </div>
        </>
      )}
      </>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <h1 className="t-title text-center">הקוד שקיבלת</h1>
      <p className="t-sub text-center">
        שלחנו הודעה ל-{displayPhone(phone.replace(/\D/g, "").replace(/^0/, "972"))}
      </p>
      <input
        ref={codeRef}
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(v);
          // שש ספרות זה סוף הקלט — אין מה לחכות ללחיצה על כפתור
          if (v.length === 6) verify(v);
        }}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="______"
        aria-label="קוד אימות"
        className="field w-full px-4 py-4 text-center text-[1.75rem] font-medium tracking-[0.4em]"
      />
      {err && <p className="t-small text-[var(--danger)] text-center">{err}</p>}
      {busy && <p className="t-small text-[var(--muted)] text-center">רגע…</p>}
      <button
        onClick={() => setStep("phone")}
        className="t-small text-[var(--muted)] underline"
      >
        המספר לא נכון? לשנות
      </button>
      <button
        onClick={sendCode}
        disabled={cooldown > 0 || busy}
        className="t-small text-[var(--muted)] underline disabled:opacity-40 disabled:no-underline"
      >
        {cooldown > 0 ? `לא הגיעה הודעה? אפשר לשלוח שוב בעוד ${cooldown}` : "לא הגיעה הודעה? לשלוח שוב"}
      </button>
    </div>
  );
}

/** רשימת שלבים ממוספרת למציאת מספר הטלפון במכשיר */
function FindNumberSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="mb-4">
      <div className="t-body font-medium mb-2">{title}</div>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 py-2.5 border-b border-[var(--line)] last:border-0 t-small"
          >
            <span className="t-label pt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
