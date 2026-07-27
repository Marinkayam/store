"use client";

import { useEffect, useRef, useState } from "react";
import { COVERS, DEFAULT_COVER, coverCss } from "@/lib/covers";
import { squareImage, MediaError } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "../phone-verify";
import HelpButton from "../help-button";

// ארבעה מסכים: שם → רקע → פרטים ואישור → טלפון. אין ערכות, אין מוצר —
// מוצרים הם השלב הבא ושיתוף אחריו. כל מסך שואל דבר אחד, כדי שאף אחד
// מהם לא יידחה כ"טופס ארוך מדי".

type Step = 1 | 2 | 3 | 4;

interface Draft {
  step: Step;
  displayName: string;
  avatarData: string | null;
  cover: string;
  age: string;
  city: string;
  parentAware: boolean;
  ref: string | null;
}

const EMPTY: Draft = {
  step: 1,
  displayName: "",
  avatarData: null,
  cover: DEFAULT_COVER.key,
  age: "",
  city: "",
  parentAware: false,
  ref: null,
};

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem("duchan-draft");
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

/** מד ההתקדמות ושורת החזרה, משותפים לשלושת מסכי הבנייה (לא למסך הטלפון —
 * הוא לא נספר כ"עוד שלב", הוא השלב שבסוף כל השלושה). */
