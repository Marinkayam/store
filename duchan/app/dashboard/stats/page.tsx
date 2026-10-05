"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "../use-store";
import Icon from "@/app/icons";
import { formatPrice } from "@/lib/money";

/**
 * "מי מסתכל על הדוכן" (0062).
 *
 * מרינה: "תבנה גם אנליטיקס שנראה מי מסתכל וכמה צופה".
 *
 * מה רואים כאן, לפי הסדר שילד/ה שואל/ת:
 *   1. האם מישהו מסתכל *עכשיו*.
 *   2. כמה נכנסו (היום / שבוע / חודש), וכמה מהם אנשים שונים וחדשים.
 *   3. מתי נכנסים (לפי שעה או יום) — מתי כדאי לשלוח את הלינק.
 *   4. מאיפה הגיעו.
 *   5. מהכניסה ועד ההזמנה: כמה פתחו מוצר, כמה הוסיפו לסל, כמה הזמינו.
 *   6. על אילו מוצרים הכי מסתכלים — ועצה כשמסתכלים ולא מזמינים.
 *
 * "מי" — בכוונה לא. אין כאן שמות ואין דרך לדעת מי נכנס: הדוכן של ילדים,
 * וגם הקונים הם ילדים. זה כתוב בסוף הדף, במילים פשוטות.
 *
 * גרפים: סדרה אחת בכל גרף, בצבע אחד (לבנדר כהה), בלי מקרא — הכותרת אומרת
 * מה זה. כל עמודה היא כפתור: נגיעה מראה את המספר המדויק.
 */

type Range = "today" | "7" | "30";
type Stats = {
  live: number;
  totals: { visits: number; visitors: number; newVisitors: number; productOpens: number; carts: number; orders: number; revenue: number };
  prevVisits: number;
  series: { key: string; label: string; visits: number }[];
  sources: { source: string; label: string; visits: number }[];
  products: { id: string; name: string; opens: number; carts: number; orders: number }[];
};

const RANGES: { key: Range; label: string; prev: string }[] = [
  { key: "today", label: "היום", prev: "מאתמול" },
  { key: "7", label: "7 ימים", prev: "מהשבוע שלפני" },
  { key: "30", label: "30 ימים", prev: "מהחודש שלפני" },
];
const BAR = "#756192"; // lavender-deep: 5.6:1 על הרקע — עומד ב-AA גם כסימן גרפי
const LIVE_EVERY = 15_000;

const many = (n: number, one: string, more: string) => (n === 1 ? one : `${n} ${more}`);

