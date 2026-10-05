"use client";

import { useEffect, useState, type ReactNode } from "react";
import Icon, { type IconName } from "../icons";
import { Coin, KupaStall } from "../kupa-art";
import Art from "./art";
import { useInView } from "./use-scene";
import { ACTIVATION_PRICE, DEAL_LABEL, FULL_PRICE, IS_LAUNCH } from "@/lib/pricing";

/** כותרת פרק: מספר קטן, כותרת דקה וגדולה, ומשפט אחד */
function Head({ kicker, title, sub, light = false }: { kicker: string; title: ReactNode; sub?: ReactNode; light?: boolean }) {
  return (
    <div className="text-center max-w-[34rem] mx-auto">
      <div className="text-[13px] font-medium tracking-wide" style={{ color: light ? "#FFF3C4" : "var(--muted)" }}>
        {kicker}
      </div>
      <h2 className="home-display mt-1">{title}</h2>
      {sub && <p className="text-[15.5px] leading-relaxed mt-3 opacity-90">{sub}</p>}
    </div>
  );
}

/** מופיע כשנכנס למסך, עם השהיה לפי הסדר */
function Reveal({ children, i = 0, className = "" }: { children: ReactNode; i?: number; className?: string }) {
  const { ref, seen } = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`home-reveal ${seen ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${i * 80}ms` }}>
      {children}
    </div>
  );
}

/* ───────────────────────── מה לומדים ───────────────────────── */

const LEARNS: { icon: IconName; title: string; line: string }[] = [
  { icon: "coin", title: "תמחור", line: "כמה לבקש? יותר מדי — לא קונים. פחות מדי — מפסידים." },
  { icon: "box", title: "ניהול מלאי", line: "כמה נשאר, מה נגמר, ומה כדאי להכין עוד." },
  { icon: "megaphone", title: "שיווק", line: "איך מספרים על הדוכן כך שירצו להיכנס." },
  { icon: "chat", title: "שירות לקוחות", line: "עונים יפה, מוסרים בזמן, מחזירים עודף נכון." },
  { icon: "receipt", title: "חשבון של כסף אמיתי", line: "רווח, הוצאות, הנחות ואחוזים, עם כסף אמיתי." },
  { icon: "plant", title: "התמדה", line: "דוכן לא נבנה ביום אחד. מוסיפים, משפרים, ממשיכים." },
];

const RIDDLE = {
  q: "מכרת ב-₪50 והוצאת ₪20 על חומרים. כמה הרווחת?",
  opts: ["₪50", "₪30", "₪70"],
  a: 1,
  why: "הכנסה ₪50, רווח ₪30. רווח = מה שנשאר אחרי ההוצאות.",
};

