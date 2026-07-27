"use client";

import { useEffect, useRef, useState } from "react";
import { displayPhone } from "@/lib/phone";

/**
 * אימות טלפון בשני מסכים קטנים: מספר → קוד.
 *
 * זה הרכיב היחיד שמאמת מספר, והוא משמש גם בהרשמה וגם בכניסה — כי מבחינת
 * הילדה זו אותה פעולה בדיוק. אין לה מושג אם יש לה כבר חשבון, ואין סיבה
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
      setErr("אין חיבור — נסי שוב");
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
      setErr("אין חיבור — נסי שוב");
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
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
        <p className="text-[11.5px] text-[var(--faint)] text-center leading-relaxed">
          נשלח לך קוד בהודעה. זה גם המספר שאליו יגיעו ההזמנות בוואטסאפ.
        </p>
      </div>
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
        {cooldown > 0 ? `לא קיבלתי — אפשר לשלוח שוב בעוד ${cooldown}` : "לא קיבלתי, לשלוח שוב"}
      </button>
    </div>
  );
}
