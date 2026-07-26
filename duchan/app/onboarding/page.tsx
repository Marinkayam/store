"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, themeCssVars, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";

// אונבורדינג: בונים לפני שנרשמים. מצב הביניים חי ב-sessionStorage.
// מסך 4 ("החנות שלך מוכנה") הוא הציר — עד אליו לא ביקשנו כלום.

interface Draft {
  step: number;
  displayName: string;
  theme: ThemeKey;
  emoji: string;
  product: { name: string; price: string; imageData: string | null };
}

const EMOJIS = ["🦄", "🍩", "🐼", "🍦", "🌈", "🍓", "🐻", "⭐", "🧁", "🐸"];

const EMPTY: Draft = {
  step: 1,
  displayName: "",
  theme: "cloud",
  emoji: "🦄",
  product: { name: "", price: "", imageData: null },
};

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
  const fileRef = useRef<HTMLInputElement>(null);

  // שדות מסך השמירה — לא נשמרים ב-sessionStorage (סיסמה!)
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    if (draft && !result) sessionStorage.setItem("duchan-draft", JSON.stringify(draft));
  }, [draft, result]);

  if (!draft) return null;

  const theme = themeOrDefault(draft.theme);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));

  async function onImagePicked(file: File) {
    const blob = await squareImage(file);
    const reader = new FileReader();
    reader.onload = () =>
      set({ product: { ...draft!.product, imageData: reader.result as string } });
    reader.readAsDataURL(blob);
  }

  async function save() {
    setErr("");
    if (password.length < 6) {
      setErr("סיסמה של 6 תווים לפחות");
      return;
    }
    setBusy(true);
    try {
      const supa = supabaseBrowser();
      const { error: signErr } = await supa.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signErr) {
        // אולי כבר רשומה — מנסים להתחבר
        const { error: inErr } = await supa.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (inErr) {
          setErr("לא הצלחנו להירשם — אולי האימייל כבר רשום עם סיסמה אחרת");
          return;
        }
      }

      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft!.displayName,
          emoji: draft!.emoji,
          theme: draft!.theme,
          contactPhone,
          firstProduct: draft!.product.name
            ? {
                name: draft!.product.name,
                price: Number(draft!.product.price) || 0,
                stock: 1,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש, נסי שוב");
        return;
      }

      // העלאת תמונת המוצר הראשון (אם צולמה) — אחרי שיש חנות
      if (draft!.product.imageData && data.firstProductId) {
        try {
          const blob = await (await fetch(draft!.product.imageData)).blob();
          const up = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "image", contentType: blob.type, bytes: blob.size }),
          });
          if (up.ok) {
            const { url, key } = await up.json();
            const put = await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": blob.type },
              body: blob,
            });
            if (put.ok) {
              await supa.from("products").update({ image_key: key }).eq("id", data.firstProductId);
            }
          }
        } catch {
          // התמונה תעלה שוב מהדשבורד — לא חוסמים את הלינק בגללה
        }
      }

      sessionStorage.removeItem("duchan-draft");
      setResult({ slug: data.slug });
    } finally {
      setBusy(false);
    }
  }

  const storeUrl = result ? `${window.location.origin}/s/${result.slug}` : "";

  /* ---------- תצוגת חנות (למסכים 2 ו-4) ---------- */
  const preview = (full: boolean) => (
    <div
      className={`w-full overflow-hidden ${full ? "rounded-none min-h-[60vh]" : "rounded-2xl border border-[#E6E7EC]"}`}
      style={{
        ...(themeCssVars(theme) as React.CSSProperties),
        background: theme.bg,
        color: theme.ink,
        fontFamily: theme.font,
      }}
    >
      <div className="h-16" style={{ background: "linear-gradient(135deg,#C9D6FF,#E2C6F7)" }} />
      <div className="text-center -mt-6">
        <span
          className="inline-flex w-12 h-12 rounded-full items-center justify-center text-2xl shadow"
          style={{ background: theme.surface }}
        >
          {draft.emoji}
        </span>
        <h3 className="font-bold mt-1.5">{draft.displayName || "החנות שלך"}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{ background: theme.surface, borderRadius: theme.radius, border: theme.border }}
          >
            <div className="h-20 flex items-center justify-center text-3xl overflow-hidden" style={{ background: theme.thumb }}>
              {i === 0 && draft.product.imageData ? (
                <img src={draft.product.imageData} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className={i === 0 ? "squish" : ""}>{i === 0 ? draft.emoji : "✨"}</span>
              )}
            </div>
            <div className="text-center py-1.5 text-[11px] font-medium">
              {i === 0 ? draft.product.name || "המוצר הראשון" : "עוד יבוא…"}
              <div className="font-bold" style={{ color: theme.primary }}>
                {i === 0 && draft.product.price ? `₪${draft.product.price}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-8 gap-5 max-w-md mx-auto">
      {/* progress */}
      {!result && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${s <= draft.step ? "w-6 bg-[#15161B]" : "w-3 bg-[#DCDCE4]"}`}
            />
          ))}
        </div>
      )}

      {/* 1 — שם */}
      {draft.step === 1 && (
        <div className="w-full flex flex-col gap-4 pt-10">
          <h1 className="text-xl font-bold text-center">מה שם החנות שלך?</h1>
          <input
            value={draft.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            placeholder="החנות של…"
            maxLength={40}
            autoFocus
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-center"
          />
          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 2 })}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-30"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 2 — ערכה */}
      {draft.step === 2 && (
        <div className="w-full flex flex-col gap-4">
          <h1 className="text-lg font-bold text-center">איזה סגנון הכי את?</h1>
          {preview(false)}
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, t]) => (
              <button
                key={k}
                onClick={() => set({ theme: k })}
                className={`rounded-xl border-[1.5px] bg-white p-2 ${draft.theme === k ? "border-[#15161B]" : "border-[#E6E7EC]"}`}
              >
                <div
                  className="h-6 rounded-md mb-1 flex items-center justify-center"
                  style={{ background: t.bg, border: "1px solid rgba(0,0,0,.07)" }}
                >
                  <i className="w-3 h-3 rounded-full block" style={{ background: t.primary }} />
                </div>
                <span className="text-[11px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => set({ step: 3 })}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 3 — מוצר ראשון */}
      {draft.step === 3 && (
        <div className="w-full flex flex-col gap-3">
          <h1 className="text-lg font-bold text-center">המוצר הראשון שלך</h1>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && onImagePicked(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="h-40 rounded-2xl border-[1.5px] border-dashed border-[#D3D5DC] bg-[#F5F6F9] flex items-center justify-center overflow-hidden"
          >
            {draft.product.imageData ? (
              <img src={draft.product.imageData} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm text-[#7A7D8A]">📷 צלמי את המוצר</span>
            )}
          </button>
          <div className="flex gap-1.5 justify-center flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => set({ emoji: e })}
                className={`w-9 h-9 rounded-lg border-[1.5px] bg-white text-lg ${draft.emoji === e ? "border-[#15161B]" : "border-[#E6E7EC]"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            value={draft.product.name}
            onChange={(e) => set({ product: { ...draft.product, name: e.target.value } })}
            placeholder="שם המוצר"
            maxLength={40}
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-sm"
          />
          <input
            value={draft.product.price}
            onChange={(e) => set({ product: { ...draft.product, price: e.target.value } })}
            placeholder="מחיר (₪)"
            type="number"
            inputMode="numeric"
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-sm"
          />
          <button
            disabled={!draft.product.name.trim() || !draft.product.price}
            onClick={() => set({ step: 4 })}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-30"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 4 — החנות שלך מוכנה */}
      {draft.step === 4 && (
        <div className="w-full flex flex-col gap-4">
          <h1 className="text-xl font-bold text-center">החנות שלך מוכנה 🎉</h1>
          {preview(true)}
          <button
            onClick={() => set({ step: 5 })}
            className="bg-[#15161B] text-white rounded-xl py-3.5 text-sm font-medium"
          >
            שמירת החנות ←
          </button>
        </div>
      )}

      {/* 5 — שמירה */}
      {draft.step === 5 && !result && (
        <div className="w-full flex flex-col gap-3">
          <h1 className="text-lg font-bold text-center">עוד רגע והיא באוויר</h1>
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="הטלפון שלך (וואטסאפ)"
            inputMode="tel"
            dir="ltr"
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-sm text-left"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="אימייל (איתו נכנסים לניהול)"
            type="email"
            dir="ltr"
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-sm text-left"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה (6 תווים לפחות)"
            type="password"
            dir="ltr"
            className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-3 text-sm text-left"
          />
          {err && <p className="text-xs text-[#D2373B]">{err}</p>}
          <button
            disabled={busy || !contactPhone || !email || !password}
            onClick={save}
            className="bg-[#15161B] text-white rounded-xl py-3.5 text-sm font-medium disabled:opacity-30"
          >
            {busy ? "שומרים…" : "שמירה ופתיחת החנות 🎉"}
          </button>
        </div>
      )}

      {/* 6 — הלינק שלך */}
      {result && (
        <div className="w-full flex flex-col gap-4 pt-10 text-center">
          <div className="text-5xl">🎊</div>
          <h1 className="text-xl font-bold">הלינק שלך מוכן</h1>
          <div className="bg-white border border-[#E6E7EC] rounded-xl px-4 py-3 text-sm font-mono" dir="ltr">
            {storeUrl}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(storeUrl);
            }}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium"
          >
            העתקה
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`בואי לראות את החנות שלי! ${storeUrl}`)}`}
            className="bg-[#25D366] text-white rounded-xl py-3 text-sm font-medium"
          >
            שיתוף בוואטסאפ
          </a>
          <a href="/dashboard" className="text-sm text-[#7A7D8A] underline">
            לניהול החנות ←
          </a>
          <p className="text-xs text-[#7A7D8A] leading-relaxed">
            טיפ: הוסיפי את הדף למסך הבית כדי לחזור לחנות בקליק.
          </p>
        </div>
      )}
    </main>
  );
}
