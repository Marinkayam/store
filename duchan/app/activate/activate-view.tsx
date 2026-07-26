"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../dashboard/use-store";
import { AnchorTable, GetsList, LearnsTable, PaybackCard, SafetyList } from "../price/sections";

// הפלואו: בונים בחינם → רוצים לשתף → כאן מסבירים כמה ולמה → משלמים בביט/פייבוקס
// → מצהירים "שילמנו" → המנהלת מאשרת → החנות באוויר והלינק ניתן לשיתוף.
//
// שלוש הערות שמסבירות למה זה בנוי ככה:
// 1. הילדה לא משלמת — ההורה משלם. לכן יש כפתור ייעודי שמעביר את ההסבר להורה.
// 2. אין סליקה, ולכן אין מסך "מעבד תשלום". יש הצהרה ואישור ידני, וזה נאמר בגלוי.
// 3. ההצהרה לא מפעילה את החנות. ההפעלה נעשית בשרת בלבד (טריגר במיגרציה 0008).

interface Props {
  price: number;
  bitUrl: string;
  payboxUrl: string;
  ownerWhatsapp: string;
}

const METHODS = [
  { key: "bit", label: "ביט", icon: "💳" },
  { key: "paybox", label: "פייבוקס", icon: "📱" },
  { key: "other", label: "דרך אחרת", icon: "🤝" },
];

