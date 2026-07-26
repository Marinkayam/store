"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, themeCssVars, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { COVERS, DEFAULT_COVER, coverCss } from "@/lib/covers";
import { squareImage, MediaError } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "../phone-verify";

// אונבורדינג: בונים לפני שנרשמים. מצב הביניים חי ב-sessionStorage.
//
// ארבעה מסכים: שם → זהות → "מוכנה" → שמירה.
//
// האונבורדינג לא מבקש מוצר. הוא בונה *דוכן*, לא מלאי. ילדה שנוחתת כאן עוד
// לא צילמה כלום, ולבקש ממנה מוצר ראשון לפני שיש לה חנות זה לבקש עבודה לפני
// שנתנו לה משהו. מה שהיא בונה כאן זה הזהות — שם, פרצוף, קאבר, סגנון — וזה
// מה שהיא רוצה להראות לחברה. מוצרים נכנסים אחר כך מהדשבורד, שם יש מסך
// שנבנה בשבילם, עם מצלמה, מלאי, אפשרויות ותגיות.

interface Draft {
  step: number;
  displayName: string;
  theme: ThemeKey;
  emoji: string;
  avatarData: string | null; // תמונת פרופיל שנבחרה, כ-dataURL עד שיש חנות
  cover: string;             // מפתח קאבר מוכן
  coverData: string | null;  // קאבר שהועלה — גובר על המוכן
  ref: string | null;        // הסלאג של החנות שממנה הגיעה (?ref= בדף הנחיתה)
}

const EMOJIS = [
  "🦄", "🍩", "🐼", "🍦", "🌈", "🍓", "🐻", "⭐", "🧁", "🐸",
  "🌸", "🍭", "🦋", "🐰", "🍉", "💎", "🌻", "🐣", "🍀", "🎀",
];

