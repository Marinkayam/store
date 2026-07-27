"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../dashboard/use-store";
import { AnchorTable, GetsList, LearnsTable, PaybackCard, SafetyList } from "../price/sections";
import HelpButton from "../help-button";

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
  launchUntil: string;
  bitUrl: string;
  payboxUrl: string;
  ownerWhatsapp: string;
}

const METHODS = [
  { key: "bit", label: "ביט", icon: "💳" },
  { key: "paybox", label: "פייבוקס", icon: "📱" },
  { key: "other", label: "דרך אחרת", icon: "🤝" },
];

export default function ActivateView({ price, fullPrice, isLaunch, launchUntil, bitUrl, payboxUrl, ownerWhatsapp }: Props) {
  const { store, setStore, loading } = useStore();
  const [showParent, setShowParent] = useState(false);
  const [method, setMethod] = useState<string>("bit");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
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
      setErr("לא הצלחנו לשמור את האישור — לנסות שוב.");
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
      setErr("משהו השתבש — אפשר לנסות שוב, או לשלוח לי הודעה בוואטסאפ.");
      return;
    }
    setStore({ ...store, payment_claimed_at: new Date().toISOString(), payment_method: method });
  }

  if (loading) return <Shell><p className="text-sm text-[var(--muted)]">רגע…</p></Shell>;

  if (!store)
    return (
      <Shell>
        <p className="text-sm text-[var(--muted)] leading-relaxed text-center">
          עוד אין לך חנות.
          <br />
          <a href="/onboarding" className="underline text-[var(--ink)]">נפתח אחת ←</a>
        </p>
      </Shell>
    );

  /* ── החנות כבר פעילה ── */
  if (store.activated_at)
    return (
      <Shell>
        <div className="text-center flex flex-col gap-4">
          <div className="text-5xl">🎊</div>
          <h1 className="text-xl font-bold">החנות שלך באוויר</h1>
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
            href={`https://wa.me/?text=${encodeURIComponent(`רוצה לראות את החנות שלי? ${storeUrl}`)}`}
            className="bg-[var(--whatsapp)] text-white py-3 text-sm font-bold"
          >
            שיתוף בוואטסאפ
          </a>
          <a href="/dashboard" className="text-sm text-[var(--muted)] underline">
            לניהול החנות ←
          </a>
        </div>
      </Shell>
    );

  /* ── הצהרנו ששילמנו, מחכים לאישור ── */
  if (store.payment_claimed_at)
    return (
      <Shell>
        <div className="text-center flex flex-col gap-4">
          <div className="text-5xl">⏳</div>
          <h1 className="text-xl font-bold">קיבלנו, בודקים</h1>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
            אנחנו מאשרות כל חנות ידנית — לרוב תוך כמה שעות.
            <br />
            ברגע שזה קורה הלינק נפתח ואפשר לשתף.
          </p>
          <div className="bg-white border border-[var(--line)] p-4 text-right text-[13px] leading-relaxed">
            <div className="font-bold mb-1">בינתיים שווה:</div>
            <div className="text-[var(--muted)]">
              • להוסיף עוד כמה מוצרים — חנות עם 5 מוצרים נראית רצינית
              <br />
              • לכתוב תיאור קצר לכל אחד
              <br />
              • להגדיר <a href="/dashboard/settings" className="underline">איך משלמים לך</a> — ביט, מזומן או שניהם
            </div>
          </div>
          <a
            href={waOwner(`היי מרינה! שילמנו על החנות "${store.display_name}" (${store.slug}). אפשר לאשר?`)}
            className="bg-[var(--whatsapp)] text-white py-3 text-sm font-bold"
          >
            לשלוח לי תזכורת בוואטסאפ
          </a>
          <a href="/dashboard/products" className="text-sm text-[var(--muted)] underline">
            להוספת מוצרים ←
          </a>
        </div>
      </Shell>
    );

  /* ── המסך המרכזי: כמה, ולמה זה שווה ── */
  return (
    <Shell>
      <div className="text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-[22px] font-bold leading-tight">
          {store.display_name} מוכנה
          <br />
          לצאת לעולם
        </h1>
        <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed">
          בנית אותה בחינם, וזה נשאר שלך.
          <br />
          הלינק כבר עובד בתצוגה מקדימה. כדי לקבל הזמנות אמיתיות — תשלום אחד.
        </p>
        {isLaunch && (
          <div className="mt-5 inline-block bg-[var(--wood)] text-white px-3 py-1.5 text-[12.5px] font-bold">
            🎉 מחיר השקה — עד {launchUntil}
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-center gap-2">
          <span className="text-5xl font-bold">₪{price}</span>
          {isLaunch && (
            <span className="text-2xl text-[var(--faint)] line-through">₪{fullPrice}</span>
          )}
          <span className="text-sm text-[var(--muted)]">פעם אחת, לתמיד</span>
        </div>
        {isLaunch && (
          <p className="text-[14px] font-bold mt-2">לבנות את הדוכן שלך במחיר מצחיק!</p>
        )}
        <p className="text-[12px] text-[var(--muted)] mt-1.5">
          בלי מנוי · בלי עמלה על מכירות · כל שקל שתרוויחי נשאר אצלך
        </p>
      </div>

      <h2 className="text-base font-bold mt-9 mb-2.5">מה נפתח לך עכשיו</h2>
      <GetsList compact />

      <div className="mt-8">
        <PaybackCard />
      </div>

      {/* ההורה הוא זה שמשלם — נותנים לו את ההסבר במקום להשאיר אותה להסביר לבד */}
      <div className="mt-8 bg-white border border-[var(--line)] p-4">
        <div className="text-[14px] font-bold">צריך אישור של הורה?</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          לשלוח את ההסבר המלא — מה כלול, מה לומדים מזה, ואיך אנחנו שומרים על הבטיחות.
        </p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `בניתי חנות אמיתית באינטרנט! 🛍️\n` +
              (isLaunch
                ? `יש עכשיו מחיר השקה — ₪${price} במקום ₪${fullPrice}, עד ${launchUntil}.\n`
                : `כדי לפרסם אותה צריך תשלום אחד של ₪${price} (בלי מנוי, בלי עמלות).\n`) +
              `כל ההסבר כאן: ${priceUrl}`
          )}`}
          className="mt-3 block text-center bg-[var(--whatsapp)] text-white py-2.5 text-[13px] font-bold"
        >
          שליחת ההסבר להורה בוואטסאפ
        </a>
        <button
          onClick={() => setShowParent((v) => !v)}
          className="mt-2 w-full text-[12px] text-[var(--muted)] underline"
        >
          {showParent ? "סגירה" : "או להראות את זה כאן"}
        </button>
        {showParent && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="text-[13px] font-bold mb-2">מה היא באמת לומדת</div>
              <LearnsTable />
            </div>
            <div>
              <div className="text-[13px] font-bold mb-2">₪{price} בפרספקטיבה</div>
              <AnchorTable />
            </div>
            <div>
              <div className="text-[13px] font-bold mb-2">בטיחות</div>
              <SafetyList />
            </div>
          </div>
        )}
      </div>

      {/* אישור הורה — הדבר האחרון שקורה לפני שהדוכן יוצא לעולם.
          זו הצהרה של הילד/ה ולא חשבון להורה: אין כאן מסך שני, אין סיסמה
          להורה ואין מייל לאימות. מה שיש זה רגע אחד שבו היא עוצרת ואומרת
          "כן, הם יודעים" — והחותמת נשמרת בשרת כדי שאראה אותה באישור. */}
      <div
        className={`mt-9 p-4 border-[1.5px] ${
          consentOn ? "bg-[var(--ok-bg)] border-[var(--ok-line)]" : "bg-white border-[var(--warn-line)]"
        }`}
      >
        <div className="text-[14px] font-bold">לפני שמפרסמים</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          דוכן אמיתי באינטרנט זה דבר גדול. אנחנו רוצות לדעת שההורים שלך בעניין.
        </p>
        <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentOn}
            onChange={(e) => toggleConsent(e.target.checked)}
            aria-label="אישור הורים"
            className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--ink)]"
          />
          <span className="text-[13px] leading-relaxed">
            אני מאשרת שההורים שלי יודעים ומאשרים לי לנהל את הדוכן.
          </span>
        </label>
      </div>

      {/* תשלום */}
      <h2 className="text-base font-bold mt-9 mb-1">איך משלמים לדוכן</h2>
      <p className="text-[12.5px] text-[var(--muted)] mb-3 leading-relaxed">
        אנחנו לא סולקות כרטיסי אשראי ולא שומרות פרטי תשלום. משלמים בביט או בפייבוקס,
        ואני מאשרת את החנות ידנית.
      </p>
      {/* הבלבול הכי סביר כאן הוא בין שני סוגי הכסף. אומרים את זה במפורש. */}
      <div className="bg-[var(--ok-bg)] border border-[var(--ok-line)] p-3 mb-3 text-[12.5px] leading-relaxed">
        <span className="font-bold">שני דברים נפרדים לגמרי:</span>
        <br />
        התשלום הזה הוא <b>לדוכן</b>, פעם אחת, על הקמת החנות.
        <br />
        הכסף שקונות משלמות לך על מוצרים עובר <b>ישירות אלייך</b> — בביט או במזומן, איך
        שנבחר בהגדרות. אנחנו לא נוגעים בו ולא לוקחים ממנו אגורה.
      </div>
      <div className="flex flex-col gap-2">
        {bitUrl && (
          <a href={bitUrl} target="_blank" rel="noreferrer" className={payBtn}>
            💳 תשלום ₪{price} בביט
          </a>
        )}
        {payboxUrl && (
          <a href={payboxUrl} target="_blank" rel="noreferrer" className={payBtn}>
            📱 תשלום ₪{price} בפייבוקס
          </a>
        )}
        {!bitUrl && !payboxUrl && ownerWhatsapp && (
          <div className="bg-white border border-[var(--line)] p-3.5 text-[13px] leading-relaxed">
            שולחים ביט או פייבוקס למספר{" "}
            <span className="font-bold" dir="ltr">
              {ownerWhatsapp.replace(/^972/, "0")}
            </span>
            , על שם מרינה.
          </div>
        )}
        <a href={waOwner(`היי מרינה! רוצה להפעיל את החנות "${store.display_name}" (${store.slug}). איך משלמים?`)}
          className="bg-white border border-[var(--line)] py-3 text-[13px] font-bold text-center"
        >
          💬 יש לי שאלה — לדבר איתך בוואטסאפ
        </a>
      </div>

      {/* הצהרה */}
      <div className="mt-8 bg-white border border-[var(--line)] p-4">
        <div className="text-[14px] font-bold">שילמתם? נעדכן אותנו</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          זה לא מפעיל את החנות מיד — זה מכניס אותה לרשימה שלי לאישור.
        </p>
        <div className="flex gap-1.5 mt-3">
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={`flex-1 border-[1.5px] py-2.5 text-[12px] font-medium ${
                method === m.key ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)]"
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="על שם מי שולם? (לא חובה)"
          maxLength={60}
          className="mt-2 w-full border border-[var(--line)] px-3.5 py-2.5 text-[13px]"
        />
        {err && <p className="text-[12px] text-[var(--danger)] mt-2">{err}</p>}
        <button
          onClick={declarePaid}
          disabled={busy || !consentOn}
          className="mt-2 w-full bg-[var(--ink)] text-white py-3.5 text-[14px] font-bold disabled:opacity-40"
        >
          {busy ? "רגע…" : consentOn ? "שילמנו — לאישור החנות" : "קודם מסמנים שההורים מאשרים ↑"}
        </button>
      </div>

      <div className="text-center mt-8">
        <a href="/dashboard" className="text-[13px] text-[var(--muted)] underline">
          לא עכשיו, חזרה לחנות ←
        </a>
        <p className="text-[11px] text-[var(--faint)] mt-4 leading-relaxed">
          כל מה שבנית נשמר, גם אם לא תפעילי עכשיו.
          <br />
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
