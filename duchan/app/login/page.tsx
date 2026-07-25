"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const supa = supabaseBrowser();
    const { error } = await supa.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr("האימייל או הסיסמה לא נכונים");
      return;
    }
    router.replace(params.get("next") ?? "/dashboard");
  }

  async function resetPassword() {
    if (!email) {
      setErr("כתבי קודם את האימייל");
      return;
    }
    const supa = supabaseBrowser();
    await supa.auth.resetPasswordForEmail(email);
    setErr("שלחנו לינק לאיפוס סיסמה לאימייל");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
      <label className="text-xs text-[#7A7D8A]">
        אימייל
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full border border-[#E6E7EC] bg-white rounded-xl px-3 py-2.5 text-sm"
          required
        />
      </label>
      <label className="text-xs text-[#7A7D8A]">
        סיסמה
        <input
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full border border-[#E6E7EC] bg-white rounded-xl px-3 py-2.5 text-sm"
          required
        />
      </label>
      {err && <p className="text-xs text-[#D2373B]">{err}</p>}
      <button
        disabled={busy}
        className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "רגע…" : "כניסה"}
      </button>
      <button type="button" onClick={resetPassword} className="text-xs text-[#7A7D8A] underline">
        שכחתי סיסמה
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🛍️</div>
        <h1 className="text-xl font-bold">כניסה לדוכן</h1>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <a href="/onboarding" className="text-xs text-[#7A7D8A]">
        עוד אין לך חנות? <span className="underline">פותחים אחת בדקות</span>
      </a>
    </main>
  );
}
