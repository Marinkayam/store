"use client";

import { useEffect, useRef, useState } from "react";
import { displayPhone } from "@/lib/phone";
import VSteps from "./v-steps";

/**
 * אימות טלפון בשני מסכים קטנים: מספר → קוד.
 *
 * זה הרכיב היחיד שמאמת מספר, והוא משמש גם בהרשמה וגם בכניסה — כי מבחינת
 * הילד/ה זו אותה פעולה בדיוק. אין לו/לה מושג אם יש כבר חשבון, ואין סיבה
 * שהיא תצטרך לדעת.
 */
/** אחרי כמה שניות בלי קוד מופיע כפתור "לא קיבלתי קוד" */
const HELP_AFTER = 120;

export default function PhoneVerify({
  title,
  subtitle,
  cta,
  onVerified,
}: {
  title: string;
  subtitle: string;
  cta: string;
  onVerified: (r: { isNew: boolean; hasStore: boolean; phone: string; invite?: string }) => void | Promise<void>;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showFindHelp, setShowFindHelp] = useState(false);
  /* מתי נשלח הקוד — אחרי HELP_AFTER שניות מופיע "לא קיבלתי קוד". לפי שעון
     ולא לפי ספירת טיקים: כשעוברים לאפליקציית ההודעות לחפש את הקוד, הדפדפן
     מאט טיימרים ברקע, וספירה הייתה נתקעת. */
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const waited = sentAt ? (now - sentAt) / 1000 : 0;
  const [help, setHelp] = useState<"idle" | "busy" | "sent" | "error">("idle");
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

  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  /* "לא קיבלתי קוד" — מגיע לחמ"ל כפוש, ומשם שולחים קישור כניסה בוואטסאפ */
  async function askHelp() {
    setHelp("busy");
    try {
      const res = await fetch("/api/auth/sms/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      setHelp(res.ok ? "sent" : "error");
    } catch {
      setHelp("error");
    }
  }

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
        setErr(data.error ?? "לא הצלחנו לשלוח קוד. בודקים שהמספר נכון ומנסים שוב.");
        return;
      }
      setStep("code");
      setCode("");
      setCooldown(60);
      setSentAt(Date.now());
      setNow(Date.now());
    } catch {
      setErr("אין חיבור לאינטרנט. אפשר לנסות שוב בעוד רגע.");
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
        setErr(data.error ?? "הקוד לא נכון. אפשר להקליד אותו שוב.");
        setCode("");
        return;
      }
      /* נשמר רק אחרי אימות מוצלח: מספר שהוקלד בטעות לא נדבק למכשיר */
      try { localStorage.setItem("duchan-last-phone", phone); } catch { /* אין אחסון */ }
      await onVerified(data);
    } catch {
      setErr("אין חיבור לאינטרנט. אפשר לנסות שוב בעוד רגע.");
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
        <label htmlFor="pv-phone" className="t-small font-medium -mb-1.5">מספר הטלפון</label>
        <input
          id="pv-phone"
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

        {/* "של מי המספר" ו"איך מוצאים אותו" הן אותה שאלה מבחינת מי ששואלת,
            ולכן הן יושבות באותה מגירה. קודם הן היו שני דברים נפרדים על
            המסך — תיבה שכולן קוראות וקישור שרק התוהות פותחות. */}
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
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[85%] overflow-y-auto">
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
            {/* קודם *של מי* המספר, ורק אחר כך איך מוצאים אותו: ילדה בלי
                טלפון משלה תוקעת כאן, ורשימת הוראות לא עוזרת לה. */}
            <div className="bg-[var(--canvas)] border border-[var(--line)] px-3.5 py-3 mb-5">
              <div className="t-body font-medium">אפשר גם מספר של אמא או אבא</div>
              <p className="t-small text-[var(--muted)] mt-1.5">
                הקוד צריך להגיע בהודעה שאפשר לראות. אם זה מספר של מבוגר,
                ההודעות על ההזמנות יגיעו אליו.
              </p>
            </div>

            <p className="t-sub mb-3">ואם זה הטלפון שלך — ככה מוצאים אותו:</p>

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
      <h1 className="t-title text-center">מחכים לקוד</h1>
      <p className="t-sub text-center">
        שלחנו SMS עם קוד של 6 ספרות ל-<bdi>{displayPhone(phone.replace(/\D/g, "").replace(/^0/, "972"))}</bdi>.
        <br />
        כשההודעה מגיעה, מקלידים את הקוד כאן:
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

      {/* אחרי 2 דקות בלי קוד: כפתור עזרה שמגיע ישר אלינו */}
      {waited < HELP_AFTER ? (
        <p className="t-small text-[var(--muted)] text-center" data-testid="code-wait">
          ההודעה בדרך… אם לא תגיע תוך 2 דקות, יופיע כאן כפתור עזרה.
        </p>
      ) : help === "sent" ? (
        <div role="status" data-testid="code-help-sent" className="bg-[var(--ok-bg)] border border-[var(--ok-line)] p-3.5 text-center">
          <div className="t-body font-bold">קיבלנו! אנחנו על זה</div>
          <p className="t-small text-[var(--muted)] mt-1 leading-relaxed">
            נשלח הודעת וואטסאפ למספר הזה, עם קישור שנכנסים בו בלי קוד.
            אפשר לסגור את המסך ולחכות להודעה.
          </p>
        </div>
      ) : (
        <div className="bg-white border-[1.5px] border-[var(--ink)] p-3.5 text-center" data-testid="code-help-box">
          <div className="t-body font-bold">עברו 2 דקות ועוד אין קוד?</div>
          <p className="t-small text-[var(--muted)] mt-1">לוחצים כאן, ואנחנו נעזור להיכנס.</p>
          <button onClick={askHelp} disabled={help === "busy"} data-testid="code-help"
            className="btn btn-primary w-full mt-2.5 disabled:opacity-50">
            {help === "busy" ? "שולחים…" : "לא קיבלתי קוד"}
          </button>
          {help === "error" && <p className="t-small text-[var(--danger)] mt-2">לא הצלחנו לשלוח. אפשר לנסות שוב.</p>}
        </div>
      )}

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
        {cooldown > 0 ? `לא הגיעה הודעה? אפשר לשלוח שוב בעוד ${cooldown} שניות` : "לא הגיעה הודעה? לשלוח שוב"}
      </button>
    </div>
  );
}

/** רשימת שלבים ממוספרת למציאת מספר הטלפון במכשיר */
function FindNumberSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="mb-4">
      <div className="t-body font-medium mb-2">{title}</div>
      <VSteps compact steps={steps.map((st, i) => ({ key: String(i), title: <span className="font-normal">{st}</span> }))} />
    </div>
  );
}
