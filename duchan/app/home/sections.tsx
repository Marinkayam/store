"use client";

import { useEffect, useState, type ReactNode } from "react";
import Icon, { type IconName } from "../icons";
import { Coin, KupaStall } from "../kupa-art";
import Art from "./art";
import { useInView } from "./use-scene";
import { Kicker, ParentNote } from "./scenes";
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
        <Head light kicker="להורים · מה שקורה מאחורי הקלעים" title={<span id="safe-title">בטוח. באמת.</span>} sub="נועה רק רצתה למכור סקווישים. כל השאר בנוי מראש, כי הדוכן נועד לילדים." />
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
        <Head kicker="להורים · כמה זה עולה?" title={<span id="price-title">לבנות — חינם.</span>} sub="בונים, מעצבים ומוסיפים מוצרים בלי לשלם. משלמים פעם אחת רק כשרוצים לקבל הזמנות." />
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

/* ───────────────────────── פרק 3: כמה זה עולה? (משחק) ───────────────────────── */

/**
 * ההחלטה העסקית הראשונה של נועה, כמשחק: מזיזים את המחיר של צמיד ורואים
 * כמה חברים יקנו וכמה נשאר ברווח. המודל פשוט ובכוונה: 16 חברים, וכל שקל
 * מבריח קצת קונים. חומרים לצמיד: ₪4. המחיר הכי טוב יוצא בערך ₪20.
 */
const COST = 4;
const buyersAt = (price: number) => Math.max(0, Math.round(16 - 0.45 * price));

export function PriceGame() {
  const [price, setPrice] = useState(8);
  const [touched, setTouched] = useState(false);
  const buyers = buyersAt(price);
  const profit = buyers * (price - COST);
  const best = Math.max(...Array.from({ length: 36 }, (_, i) => buyersAt(i + 5) * (i + 5 - COST)));
  const great = profit >= best * 0.9;
  const say = !touched
    ? "מזיזים את המחיר ורואים מה קורה."
    : great
      ? "מחיר מעולה! כמעט הכי הרבה רווח שאפשר."
      : price < 14
        ? "זול מדי: הרבה קונים, אבל כמעט לא נשאר רווח."
        : price > 28
          ? "יקר מדי: כמעט אף אחד לא קונה."
          : "לא רע! נסו לזוז עוד קצת.";
  return (
    <section className="px-5 py-24 bg-[var(--cream)]" aria-labelledby="game-title" data-testid="home-price-game">
      <Reveal>
        <div className="text-center max-w-[34rem] mx-auto">
          <Kicker>פרק 3 · ההחלטה הראשונה</Kicker>
          <h2 id="game-title" className="home-display mt-1">
            כמה זה עולה?
          </h2>
          <p className="text-[15.5px] leading-relaxed mt-3">
            נועה הכינה צמידים. החומרים לכל צמיד עלו <bdi>₪{COST}</bdi>. יותר מדי — אף אחד לא קונה. פחות מדי — לא נשאר כלום. נסו למצוא את
            המחיר הכי טוב:
          </p>
        </div>
      </Reveal>
      <Reveal className="max-w-md mx-auto mt-10">
        <div className="flex items-end justify-between">
          <span className="w-24">
            <Art name="bracelets" />
          </span>
          <bdi className="text-[64px] font-extralight leading-none tabular-nums" data-testid="game-price">
            ₪{price}
          </bdi>
        </div>
        <input
          type="range"
          min={5}
          max={40}
          value={price}
          onChange={(e) => {
            setPrice(Number(e.target.value));
            setTouched(true);
          }}
          aria-label="המחיר של צמיד"
          className="home-range w-full mt-5"
          dir="ltr"
          data-testid="game-slider"
        />
        <div className="flex justify-between text-[12px] text-[var(--muted)] mt-1" dir="ltr">
          <bdi>₪5</bdi>
          <bdi>₪40</bdi>
        </div>
        <div className="mt-6" aria-hidden>
          <div className="flex flex-wrap gap-1.5 min-h-[44px]">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="w-[18px] transition-opacity duration-200" style={{ opacity: i < buyers ? 1 : 0.15 }}>
                <Icon name="heart" size={18} tone={i < buyers ? "var(--lavender)" : "none"} />
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 border-y border-[var(--stone)] mt-4 divide-x divide-x-reverse divide-[var(--stone)] text-center">
          <div className="py-3">
            <div className="text-[30px] font-extralight tabular-nums">{buyers}</div>
            <div className="text-[12.5px] text-[var(--muted)]">חברים קונים</div>
          </div>
          <div className="py-3">
            <bdi className="text-[30px] font-extralight tabular-nums" data-testid="game-profit">
              ₪{profit}
            </bdi>
            <div className="text-[12.5px] text-[var(--muted)]">רווח</div>
          </div>
        </div>
        <p className="text-[13px] text-[var(--muted)] mt-2 text-center" dir="rtl">
          {buyers} × (<bdi>₪{price}</bdi> − <bdi>₪{COST}</bdi> חומרים) = <bdi>₪{profit}</bdi>
        </p>
        <p className="text-[16px] font-medium text-center mt-3 min-h-[26px]" aria-live="polite" data-testid="game-say">
          {great && touched && (
            <span className="inline-block w-5 align-[-3px] me-1">
              <Art name="FSTAR" />
            </span>
          )}
          {say}
        </p>
        <ParentNote className="mt-8">
          ככה נראה שיעור בתמחור כשהכסף אמיתי: הכנסה, הוצאה ורווח. בקופת הדוכן מחכות עוד יותר מ-100 חידות כסף כאלה.
        </ParentNote>
      </Reveal>
    </section>
  );
}

