"use client";

import { use, useState } from "react";
import { BRAND, PARENT_APPROVAL_COPY, parentApprovalEnabled } from "@/lib/squish";

/**
 * מה שההורה רואה.
 *
 * דף אחד, בלי חשבון ובלי התחברות: הוא הגיע לכאן מקישור בסמס למספר שלו,
 * וזו כל ההוכחה שצריך. אין כאן דשבורד, אין מעקב, ואין מה "לנהל" —
 * שתי אפשרויות, ותשובה.
 */
export default function ParentApproval({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [done, setDone] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!parentApprovalEnabled()) {
    return (
      <Shell>
        <p className="t-small text-[var(--muted)] text-center">אין כאן כלום 🌵</p>
      </Shell>
    );
  }

  async function decide(approved: boolean) {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/squish/parent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, approved }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr("לא הצלחנו לשמור. אפשר לנסות שוב.");
      return;
    }
    setDone(approved);
  }

  if (done !== null)
    return (
      <Shell>
        <div className="text-center flex flex-col gap-2">
          <div className="text-4xl">{done ? "✅" : "🙏"}</div>
          <h1 className="t-title">{done ? "תודה, האישור נשמר" : "תודה, ההחלטה נשמרה"}</h1>
          <p className="t-sub">
            {done
              ? "אפשר לסגור את החלון."
              : "לא נאשר את האוסף. אם זו הייתה טעות, אפשר לפנות אלינו."}
          </p>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <h1 className="t-title text-center">{BRAND} — אישור הורה</h1>
      <div className="flex flex-col gap-2.5 mt-4">
        {PARENT_APPROVAL_COPY.map((line, i) => (
          <p key={i} className="text-[13.5px] leading-relaxed">
            {line}
          </p>
        ))}
      </div>

      {err && <p className="t-small text-[var(--danger)] mt-3">{err}</p>}

      <div className="flex flex-col gap-2 mt-5">
        <button disabled={busy} onClick={() => decide(true)} className="btn btn-primary">
          {busy ? "רגע…" : "מאשר/ת"}
        </button>
        <button disabled={busy} onClick={() => decide(false)} className="btn btn-secondary">
          לא מאשר/ת
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] max-w-md mx-auto px-5 py-10">
      {children}
      <p className="text-center text-[11px] text-[var(--muted)] pt-10">
        <a href="/privacy" className="underline">מדיניות פרטיות</a>
        {" · "}
        <a href="/terms" className="underline">תנאים</a>
      </p>
    </main>
  );
}
