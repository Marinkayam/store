"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

// תביעת חנות שנוצרה ע"י אדמין: לינק חד-פעמי → אימייל + סיסמה → החנות שלך.

export default function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש");
        return;
      }
      const supa = supabaseBrowser();
      await supa.auth.signInWithPassword({ email, password });
      router.replace("/dashboard/settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🎁</div>
        <h1 className="text-xl font-bold">החנות מחכה לך</h1>
        <p className="text-sm text-[#7A7D8A] mt-1">בוחרים אימייל של הורה וסיסמה — וזהו.</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="האימייל של ההורה"
          required
          className="w-full border border-[#E6E7EC] bg-white rounded-xl px-3 py-2.5 text-sm text-left"
        />
        <input
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="סיסמה (6 תווים לפחות)"
          required
          className="w-full border border-[#E6E7EC] bg-white rounded-xl px-3 py-2.5 text-sm text-left"
        />
        {err && <p className="text-xs text-[#D2373B]">{err}</p>}
        <button
          disabled={busy}
          className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "רגע…" : "קבלת החנות 🎉"}
        </button>
      </form>
    </main>
  );
}
