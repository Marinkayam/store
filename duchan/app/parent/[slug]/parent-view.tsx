"use client";

import { useState } from "react";
import HomeStall from "@/app/home-stall";
import Icon, { type IconName } from "@/app/icons";
import { LearnsTable, SafetyList } from "@/app/price/sections";
import { displayPhone } from "@/lib/phone";
import ExplainerVideo from "@/app/explainer-video";

/**
 * הדף להורה. מרינה, 11.2026: "הבעיה שילדים נתקעים עליה זה העברה של הכסף
 * בביט… הסבר מדויק ופשוט עם לינק… על מה הולך הכסף, שזה חד פעמי, והחנות
 * פעילה ואפשר להיות יזם".
 *
 * הסדר: מה נבנה (עם הדוכן עצמו) → מה זה → על מה הכסף → מה לומדים →
 * בטיחות → איך משלמים בביט, צעד אחר צעד → "שילמתי". פונים להורה ברבים.
 */

type State = "open" | "pending" | "live" | "invalid";

export default function ParentView(p: {
  valid: boolean;
  slug: string;
  token: string;
  name: string;
  state: State;
  storeHref: string;
  price: number;
  fullPrice: number;
  isLaunch: boolean;
  bitUrl: string;
  payboxUrl: string;
  ownerWhatsapp: string;
}) {
  const [state, setState] = useState<State>(p.state);
  const [method, setMethod] = useState<"bit" | "paybox">("bit");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
      },
      () => {}
    );
  const wa = (text: string) => `https://wa.me/${p.ownerWhatsapp}?text=${encodeURIComponent(text)}`;
  const phoneLocal = displayPhone(p.ownerWhatsapp);

  async function claim() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/parent/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: p.slug, t: p.token, method, ref }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "משהו השתבש. אפשר לנסות שוב");
      setState(d.state === "live" ? "live" : "pending");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "משהו השתבש. אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  if (!p.valid)
    return (
      <Shell>
        <div className="text-center flex flex-col items-center gap-3 pt-6" data-testid="parent-invalid">
          <HomeStall name="?" empty className="w-full max-w-[280px] block" />
          <h1 className="text-[22px] font-black">הלינק לא שלם</h1>
          <p className="text-[14px] text-[var(--muted)] leading-relaxed max-w-xs">
            כנראה חסר בו חלק. אפשר לבקש שישלחו אותו שוב מתוך הדוכן, או לכתוב לנו ונעזור.
          </p>
          <a href={wa("היי! קיבלתי לינק להורים של דוכן והוא לא נפתח")} className="mt-1 bg-[var(--whatsapp)] text-white px-5 py-3 text-[14px] font-bold">
            לכתוב לנו בוואטסאפ
          </a>
        </div>
      </Shell>
    );

  return (
    <Shell>
      {/* ── מה נבנה ── */}
      <section className="text-center">
        <HomeStall name={p.name} celebrate={state === "live"} className="w-full max-w-[320px] mx-auto block" />
        {state === "live" ? (
          <>
            <h1 className="text-[26px] font-black leading-tight mt-1" data-testid="parent-live">הדוכן פתוח!</h1>
            <p className="text-[14px] text-[var(--muted)] leading-relaxed mt-2">
              &quot;{p.name}&quot; כבר מקבל הזמנות. תודה שאתם איתם בזה.
            </p>
          </>
        ) : state === "pending" ? (
          <>
            <h1 className="text-[24px] font-black leading-tight mt-1" data-testid="parent-pending">תודה! קיבלנו</h1>
            <div className="mt-3 bg-[var(--ok-bg)] border border-[var(--ok-line)] p-4 text-right">
              <p className="text-[14px] leading-relaxed">
                עכשיו אנחנו בודקים שהתשלום הגיע, ואז פותחים את &quot;{p.name}&quot; להזמנות. לרוב זה לוקח כמה שעות.
              </p>
              <p className="text-[13px] text-[var(--muted)] mt-1.5">לא צריך לשלם שוב ולא צריך לעשות שום דבר נוסף.</p>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] font-bold text-[var(--lavender-deep)] mt-1">להורים</p>
            <h1 className="text-[26px] font-black leading-tight">נבנה אצלכם דוכן!</h1>
            <p className="text-[14.5px] text-[var(--muted)] leading-relaxed mt-2">
              &quot;{p.name}&quot; הוא חנות קטנה באינטרנט, שנבנתה לבד מהטלפון. כדי שהוא יתחיל לקבל הזמנות
              אמיתיות, חסר רק אישור שלכם ותשלום אחד של ₪{p.price}.
            </p>
          </>
        )}
        <div className="flex flex-col gap-2 mt-4">
          {state === "open" && (
            <a href="#pay" className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold" data-testid="parent-to-pay">
              איך משלמים ←
            </a>
          )}
          <a href={p.storeHref} target="_blank" rel="noreferrer" className="border-[1.5px] border-[var(--ink)] py-3 text-[14px] font-bold">
            לראות את הדוכן
          </a>
        </div>
      </section>

      {/* כל הדף בדקה, בסרטון — למי שמעדיף לשמוע. רק לפני התשלום. */}
      {state === "open" && <ExplainerVideo which="parents" className="mt-6" />}

      {/* ── מה זה ── */}
      <section className="mt-9">
        <h2 className="text-[18px] font-black mb-3">מה זה דוכן?</h2>
        <div className="flex flex-col gap-2">
          <Row icon="shop" title="חנות אמיתית, קטנה" body="מעלים מוצרים מהטלפון, ושולחים לינק לחברים ולמשפחה." />
          <Row icon="chat" title="ההזמנות מגיעות בוואטסאפ" body="מי שמזמין כותב ישר לבעלי הדוכן, ומסכמים יחד תשלום ואיסוף." />
          <Row icon="coins" title="כל הכסף מהמכירות נשאר אצלם" body="אנחנו לא לוקחים עמלה ולא נוגעים בכסף של הקונים." />
        </div>
      </section>

      {/* ── על מה הכסף ── */}
      <section className="mt-9" data-testid="parent-why">
        <h2 className="text-[18px] font-black mb-3">על מה ה-₪{p.price}?</h2>
        <div className="bg-white border-[1.5px] border-[var(--ink)] p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-black leading-none">₪{p.price}</span>
            {p.isLaunch && <s className="text-[18px] text-[var(--faint)]">₪{p.fullPrice}</s>}
            <span className="text-[14px] font-bold">פעם אחת</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            <Check>תשלום אחד. בלי מנוי, בלי חיוב חודשי ובלי הפתעות.</Check>
            <Check>פותח את הדוכן להזמנות אמיתיות, והוא נשאר פתוח.</Check>
            <Check>מכסה את האחסון של התמונות, הודעות ה-SMS לכניסה, ובדיקה שלנו של כל דוכן לפני שהוא נפתח.</Check>
          </ul>
        </div>
      </section>

      {/* ── יזמות ── */}
      <section className="mt-9">
        <h2 className="text-[18px] font-black">להיות יזמים</h2>
        <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1 mb-3">
          לנהל דוכן זה עסק קטן אמיתי. מה לומדים בדרך:
        </p>
        <LearnsTable />
      </section>

      {/* ── בטיחות ── */}
      <section className="mt-9">
        <h2 className="text-[18px] font-black mb-3">בטיחות</h2>
        <SafetyList />
      </section>

      {/* ── איך משלמים ── */}
      {state === "open" && (
        <section id="pay" className="mt-10 scroll-mt-4" data-testid="parent-pay">
          <h2 className="text-[20px] font-black">איך משלמים בביט</h2>
          <p className="text-[13.5px] text-[var(--muted)] mt-1">שלושה צעדים, פחות מדקה.</p>
          <ol className="mt-3 bg-white border border-[var(--line)]">
            {p.bitUrl ? (
              <Step n={1} title={`לוחצים על הכפתור, ביט נפתח, ומקלידים ₪${p.price}`}>
                <a href={p.bitUrl} target="_blank" rel="noreferrer" className="mt-2 block bg-[var(--ink)] text-white py-3 text-center text-[14px] font-bold">
                  לתשלום בביט ←
                </a>
              </Step>
            ) : (
              <Step n={1} title="פותחים את ביט, לוחצים ״העברה״ ומקלידים את המספר">
                <CopyBox
                  label={phoneLocal}
                  ltr
                  done={copied === "phone"}
                  onCopy={() => copy("phone", phoneLocal.replace(/\D/g, ""))}
                  testid="parent-copy-phone"
                />
              </Step>
            )}
            <Step n={2} title={`סכום: ₪${p.price}. בהערה כותבים את שם הדוכן`}>
              <CopyBox label={p.name} done={copied === "name"} onCopy={() => copy("name", p.name)} testid="parent-copy-name" />
            </Step>
            <Step n={3} title="שולחים, וחוזרים לכאן ללחוץ ״שילמנו״" last />
          </ol>

          <details className="mt-2 bg-white border border-[var(--line)]">
            <summary className="min-h-12 px-4 flex items-center text-[13.5px] font-bold cursor-pointer">
              אין ביט? אפשר בפייבוקס
            </summary>
            <div className="px-4 pb-4 text-[13px] text-[var(--muted)] leading-relaxed">
              נכנסים לקבוצה &quot;הקמת דוכן&quot;, משלמים בה ₪{p.price}, וכותבים בהערה את שם הדוכן. השימוש בפייבוקס בחינם.
              {p.payboxUrl && (
                <a href={p.payboxUrl} target="_blank" rel="noreferrer" className="mt-2.5 block bg-[var(--ink)] text-white py-3 text-center text-[14px] font-bold">
                  לקבוצה בפייבוקס ←
                </a>
              )}
            </div>
          </details>

          {/* ── שילמנו ── */}
          <div className="mt-6 bg-white border-[1.5px] border-[var(--ink)] p-4" data-testid="parent-claim">
            <div className="text-[16px] font-black">שילמתם?</div>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-1">
              לוחצים כאן, ואנחנו בודקים שהכסף הגיע ופותחים את הדוכן.
            </p>
            <div className="flex gap-1.5 mt-3" role="radiogroup" aria-label="איך שילמתם">
              {(["bit", "paybox"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 min-h-11 border-[1.5px] text-[14px] font-bold ${method === m ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "border-[var(--line)]"}`}
                >
                  {m === "bit" ? "בביט" : "בפייבוקס"}
                </button>
              ))}
            </div>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value.slice(0, 60))}
              placeholder="על שם מי התשלום? (לא חובה)"
              aria-label="על שם מי התשלום"
              className="mt-2 w-full border border-[var(--line)] px-3.5 py-3 text-[16px]"
              data-testid="parent-ref"
            />
            {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-2">{err}</p>}
            <button
              onClick={claim}
              disabled={busy}
              className="mt-2 w-full bg-[var(--ink)] text-white py-4 text-[16px] font-bold disabled:opacity-50"
              data-testid="parent-paid"
            >
              {busy ? "רגע…" : "שילמנו ✓"}
            </button>
            <p className="text-[12px] text-[var(--muted)] mt-2 leading-relaxed">
              בלחיצה אתם גם מאשרים את פתיחת הדוכן.
            </p>
          </div>
        </section>
      )}

      {/* ── שאלות ── */}
      <section className="mt-9 mb-6 text-center">
        <p className="text-[13.5px] text-[var(--muted)]">יש שאלה? אנחנו כאן</p>
        <a href={wa(`היי! יש לי שאלה על הדוכן "${p.name}"`)} className="mt-2 inline-block bg-[var(--whatsapp)] text-white px-5 py-3 text-[14px] font-bold">
          לכתוב לנו בוואטסאפ
        </a>
        <p className="text-[12.5px] text-[var(--muted)] mt-2" dir="ltr">{phoneLocal}</p>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <div className="w-full max-w-md mx-auto px-gutter pt-6 pb-10">{children}</div>
    </main>
  );
}

function Row({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="flex gap-3 items-start bg-white border border-[var(--line)] p-3">
      <span className="w-10 h-10 shrink-0 grid place-items-center bg-[var(--canvas)]">
        <Icon name={icon} size={24} tone="var(--lavender)" />
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-bold leading-snug">{title}</div>
        <div className="text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 items-start text-[14px] leading-relaxed">
      <span className="w-5 h-5 mt-0.5 shrink-0 grid place-items-center bg-[var(--ok-bg)] text-[var(--ok-ink)] text-[12px] font-bold" aria-hidden>✓</span>
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, children, last = false }: { n: number; title: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <li className={`flex gap-3 p-4 ${last ? "" : "border-b border-[var(--line)]"}`}>
      <span className="w-7 h-7 shrink-0 grid place-items-center bg-[var(--ink)] text-white text-[14px] font-bold" aria-hidden>{n}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-bold leading-snug">{title}</div>
        {children}
      </div>
    </li>
  );
}

function CopyBox({ label, onCopy, done, ltr = false, testid }: { label: string; onCopy: () => void; done: boolean; ltr?: boolean; testid: string }) {
  return (
    <div className="mt-2 flex items-stretch border-[1.5px] border-[var(--ink)]">
      <span className="flex-1 min-w-0 px-3 py-2.5 text-[16px] font-bold truncate" dir={ltr ? "ltr" : undefined} style={ltr ? { textAlign: "right" } : undefined}>
        {label}
      </span>
      <button
        onClick={onCopy}
        className={`shrink-0 flex items-center gap-1.5 px-3.5 text-[13.5px] font-bold ${done ? "bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "bg-[var(--ink)] text-white"}`}
        data-testid={testid}
      >
        <Icon name={done ? "check" : "copy"} size={16} tone="none" />
        {done ? "הועתק!" : "העתקה"}
      </button>
    </div>
  );
}
