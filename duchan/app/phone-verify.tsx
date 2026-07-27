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
      setErr("אין חיבור — לנסות שוב");
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
      await onVerified(data);
    } catch {
      setErr("אין חיבור — לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <>
      <div className="w-full flex flex-col gap-3">
        <h1 className="text-lg font-bold text-center">{title}</h1>
        <p className="text-[12.5px] text-[var(--muted)] text-center -mt-1 leading-relaxed">{subtitle}</p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="050-123-4567"
          aria-label="מספר טלפון"
          className="w-full border border-[var(--line)] bg-white px-4 py-3 text-center text-base tracking-wide"
          onKeyDown={(e) => e.key === "Enter" && phone.trim() && sendCode()}
        />
        {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
        <button
          onClick={sendCode}
          disabled={busy || phone.replace(/\D/g, "").length < 9}
          className="bg-[var(--ink)] text-white py-3.5 text-sm font-bold disabled:opacity-30"
        >
          {busy ? "שולחים…" : cta}
        </button>

        {/* לא כל ילד/ה יש לו/לה טלפון משלו/משלה — המספר יכול להיות של הורה,
            וזה בכוונה לא הערת שוליים אלא תיבה עצמאית */}
        <div className="bg-[var(--canvas)] border border-[var(--line)] px-3.5 py-3">
          <div className="text-[12.5px] font-semibold">אפשר גם מספר של אמא או אבא</div>
          <p className="text-[11.5px] text-[var(--muted)] leading-relaxed mt-1">
            הקוד צריך להגיע בהודעה שאפשר לראות. אם זה מספר של מבוגר —
            ההודעות על ההזמנות יגיעו אליו.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowFindHelp(true)}
          className="text-[11.5px] text-[var(--muted)] underline"
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
              <h2 className="text-base font-bold">איך מוצאים את המספר</h2>
              <button
                onClick={() => setShowFindHelp(false)}
                aria-label="סגירה"
                className="w-7 h-7 shrink-0 flex items-center justify-center text-[var(--muted)]"
              >
                ✕
              </button>
            </div>
            <p className="text-[12.5px] text-[var(--muted)] mb-4">שתי דרכים, לפי הטלפון:</p>

            <FindNumberSteps
              title="באייפון"
              steps={["פותחים הגדרות", "נכנסים לכללי ואז לאודות", "המספר מופיע בשורה ‘מספר טלפון’"]}
            />
            <FindNumberSteps
              title="באנדרואיד"
              steps={["פותחים הגדרות", "נכנסים לאודות הטלפון ואז למצב", "המספר מופיע בשורה ‘מספר טלפון’"]}
            />

            <button
              onClick={() => setShowFindHelp(false)}
              className="w-full bg-[var(--ink)] text-white py-3 text-sm font-bold mt-2"
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
      <h1 className="text-lg font-bold text-center">הקוד שקיבלת</h1>
      <p className="text-[12.5px] text-[var(--muted)] text-center -mt-1">
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
        className="w-full border border-[var(--line)] bg-white px-4 py-3.5 text-center text-2xl font-bold tracking-[0.5em]"
      />
      {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
      {busy && <p className="text-xs text-[var(--muted)] text-center">רגע…</p>}
      <button
        onClick={() => setStep("phone")}
        className="text-xs text-[var(--muted)] underline"
      >
        המספר לא נכון? לשנות
      </button>
      <button
        onClick={sendCode}
        disabled={cooldown > 0 || busy}
        className="text-xs text-[var(--muted)] underline disabled:opacity-40 disabled:no-underline"
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
      <div className="text-[13px] font-bold mb-1.5">{title}</div>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li
            key={i}
            className="flex gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0 text-[13px]"
          >
            <span className="text-[var(--faint)] text-[11px] pt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