/* ───────────────────────── פרק 6: חודש אחרי ───────────────────────── */

const LEDGER: { label: string; value: number; money?: boolean; sign?: string }[] = [
  { label: "מכירות", value: 14 },
  { label: "הכנסות", value: 238, money: true },
  { label: "חומרים ושקיות", value: 56, money: true, sign: "−" },
  { label: "רווח", value: 182, money: true },
];

export function MonthSection() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const [pick, setPick] = useState<number | null>(null);
  const right = pick === RIDDLE.a;
  return (
    <section className="px-5 py-24 bg-[var(--canvas)]" aria-labelledby="month-title" data-testid="home-month">
      <Reveal>
        <div className="text-center max-w-[34rem] mx-auto">
          <Kicker>פרק 6 · חודש אחרי</Kicker>
          <h2 id="month-title" className="home-display mt-1">
            מה נשאר בקופה?
          </h2>
        </div>
      </Reveal>
      <div ref={ref} className="max-w-md mx-auto mt-10">
        <ul className="divide-y divide-[var(--sand)] border-y border-[var(--sand)]">
          {LEDGER.map((r, i) => (
            <li
              key={r.label}
              className={`home-reveal flex items-baseline justify-between py-3 ${seen ? "is-in" : ""}`}
              style={{ transitionDelay: `${i * 140}ms` }}
            >
              <span className={`text-[15px] ${i === LEDGER.length - 1 ? "font-medium" : ""}`}>{r.label}</span>
              <bdi dir="ltr" className={`tabular-nums ${i === LEDGER.length - 1 ? "text-[40px] font-extralight text-[var(--lavender-deep)]" : "text-[24px] font-extralight"}`}>
                {r.sign}
                {r.money ? "₪" : ""}
                <CountUp to={r.value} run={seen} />
              </bdi>
            </li>
          ))}
        </ul>
        <p className="text-[15.5px] leading-relaxed mt-5 text-center">
          <bdi>₪120</bdi> נכנסו לקופסה של האופניים, והשאר לחומרים לצמידים חדשים.
        </p>
        <p className="text-[11.5px] text-[var(--muted)] text-center mt-1">הסיפור והמספרים להמחשה.</p>
      </div>

      <Reveal className="mt-16">
        <h3 className="text-center text-[20px] font-medium">ומה נועה למדה בדרך? בכלל לא על הדרך…</h3>
      </Reveal>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8 max-w-4xl mx-auto mt-8">
        {LEARNS.map((l, i) => (
          <Reveal key={l.title} i={i} className="text-center">
            <span className="inline-flex text-[var(--ink)]">
              <Icon name={l.icon} size={36} />
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
          <p className="text-[20px] leading-snug mt-3">{RIDDLE.q}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {RIDDLE.opts.map((o, i) => {
              const state = pick === null ? "" : i === RIDDLE.a ? "ok" : i === pick ? "no" : "dim";
              return (
                <button
                  key={o}
                  onClick={() => setPick(i)}
                  disabled={pick !== null && right}
                  aria-pressed={pick === i}
                  className="min-h-12 text-[18px] border-2 transition-colors"
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
        <ParentNote className="mt-8">
          מה שנשאר אחרי חודש הוא לא רק <bdi>₪182</bdi>. זו הבנה של הכנסה, הוצאה ורווח, מהכסף של הילד/ה עצמו/ה, ובקצב שלו/ה.
        </ParentNote>
      </Reveal>
    </section>
  );
}
