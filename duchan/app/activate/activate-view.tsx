"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../dashboard/use-store";
import { AnchorTable, GetsList, LearnsTable, PaybackCard, SafetyList } from "../price/sections";
import HelpButton from "../help-button";
import Icon from "../icons";
import { displayPhone } from "@/lib/phone";

// הפלואו: בונים בחינם → רוצים לשתף → כאן מסבירים כמה ולמה → משלמים בביט/פייבוקס
// → מצהירים "שילמנו" → המנהלת מאשרת → החנות באוויר והלינק ניתן לשיתוף.
//
// שלוש הערות שמסבירות למה זה בנוי ככה:
// 1. הילד/ה לא משלם/ת — ההורה משלם. לכן יש כפתור ייעודי שמעביר את ההסבר להורה.
// 2. אין סליקה, ולכן אין מסך "מעבד תשלום". יש הצהרה ואישור ידני, וזה נאמר בגלוי.
// 3. ההצהרה לא מפעילה את החנות. ההפעלה נעשית בשרת בלבד (טריגר במיגרציה 0008).

interface Props {
  price: number;
  fullPrice: number;
  isLaunch: boolean;
  /** "מבצע חד-פעמי" או "מחיר השקה · עד …" — מ-lib/pricing */
  dealLabel: string;
  bitUrl: string;
  payboxUrl: string;
  ownerWhatsapp: string;
}

const METHODS = [
  { key: "bit", label: "ביט" },
  { key: "paybox", label: "פייבוקס" },
  { key: "other", label: "דרך אחרת" },
];