function StepHeader({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  return (
    <div className="w-full flex items-center gap-3">
      <button onClick={onBack} aria-label="חזרה" className="text-lg text-[var(--muted)]">→</button>
      <div className="flex-1 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="flex-1 h-1"
            style={{ background: n <= step ? "var(--olive)" : "var(--sand)" }}
          />
        ))}
      </div>
      <span className="text-[11px] text-[var(--muted)] shrink-0">{step} / 3</span>
    </div>
  );
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
          parentAware: draft!.parentAware,
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

      {/* 1 — שם הדוכן */}
      {draft.step === 1 && !result && (
        <div className="w-full flex flex-col gap-5">
          <StepHeader step={1} onBack={() => (window.location.href = "/")} />
          <div className="text-center">
            <h1 className="text-xl font-bold">איך יקראו לדוכן?</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
              זה השם שיופיע בדוכן. אפשר לשנות אותו מתי שרוצים.
            </p>
          </div>
          <input
            value={draft.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            placeholder="למשל: הדברים של נועה"
            aria-label="שם הדוכן"
            maxLength={40}
            autoFocus
            className="field w-full px-4 py-3.5 text-center text-base"
          />
          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 2 })}
            className="btn btn-primary py-3.5 text-[15px]"
          >
            הלאה — לבחירת רקע ←
          </button>
        </div>
      )}

      {/* 2 — רקע, עם תצוגה חיה שכוללת גם תמונה אישית אופציונלית */}
      {draft.step === 2 && !result && (
        <div className="w-full flex flex-col gap-5">
          <StepHeader step={2} onBack={() => set({ step: 1 })} />
          <div className="text-center">
            <h1 className="text-xl font-bold">איזה רקע בא לך?</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
              זה הצבע של כל הדוכן. אפשר לראות למעלה איך זה נראה.
            </p>
          </div>

          <div className="w-full overflow-hidden card">
            <div className="h-20" style={{ background: coverCss(draft.cover) }} />
            <div className="text-center -mt-8 pb-3">
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
              <div className="font-bold mt-2 text-[16px]">{draft.displayName || "הדוכן"}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {draft.avatarData ? "לחיצה כדי להחליף" : "לחיצה כדי להוסיף תמונה (לא חובה)"}
              </div>
            </div>
          </div>
          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
          {photoErr && <p className="text-xs text-[var(--danger)] text-center">{photoErr}</p>}

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

          <button onClick={() => set({ step: 3 })} className="btn btn-primary py-3.5 text-[15px]">
            הלאה — לפרטים אחרונים ←
          </button>
        </div>
      )}

      {/* 3 — גיל ועיר (לא חובה) + מודעות הורים */}
      {draft.step === 3 && !result && (
        <div className="w-full flex flex-col gap-5">
          <StepHeader step={3} onBack={() => set({ step: 2 })} />
          <div className="text-center">
            <h1 className="text-xl font-bold">עוד שני פרטים</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
              שניהם לא חובה — הם רק עוזרים למצוא את הדוכן לפי גיל ואזור.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[13px] font-semibold mb-1.5">גיל</div>
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
              <div className="text-[13px] font-semibold mb-1.5">עיר</div>
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

          {/* מודעות הורים — לפני שמוזן מספר טלפון או שנוצר חשבון, לא אחרי.
              זו לא אותה הצהרה כמו זו שב-/activate: שם מאשרים לפרסם את
              הדוכן לעולם, כאן רק שההורים יודעים שנפתח דוכן ושמוזנים פרטים.
              שתי נקודות עצירה שונות לשתי החלטות שונות. */}
          <div
            className="p-3.5 border-[1.5px]"
            style={{ borderColor: draft.parentAware ? "var(--olive)" : "var(--line)" }}
          >
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.parentAware}
                onChange={(e) => set({ parentAware: e.target.checked })}
                aria-label="ההורים שלי יודעים"
                className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--olive)]"
              />
              <span className="text-[13px] font-semibold leading-relaxed">
                ההורים יודעים על פתיחת הדוכן כאן
              </span>
            </label>
            {/* הסיבה האמיתית לבקש טלפון בשלב הבא: ההזמנות מגיעות ישירות
                לוואטסאפ. לא סליקה, לא משיכת כסף, לא מסירות — דוכן לא נוגע
                בכסף ובמשלוח בכלל. */}
            <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-1.5">
              בשלב הבא נבקש מספר טלפון, כדי שההזמנות יגיעו ישירות בוואטסאפ.
              בלי זה אי אפשר לפרסם את הדוכן.
            </p>
          </div>

          <div className="text-[12px] text-[var(--muted)] leading-relaxed">
            <div className="font-semibold text-[var(--ink)] mb-1">מה יקרה עכשיו:</div>
            <ul className="flex flex-col gap-0.5 list-disc pr-4">
              <li>הדוכן נפתח — פרטי, רק מי שבונה אותו רואה אותו</li>
              <li>מעלים מוצר ראשון עם תמונה ומחיר</li>
              <li>מפרסמים ומשתפים את הקישור</li>
            </ul>
          </div>

          <button
            disabled={!draft.parentAware}
            onClick={() => set({ step: 4 })}
            className="btn btn-primary py-3.5 text-[15px]"
          >
            הלאה — למספר הטלפון ←
          </button>
        </div>
      )}

      {/* 4 — מספר וקוד. לא נספר כ"שלב 4 מתוך 3" בכוונה: זה לא עוד שלב
          בבניית הדוכן, זה מה שקורה אחרי שהוא כבר בנוי. */}
      {draft.step === 4 && !result && (
        <div className="w-full flex flex-col gap-3">
          {busy ? (
            <p className="text-sm text-center py-10">פותחים את הדוכן…</p>
          ) : (
            <PhoneVerify
              title="המספר שלך"
              subtitle="לכאן יגיעו ההזמנות. שולחים קוד קצר כדי לוודא שהמספר נכון, ואז ממשיכים."
              cta="שלחו לי קוד"
              onVerified={save}
            />
          )}
          {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
          <button onClick={() => set({ step: 3 })} className="btn btn-tertiary text-[12px] py-1">
            → חזרה
          </button>
        </div>
      )}

      {/* סיימנו. נכנסים לדוכן עצמו — ומשם מוסיפים מוצרים, כמה שרוצים.
          מסך שנפתח ישר על טופס מוצר בודד גורם להרגשה שזה טופס הרשמה נוסף;
          כרטיס של הדוכן עם מקום ריק למוצר גורם להרגשה שזה כבר שלו/שלה. */}
      {result && draft && (
        <div className="w-full flex flex-col gap-4">
          <div className="text-center">
            <p className="text-[11px] text-[var(--muted)] tracking-wide">נפתח דוכן</p>
            <h1 className="text-xl font-bold mt-0.5">{draft.displayName}</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
              הוא עדיין פרטי. מעלים מוצר אחד, ואז אפשר לפרסם.
            </p>
          </div>

          <div className="w-full overflow-hidden card">
            <div className="h-20" style={{ background: coverCss(draft.cover) }} />
            <div className="text-center -mt-8 pb-3">
              <div
                className="w-20 h-20 mx-auto inline-flex items-center justify-center overflow-hidden bg-white text-2xl"
                style={{ borderRadius: "var(--r)", border: "1px solid var(--line)", boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
              >
                {draft.avatarData ? (
                  <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
                ) : (
                  "🛍️"
                )}
              </div>
              <div className="font-bold mt-2 text-[16px]">{draft.displayName}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">
                {[draft.city, "0 מוצרים"].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="mx-4 mb-4 border-[1.5px] border-dashed border-[#D3D5DC] py-6 text-center text-[12px] text-[var(--muted)]">
              כאן יופיע המוצר הראשון
            </div>
          </div>

          <a href="/dashboard/products?new=1" className="btn btn-primary py-3.5 text-[15px]">
            להעלות מוצר ראשון
          </a>
          <a href="/dashboard/products" className="btn btn-tertiary text-[13px] py-2 text-center">
            אחר כך — לדוכן שלי
          </a>
        </div>
      )}
    </main>
  );
}
