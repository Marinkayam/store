"use client";

import { useEffect, useRef, useState } from "react";
import { COVERS, DEFAULT_COVER, coverCss } from "@/lib/covers";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "../phone-verify";
import HelpButton from "../help-button";

// ארבעה מסכים: שם → עיצוב הדוכן → פרטים ואישור → טלפון.
//
// מסך 2 הוא הדוכן עצמו, חי וניתן לעריכה, כולל הוספת מוצרים. הכל שם קורה
// לפני שמבקשים טלפון: הילד/ה רואה דוכן אמיתי עם המוצרים שלו/ה, ורק אז
// מחליט/ה אם למסור מספר. המוצרים יושבים בטיוטה ונוצרים באמת אחרי
// שהחשבון נפתח.

type Step = 1 | 2 | 3 | 4;

/** מוצר שנוסף לפני שיש חשבון. התמונה יושבת כ-data URL בטיוטה ומועלית
 *  ל-R2 רק אחרי שהדוכן נוצר, כי לפני זה אין storeId לתלות בו קובץ. */
export interface DraftProduct {
  name: string;
  price: string;
  imageData: string | null;
}

interface Draft {
  step: Step;
  displayName: string;
  tagline: string;
  avatarData: string | null;
  cover: string;
  theme: ThemeKey;
  products: DraftProduct[];
  age: string;
  city: string;
  parentAware: boolean;
  ref: string | null;
}

const EMPTY: Draft = {
  step: 1,
  displayName: "",
  tagline: "",
  avatarData: null,
  cover: DEFAULT_COVER.key,
  theme: "cloud",
  products: [],
  age: "",
  city: "",
  parentAware: false,
  ref: null,
};

/** תמונות ה-data URL תופסות מקום ב-sessionStorage. שלושה מוצרים בהקמה
 *  זה מספיק כדי להבין איך הדוכן נראה, והשאר נוספים אחר כך בדשבורד. */
const MAX_DRAFT_PRODUCTS = 3;

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem("duchan-draft");
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

/**
 * מד ההתקדמות ושורת החזרה — נצמד לראש המסך, לא צף באמצע.
 * משותף לשלושת מסכי הבנייה בלבד; מסך הטלפון לא נספר כ"עוד שלב",
 * הוא מה שקורה אחרי שכל השלושה נגמרו.
 */
function StepHeader({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--canvas)] border-b border-[var(--line)]">
      <div className="max-w-md mx-auto px-6 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="חזרה"
          className="w-8 h-8 -mr-2 flex items-center justify-center text-[17px] text-[var(--muted)]"
        >
          →
        </button>
        <span className="t-label shrink-0">שלב {step} מתוך 3</span>
        <div className="flex-1 flex gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="flex-1 h-[3px]"
              style={{ background: n <= step ? "var(--ink)" : "var(--sand)" }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}

/** קישורי החובה — מופיעים בתחתית כל מסך בפלואו, לא רק בדף הבית */
function LegalFooter() {
  return (
    <p className="t-small text-[var(--muted)] text-center pt-2">
      <a href="/terms" className="underline">תנאי שימוש</a>
      {" · "}
      <a href="/privacy" className="underline">פרטיות</a>
      {" · "}
      <a href="/accessibility" className="underline">נגישות</a>
    </p>
  );
}

