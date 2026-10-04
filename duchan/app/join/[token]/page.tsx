"use client";

import RoleGuide from "@/app/role-guide";
import { use, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pickStore } from "@/app/dashboard/use-store";

/**
 * הצטרפות לדוכן משותף (0057). מגיעים לכאן מהלינק שראש הדוכן שלח.
 *
 * 1. רואים לאיזה דוכן מזמינים ולאיזה מספר.
 * 2. לא מחוברים? נכנסים בסמס עם המספר הזה (ואז חוזרים לכאן לבד).
 * 3. מסמנים שההורים יודעים, ולוחצים "להצטרף".
 * לינק שהועבר הלאה לא מכניס אף אחד — השרת בודק שהמספר המאומת הוא המספר שהוזמן.
 */
type Info = { state: "open" | "expired" | "cancelled" | "accepted"; store: { name: string; emoji: string }; phone: string };

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wrongPhone, setWrongPhone] = useState(false);

  useEffect(() => {
    fetch(`/api/team/join?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setMissing(true)))
      .catch(() => setMissing(true));
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setLoggedIn(!!data.user))
      .catch(() => setLoggedIn(false));
  }, [token]);

  const next = `/join/${token}`;

  async function join() {
    if (busy) return;
    if (!consent) {
      setError("צריך לסמן שההורים יודעים ומאשרים");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/team/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "משהו השתבש. אפשר לנסות שוב.");
        setWrongPhone(!!d.wrongPhone);
        return;
      }
      pickStore(d.storeId);
      window.location.assign("/dashboard");
    } catch {
      setError("אין חיבור לאינטרנט. אפשר לנסות שוב בעוד רגע.");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    await supabaseBrowser().auth.signOut().catch(() => {});
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-[var(--canvas)]">
      <div className="w-full max-w-sm flex flex-col gap-4 text-center" data-testid="join-page">
        {missing ? (
          <>
            <div className="text-5xl" aria-hidden>🤔</div>
            <h1 className="text-xl font-bold">ההזמנה לא נמצאה</h1>
            <p className="text-[13.5px] text-[var(--muted)]">אולי הלינק נחתך. אפשר לבקש מראש הדוכן לשלוח אותו שוב.</p>
          </>
        ) : !info ? (
          <p className="text-sm text-[var(--muted)]">רגע…</p>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto bg-white border border-[var(--line)] flex items-center justify-center text-5xl" aria-hidden>
              {info.store.emoji}
            </div>
            <div>
              <p className="text-[13px] text-[var(--muted)]">מזמינים אותך לנהל יחד את</p>
              <h1 className="text-[22px] font-bold mt-0.5" data-testid="join-store">{info.store.name}</h1>
            </div>

            {info.state !== "open" ? (
              <div className="bg-white border border-[var(--line)] p-4 text-[13.5px] leading-relaxed" data-testid="join-closed">
                {info.state === "expired"
                  ? "פג התוקף של ההזמנה: היא תקפה לשבוע בלבד. אפשר לבקש מראש הדוכן הזמנה חדשה."
                  : info.state === "cancelled"
                    ? "ההזמנה בוטלה. אפשר לבקש מראש הדוכן הזמנה חדשה."
                    : "ההזמנה הזו כבר נוצלה."}
                {info.state === "accepted" && (
                  <a href="/dashboard" className="block underline mt-2">לדוכנים שלי ←</a>
                )}
              </div>
            ) : loggedIn === false ? (
              <div className="bg-white border border-[var(--line)] p-4 flex flex-col gap-3">
                <p className="text-[13.5px] leading-relaxed">
                  כדי להצטרף נכנסים עם המספר <b dir="ltr">{info.phone}</b>. מקבלים קוד בסמס, וחוזרים לכאן לבד.
                </p>
                <a
                  href={`/login?next=${encodeURIComponent(next)}`}
                  data-testid="join-login"
                  className="bg-[var(--ink)] text-white py-3 text-[14px] font-bold"
                >
                  כניסה עם הטלפון
                </a>
              </div>
            ) : loggedIn ? (
              <div className="bg-white border border-[var(--line)] p-4 flex flex-col gap-3 text-right">
                <RoleGuide who="invitee" compact />
                <label className="flex items-start gap-2.5 text-[13.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-label="ההורים שלי יודעים ומאשרים"
                    data-testid="join-consent"
                    className="mt-1 w-5 h-5 shrink-0"
                  />
                  <span>ההורים שלי יודעים שאני מצטרף/ת לדוכן, ומאשרים</span>
                </label>
                <button
                  onClick={join}
                  disabled={busy}
                  data-testid="join-submit"
                  className="bg-[var(--ink)] text-white py-3 text-[14px] font-bold disabled:opacity-60"
                >
                  {busy ? "מצטרפים…" : "להצטרף לדוכן"}
                </button>
                {error && (
                  <p className="text-[12.5px] text-[var(--danger)] leading-relaxed" role="alert" data-testid="join-error">
                    {error}
                  </p>
                )}
                {wrongPhone && (
                  <button onClick={switchAccount} className="text-[12.5px] underline" data-testid="join-switch">
                    להתנתק ולהיכנס עם המספר הנכון
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">רגע…</p>
            )}
          </>
        )}
        <a href="/" className="text-[12px] text-[var(--muted)]">דוכן · דוכנים קטנים של ילדים</a>
      </div>
    </main>
  );
}