export default function ActivateView({ price, fullPrice, isLaunch, dealLabel, bitUrl, payboxUrl, ownerWhatsapp }: Props) {
  const { store, setStore, loading, role } = useStore();
  const [showParent, setShowParent] = useState(false);
  // שלב ההורה (תשלום ואישור) סגור עד שלוחצים — לילדה יש מסך קצר ואחד.
  const [parentStage, setParentStage] = useState(false);
  const [method, setMethod] = useState<string>("bit");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const storeUrl = store ? `${origin}/s/${store.slug}` : "";
  const priceUrl = `${origin}/price`;

  const waOwner = (text: string) =>
    ownerWhatsapp
      ? `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

  // מסומן = מה שבמסך אם נגעו בו, אחרת מה שכבר שמור בחנות
  const consentOn = consent ?? !!store?.parent_consent_at;

  /**
   * ההצהרה נשמרת בשרת ברגע הסימון, ולא רק כשמצהירים על תשלום.
   *
   * ההורה משלם בביט מחוץ למערכת, ואז הילד/ה מצהיר/ה. אם האישור היה נשמר רק
   * בהצהרה, כל מסלול שבו היא סוגרת את הדף באמצע היה מגיע אליי לחמ"ל בלי
   * שום סימן שההורים בכלל יודעים.
   */
  async function toggleConsent(on: boolean) {
    if (!store) return;
    setConsent(on);
    setErr("");
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("set_parent_consent", { p_store: store.id, p_consent: on });
    if (error) {
      setConsent(!on);
      setErr("לא הצלחנו לשמור את האישור. אפשר לסמן שוב.");
      return;
    }
    setStore({ ...store, parent_consent_at: on ? new Date().toISOString() : null });
  }

  async function declarePaid() {
    if (!store) return;
    if (!consentOn) {
      setErr("קודם צריך לסמן שההורים יודעים ומאשרים.");
      return;
    }
    setBusy(true);
    setErr("");
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("claim_store_payment", {
      p_store: store.id,
      p_method: method,
      p_ref: ref.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr("משהו השתבש. אפשר לנסות שוב, או לכתוב לנו בוואטסאפ.");
      return;
    }
    setStore({ ...store, payment_claimed_at: new Date().toISOString(), payment_method: method });
    // לא חוסמים על זה — אם הטלגרם לא מוגדר או נכשל, ההצהרה עצמה כבר הצליחה
    fetch("/api/stores/notify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: store.id }),
    }).catch(() => {});
  }

  if (loading) return <Shell><p className="text-sm text-[var(--muted)]">רגע…</p></Shell>;

  if (!store)
    return (
      <Shell>
        <p className="text-sm text-[var(--muted)] leading-relaxed text-center">
          עוד אין לך דוכן.
          <br />
          <a href="/onboarding" className="underline text-[var(--ink)]">בואו נפתח אחד ←</a>
        </p>
      </Shell>
    );

  /* ── החנות כבר פעילה ── */
  if (store.activated_at)
    return (
      <Shell>
        <div className="text-center flex flex-col gap-4">
          <div className="flex justify-center text-[var(--ink)]"><Icon name="party" size={56} /></div>
          <h1 data-testid="store-live" className="text-xl font-bold">הדוכן שלך באוויר</h1>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">
            הלינק פעיל. כל מי שמקבל אותו ממך יכול להיכנס ולהזמין.
          </p>
          <div className="bg-white border border-[var(--line)] px-4 py-3 text-[13px] font-mono" dir="ltr">
            {storeUrl}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(storeUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="bg-[var(--ink)] text-white py-3 text-sm font-bold"
          >
            {copied ? "הועתק ✓" : "העתקת הלינק"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`רוצים לראות את הדוכן שלי? ${storeUrl}`)}`}
            className="bg-[var(--whatsapp)] text-white py-3 text-sm font-bold"
          >
            שיתוף בוואטסאפ
          </a>
          <a href="/dashboard" className="text-sm text-[var(--muted)] underline">
            לניהול הדוכן ←
          </a>
        </div>
      </Shell>
    );

  /* ── שותף/ה (0057): את התשלום ואישור ההורים עושה ראש הדוכן ── */
  if (role === "partner" && !store.activated_at)
    return (
      <Shell>
        <div className="text-center flex flex-col gap-4" data-testid="activate-partner">
          
          <h1 className="text-xl font-bold">את הפרסום עושה ראש הדוכן</h1>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
            {store.payment_claimed_at
              ? "ראש הדוכן כבר סימן/ה ששילמו. עכשיו אנחנו בודקים שהכסף הגיע, ואז הדוכן נפתח להזמנות."
              : "התשלום ואישור ההורים נעשים מהטלפון של ראש הדוכן. בינתיים אפשר להוסיף מוצרים ולעצב."}
          </p>
          <a href="/dashboard/products" className="bg-[var(--ink)] text-white py-3 text-sm font-bold">
            להוספת מוצרים
          </a>
        </div>
      </Shell>
    );

  /* ── הצהרנו ששילמנו, מחכים לאישור ──
     "קיבלנו, בודקים" לבד לא אמר מה קיבלנו ומה קורה עכשיו — לקוחה לא ידעה אם
     בכלל שילמה. אז זה מסלול של שלושה שלבים, עם מה שסומן (סכום, איך, מתי),
     מה קורה עכשיו (אנחנו בודקים, לא צריך לעשות כלום), ומה יקרה אחר כך. */
  if (store.payment_claimed_at) {
    const methodLabel = METHODS.find((m) => m.key === store.payment_method)?.label ?? "דרך אחרת";
    const when = new Date(store.payment_claimed_at).toLocaleString("he-IL", {
      day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const amount = store.payment_amount ?? price;
    return (
      <Shell>
        <div className="text-center">
          <h1 data-testid="payment-pending" className="text-[21px] font-bold leading-snug">
            התשלום בבדיקה
          </h1>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1.5">
            סימנתם ששילמתם. עכשיו אנחנו בודקים שהכסף הגיע, ואז הדוכן נפתח להזמנות.
          </p>
        </div>

        <ol className="mt-6 bg-white border border-[var(--line)]" data-testid="payment-steps">
          <li className="flex gap-3 p-4 border-b border-[var(--line)]">
            <span className="w-7 h-7 shrink-0 flex items-center justify-center bg-[var(--ok-bg)] text-[var(--ok-ink)] font-bold" aria-hidden>✓</span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold">סימנתם ששילמתם</div>
              <div className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5" data-testid="payment-claim-details">
                ₪{amount} ב{methodLabel} · {when}
                {store.payment_ref ? <> · שם המשלם: {store.payment_ref}</> : null}
              </div>
            </div>
          </li>
          <li className="flex gap-3 p-4 border-b border-[var(--line)] bg-[var(--warn-bg)]" aria-current="step">
            <span className="w-7 h-7 shrink-0 flex items-center justify-center bg-white" aria-hidden><Icon name="hourglass" size={16} tone="var(--ink)" /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold">עכשיו: אנחנו בודקים שהכסף הגיע</div>
              <div className="text-[12.5px] text-[var(--ink)] leading-relaxed mt-0.5">
                לרוב תוך כמה שעות. <b>לא צריך לעשות כלום</b> ולא צריך לשלם שוב.
              </div>
            </div>
          </li>
          <li className="flex gap-3 p-4">
            <span className="w-7 h-7 shrink-0 flex items-center justify-center border border-[var(--line)] text-[var(--faint)] text-[13px] font-bold" aria-hidden>3</span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-[var(--muted)]">הדוכן נפתח להזמנות</div>
              <div className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5">
                המסך הזה יתחלף ל&quot;הדוכן שלך באוויר&quot;, ואפשר יהיה לשתף את הלינק עם כולם.
              </div>
            </div>
          </li>
        </ol>

        {/* מי שסימן בטעות, או לא בטוח שההורה באמת שלח — הדרכים לשלם נמצאות כאן */}
        <details className="mt-4 bg-white border border-[var(--line)]" data-testid="not-paid-yet">
          <summary className="min-h-12 px-4 flex items-center text-[13.5px] font-bold cursor-pointer">
            עוד לא שילמתם בפועל?
          </summary>
          <div className="px-4 pb-4 text-[12.5px] text-[var(--muted)] leading-relaxed">
            <p>
              התשלום הוא ₪{amount}, פעם אחת. בהערה לתשלום כותבים את שם הדוכן: <b className="text-[var(--ink)]">{store.display_name}</b>.
              אחרי ששולחים, לא צריך לסמן שוב. אנחנו נראה את התשלום.
            </p>
            <div className="flex flex-col gap-2 mt-3">
              {payboxUrl && (
                <a href={payboxUrl} target="_blank" rel="noreferrer" className={payBtn}>
                  לתשלום בפייבוקס ←
                </a>
              )}
              {bitUrl && (
                <a href={bitUrl} target="_blank" rel="noreferrer" className={payBtn}>
                  לתשלום ₪{amount} בביט ←
                </a>
              )}
            </div>
          </div>
        </details>

        {/* mb-20: שכפתור ה"עזרה?" הצף לא יכסה את הקישור האחרון */}
        <div className="mt-6 mb-20 flex flex-col gap-3">
          <a href="/dashboard/products" className="bg-[var(--ink)] text-white py-3 text-center text-sm font-bold">
            בינתיים אפשר להוסיף עוד מוצרים
          </a>
          <a
            href={waOwner(`היי! שילמנו על הדוכן "${store.display_name}" (${store.slug}). אפשר לבדוק?`)}
            className="text-center text-[13px] text-[var(--muted)] underline py-2"
            data-testid="ask-marina"
          >
            עברו יותר מכמה שעות? לכתוב לנו בוואטסאפ
          </a>
        </div>
      </Shell>
    );
  }

  /* ── המסך המרכזי ──
     מרינה, 10.2026: "המסכים עמוסים מאוד, לא ברורים". היה כאן דף של 3,200
     פיקסלים: שישה כרטיסי "מה מקבלים", מחשבון, אישור הורה, שלוש דרכי תשלום
     והצהרה — הכל לילדה בת עשר. עכשיו: שלב אחד לילדה (מה המחיר ומה עושים,
     כפתור אחד), ושלב להורה (אישור ותשלום) שנפתח בלחיצה. */
  const parentShareText =
    `בניתי דוכן אמיתי באינטרנט!\n` +
    (isLaunch
      ? `יש עכשיו ${dealLabel}: רק ₪${price} במקום ₪${fullPrice}.\n`
      : `כדי לפרסם אותו צריך תשלום אחד של ₪${price} (בלי מנוי, בלי עמלות).\n`) +
    `כל ההסבר כאן: ${priceUrl}`;

  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-[22px] font-bold leading-tight">
          {store.display_name} מוכן
          <br />
          לצאת לעולם
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-2 leading-relaxed">
          הלינק כבר עובד בתצוגה מקדימה. כדי לקבל הזמנות אמיתיות, משלמים פעם אחת.
        </p>
        {isLaunch && (
          <div className="mt-4 inline-block text-white px-3 py-1 text-[12.5px] font-bold" style={{ background: "var(--wood)" }}>
            {dealLabel}
          </div>
        )}
        <div data-testid="activation-price" className="mt-3 flex items-baseline justify-center gap-2">
          <span className="text-5xl font-bold">₪{price}</span>
          {isLaunch && (
            <span className="text-2xl text-[var(--faint)] line-through">₪{fullPrice}</span>
          )}
          <span className="text-sm text-[var(--muted)]">פעם אחת</span>
        </div>
        <p className="text-[12.5px] text-[var(--muted)] mt-1.5">בלי מנוי ובלי עמלה על מכירות</p>
      </div>

      {/* מה מקבלים — סגור. מי שרוצה לדעת פותחת; מי שרוצה להתקדם לא נעצרת. */}
      <details className="mt-7 bg-white border border-[var(--line)]" data-testid="gets-details">
        <summary className="min-h-12 px-4 flex items-center justify-between text-[14px] font-bold cursor-pointer">
          מה נפתח לך?
          <span className="text-[12px] font-normal text-[var(--muted)]">לראות</span>
        </summary>
        <div className="px-4 pb-4">
          <GetsList compact />
        </div>
      </details>
      <details className="mt-2.5 bg-white border border-[var(--line)]" data-testid="payback-details">
        <summary className="min-h-12 px-4 flex items-center justify-between text-[14px] font-bold cursor-pointer">
          תוך כמה מכירות זה חוזר?
          <span className="text-[12px] font-normal text-[var(--muted)]">לחשב</span>
        </summary>
        <div className="px-4 pb-4">
          <PaybackCard />
        </div>
      </details>

      {/* הצעד של הילדה: להביא את ההורה. כפתור אחד. */}
      <div className="mt-7 bg-white border-[1.5px] border-[var(--ink)] p-4">
        <div className="text-[16px] font-bold">צריך את ההורים</div>
        <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
          הם צריכים לדעת על הדוכן, ולשלם את ה-₪{price}.
        </p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(parentShareText)}`}
          data-testid="send-parent"
          className="mt-3 block text-center bg-[var(--whatsapp)] text-white py-3.5 text-[15px] font-bold"
        >
          שליחת ההסבר להורה בוואטסאפ
        </a>
        {!parentStage && (
          <button
            onClick={() => setParentStage(true)}
            data-testid="parent-here"
            className="mt-2 w-full min-h-11 text-[14px] underline text-[var(--ink)]"
          >
            ההורה לידי, להמשיך
          </button>
        )}
      </div>

      {parentStage && (
        <div data-testid="parent-stage">
          {/* ההסבר המלא להורה — סגור בתוך שלב ההורה */}
          <div className="mt-7">
            <button
              onClick={() => setShowParent((v) => !v)}
              className="w-full min-h-11 text-[13px] text-[var(--muted)] underline"
            >
              {showParent ? "סגירה" : "או להראות את זה כאן"}
            </button>
            {showParent && (
              <div data-testid="parent-explainer" className="mt-3 bg-white border border-[var(--line)] p-4 flex flex-col gap-4">
                <div>
                  <div className="text-[13px] font-bold mb-2">מה באמת לומדים מזה</div>
                  <LearnsTable />
                </div>
                <div>
                  <div className="text-[13px] font-bold mb-2">₪{price} בהשוואה לדברים אחרים</div>
                  <AnchorTable />
                </div>
                <div>
                  <div className="text-[13px] font-bold mb-2">בטיחות</div>
                  <SafetyList />
                </div>
              </div>
            )}
          </div>

          {/* אישור הורה — הצהרה של הילדה, והחותמת נשמרת בשרת */}
          <div
            className={`mt-5 p-4 border-[1.5px] ${
              consentOn ? "bg-[var(--ok-bg)] border-[var(--ok-line)]" : "bg-white border-[var(--warn-line)]"
            }`}
          >
            <div className="text-[15px] font-bold">אישור הורה</div>
            <label className="flex items-start gap-2.5 mt-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consentOn}
                onChange={(e) => toggleConsent(e.target.checked)}
                aria-label="אישור הורים"
                className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--ink)]"
              />
              <span className="text-[13.5px] leading-relaxed">
                אני מאשר/ת שההורים שלי יודעים ומאשרים לי לנהל את הדוכן.
              </span>
            </label>
          </div>

          {/* תשלום */}
          <h2 className="text-base font-bold mt-7 mb-1">איך משלמים</h2>
          <p className="text-[12.5px] text-[var(--muted)] mb-3 leading-relaxed">
            התשלום הוא לנו, פעם אחת. הכסף שקונים משלמים על מוצרים עובר ישירות אליך, ואנחנו לא לוקחים ממנו כלום.
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="bg-white border-[1.5px] border-[var(--ink)] p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">פייבוקס</span>
                <span className="bg-[var(--ok-bg)] border border-[var(--ok-line)] text-[var(--ok-ink)] text-[11px] font-bold px-1.5 py-0.5">
                  השימוש חינם
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1.5">
                נכנסים לקבוצת <b>&quot;הקמת דוכן&quot;</b> ומשלמים שם ₪{price}.
              </p>
              {payboxUrl && (
                <a href={payboxUrl} target="_blank" rel="noreferrer" className={`${payBtn} mt-2.5`}>
                  להצטרפות לקבוצה ולתשלום ←
                </a>
              )}
            </div>

            <div className="bg-white border border-[var(--line)] p-3.5">
              <div className="text-[15px] font-bold">או בביט</div>
              <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1.5">
                שולחים ₪{price} למספר הזה, וכותבים בהערה את שם הדוכן.
              </p>
              {bitUrl ? (
                <a href={bitUrl} target="_blank" rel="noreferrer" className={`${payBtn} mt-2.5`}>
                  תשלום ₪{price} בביט ←
                </a>
              ) : (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(ownerWhatsapp.replace(/^972/, "0"));
                    setCopiedPhone(true);
                    setTimeout(() => setCopiedPhone(false), 2000);
                  }}
                  className="mt-2.5 w-full border-[1.5px] border-[var(--line)] py-3 flex items-center justify-center gap-2"
                >
                  <span className="text-[16px] font-bold tracking-wide" dir="ltr">
                    {displayPhone(ownerWhatsapp)}
                  </span>
                  <span className="text-[12px] text-[var(--muted)]">
                    {copiedPhone ? "הועתק ✓" : "להעתקה"}
                  </span>
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(store.display_name);
                  setCopiedName(true);
                  setTimeout(() => setCopiedName(false), 2000);
                }}
                className="mt-1.5 w-full border border-dashed border-[var(--line)] py-2.5 text-[12.5px] text-start px-3"
              >
                <span className="text-[var(--muted)]">מה לכתוב בהערה: </span>
                <b>{store.display_name}</b>
                <span className="text-[var(--muted)]">{copiedName ? " · הועתק ✓" : " · להעתקה"}</span>
              </button>
            </div>
          </div>

          {/* הצהרה */}
          <div className="mt-6 bg-white border border-[var(--line)] p-4">
            <div className="text-[15px] font-bold">שילמתם? עדכנו אותנו</div>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
              אנחנו בודקים שהתשלום הגיע, ואז הדוכן נפתח.
            </p>
            <div className="flex gap-1.5 mt-3">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  data-testid={`pay-method-${m.key}`}
                  onClick={() => setMethod(m.key)}
                  aria-pressed={method === m.key}
                  className={`flex-1 border-[1.5px] min-h-11 text-[13px] font-medium ${
                    method === m.key ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              data-testid="payment-ref"
              placeholder="על שם מי התשלום? (לא חובה)"
              maxLength={60}
              className="mt-2 w-full border border-[var(--line)] px-3.5 py-3 text-[14px]"
            />
            {err && <p className="text-[12px] text-[var(--danger)] mt-2">{err}</p>}
            <button
              data-testid="declare-paid"
              onClick={declarePaid}
              disabled={busy || !consentOn}
              className="mt-2 w-full bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold disabled:opacity-40"
            >
              {busy ? "רגע…" : consentOn ? "שילמנו, לאישור הדוכן" : "קודם מסמנים שההורים מאשרים"}
            </button>
          </div>

          <a
            href={waOwner(`היי! רוצה להפעיל את הדוכן "${store.display_name}" (${store.slug}). איך משלמים?`)}
            className="mt-3 block text-center text-[13px] text-[var(--muted)] underline py-2"
          >
            יש שאלה? לכתוב לנו בוואטסאפ
          </a>
        </div>
      )}

      <div className="text-center mt-8 mb-16">
        <a href="/dashboard" className="text-[14px] text-[var(--muted)] underline">
          לא עכשיו, חזרה לדוכן
        </a>
        <p className="text-[12px] text-[var(--faint)] mt-3">כל מה שבנית נשמר.</p>
        <p className="text-[12px] text-[var(--faint)] mt-3">
          <a href="/terms" className="underline">תנאי שימוש</a>
          {" · "}
          <a href="/privacy" className="underline">מדיניות פרטיות</a>
          {" · "}
          <a href="/accessibility" className="underline">נגישות</a>
        </p>
      </div>
    </Shell>
  );
}

const payBtn =
  "bg-[var(--ink)] text-white  py-3.5 text-[14px] font-bold text-center block";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <HelpButton context="הפעלת הדוכן" />
      <div className="max-w-md mx-auto px-5 py-10">{children}</div>
    </main>
  );
}