export function LearnSection() {
  const [pick, setPick] = useState<number | null>(null);
  const right = pick === RIDDLE.a;
  return (
    <section className="px-5 py-24 bg-[var(--canvas)]" aria-labelledby="learn-title" data-testid="home-learn">
      <Reveal>
        <Head
          kicker="ומה לומדים?"
          title={<span id="learn-title">בכלל לא על הדרך…</span>}
          sub="דוכן הוא עסק אמיתי. כל מכירה מלמדת משהו שלא לומדים בבית ספר."
        />
      </Reveal>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8 max-w-4xl mx-auto mt-12">
        {LEARNS.map((l, i) => (
          <Reveal key={l.title} i={i} className="text-center">
            <span className="inline-flex text-[var(--ink)]">
              <Icon name={l.icon} size={40} />
            </span>
            <div className="text-[16px] font-medium mt-2">{l.title}</div>
            <p className="text-[13.5px] leading-relaxed text-[var(--muted)] mt-1">{l.line}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="max-w-md mx-auto mt-16">
        <div className="border-t-2 border-[var(--ink)] pt-6" data-testid="home-riddle">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--muted)]">
            <span className="w-5 text-[#E3C26F]">
              <Art name="FSTAR" />
            </span>
            חידה מקופת הדוכן · יש שם יותר מ-100
          </div>
          <p className="text-[20px] leading-snug mt-3 font-medium">{RIDDLE.q}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {RIDDLE.opts.map((o, i) => {
              const state = pick === null ? "" : i === RIDDLE.a ? "ok" : i === pick ? "no" : "dim";
              return (
                <button
                  key={o}
                  onClick={() => setPick(i)}
                  disabled={pick !== null && right}
                  aria-pressed={pick === i}
                  className="min-h-12 text-[18px] font-medium border-2 transition-colors"
                  style={{
                    background: state === "ok" ? "var(--ok-bg)" : state === "no" ? "var(--danger-bg)" : "#fff",
                    borderColor: state === "ok" ? "var(--ok-ink)" : state === "no" ? "var(--danger)" : "var(--stone)",
                    opacity: state === "dim" ? 0.5 : 1,
                  }}
                >
                  <bdi>{o}</bdi>
                </button>
              );
            })}
          </div>
          <p className="text-[14px] leading-relaxed mt-3 min-h-[44px]" aria-live="polite" data-testid="home-riddle-answer">
            {pick === null ? "" : right ? <><b className="text-[var(--ok-ink)]">נכון! כוכב לקופה.</b> {RIDDLE.why}</> : "כמעט! עוד ניסיון?"}
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────────────── הקופה ───────────────────────── */

function CountUp({ to, run }: { to: number; run: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <>{n}</>;
}

const COIN_WAYS = [
  ["מוצר ראשון", 20],
  ["הזמנה ראשונה", 40],
  ["מכירה ראשונה", 50],
  ["₪100 ראשונים", 50],
] as const;

export function KupaSection() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  return (
    <section className="px-5 py-24 bg-[var(--cream)]" aria-labelledby="kupa-title" data-testid="home-kupa">
      <Reveal>
        <Head
          kicker="קופת הדוכן"
          title={<span id="kupa-title">כל צעד אמיתי — מטבעות לקופה.</span>}
          sub="מוצר ראשון, הזמנה ראשונה, חידה שנפתרה. הדוכן המצויר גדל, ובחנות הקופה קונים לו סוכך זהב או חתול."
        />
      </Reveal>
      <div ref={ref} className="max-w-md mx-auto mt-10 text-center">
        <div className="inline-flex items-center gap-3">
          <Coin size={44} />
          <span className="text-[56px] font-extralight leading-none tabular-nums">
            <CountUp to={345} run={seen} />
          </span>
        </div>
        <div className="text-[13px] text-[var(--muted)] mt-1">מטבעות מחכים באותות הקופה</div>
        <ul className="mt-6 divide-y divide-[var(--sand)] border-y border-[var(--sand)] text-right">
          {COIN_WAYS.map(([w, c], i) => (
            <li key={w} className={`home-reveal flex items-center justify-between py-3 ${seen ? "is-in" : ""}`} style={{ transitionDelay: `${300 + i * 120}ms` }}>
              <span className="text-[15px]">{w}</span>
              <span className="flex items-center gap-1.5 font-medium">
                +{c} <Coin size={18} />
              </span>
            </li>
          ))}
        </ul>
        <div className="w-[min(70vw,300px)] mx-auto mt-8">
          <KupaStall level={5} bare deco={{ awning: "gold", flowers: true, openSign: true, cat: true }} className="w-full block" />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── בטוח ───────────────────────── */

const SAFE: { icon: IconName; title: string; line: string }[] = [
  { icon: "lock", title: "בלי כתובת. אף פעם.", line: "לא מבקשים איפה גרים. מסירה מסכמים בוואטסאפ." },
  { icon: "phone", title: "הטלפון לא בדוכן", line: "המספר לא מופיע בדף ולא בקוד שלו." },
  { icon: "eye", title: "לא מופיע בגוגל", line: "מגיעים לדוכן רק מהלינק ששלחתם." },
  { icon: "heart", title: "ההורים מאשרים", line: "לפני שהדוכן נפתח להזמנות, הורה מאשר/ת." },
  { icon: "camera", title: "תמונות נקיות", line: "התמונות מנוקות מהמיקום, והסרטונים בלי קול." },
  { icon: "coins", title: "הכסף לא עובר דרכנו", line: "משלמים ישר לדוכן: ביט, פייבוקס או מזומן." },
];

export function SafetySection() {
  return (
    <section className="px-5 py-24" style={{ background: "var(--ink)", color: "#FBF8F3" }} aria-labelledby="safe-title" data-testid="home-safety">
      <Reveal>
        <Head light kicker="להורים" title={<span id="safe-title">בטוח. באמת.</span>} sub="הדוכן בנוי לילדים, ולכן הבטיחות לא נתונה לבחירה. היא פשוט שם." />
      </Reveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-white/15 max-w-4xl mx-auto mt-12 border border-white/15">
        {SAFE.map((s, i) => (
          <Reveal key={s.title} i={i} className="bg-[var(--ink)] p-5">
            <span className="inline-flex text-[#FBF8F3]">
              <Icon name={s.icon} size={30} tone="var(--lavender-deep)" />
            </span>
            <div className="text-[16px] font-medium mt-2">{s.title}</div>
            <p className="text-[13.5px] leading-relaxed mt-1 opacity-80">{s.line}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── מחיר ───────────────────────── */

export function PriceSection() {
  const units = Math.max(1, Math.ceil(ACTIVATION_PRICE / 15));
  return (
    <section className="px-5 py-24 bg-[var(--canvas)]" aria-labelledby="price-title" data-testid="home-price">
      <Reveal>
        <Head kicker="כמה זה עולה?" title={<span id="price-title">לבנות — חינם.</span>} sub="בונים, מעצבים ומוסיפים מוצרים בלי לשלם. משלמים פעם אחת רק כשרוצים לקבל הזמנות." />
      </Reveal>
      <Reveal className="max-w-md mx-auto mt-10 text-center">
        {IS_LAUNCH && (
          <div className="inline-block text-[12.5px] font-medium bg-[var(--wood)] text-white px-3 py-1">
            <span className="fx-wiggle inline-block align-[-2px]">
              <Icon name="party" size={14} tone="none" />
            </span>{" "}
            {DEAL_LABEL}
          </div>
        )}
        <div className="flex items-end justify-center gap-4 mt-4">
          <bdi className="text-[96px] font-extralight leading-none">₪{ACTIVATION_PRICE}</bdi>
          {IS_LAUNCH && <bdi className="text-[28px] text-[var(--muted)] line-through mb-3">₪{FULL_PRICE}</bdi>}
        </div>
        <div className="text-[17px] font-medium mt-2">פעם אחת. הדוכן שלך לתמיד.</div>
        <div className="flex items-center justify-center gap-3 mt-8">
          {Array.from({ length: units }, (_, i) => (
            <span key={i} className="w-16">
              <Art name="squishy" />
            </span>
          ))}
        </div>
        <p className="text-[14.5px] mt-2">
          {units === 1 ? "סקוויש אחד ב-₪15" : `${units} סקווישים ב-₪15`} — וזה כבר החזיר את עצמו.
        </p>
        <a href="/price" className="inline-block underline font-medium text-[14.5px] mt-5" data-testid="promo-banner">
          כל מה שמקבלים בדוכן ←
        </a>
      </Reveal>
    </section>
  );
}
