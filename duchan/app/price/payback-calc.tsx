"use client";

import { useState } from "react";
import Icon from "@/app/icons";
import { ACTIVATION_PRICE, PAYBACK_EXAMPLES } from "@/lib/pricing";

/**
 * מחשבון ההחזר — "תוך כמה מכירות זה חוזר?"
 *
 * מרינה: "תעשה מזה מחשבון שיהיה כיפי לילדים לחשב". בוחרים מוצר (או מחיר
 * משלך) וכמה מכרת, ורואים: שורת מוצרים שהראשונים בה "מחזירים את הדוכן"
 * והשאר רווח, ומתחת התרגיל עצמו — כפל ואז חיסור, כמו בחידות של הקופה.
 * התרגילים LTR בתוך עמוד RTL, אחרת "3 × ₪15" מתהפך.
 */

const L = ({ children }: { children: React.ReactNode }) => (
  <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="inline-block tabular-nums">{children}</span>
);

function Stepper({ label, value, set, min, max, prefix = "", testid }: {
  label: string; value: number; set: (n: number) => void; min: number; max: number; prefix?: string; testid: string;
}) {
  const btn = "w-11 h-11 flex items-center justify-center border-[1.5px] border-[var(--ink)] bg-white text-[20px] font-bold disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] font-bold">{label}</span>
      <div className="flex items-center gap-2" data-testid={testid}>
        <button type="button" className={btn} onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`פחות: ${label}`}>−</button>
        <span className="min-w-[56px] text-center text-[20px] font-bold tabular-nums" aria-live="polite">
          <L>{prefix}{value}</L>
        </span>
        <button type="button" className={btn} onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`יותר: ${label}`}>+</button>
      </div>
    </div>
  );
}

export default function PaybackCalc() {
  const [pick, setPick] = useState(0);
  const [unit, setUnit] = useState<number>(PAYBACK_EXAMPLES[0].unit);
  const back = Math.ceil(ACTIVATION_PRICE / unit);
  const [sold, setSold] = useState(back + 3);

  const income = sold * unit;
  const profit = income - ACTIVATION_PRICE;
  const icon = pick >= 0 ? PAYBACK_EXAMPLES[pick].icon : "bag";
  const what = pick >= 0 ? PAYBACK_EXAMPLES[pick].what : "מוצר";

  const choose = (i: number) => {
    setPick(i);
    setUnit(PAYBACK_EXAMPLES[i].unit);
    setSold(Math.ceil(ACTIVATION_PRICE / PAYBACK_EXAMPLES[i].unit) + 3);
  };

  return (
    <section className="bg-white border-[1.5px] border-[var(--ink)]" data-testid="payback-calc" aria-labelledby="calc-title">
      <div className="bg-[var(--olive)] px-4 py-3.5">
        <h2 id="calc-title" className="text-[19px] font-bold leading-tight">תוך כמה מכירות זה חוזר?</h2>
        <p className="text-[13px] mt-0.5 leading-snug">בוחרים מה מוכרים ובכמה, ורואים מתי הדוכן כבר הרוויח את עצמו.</p>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="מה מוכרים">
          {PAYBACK_EXAMPLES.map((ex, i) => (
            <button
              key={ex.what}
              type="button"
              role="radio"
              aria-checked={pick === i}
              onClick={() => choose(i)}
              data-testid={`calc-pick-${i}`}
              className={`flex flex-col items-center gap-1 py-2.5 border-[1.5px] ${pick === i ? "border-[var(--ink)] bg-[var(--cream)]" : "border-[var(--line)] bg-white"}`}
            >
              <Icon name={ex.icon} size={28} tone="var(--lavender)" />
              <span className="text-[13px] font-bold">{ex.what}</span>
              <span className="text-[12px] text-[var(--muted)]"><L>₪{ex.unit}</L></span>
            </button>
          ))}
        </div>

        <Stepper label={`מחיר ל${what}`} value={unit} set={(n) => { setUnit(n); setPick((p) => (PAYBACK_EXAMPLES[p]?.unit === n ? p : -1)); }} min={1} max={200} prefix="₪" testid="calc-price" />
        <Stepper label="כמה מכרתי?" value={sold} set={setSold} min={0} max={30} testid="calc-sold" />

        {/* שורת המוצרים: הראשונים מחזירים את הדוכן, השאר רווח */}
        <div>
          <div className="flex flex-wrap gap-1.5" aria-hidden>
            {Array.from({ length: Math.max(sold, 0) }, (_, i) => (
              <span
                key={i}
                className={`w-9 h-9 flex items-center justify-center ${i < back ? "bg-[var(--cream)] border border-[var(--wood)]" : "bg-[var(--ok-bg)] border border-[var(--ok-line)]"}`}
              >
                <Icon name={icon} size={20} tone={i < back ? "var(--wood)" : "var(--olive)"} />
              </span>
            ))}
            {sold === 0 && <span className="text-[13px] text-[var(--muted)] py-2">עוד לא מכרת כלום. לוחצים על + ←</span>}
          </div>
          <div className="flex gap-4 mt-2 text-[12px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[var(--cream)] border border-[var(--wood)]" />מחזיר את הדוכן</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[var(--ok-bg)] border border-[var(--ok-line)]" />רווח שלך</span>
          </div>
        </div>

        {/* התרגיל */}
        <div className="bg-[var(--canvas)] border border-[var(--line)] p-3.5 flex flex-col gap-1.5 text-[15px]" data-testid="calc-math" aria-live="polite">
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[var(--muted)]">נכנס מהמכירות</span>
            <b className="text-[18px]"><L>{sold} × ₪{unit} = ₪{income}</L></b>
          </div>
          <div className="flex flex-col border-t border-[var(--line)] pt-1.5">
            <span className="text-[12.5px] text-[var(--muted)]">פחות מחיר הדוכן (פעם אחת)</span>
            <b className="text-[18px]"><L>₪{income} − ₪{ACTIVATION_PRICE} = ₪{profit}</L></b>
          </div>
        </div>

        <p className="text-center text-[16px] font-bold leading-snug" data-testid="calc-result">
          {profit >= 0 ? (
            <>
              כבר אחרי {back === 1 ? "מכירה אחת" : `${back} מכירות`} הדוכן החזיר את עצמו.
              <br />
              <span className="text-[var(--ok-ink)]">ומכאן הכל רווח: <L>₪{profit}</L></span>
            </>
          ) : (
            <>עוד <L>₪{-profit}</L> והדוכן החזיר את עצמו. עוד {Math.ceil(-profit / unit) === 1 ? "מכירה אחת" : `${Math.ceil(-profit / unit)} מכירות`}!</>
          )}
        </p>
        <p className="text-[12px] text-[var(--muted)] text-center -mt-2">אנחנו לא נוגעים בכסף ולא לוקחים עמלה. מה שמרוויחים נשאר אצלך.</p>
      </div>
    </section>
  );
}