const EMPTY: Draft = {
  step: 1,
  displayName: "",
  theme: "cloud",
  emoji: "🦄",
  avatarData: null,
  cover: DEFAULT_COVER.key,
  coverData: null,
  ref: null,
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
  const [photoErr, setPhotoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    if (draft && !result) sessionStorage.setItem("duchan-draft", JSON.stringify(draft));
  }, [draft, result]);

  if (!draft) return null;

  const theme = themeOrDefault(draft.theme);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));

  /** קורא תמונה, חותך לריבוע ומוחק EXIF — ואז שומר כ-dataURL בטיוטה. */
  async function pickImage(file: File, kind: "avatar" | "cover") {
    setPhotoErr("");
    let blob: Blob;
    try {
      blob = await squareImage(file, kind === "cover" ? 1200 : 400);
    } catch (e) {
      setPhotoErr(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      set(kind === "avatar" ? { avatarData: reader.result as string } : { coverData: reader.result as string });
    reader.readAsDataURL(blob);
  }

  /** מעלה dataURL ל-R2 ומחזיר את המפתח. נכשל בשקט — התמונה ניתנת להעלאה שוב. */
  async function uploadData(dataUrl: string, kind: "avatar" | "cover", storeId: string) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, contentType: blob.type, bytes: blob.size, storeId }),
      });
      if (!up.ok) return null;
      const { url, key } = await up.json();
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
      return put.ok ? (key as string) : null;
    } catch {
      return null;
    }
  }

  /**
   * נקרא אחרי שהטלפון אומת בסמס — בשלב הזה כבר יש סשן פתוח, ולכן אין כאן
   * הרשמה: רק יצירת החנות. הטלפון עצמו נלקח בשרת מהמספר שאומת, לא מהלקוח.
   */
  async function save() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft!.displayName,
          emoji: draft!.emoji,
          theme: draft!.theme,
          coverPreset: draft!.cover,
          ref: draft!.ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש, נסי שוב");
        return;
      }

      // התמונות עולות אחרי שיש חנות. כישלון כאן לא חוסם — הלינק כבר קיים,
      // והיא תוכל להעלות שוב מההגדרות.
      const patch: Record<string, string> = {};
      if (draft!.avatarData) {
        const k = await uploadData(draft!.avatarData, "avatar", data.storeId);
        if (k) patch.avatar_key = k;
      }
      if (draft!.coverData) {
        const k = await uploadData(draft!.coverData, "cover", data.storeId);
        if (k) patch.cover_key = k;
      }
      if (Object.keys(patch).length) {
        await supabaseBrowser().from("stores").update(patch).eq("id", data.storeId);
      }

      sessionStorage.removeItem("duchan-draft");
      setResult({ slug: data.slug });
    } finally {
      setBusy(false);
    }
  }

  const storeUrl = result ? `${window.location.origin}/s/${result.slug}` : "";
  const coverStyle = draft.coverData
    ? { backgroundImage: `url(${draft.coverData})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: coverCss(draft.cover) };

  /* ---------- תצוגת החנות ---------- */
  const preview = (tall: boolean) => (
    <div
      className="w-full overflow-hidden card"
      style={{
        ...(themeCssVars(theme) as React.CSSProperties),
        background: theme.bg,
        color: theme.ink,
        fontFamily: theme.font,
      }}
    >
      <div className={tall ? "h-24" : "h-16"} style={coverStyle} />
      <div className="text-center -mt-7">
        <span
          className="inline-flex w-14 h-14 items-center justify-center text-2xl overflow-hidden"
          style={{ background: theme.surface, borderRadius: theme.radius, border: theme.border, boxShadow: theme.shadow }}
        >
          {draft.avatarData ? (
            <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
          ) : (
            draft.emoji
          )}
        </span>
        <h3 className="font-bold mt-2 text-[17px]">{draft.displayName || "הדוכן שלך"}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{ background: theme.surface, borderRadius: theme.radius, border: theme.border }}
          >
            <div
              className="aspect-square flex items-center justify-center text-2xl opacity-45"
              style={{ background: theme.thumb }}
            >
              ✦
            </div>
            <div className="text-center py-1.5 text-[11px] opacity-50">
              {i === 0 ? "המוצר הראשון שלך" : "ועוד אחד"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-8 gap-5 max-w-md mx-auto">
      {!result && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className="h-1.5 transition-all"
              style={{
                width: s <= draft.step ? 24 : 12,
                borderRadius: 99,
                background: s <= draft.step ? "var(--olive)" : "var(--stone)",
              }}
            />
          ))}
        </div>
      )}

      {/* 1 — שם */}
      {draft.step === 1 && (
        <div className="w-full flex flex-col gap-4 pt-10">
          <h1 className="text-xl font-bold text-center">איך קוראים לדוכן שלך?</h1>
          <input
            value={draft.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            placeholder="הדוכן של…"
            maxLength={40}
            autoFocus
            className="field w-full px-4 py-3.5 text-center text-base"
          />
          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 2 })}
            className="btn btn-primary py-3.5 text-[15px]"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 2 — הזהות: פרצוף וקאבר. לא מוצרים. */}
      {draft.step === 2 && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="text-xl font-bold">איך הדוכן שלך נראה?</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">אפשר לשנות הכל אחר כך.</p>
          </div>

          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0], "avatar")} />
          <input ref={coverRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0], "cover")} />

          {/* פרופיל */}
          <div>
            <div className="text-[13px] font-semibold mb-2">התמונה שלך</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => avatarRef.current?.click()}
                className="w-16 h-16 shrink-0 flex items-center justify-center text-2xl overflow-hidden card"
              >
                {draft.avatarData ? (
                  <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
                ) : (
                  draft.emoji
                )}
              </button>
              <div className="flex-1 flex flex-col gap-1.5">
                <button onClick={() => avatarRef.current?.click()} className="btn btn-secondary py-2 text-[13px]">
                  📷 תמונה מהטלפון
                </button>
                {draft.avatarData && (
                  <button onClick={() => set({ avatarData: null })} className="btn btn-tertiary py-1 text-[12px]">
                    להשתמש באמוג'י במקום
                  </button>
                )}
              </div>
            </div>

            {!draft.avatarData && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2.5 -mx-1 px-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => set({ emoji: e })}
                    className="w-10 h-10 shrink-0 bg-white text-lg transition"
                    style={{
                      borderRadius: "var(--r)",
                      border: `1px solid ${draft.emoji === e ? "var(--olive)" : "var(--line)"}`,
                      boxShadow: draft.emoji === e ? "0 0 0 3px rgba(168,164,109,.16)" : "none",
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* קאבר */}
          <div>
            <div className="text-[13px] font-semibold mb-2">הרקע של הדוכן</div>
            <div className="grid grid-cols-4 gap-2">
              {COVERS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => set({ cover: c.key, coverData: null })}
                  className="h-12 transition"
                  style={{
                    background: c.css,
                    borderRadius: "var(--r)",
                    border: `1px solid ${!draft.coverData && draft.cover === c.key ? "var(--olive)" : "var(--line)"}`,
                    boxShadow: !draft.coverData && draft.cover === c.key ? "0 0 0 3px rgba(168,164,109,.16)" : "none",
                  }}
                  aria-label={c.label}
                />
              ))}
            </div>
            <button onClick={() => coverRef.current?.click()} className="btn btn-secondary w-full py-2 text-[13px] mt-2">
              🖼️ או תמונה משלך
            </button>
            {draft.coverData && (
              <button onClick={() => set({ coverData: null })} className="btn btn-tertiary w-full py-1 text-[12px] mt-1">
                לחזור לרקעים המוכנים
              </button>
            )}
          </div>

          {photoErr && <p className="text-xs text-[var(--danger)] text-center">{photoErr}</p>}

          <button onClick={() => set({ step: 3 })} className="btn btn-primary py-3.5 text-[15px]">
            הלאה ←
          </button>
        </div>
      )}

      {/* 3 — מוכנה: סגנון על תצוגה חיה */}
      {draft.step === 3 && (
        <div className="w-full flex flex-col gap-4">
          <h1 className="text-xl font-bold text-center">הדוכן שלך מוכן 🎉</h1>
          {preview(true)}

          <div>
            <div className="text-[13px] font-semibold mb-2">סגנון</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => set({ theme: k })}
                  className="bg-white p-2 transition"
                  style={{
                    borderRadius: "var(--r)",
                    border: `1px solid ${draft.theme === k ? "var(--olive)" : "var(--line)"}`,
                    boxShadow: draft.theme === k ? "0 0 0 3px rgba(168,164,109,.16)" : "none",
                  }}
                >
                  <div
                    className="h-6 mb-1 flex items-center justify-center"
                    style={{ background: t.bg, borderRadius: 8, border: "1px solid rgba(0,0,0,.06)" }}
                  >
                    <i className="w-3 h-3 block" style={{ background: t.primary, borderRadius: 99 }} />
                  </div>
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => set({ step: 4 })} className="btn btn-primary py-3.5 text-[15px]">
            שמירת החנות ←
          </button>
        </div>
      )}

      {/* 4 — שמירה. שדה אחד: המספר. */}
      {draft.step === 4 && !result && (
        <div className="w-full flex flex-col gap-3">
          {busy ? (
            <p className="text-sm text-center py-10">שומרים את הדוכן…</p>
          ) : (
            <PhoneVerify
              title="עוד רגע והוא באוויר"
              subtitle="המספר שלך — לכאן יגיעו ההזמנות. אם הורה ממלא, זה המספר של הילדה."
              cta="שלחו לי קוד"
              onVerified={save}
            />
          )}
          {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
          <p className="text-[11px] text-[var(--muted)] text-center leading-relaxed">
            בהמשך את מאשרת את{" "}
            <a href="/terms" target="_blank" className="underline">תנאי השימוש</a>
            {" "}ואת{" "}
            <a href="/privacy" target="_blank" className="underline">מדיניות הפרטיות</a>
          </p>
        </div>
      )}

      {/* נשמר — עכשיו מוצרים */}
      {result && (
        <div className="w-full flex flex-col gap-4 pt-8 text-center">
          <div className="text-5xl">🎊</div>
          <h1 className="text-xl font-bold">הדוכן שלך נשמר</h1>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
            עכשיו החלק הכיפי — להוסיף מה שאת מוכרת.
            <br />
            הלינק לשיתוף נפתח כשמפרסמים.
          </p>
          <div className="card px-4 py-3 text-[13px] font-mono text-[var(--muted)]" dir="ltr">
            {storeUrl}
          </div>
          <a href="/dashboard/products" className="btn btn-primary py-3.5 text-[15px]">
            להוסיף את המוצר הראשון ←
          </a>
          <a href="/activate" className="btn btn-secondary py-3 text-[14px]">
            לפרסם ולשחרר את הלינק 🚀
          </a>
          <a href="/dashboard" className="text-[13px] text-[var(--olive)] font-semibold">
            לניהול הדוכן
          </a>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            טיפ: הוסיפי את הדף למסך הבית כדי לחזור בקליק.
          </p>
        </div>
      )}
    </main>
  );
}