export default function ActivateView({ price, bitUrl, payboxUrl, ownerWhatsapp }: Props) {
  const { store, setStore, loading } = useStore();
  const [showParent, setShowParent] = useState(false);
  const [method, setMethod] = useState<string>("bit");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const storeUrl = store ? `${origin}/s/${store.slug}` : "";
  const priceUrl = `${origin}/price`;

  const waOwner = (text: string) =>
    ownerWhatsapp
      ? `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

  async function declarePaid() {
    if (!store) return;
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
      setErr("משהו השתבש. נסי שוב, או שלחי לי הודעה בוואטסאפ.");
      return;
    }
    setStore({ ...store, payment_claimed_at: new Date().toISOString(), payment_method: method });
  }

  if (loading) return <Shell><p className="text-sm text-[#7A7D8A]">רגע…</p></Shell>;

  if (!store)
    return (
      <Shell>
        <p className="text-sm text-[#7A7D8A] leading-relaxed text-center">
          עוד אין לך חנות.
          <br />
          <a href="/onboarding" className="underline text-[#15161B]">בואי נפתח אחת ←</a>
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
          <p className="text-[13px] text-[#7A7D8A] leading-relaxed">
            הלינק פעיל. כל מי שתשלחי לו יכול להיכנס ולהזמין.
          </p>
          <div className="bg-white border border-[#E6E7EC] rounded-xl px-4 py-3 text-[13px] font-mono" dir="ltr">
            {storeUrl}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(storeUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-bold"
          >
            {copied ? "הועתק ✓" : "העתקת הלינק"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`בואי לראות את החנות שלי! ${storeUrl}`)}`}
            className="bg-[#25D366] text-white rounded-xl py-3 text-sm font-bold"
          >
            שיתוף בוואטסאפ
          </a>
          <a href="/dashboard" className="text-sm text-[#7A7D8A] underline">
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
          <p className="text-[13.5px] text-[#3A3C46] leading-relaxed">
            אנחנו מאשרות כל חנות ידנית — לרוב תוך כמה שעות.
            <br />
            ברגע שזה קורה הלינק נפתח ואפשר לשתף.
          </p>
          <div className="bg-white border border-[#E6E7EC] rounded-xl p-4 text-right text-[13px] leading-relaxed">
            <div className="font-bold mb-1">בינתיים שווה:</div>
            <div className="text-[#5B5E6B]">
              • להוסיף עוד כמה מוצרים — חנות עם 5 מוצרים נראית רצינית
              <br />
              • לכתוב תיאור קצר לכל אחד
              <br />
              • לבחור תמונת קאבר
            </div>
          </div>
          <a
            href={waOwner(`היי מרינה! שילמנו על החנות "${store.display_name}" (${store.slug}). אפשר לאשר?`)}
            className="bg-[#25D366] text-white rounded-xl py-3 text-sm font-bold"
          >
            לשלוח לי תזכורת בוואטסאפ
          </a>
          <a href="/dashboard/products" className="text-sm text-[#7A7D8A] underline">
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
        <p className="text-[13px] text-[#7A7D8A] mt-2 leading-relaxed">
          בנית אותה בחינם, וזה נשאר שלך.
          <br />
          כדי לפתוח את הלינק לשיתוף — תשלום אחד.
        </p>
        <div className="mt-5 inline-flex items-baseline gap-1.5">
          <span className="text-5xl font-bold">₪{price}</span>
          <span className="text-sm text-[#7A7D8A]">פעם אחת, לתמיד</span>
        </div>
        <p className="text-[12px] text-[#7A7D8A] mt-1.5">
          בלי מנוי · בלי עמלה על מכירות · כל שקל שתרוויחי נשאר אצלך
        </p>
      </div>

      <h2 className="text-base font-bold mt-9 mb-2.5">מה נפתח לך עכשיו</h2>
      <GetsList compact />

      <div className="mt-8">
        <PaybackCard />
      </div>

      {/* ההורה הוא זה שמשלם — נותנים לו את ההסבר במקום להשאיר אותה להסביר לבד */}
      <div className="mt-8 bg-white border border-[#E6E7EC] rounded-2xl p-4">
        <div className="text-[14px] font-bold">צריך אישור של הורה?</div>
        <p className="text-[12.5px] text-[#5B5E6B] leading-relaxed mt-1">
          שלחי את ההסבר המלא — מה כלול, מה את לומדת מזה, ואיך אנחנו שומרות עלייך.
        </p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `בניתי חנות אמיתית באינטרנט! 🛍️\nכדי לפרסם אותה צריך תשלום אחד של ₪${price} (בלי מנוי, בלי עמלות).\nכל ההסבר כאן: ${priceUrl}`
          )}`}
          className="mt-3 block text-center bg-[#25D366] text-white rounded-xl py-2.5 text-[13px] font-bold"
        >
          שליחת ההסבר להורה בוואטסאפ
        </a>
        <button
          onClick={() => setShowParent((v) => !v)}
          className="mt-2 w-full text-[12px] text-[#7A7D8A] underline"
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

      {/* תשלום */}
      <h2 className="text-base font-bold mt-9 mb-1">איך משלמים</h2>
      <p className="text-[12.5px] text-[#7A7D8A] mb-3 leading-relaxed">
        אנחנו לא סולקות כרטיסי אשראי ולא שומרות פרטי תשלום. משלמים בביט או בפייבוקס,
        ואני מאשרת את החנות ידנית.
      </p>
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
          <div className="bg-white border border-[#E6E7EC] rounded-xl p-3.5 text-[13px] leading-relaxed">
            שולחים ביט או פייבוקס למספר{" "}
            <span className="font-bold" dir="ltr">
              {ownerWhatsapp.replace(/^972/, "0")}
            </span>
            , על שם מרינה.
          </div>
        )}
        <a href={waOwner(`היי מרינה! רוצה להפעיל את החנות "${store.display_name}" (${store.slug}). איך משלמים?`)}
          className="bg-white border border-[#E6E7EC] rounded-xl py-3 text-[13px] font-bold text-center"
        >
          💬 יש לי שאלה — לדבר איתך בוואטסאפ
        </a>
      </div>

      {/* הצהרה */}
      <div className="mt-8 bg-white border border-[#E6E7EC] rounded-2xl p-4">
        <div className="text-[14px] font-bold">שילמתם? נעדכן אותנו</div>
        <p className="text-[12.5px] text-[#5B5E6B] leading-relaxed mt-1">
          זה לא מפעיל את החנות מיד — זה מכניס אותה לרשימה שלי לאישור.
        </p>
        <div className="flex gap-1.5 mt-3">
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={`flex-1 rounded-xl border-[1.5px] py-2.5 text-[12px] font-medium ${
                method === m.key ? "border-[#15161B] bg-[#15161B] text-white" : "border-[#E6E7EC]"
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
          className="mt-2 w-full border border-[#E6E7EC] rounded-xl px-3.5 py-2.5 text-[13px]"
        />
        {err && <p className="text-[12px] text-[#D2373B] mt-2">{err}</p>}
        <button
          onClick={declarePaid}
          disabled={busy}
          className="mt-2 w-full bg-[#15161B] text-white rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40"
        >
          {busy ? "רגע…" : "שילמנו — לאישור החנות"}
        </button>
      </div>

      <div className="text-center mt-8">
        <a href="/dashboard" className="text-[13px] text-[#7A7D8A] underline">
          לא עכשיו, חזרה לחנות ←
        </a>
        <p className="text-[11px] text-[#A2A5B0] mt-4 leading-relaxed">
          כל מה שבנית נשמר, גם אם לא תפעילי עכשיו.
          <br />
          <a href="/terms" className="underline">תנאי שימוש</a>
          {" · "}
          <a href="/privacy" className="underline">מדיניות פרטיות</a>
        </p>
      </div>
    </Shell>
  );
}

const payBtn =
  "bg-[#15161B] text-white rounded-xl py-3.5 text-[14px] font-bold text-center block";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F5F6F9]">
      <div className="max-w-md mx-auto px-5 py-10">{children}</div>
    </main>
  );
}
