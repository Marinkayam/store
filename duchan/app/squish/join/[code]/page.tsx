"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "@/app/phone-verify";
import { BRAND } from "@/lib/squish";
import { SquishOutline, SwapGlyph } from "../../components";

/**
 * הצטרפות למעגל דרך קישור הזמנה אישי.
 *
 * שלושה מצבים, לפי מי שנחתה כאן:
 * 1. מחוברת — לוחצת "להצטרף", והחיבור נוצר מיד.
 * 2. לא מחוברת ויש לה חשבון — נכנסת בסמס וזהו.
 * 3. אין לה כלום — נכנסת בסמס, מצטרפת, ומופנית לבנות אוסף.
 *
 * החיבור נוצר בפונקציה בשרת (squish_join) ולא בלקוח: הצד ההופכי נכתב
 * בשם המזמינה, ואי אפשר לתת ללקוח את ההרשאה הזו.
 */
export default function JoinCircle({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [inviter, setInviter] = useState<{ nickname: string; items: number; open: number } | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ nickname: string; already: boolean } | null>(null);

  useEffect(() => {
    // ספירת לחיצה, ומי הזמינה — בלי לחשוף פרטים אישיים
    fetch(`/api/squish/invite/${code}`)
      .then((r) => r.json())
      .then((d) => d?.nickname && setInviter(d))
      .catch(() => {});
    supabaseBrowser().auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, [code]);

  const join = useCallback(async () => {
    setBusy(true);
    setErr("");
    const supa = supabaseBrowser();
    const { data, error } = await supa.rpc("squish_join", { p_code: code });
    setBusy(false);
    if (error) {
      console.error("[squish] join failed:", error.message);
      setErr(
        /own circle/.test(error.message)
          ? "זה קישור ההזמנה שלך :)"
          : "לא הצלחנו לצרף אותך, לנסות שוב"
      );
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setDone({ nickname: row?.nickname ?? "החברה שלך", already: !!row?.already });
  }, [code]);

  if (done) {
    return (
      <Shell>
        <div className="text-center flex flex-col items-center gap-3">
          <div className="text-5xl squish-breathe">🎉</div>
          <h1 className="t-title">
            {done.already ? `כבר הייתן מחוברות` : `הצטרפת למעגל של ${done.nickname}`}
          </h1>
          <p className="t-sub max-w-[19rem]">
            עכשיו אתן רואות אחת את הגלריה של השנייה, ואפשר להציע טריידים.
          </p>
          <a href="/squish/discover" className="btn btn-primary w-full max-w-sm mt-1">
            לראות מה יש לה ←
          </a>
          <a href="/squish/collection" className="btn btn-secondary w-full max-w-sm">
            לאוסף שלי
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center flex flex-col items-center gap-3">
        <SquishOutline size={64} />
        <h1 className="t-title">
          {inviter ? `${inviter.nickname} הזמינה אותך למעגל שלה` : "הזמנה למעגל"}
        </h1>
        <p className="t-sub max-w-[20rem]">
          {inviter
            ? `${inviter.nickname} פתחה אוסף ב${BRAND}. הצטרפי כדי לראות אם יש לכן סקווישים שמתאימים לטרייד.`
            : "בודקים את ההזמנה…"}
        </p>

        {inviter && (
          <p className="t-small text-[var(--muted)] flex items-center gap-2">
            <span>{inviter.items} סקווישים</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <SwapGlyph />
              {inviter.open} פתוחים לטרייד
            </span>
          </p>
        )}

        {err && <p className="t-small text-[var(--danger)]">{err}</p>}

        {signedIn === null ? null : signedIn ? (
          <button onClick={join} disabled={busy} className="btn btn-primary w-full max-w-sm mt-1">
            {busy ? "רגע…" : `להצטרף למעגל של ${inviter?.nickname ?? "החברה"}`}
          </button>
        ) : (
          <div className="w-full max-w-sm mt-1">
            <PhoneVerify
              title="קודם ניכנס"
              subtitle={`אותו חשבון כמו בדוכן. אם עוד אין לך, ניצור אחד עכשיו.`}
              cta="שלחו לי קוד"
              onVerified={join}
            />
          </div>
        )}

        <p className="t-small text-[var(--muted)] mt-2 leading-relaxed max-w-[20rem]">
          המעגל פרטי. אף אחת לא רואה מספרי טלפון, כתובת או בית ספר.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] max-w-md mx-auto px-5 py-10 flex flex-col justify-center">
      {children}
      <p className="text-center text-[11px] text-[var(--muted)] pt-10">
        <a href="/squish" className="underline">{BRAND}</a>
        {" · "}
        <a href="/terms" className="underline">תנאים</a>
      </p>
    </main>
  );
}
