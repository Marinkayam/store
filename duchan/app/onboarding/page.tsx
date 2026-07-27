"use client";

import { useEffect, useRef, useState } from "react";
import { COVERS, DEFAULT_COVER, coverCss } from "@/lib/covers";
import { squareImage, MediaError } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "../phone-verify";
import HelpButton from "../help-button";

// שלב 1 מתוך שלושה: לפתוח דוכן. פחות מדקה.
//
// שם → תמונה → רקע → מספר → סיימנו. אין ערכות, אין אמוג'י כשלב, ואין מוצר.
// כל מה שהילד/ה רוצה בשלב הזה הוא להגיד "זה הדוכן שלי", והכל כאן משרת רק את
// המשפט הזה. מוצרים הם שלב 2 ושיתוף הוא שלב 3, ושניהם קורים אחרי.

interface Draft {
  step: 1 | 2;
  displayName: string;
  avatarData: string | null;
  cover: string;
  age: string;
  city: string;
  ref: string | null;
}

const EMPTY: Draft = {
  step: 1,
  displayName: "",
  avatarData: null,
  cover: DEFAULT_COVER.key,
  age: "",
  city: "",
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

  useEffect(() => setDraft(loadDraft()), []);
  useEffect(() => {
    if (draft && !result) sessionStorage.setItem("duchan-draft", JSON.stringify(draft));
  }, [draft, result]);

  if (!draft) return null;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));

  async function pickPhoto(file: File) {
    setPhotoErr("");
    try {
      const blob = await squareImage(file, 400);
      const reader = new FileReader();
      reader.onload = () => set({ avatarData: reader.result as string });
      reader.readAsDataURL(blob);
    } catch (e) {
      setPhotoErr(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
    }
  }

  /** נקרא אחרי אימות הטלפון — יש כבר סשן, ולכן זו רק יצירת הדוכן. */
  async function save() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft!.displayName,
          coverPreset: draft!.cover,
          age: draft!.age ? Number(draft!.age) : undefined,
          city: draft!.city.trim() || undefined,
          ref: draft!.ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש — לנסות שוב");
        return;
      }

      // התמונה עולה אחרי שיש דוכן. כישלון כאן לא חוסם — אפשר להעלות שוב.
      if (draft!.avatarData) {
        try {
          const blob = await (await fetch(draft!.avatarData)).blob();
          const up = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "avatar", contentType: blob.type, bytes: blob.size, storeId: data.storeId }),
          });
          if (up.ok) {
            const { url, key } = await up.json();
            const put = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
            if (put.ok) await supabaseBrowser().from("stores").update({ avatar_key: key }).eq("id", data.storeId);
          }
        } catch {}
      }

      sessionStorage.removeItem("duchan-draft");
      setResult({ slug: data.slug });
    } catch {
      setErr("אין חיבור — לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-5 max-w-md mx-auto">
      <HelpButton context="פתיחת הדוכן" />
      {/* 1 — שם, תמונה, רקע. הכל במסך אחד. */}
      {draft.step === 1 && !result && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="text-xl font-bold">נפתח לך דוכן</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1">שלוש בחירות קטנות, וזהו</p>
          </div>

          {/* תצוגה חיה — רואים את הדוכן נבנה תוך כדי */}
          <div className="w-full overflow-hidden card">
            <div className="h-20" style={{ background: coverCss(draft.cover) }} />
            <div className="text-center -mt-8 pb-3">
              {/* עיגול אחד, לא שני כפתורים לאותה פעולה: מסגרת מקווקוות ותג
                  מצלמה קטן בפינה מסמנים "זה לחיץ" גם בלי טקסט. */}
              <button
                onClick={() => avatarRef.current?.click()}
                aria-label={draft.avatarData ? "להחליף תמונה" : "להוסיף תמונה"}
                className="relative w-20 h-20 inline-flex items-center justify-center overflow-hidden bg-white text-3xl"
                style={{
                  borderRadius: "var(--r)",
                  border: draft.avatarData ? "1px solid var(--line)" : "2px dashed var(--sand)",
                  boxShadow: "0 2px 10px rgba(0,0,0,.06)",
                }}
              >
                {draft.avatarData ? (
                  <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
                ) : (
                  "📷"
                )}
                <span
                  className="absolute -bottom-1 -left-1 w-6 h-6 flex items-center justify-center text-xs bg-[var(--olive)] text-white"
                  style={{ borderRadius: "999px", border: "2px solid white" }}
                  aria-hidden
                >
                  {draft.avatarData ? "✎" : "+"}
                </span>
              </button>
              <div className="font-bold mt-2 text-[16px]">{draft.displayName || "הדוכן שלך"}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {draft.avatarData ? "לחיצה כדי להחליף" : "לחיצה כדי להוסיף תמונה (לא חובה)"}
              </div>
            </div>
          </div>

          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />

          <div>
            <div className="text-[13px] font-semibold mb-1.5">1. איך יקראו לדוכן שלך?</div>
            <input
              value={draft.displayName}
              onChange={(e) => set({ displayName: e.target.value })}
              placeholder="למשל: הדברים של נועה"
              aria-label="שם הדוכן"
              maxLength={40}
              autoFocus
              className="field w-full px-4 py-3.5 text-center text-base"
            />
          </div>

          {photoErr && <p className="text-xs text-[var(--danger)] text-center">{photoErr}</p>}

          <div>
            <div className="text-[13px] font-semibold mb-2">2. איזה רקע בא לך?</div>
            {/* כל אריח הוא כפתור עצמאי, גדול מספיק לאצבע, עם וי ברור על מה שנבחר —
                לא רק מסגרת דקה שקל לפספס. */}
            <div className="grid grid-cols-4 gap-2.5">
              {COVERS.map((c) => {
                const on = draft.cover === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => set({ cover: c.key })}
                    aria-label={c.label}
                    aria-pressed={on}
                    className="relative h-14 flex items-end justify-center pb-1"
                    style={{
                      background: c.css,
                      borderRadius: "var(--r)",
                      border: `2px solid ${on ? "var(--olive)" : "var(--line)"}`,
                    }}
                  >
                    {on && (
                      <span
                        className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[11px] bg-[var(--olive)] text-white"
                        style={{ borderRadius: "999px" }}
                        aria-hidden
                      >
                        ✓
                      </span>
                    )}
                    <span className="text-[9.5px] font-medium" style={{ color: "rgba(0,0,0,.55)" }}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[13px] font-semibold mb-1.5">3. גיל (לא חובה)</div>
              <input
                value={draft.age}
                onChange={(e) => set({ age: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                placeholder="11"
                aria-label="גיל"
                inputMode="numeric"
                maxLength={2}
                className="field w-full px-4 py-3.5 text-center text-base"
              />
            </div>
            <div className="flex-[1.4]">
              <div className="text-[13px] font-semibold mb-1.5">עיר (לא חובה)</div>
              <input
                value={draft.city}
                onChange={(e) => set({ city: e.target.value })}
                placeholder="רמת גן"
                aria-label="עיר"
                maxLength={30}
                className="field w-full px-4 py-3.5 text-center text-base"
              />
            </div>
          </div>

          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 2 })}
            className="btn btn-primary py-3.5 text-[15px]"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 2 — מספר וקוד */}
      {draft.step === 2 && !result && (
        <div className="w-full flex flex-col gap-3">
          {busy ? (
            <p className="text-sm text-center py-10">פותחים את הדוכן…</p>
          ) : (
            <PhoneVerify
              title="המספר שלך"
              subtitle="לכאן יגיעו ההזמנות. שולחים קוד ומסיימים."
              cta="שלחו לי קוד"
              onVerified={save}
            />
          )}
          {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
          <button onClick={() => set({ step: 1 })} className="btn btn-tertiary text-[12px] py-1">
            חזרה
          </button>
        </div>
      )}

      {/* סיימנו את שלב 1. נכנסים לדוכן עצמו — ומשם מוסיפים מוצרים, כמה
          שרוצים. מסך שנפתח ישר על טופס מוצר בודד גורם להרגשה שזה טופס
          הרשמה נוסף; מסך של דוכן שיש בו כפתור "+" גורם להרגשה שזה שלו/שלה. */}
      {result && (
        <div className="w-full flex flex-col gap-4 text-center">
          <div className="text-5xl">🎊</div>
          <h1 className="text-xl font-bold">הדוכן שלך נפתח</h1>
          <p className="text-[14px] leading-relaxed">
            עכשיו נכנסים פנימה וממלאים אותו במוצרים.
          </p>
          <a href="/dashboard/products" className="btn btn-primary py-3.5 text-[15px]">
            לדוכן שלי ←
          </a>
        </div>
      )}
    </main>
  );
}