export default function Onboarding() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<HTMLInputElement>(null);
  // המוצר שנמצא כרגע בטופס ההוספה. null = הטופס סגור.
  const [adding, setAdding] = useState<DraftProduct | null>(null);

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

  /** תמונת מוצר בהקמה. 600 ולא 900: היא יושבת ב-sessionStorage עד
   *  שנוצר הדוכן, ו-data URL גדול מדי ממלא את המכסה של הדפדפן. */
  async function pickProductPhoto(file: File) {
    setPhotoErr("");
    try {
      const blob = await squareImage(file, 600);
      const reader = new FileReader();
      reader.onload = () =>
        setAdding((a) => (a ? { ...a, imageData: reader.result as string } : a));
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
          tagline: draft!.tagline.trim() || undefined,
          theme: draft!.theme,
          coverPreset: draft!.cover,
          age: draft!.age ? Number(draft!.age) : undefined,
          city: draft!.city.trim() || undefined,
          parentAware: draft!.parentAware,
          ref: draft!.ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש, לנסות שוב");
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

      // המוצרים שנוספו לפני שהיה חשבון. עכשיו יש storeId, אז אפשר להעלות
      // את התמונות וליצור אותם. מוצר שנכשל לא עוצר את השאר.
      for (const pr of draft!.products) {
        try {
          let imageKey: string | null = null;
          if (pr.imageData) {
            const blob = await (await fetch(pr.imageData)).blob();
            const up = await uploadBlob("image", blob, data.storeId);
            if (!("error" in up)) imageKey = up.key;
          }
          await supabaseBrowser().from("products").insert({
            store_id: data.storeId,
            name: pr.name.trim().slice(0, 40) || "מוצר",
            price: Math.max(0, Math.floor(Number(pr.price) || 0)),
            image_key: imageKey,
            stock: 1,
          });
        } catch (e) {
          console.error("[onboarding] draft product failed:", e);
        }
      }

      sessionStorage.removeItem("duchan-draft");
      setResult({ slug: data.slug });
    } catch {
      setErr("אין חיבור, לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  // הערכה שנבחרה, לצביעת התצוגה החיה של הדוכן
  const th = themeOrDefault(draft.theme);

  // מסך הטלפון ומסך הסיום אינם חלק ממד ההתקדמות — הבנייה כבר נגמרה בהם
  const barStep = !result && draft.step <= 3 ? (draft.step as 1 | 2 | 3) : null;
  const goBack = () =>
    draft.step === 1 ? (window.location.href = "/") : set({ step: (draft.step - 1) as Step });

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)]">
      <HelpButton context="פתיחת הדוכן" />
      {barStep && <StepHeader step={barStep} onBack={goBack} />}

      <main className="flex-1 w-full max-w-md mx-auto px-6 py-8 flex flex-col gap-5">
      {/* 1 — שם הדוכן */}
      {draft.step === 1 && !result && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="t-title">איך יקראו לדוכן?</h1>
            <p className="t-sub mt-2">
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
            className="field w-full px-4 py-4 text-center t-body"
          />
          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 2 })}
            className="btn btn-primary"
          >
            הלאה, לעיצוב הדוכן ←
          </button>
        </div>
      )}

      {/* 2 — הדוכן עצמו, חי וניתן לעריכה, כולל מוצרים.
          כאן רואים איך הדוכן ייראה עוד לפני שמחברים טלפון: השם, המשפט,
          התיאור, התמונות, הערכה, וגם מוצר או שניים. */}
      {draft.step === 2 && !result && (
        <div className="w-full flex flex-col gap-4">
          <div className="text-center">
            <h1 className="t-title">ככה הדוכן שלך ייראה</h1>
            <p className="t-sub mt-2">
              לחיצה על כל דבר עורכת אותו. אפשר גם להוסיף מוצר ולראות אותו בפנים.
            </p>
          </div>

          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
          <input ref={productRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickProductPhoto(e.target.files[0])} />

          <div className="overflow-hidden border border-[var(--line)]"
            style={{ background: th.bg, color: th.ink, fontFamily: th.font }}>
            <div className="h-24" style={{ background: coverCss(draft.cover) }} />
            <div className="px-4 pb-4 -mt-8">
              <div className="text-center">
                <button
                  onClick={() => avatarRef.current?.click()}
                  aria-label="החלפת תמונת הפרופיל"
                  className="relative inline-block w-16 h-16 align-middle"
                >
                  <span className="flex w-full h-full items-center justify-center text-3xl overflow-hidden"
                    style={{ background: th.surface, border: `2px solid ${th.bg}` }}>
                    {draft.avatarData
                      ? <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
                      : "📷"}
                  </span>
                  <span className="absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center text-[11px] bg-[var(--ink)] text-white z-10"
                    style={{ borderRadius: "999px", border: "1.5px solid var(--white)" }} aria-hidden>✎</span>
                </button>
              </div>

              <input
                value={draft.displayName}
                maxLength={40}
                aria-label="שם הדוכן"
                placeholder="שם הדוכן"
                onChange={(e) => set({ displayName: e.target.value })}
                className="editable block w-full text-center font-bold text-[15px] mt-1.5"
                style={{ color: th.ink }}
              />
              {/* תיאור אחד, בדיוק כמו במסך העריכה. שני שדות תיאור נראו
                  כמו שתי הערות שאומרות את אותו דבר. */}
              <textarea
                value={draft.tagline}
                maxLength={140}
                rows={2}
                aria-label="תיאור הדוכן"
                placeholder="מה מוכרים כאן? (לא חובה)"
                onChange={(e) => set({ tagline: e.target.value })}
                className="editable block w-full text-center text-[13px] mt-1 resize-none leading-snug opacity-85"
                style={{ color: th.ink }}
              />

              {/* מוצרים שנוספו לפני שיש חשבון */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {draft.products.map((pr, i) => (
                  <div key={i} className="relative" style={{ background: th.surface, border: `1px solid ${th.border}` }}>
                    <button
                      onClick={() => set({ products: draft.products.filter((_, j) => j !== i) })}
                      aria-label={`הסרת ${pr.name || "המוצר"}`}
                      className="absolute top-1 left-1 z-10 w-5 h-5 bg-black/55 text-white text-[12px] leading-none"
                      style={{ borderRadius: "999px" }}
                    >
                      ×
                    </button>
                    <div className="h-20 flex items-center justify-center text-2xl overflow-hidden">
                      {pr.imageData
                        ? <img src={pr.imageData} alt="" className="w-full h-full object-cover" />
                        : "🛍️"}
                    </div>
                    <div className="px-2 pb-2">
                      <div className="text-[12.5px] truncate">{pr.name || "מוצר"}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[12px] font-bold">₪{pr.price || 0}</span>
                        <span className="px-2 py-1 text-[11px] font-bold"
                          style={{ background: th.primary, color: th.onPrimary }}>לסל</span>
                      </div>
                    </div>
                  </div>
                ))}
                {draft.products.length < MAX_DRAFT_PRODUCTS && (
                  <button
                    onClick={() => setAdding({ name: "", price: "", imageData: null })}
                    className="border border-dashed py-6 text-[12px] col-span-2"
                    style={{ borderColor: th.border, color: th.ink }}
                  >
                    + להוסיף מוצר
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* טופס הוספת מוצר, נפתח רק כשלוחצים */}
          {adding && (
            <div className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2">
              <div className="t-body font-medium">מוצר חדש</div>
              <button
                onClick={() => productRef.current?.click()}
                className="h-28 border-[1.5px] border-dashed border-[var(--line)] bg-[var(--canvas)] flex items-center justify-center overflow-hidden"
              >
                {adding.imageData
                  ? <img src={adding.imageData} alt="" className="w-full h-full object-cover" />
                  : <span className="t-small text-[var(--muted)]">📷 להוסיף תמונה</span>}
              </button>
              <input
                value={adding.name}
                maxLength={40}
                aria-label="שם המוצר"
                placeholder="שם המוצר"
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                className="field w-full px-3 py-3 t-small"
              />
              <input
                value={adding.price}
                inputMode="numeric"
                aria-label="מחיר המוצר"
                placeholder="מחיר בשקלים"
                onChange={(e) => setAdding({ ...adding, price: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className="field w-full px-3 py-3 t-small"
              />
              {photoErr && <p className="t-small text-[var(--danger)]">{photoErr}</p>}
              <div className="flex gap-2">
                <button
                  disabled={!adding.name.trim()}
                  onClick={() => { set({ products: [...draft.products, adding] }); setAdding(null); }}
                  className="btn btn-primary flex-1"
                >
                  הוספה לדוכן
                </button>
                <button onClick={() => setAdding(null)} className="btn btn-secondary px-4">ביטול</button>
              </div>
            </div>
          )}

          {/* רקע וערכה */}
          <div className="bg-white border border-[var(--line)] p-3">
            <div className="t-small font-medium mb-2">רקע</div>
            <div className="grid grid-cols-4 gap-2">
              {COVERS.map((c) => (
                <button key={c.key} onClick={() => set({ cover: c.key })}
                  aria-label={c.label} aria-pressed={draft.cover === c.key}
                  className="relative h-12"
                  style={{ background: c.css, border: `2px solid ${draft.cover === c.key ? "var(--ink)" : "var(--line)"}` }}
                />
              ))}
            </div>
            <div className="t-small font-medium mt-3 mb-2">ערכת צבעים</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, tv]) => (
                <button key={k} onClick={() => set({ theme: k })}
                  aria-label={`ערכת ${tv.label}`} aria-pressed={draft.theme === k}
                  className={`border-[1.5px] p-1.5 text-right ${draft.theme === k ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                  style={{ background: tv.bg }}>
                  <div className="p-1" style={{ border: `1px solid ${tv.border}`, background: tv.surface }}>
                    <div className="h-5 flex items-center justify-center text-[12px] opacity-70">🧁</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[8px] font-bold" style={{ color: tv.ink }}>₪15</span>
                      <span className="px-1 py-[2px] text-[7.5px] font-bold"
                        style={{ background: tv.primary, color: tv.onPrimary }}>לסל</span>
                    </div>
                  </div>
                  <span className="block text-[11.5px] mt-1" style={{ color: tv.ink }}>{tv.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!draft.displayName.trim()}
            onClick={() => set({ step: 3 })}
            className="btn btn-primary"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 3 — גיל ועיר (לא חובה) + מודעות הורים */}
      {draft.step === 3 && !result && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="t-title">עוד שני פרטים</h1>
            <p className="t-sub mt-2">
              שניהם לא חובה, הם רק עוזרים למצוא את הדוכן לפי גיל ואזור.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="t-small font-medium mb-2">גיל</div>
              <input
                value={draft.age}
                onChange={(e) => set({ age: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                placeholder="11"
                aria-label="גיל"
                inputMode="numeric"
                maxLength={2}
                className="field w-full px-4 py-4 text-center t-body"
              />
            </div>
            <div className="flex-[1.4]">
              <div className="t-small font-medium mb-2">עיר</div>
              <input
                value={draft.city}
                onChange={(e) => set({ city: e.target.value })}
                placeholder="רמת גן"
                aria-label="עיר"
                maxLength={30}
                className="field w-full px-4 py-4 text-center t-body"
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
              <span className="t-body font-medium">
                ההורים יודעים על פתיחת הדוכן כאן
              </span>
            </label>
            {/* הסיבה האמיתית לבקש טלפון בשלב הבא: ההזמנות מגיעות ישירות
                לוואטסאפ. לא סליקה, לא משיכת כסף, לא מסירות — דוכן לא נוגע
                בכסף ובמשלוח בכלל. */}
            <p className="t-small text-[var(--muted)] mt-2">
              בשלב הבא נבקש מספר טלפון, כדי שההזמנות יגיעו ישירות בוואטסאפ.
              בלי זה אי אפשר לפרסם את הדוכן.
            </p>
          </div>

          <div className="t-small text-[var(--muted)]">
            <div className="font-semibold text-[var(--ink)] mb-1">מה יקרה עכשיו:</div>
            <ul className="flex flex-col gap-0.5 list-disc pr-4">
              <li>הדוכן נפתח, פרטי, רק מי שבונה אותו רואה אותו</li>
              <li>מעלים מוצר ראשון עם תמונה ומחיר</li>
              <li>מפרסמים ומשתפים את הקישור</li>
            </ul>
          </div>

          <button
            disabled={!draft.parentAware}
            onClick={() => set({ step: 4 })}
            className="btn btn-primary"
          >
            הלאה, למספר הטלפון ←
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
          <button onClick={() => set({ step: 3 })} className="btn btn-tertiary t-small">
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
            <p className="t-label">נפתח דוכן</p>
            <h1 className="text-xl font-bold mt-0.5">{draft.displayName}</h1>
            <p className="t-sub mt-2">
              {draft.products.length
                ? "הוא עדיין פרטי. אפשר להוסיף עוד מוצרים, ואז לפרסם."
                : "הוא עדיין פרטי. מעלים מוצר אחד, ואז אפשר לפרסם."}
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
              <div className="t-heading mt-3">{draft.displayName}</div>
              <div className="t-small text-[var(--muted)] mt-1">
                {[
                  draft.city,
                  draft.products.length === 1 ? "מוצר אחד" : `${draft.products.length} מוצרים`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {draft.products.length ? (
              <div className="grid grid-cols-2 gap-2 mx-4 mb-4">
                {draft.products.map((pr, i) => (
                  <div key={i} className="border border-[var(--line)]">
                    <div className="h-16 flex items-center justify-center text-xl overflow-hidden bg-[var(--canvas)]">
                      {pr.imageData ? <img src={pr.imageData} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                    </div>
                    <div className="px-2 py-1.5 text-[12.5px] truncate">{pr.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mx-4 mb-4 border-[1.5px] border-dashed border-[#D3D5DC] py-6 text-center t-small text-[var(--muted)]">
                כאן יופיע המוצר הראשון
              </div>
            )}
          </div>

          <a
            href={draft.products.length ? "/dashboard/products" : "/dashboard/products?new=1"}
            className="btn btn-primary"
          >
            {draft.products.length ? "לדוכן שלי" : "להעלות מוצר ראשון"}
          </a>
          <a href="/dashboard/share" className="btn btn-tertiary t-small">
            לשלוח את הלינק לחברים
          </a>
        </div>
      )}

      <div className="mt-auto">
        <LegalFooter />
      </div>
      </main>
    </div>
  );
}