export default function StatsPage() {
  const { store, loading } = useStore();
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!store) return;
      const r = await fetch(`/api/stats?storeId=${store.id}&range=${range}`, { cache: "no-store" }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      if (d) {
        setData(d);
        setError("");
      } else if (!quiet) setError("לא הצלחנו לטעון את המספרים. אפשר לנסות שוב בעוד רגע.");
    },
    [store, range]
  );

  useEffect(() => {
    setData(null);
    setPicked(null);
    load();
  }, [load]);
  // "עכשיו בדוכן" מתעדכן לבד כל רבע דקה, כשהמסך פתוח
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && load(true), LIVE_EVERY);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  const rng = RANGES.find((r) => r.key === range)!;
  const t = data?.totals;
  const diff = data ? data.totals.visits - data.prevVisits : 0;
  const max = Math.max(1, ...(data?.series ?? []).map((s) => s.visits));
  const pick = data?.series.find((s) => s.key === picked) ?? null;
  const best = data && data.totals.visits > 0 ? data.series.reduce((a, b) => (b.visits > a.visits ? b : a)) : null;
  const srcTotal = Math.max(1, (data?.sources ?? []).reduce((s, x) => s + x.visits, 0));

  return (
    <div data-testid="stats-page">
      <header className="bg-[var(--canvas)] px-4 pt-4 pb-3 border-b border-[var(--line)]">
        <a href="/dashboard" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--muted)] mb-2" data-testid="stats-back">
          <span aria-hidden>→</span> להזמנות
        </a>
        <h1 className="text-lg font-bold">מי מסתכל על הדוכן</h1>
        <p className="text-xs text-[var(--muted)] font-light">כמה נכנסו, מאיפה, ועל מה הכי מסתכלים</p>
      </header>

      <div className="px-4 pt-4 pb-10 flex flex-col gap-6">
        {/* ── עכשיו ── */}
        <section className="flex items-center gap-3" data-testid="stats-live" aria-live="polite">
          <span className="relative flex w-3.5 h-3.5 shrink-0" aria-hidden>
            {!!data?.live && <span className="absolute inset-0 bg-[var(--olive)] opacity-60 animate-ping" />}
            <span className={`relative w-3.5 h-3.5 ${data?.live ? "bg-[var(--olive)]" : "bg-[var(--stone)]"}`} />
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-bold" data-testid="stats-live-text">
              {!data
                ? "בודקים מי בדוכן…"
                : data.live === 0
                  ? "ברגע זה אף אחד לא בדוכן"
                  : data.live === 1
                    ? "מישהו מסתכל על הדוכן עכשיו!"
                    : `${data.live} אנשים מסתכלים על הדוכן עכשיו!`}
            </div>
            <div className="text-[12px] text-[var(--muted)]">מתעדכן לבד כל רבע דקה</div>
          </div>
          <span className="text-[28px] font-bold tabular-nums" data-testid="stats-live-n">
            {data?.live ?? "–"}
          </span>
        </section>

        {/* ── טווח ── */}
        <div className="flex border-b border-[var(--line)]" role="tablist" aria-label="תקופה">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              data-testid={`stats-range-${r.key}`}
              className={`flex-1 py-2.5 text-[13.5px] -mb-px border-b-2 ${
                range === r.key ? "border-[var(--ink)] font-bold" : "border-transparent text-[var(--muted)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}

        {/* ── המספרים הגדולים ── */}
        <section className="grid grid-cols-3 divide-x divide-x-reverse divide-[var(--line)]" data-testid="stats-kpis">
          {[
            { n: t?.visits, label: "כניסות", id: "visits" },
            { n: t?.visitors, label: "אנשים שונים", id: "visitors" },
            { n: t?.newVisitors, label: "בפעם הראשונה", id: "new" },
          ].map((k) => (
            <div key={k.id} className="text-center px-1" data-testid={`stats-kpi-${k.id}`}>
              <div className="text-[30px] font-bold leading-none tabular-nums">{k.n ?? "–"}</div>
              <div className="text-[12px] text-[var(--muted)] mt-1.5">{k.label}</div>
            </div>
          ))}
        </section>
        {data && (data.totals.visits > 0 || data.prevVisits > 0) && (
          <p className="text-[12.5px] text-center -mt-3" data-testid="stats-compare">
            {diff > 0 ? (
              <>
                <b className="text-[var(--ok-ink)]">↑ {diff}</b> כניסות יותר {rng.prev}
              </>
            ) : diff < 0 ? (
              <>
                <b>↓ {-diff}</b> כניסות פחות {rng.prev}. זה הזמן לשלוח את הלינק שוב
              </>
            ) : (
              <>בדיוק כמו {rng.prev}</>
            )}
          </p>
        )}

        {data && data.totals.visits === 0 ? (
          <section className="text-center py-4" data-testid="stats-empty">
            <div className="inline-flex text-[var(--ink)]">
              <Icon name="chart" size={44} tone="var(--sand)" />
            </div>
            <p className="text-[14px] font-bold mt-2">
              {range === "today" ? "היום עוד לא נכנסו לדוכן" : "בתקופה הזו עוד לא נכנסו לדוכן"}
            </p>
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
              כל מי שנכנס דרך הלינק נספר כאן. ככה מביאים אנשים:
            </p>
            <a href="/dashboard/settings#share" className="btn btn-primary w-full mt-3" data-testid="stats-share">
              לשלוח את הלינק לחברים
            </a>
          </section>
        ) : data ? (
          <>
            {/* ── מתי ── */}
            <section data-testid="stats-chart">
              <h2 className="text-[14px] font-bold">{range === "today" ? "כניסות לפי שעה, היום" : "כניסות לפי יום"}</h2>
              <p className="text-[12px] text-[var(--muted)] mt-0.5 min-h-[18px]" aria-live="polite">
                {pick
                  ? `${pick.label}: ${many(pick.visits, "כניסה אחת", "כניסות")}`
                  : best && best.visits > 0
                    ? `${range === "today" ? "הכי הרבה ב-" : "הכי הרבה ב-"}${best.label} (${best.visits}). נגיעה בעמודה מראה את המספר.`
                    : ""}
              </p>
              <div className="mt-3 flex items-end gap-[2px] h-32 border-b border-[var(--stone)]" dir="ltr">
                {data.series.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setPicked(picked === s.key ? null : s.key)}
                    aria-label={`${s.label}: ${many(s.visits, "כניסה אחת", "כניסות")}`}
                    className="flex-1 h-full flex items-end min-w-0"
                  >
                    <span
                      className="block w-full"
                      style={{
                        height: s.visits ? `${Math.max(4, (s.visits / max) * 100)}%` : 1,
                        background: s.visits ? BAR : "var(--sand)",
                        opacity: picked && picked !== s.key ? 0.35 : 1,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10.5px] text-[var(--muted)] mt-1 tabular-nums" dir="ltr">
                {range === "today" ? (
                  ["0:00", "6:00", "12:00", "18:00", "23:00"].map((l) => <span key={l}>{l}</span>)
                ) : (
                  <>
                    <span>{data.series[0]?.label}</span>
                    <span>{data.series[data.series.length - 1]?.label}</span>
                  </>
                )}
              </div>
            </section>

            {/* ── מאיפה ── */}
            {data.sources.length > 0 && (
              <section data-testid="stats-sources">
                <h2 className="text-[14px] font-bold">מאיפה הגיעו</h2>
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {data.sources.map((s) => (
                    <li key={s.source} data-testid={`stats-source-${s.source}`}>
                      <div className="flex justify-between text-[12.5px]">
                        <span>{s.label}</span>
                        <span className="tabular-nums text-[var(--muted)]">
                          {s.visits} · {Math.round((s.visits / srcTotal) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--sand)] mt-1">
                        <div className="h-full" style={{ width: `${(s.visits / srcTotal) * 100}%`, background: BAR }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {data.sources[0]?.source === "whatsapp_or_direct" && (
                  <p className="text-[11.5px] text-[var(--muted)] mt-2 leading-relaxed">
                    וואטסאפ לא מספר מאיפה הגיעו, אז מי שנכנס מוואטסאפ ומי שהקליד את הלינק נספרים יחד.
                  </p>
                )}
              </section>
            )}

            {/* ── מהכניסה ועד ההזמנה ── */}
            <section data-testid="stats-funnel">
              <h2 className="text-[14px] font-bold">מהכניסה ועד ההזמנה</h2>
              <ol className="mt-2.5 flex flex-col gap-2.5">
                {[
                  { k: "visits", label: "נכנסו לדוכן", n: data.totals.visits },
                  { k: "opens", label: "פתחו מוצר", n: data.totals.productOpens },
                  { k: "carts", label: "הוסיפו לסל", n: data.totals.carts },
                  { k: "orders", label: "הזמינו", n: data.totals.orders },
                ].map((f) => {
                  const w = Math.min(100, (f.n / Math.max(1, data.totals.visits)) * 100);
                  return (
                    <li key={f.k} data-testid={`stats-funnel-${f.k}`}>
                      <div className="flex justify-between text-[12.5px]">
                        <span>{f.label}</span>
                        <b className="tabular-nums">{f.n}</b>
                      </div>
                      <div className="h-2 bg-[var(--sand)] mt-1">
                        <div className="h-full" style={{ width: `${f.n ? Math.max(2, w) : 0}%`, background: BAR }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="text-[12.5px] mt-2.5 leading-relaxed" data-testid="stats-funnel-say">
                {data.totals.orders > 0 ? (
                  <>
                    מכל {Math.min(10, data.totals.visits)} שנכנסו,{" "}
                    <b>{Math.max(1, Math.round((data.totals.orders / Math.max(1, data.totals.visits)) * Math.min(10, data.totals.visits)))}</b> הזמינו
                    {data.totals.revenue > 0 && <> · נכנסו ₪{formatPrice(data.totals.revenue)}</>}
                  </>
                ) : data.totals.carts > 0 ? (
                  "הוסיפו לסל ולא הזמינו? אולי הם עוד מתלבטים. אפשר לשלוח להם הודעה."
                ) : data.totals.productOpens > 0 ? (
                  "מסתכלים על המוצרים, עוד לא הוסיפו לסל. תמונה ברורה ותיאור קצר עוזרים להחליט."
                ) : (
                  "נכנסו, אבל עוד לא פתחו מוצר. תמונה ראשונה יפה גורמת ללחוץ."
                )}
              </p>
            </section>

            {/* ── מוצרים ── */}
            {data.products.length > 0 && (
              <section data-testid="stats-products">
                <h2 className="text-[14px] font-bold">על מה הכי מסתכלים</h2>
                <ul className="mt-1.5">
                  {data.products.map((p, i) => (
                    <li
                      key={p.id}
                      className={`py-2.5 flex items-start gap-3 ${i ? "border-t border-[var(--sand)]" : ""}`}
                      data-testid="stats-product"
                    >
                      <span className="w-5 text-[12px] text-[var(--muted)] tabular-nums pt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">{p.name}</div>
                        <div className="text-[12px] text-[var(--muted)]">
                          {many(p.opens, "פתחו פעם אחת", "פתחו")} · {many(p.carts, "פעם אחת לסל", "לסל")} ·{" "}
                          {p.orders ? many(p.orders, "הוזמן אחד", "הוזמנו") : "עוד לא הוזמן"}
                        </div>
                        {p.opens >= 5 && p.orders === 0 && (
                          <div className="text-[11.5px] text-[var(--warn-ink)] mt-0.5">
                            הרבה מסתכלים ולא מזמינים. אולי תמונה אחרת או מחיר קצת אחר?
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <div className="text-[13px] text-[var(--muted)]">טוענים…</div>
        )}

        {/* ── איך זה עובד ── */}
        <details className="border-t border-[var(--line)] pt-3" data-testid="stats-privacy">
          <summary className="text-[12.5px] font-semibold cursor-pointer">איך אנחנו יודעים את זה? (ולמה אין כאן שמות)</summary>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-2">
            אנחנו רק סופרים: כל כניסה לדוכן מוסיפה 1. לא שומרים מי נכנס, לא שמות, לא מספרי טלפון ולא מיקום, ולכן גם אנחנו לא
            יודעים מי זה. &quot;אנשים שונים&quot; ו&quot;בפעם הראשונה&quot; מגיעים מהטלפון של מי שנכנס, שזוכר לבד אם הוא כבר היה כאן.
            כשאתם או השותף/ה נכנסים לדוכן שלכם, זה לא נספר.
          </p>
        </details>
      </div>
    </div>
  );
}
