"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_COVER, coverCss } from "@/lib/covers";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneVerify from "../phone-verify";
import Icon from "../icons";
import HelpButton from "../help-button";
import LegalLinks from "../legal-links";
import { formatPrice, parsePrice, typedPrice } from "@/lib/money";

// חמישה מסכים, שאלה אחת בכל אחד: שם → מוצר ראשון → צבע → הורים → טלפון.
//
// הכל קורה לפני שמבקשים טלפון: הילד/ה רואה דוכן אמיתי עם המוצר שלו/ה,
// ורק אז מחליט/ה אם למסור מספר. המוצר יושב בטיוטה ונוצר באמת אחרי
// שהחשבון נפתח. תיאור, תמונת פרופיל ורקע — בהגדרות, אחר כך.

type Step = 1 | 2 | 3 | 4 | 5;

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

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem("duchan-draft");
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {}
  return EMPTY;
}

/**
 * מד ההתקדמות ושורת החזרה — נצמד לראש המסך, לא צף באמצע.
 * משותף לארבעת מסכי הבנייה בלבד; מסך הטלפון לא נספר כ"עוד שלב",
 * הוא מה שקורה אחרי שכל השלושה נגמרו.
 */
function StepHeader({ step, onBack }: { step: 1 | 2 | 3 | 4; onBack: () => void }) {
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
        <span className="t-label shrink-0">שלב {step} מתוך 4</span>
        <div className="flex-1 flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
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

export default function Onboarding() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);
  const productRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(loadDraft()), []);
  useEffect(() => {
    if (draft && !result) sessionStorage.setItem("duchan-draft", JSON.stringify(draft));
  }, [draft, result]);

  if (!draft) return null;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));
  /** בהקמה יש מוצר אחד בלבד — הראשון. עוד מוצרים מוסיפים בדשבורד. */
  const first: DraftProduct = draft.products[0] ?? { name: "", price: "", imageData: null };
  const productReady = !!first.name.trim() && (parsePrice(first.price) ?? 0) > 0;
  const setFirst = (patch: Partial<DraftProduct>) =>
    setDraft((d) => {
      const cur = d!.products[0] ?? { name: "", price: "", imageData: null };
      return { ...d!, products: [{ ...cur, ...patch }] };
    });

  /** תמונת מוצר בהקמה. 600 ולא 900: היא יושבת ב-sessionStorage עד
   *  שנוצר הדוכן, ו-data URL גדול מדי ממלא את המכסה של הדפדפן. */
  async function pickProductPhoto(file: File) {
    setPhotoErr("");
    try {
      const blob = await squareImage(file, 600);
      const reader = new FileReader();
      reader.onload = () => setFirst({ imageData: reader.result as string });
      reader.readAsDataURL(blob);
    } catch (e) {
      setPhotoErr(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה. אפשר לבחור תמונה אחרת.");
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
          parentAware: draft!.parentAware,
          ref: draft!.ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "משהו השתבש. אפשר לנסות שוב.");
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
      for (const pr of draft!.products.filter((x) => x.name.trim())) {
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
            price: parsePrice(pr.price) ?? 0,
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
      setErr("אין חיבור לאינטרנט. אפשר לנסות שוב בעוד רגע.");
    } finally {
      setBusy(false);
    }
  }

  // הערכה שנבחרה, לצביעת התצוגה החיה של הדוכן
  const th = themeOrDefault(draft.theme);

  // מסך הטלפון ומסך הסיום אינם חלק ממד ההתקדמות — הבנייה כבר נגמרה בהם
  const barStep = !result && draft.step <= 4 ? (draft.step as 1 | 2 | 3 | 4) : null;
  const goBack = () =>
    draft.step === 1 ? (window.location.href = "/") : set({ step: (draft.step - 1) as Step });

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)]">
      <HelpButton context="פתיחת הדוכן" />
      {barStep && <StepHeader step={barStep} onBack={goBack} />}

      <main className="flex-1 w-full max-w-md mx-auto px-6 pt-8 pb-0 flex flex-col gap-5">
      {/* 1 — שם הדוכן */}
      {draft.step === 1 && !result && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="t-title">איך קוראים לדוכן?</h1>
            <p className="t-sub mt-2">אפשר לשנות אחר כך.</p>
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
            data-testid="ob-next"
            className="btn btn-primary"
          >
            הלאה ←
          </button>
        </div>
      )}

      {/* 2 — המוצר הראשון. מסך אחד, משימה אחת: תמונה, שם, מחיר.
          מרינה, 10.2026, אחרי שנכנסה כמו ילדה: "איזה עמוס זה ולא מובן מה
          לעשות". קודם המסך הזה ערבב עיצוב, תיאור, תמונת פרופיל, 8 רקעים,
          6 ערכות וטופס מוצר — הכל באותו גלילה. */}
      {draft.step === 2 && !result && (
        <div className="w-full flex flex-col gap-4">
          <div className="text-center">
            <h1 className="t-title">מה מוכרים ראשון?</h1>
            <p className="t-sub mt-2">תמונה, שם ומחיר. את השאר מוסיפים אחר כך.</p>
          </div>

          <input ref={productRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && pickProductPhoto(e.target.files[0])} />

          <button
            onClick={() => productRef.current?.click()}
            data-testid="ob-photo"
            className="w-full aspect-[4/3] border-[1.5px] border-dashed border-[var(--line)] bg-white flex flex-col items-center justify-center gap-2 overflow-hidden"
          >
            {first.imageData ? (
              <img src={first.imageData} alt="התמונה של המוצר" className="w-full h-full object-cover" />
            ) : (
              <>
                <Icon name="camera" size={40} />
                <span className="t-body font-medium">לצלם או לבחור תמונה</span>
              </>
            )}
          </button>
          {photoErr && <p className="t-small text-[var(--danger)] text-center">{photoErr}</p>}

          <input
            value={first.name}
            maxLength={40}
            aria-label="שם המוצר"
            placeholder="מה זה? למשל: סקוויש חד-קרן"
            onChange={(e) => setFirst({ name: e.target.value })}
            className="field w-full px-4 py-4 t-body"
          />
          <div className="relative">
            <input
              value={first.price}
              inputMode="decimal"
              aria-label="מחיר המוצר"
              placeholder="כמה זה עולה?"
              onChange={(e) => setFirst({ price: typedPrice(e.target.value, 4) })}
              className="field w-full px-4 py-4 pl-10 t-body"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 t-body text-[var(--muted)]" aria-hidden>₪</span>
          </div>

          <button
            disabled={!productReady}
            onClick={() => set({ step: 3 })}
            data-testid="ob-next"
            className="btn btn-primary"
          >
            הלאה ←
          </button>
          <button
            onClick={() => set({ products: [], step: 3 })}
            data-testid="ob-skip-product"
            className="btn btn-tertiary t-small -mt-2"
          >
            אוסיף מוצר אחר כך
          </button>
        </div>
      )}

      {/* 3 — צבע. רק שש ערכות, עם הדוכן עצמו מעליהן שמשתנה מיד.
          רקע, תיאור ותמונת פרופיל עברו להגדרות: הם לא נחוצים כדי להתחיל. */}
      {draft.step === 3 && !result && (
        <div className="w-full flex flex-col gap-4">
          <div className="text-center">
            <h1 className="t-title">באיזה צבע הדוכן?</h1>
            <p className="t-sub mt-2">אפשר להחליף מתי שרוצים.</p>
          </div>

          <div data-testid="ob-preview" className="overflow-hidden border border-[var(--line)]"
            style={{ background: th.bg, color: th.ink, fontFamily: th.font }}>
            <div className="h-14" style={{ background: coverCss(draft.cover) }} />
            <div className="px-4 pb-4 -mt-3">
              <div className="text-center font-bold text-[16px]">{draft.displayName}</div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {(draft.products.length ? draft.products : [{ name: "המוצר שלך", price: "15", imageData: null }]).slice(0, 2).map((pr, i) => (
                  <div key={i} style={{ background: th.surface, border: th.border }}>
                    <div className="h-20 flex items-center justify-center overflow-hidden" style={{ background: th.thumb }}>
                      {pr.imageData
                        ? <img src={pr.imageData} alt="" className="w-full h-full object-cover" />
                        : <Icon name="bag" size={28} tone={th.primary} />}
                    </div>
                    <div className="px-2 py-2">
                      <div className="text-[12.5px] truncate">{pr.name || "מוצר"}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[12px] font-bold">₪{formatPrice(parsePrice(pr.price) ?? 0)}</span>
                        <span className="px-2 py-1 text-[11px] font-bold"
                          style={{ background: th.primary, color: th.onPrimary }}>לסל</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="צבע הדוכן">
            {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, tv]) => {
              const on = draft.theme === k;
              return (
                <button key={k} onClick={() => set({ theme: k })}
                  role="radio" aria-checked={on} aria-label={`ערכת ${tv.label}`}
                  className={`min-h-[64px] flex flex-col items-center justify-center gap-1.5 ${on ? "border-2 border-[var(--ink)]" : "border-[1.5px] border-[var(--line)]"}`}
                  style={{ background: tv.bg }}>
                  <span className="w-7 h-7 flex items-center justify-center" style={{ background: tv.primary }}>
                    {on && <Icon name="check" size={16} tone={tv.onPrimary} />}
                  </span>
                  <span className="text-[12.5px] font-medium" style={{ color: tv.ink }}>{tv.label}</span>
                </button>
              );
            })}
          </div>

          <button onClick={() => set({ step: 4 })} data-testid="ob-next" className="btn btn-primary">
            הלאה ←
          </button>
        </div>
      )}

      {/* 4 — ההורים. לפני שמוזן מספר טלפון או שנוצר חשבון, לא אחרי.
          זו לא אותה הצהרה כמו זו שב-/activate: שם מאשרים לפרסם את הדוכן,
          כאן רק שההורים יודעים שנפתח דוכן. */}
      {draft.step === 4 && !result && (
        <div className="w-full flex flex-col gap-5">
          <div className="text-center">
            <h1 className="t-title">ההורים יודעים?</h1>
            <p className="t-sub mt-2 leading-relaxed">
              בדוכן אנשים אמיתיים מזמינים ממך וכותבים לך בוואטסאפ.
              <br />
              לכן ההורים צריכים לדעת שפתחת דוכן.
            </p>
          </div>
          <label
            className="flex items-center gap-3 cursor-pointer bg-white px-4 py-4 border-[1.5px]"
            style={{ borderColor: draft.parentAware ? "var(--olive)" : "var(--line)" }}
          >
            <input
              type="checkbox"
              checked={draft.parentAware}
              onChange={(e) => set({ parentAware: e.target.checked })}
              aria-label="ההורים שלי יודעים"
              className="w-6 h-6 shrink-0 accent-[var(--olive)]"
            />
            <span className="t-body font-medium">ההורים שלי יודעים</span>
          </label>
          <button
            disabled={!draft.parentAware}
            onClick={() => set({ step: 5 })}
            data-testid="ob-next"
            className="btn btn-primary"
          >
            הלאה, למספר הטלפון ←
          </button>
        </div>
      )}

      {/* 4 — מספר וקוד. לא נספר כ"שלב 4 מתוך 3" בכוונה: זה לא עוד שלב
          בבניית הדוכן, זה מה שקורה אחרי שהוא כבר בנוי. */}
      {draft.step === 5 && !result && (
        <div className="w-full flex flex-col gap-3">
          {busy ? (
            <p className="text-sm text-center py-10">פותחים את הדוכן…</p>
          ) : (
            <PhoneVerify
              title="המספר שלך"
              subtitle="לכאן יגיעו ההזמנות בוואטסאפ. נשלח אליו קוד ב-SMS."
              cta="שלחו לי קוד"
              onVerified={save}
            />
          )}
          {err && <p className="text-xs text-[var(--danger)] text-center">{err}</p>}
          <button onClick={() => set({ step: 4 })} className="btn btn-tertiary t-small">
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
                style={{ border: "1px solid var(--line)" }}
              >
                {draft.avatarData ? (
                  <img src={draft.avatarData} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Icon name="bag" size={30} />
                )}
              </div>
              <div className="t-heading mt-3">{draft.displayName}</div>
              <div className="t-small text-[var(--muted)] mt-1">
                {draft.products.length === 1 ? "מוצר אחד" : `${draft.products.length} מוצרים`}
              </div>
            </div>
            {draft.products.length ? (
              <div className="grid grid-cols-2 gap-2 mx-4 mb-4">
                {draft.products.map((pr, i) => (
                  <div key={i} className="border border-[var(--line)]">
                    <div className="h-16 flex items-center justify-center text-xl overflow-hidden bg-[var(--canvas)]">
                      {pr.imageData ? <img src={pr.imageData} alt="" className="w-full h-full object-cover" /> : <Icon name="bag" size={22} />}
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
        </div>
      )}

      <LegalLinks />
      </main>
    </div>
  );
}
