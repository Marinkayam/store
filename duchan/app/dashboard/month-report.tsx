"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import { formatPrice, sumPrices } from "@/lib/money";

/**
 * "החודש בדוכן": סיכום עסק קטן, ולשלוח אותו להורים.
 *
 * מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיפים 7 ו-8). לילדים: כמה
 * נכנס החודש, מה נמכר הכי טוב, ושאלה אחת של חשבון על המחיר. להורים: אין
 * לנו טלפון שלהם (וטוב שכך), אז הסיכום יוצא דרך הילדים, בכפתור וואטסאפ.
 *
 * רק הזמנות ששולמו או נמסרו. החודש לפי שעון ישראל. בלי השוואה לאחרים,
 * בלי דירוג ובלי לחץ: רק החודש הזה מול הקודם של אותו דוכן.
 */

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const ym = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(d);

export type MonthStats = { revenue: number; orders: number; units: number; top: { name: string; qty: number } | null };

export function monthStats(orders: Order[], month: string): MonthStats {
  const sold = orders.filter((o) => (o.status === "paid" || o.status === "delivered") && ym(new Date(o.created_at)) === month);
  const counts = new Map<string, number>();
  let units = 0;
  sold.forEach((o) =>
    o.items.forEach((it) => {
      units += it.qty;
      counts.set(it.name, (counts.get(it.name) ?? 0) + it.qty);
    })
  );
  let top: MonthStats["top"] = null;
  counts.forEach((qty, name) => {
    if (!top || qty > top.qty) top = { name, qty };
  });
  return { revenue: sumPrices(sold.map((o) => o.total)), orders: sold.length, units, top };
}

export default function MonthReport({ orders, storeName }: { orders: Order[]; storeName: string }) {
  // לפי השעון בדפדפן, אחרי טעינה
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return null;

  const thisM = ym(now);
  const prevDate = new Date(now);
  prevDate.setDate(1);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevM = ym(prevDate);
  const cur = monthStats(orders, thisM);
  const prev = monthStats(orders, prevM);
  if (cur.orders === 0 && prev.orders === 0) return null;

  const monthName = MONTHS[Number(thisM.slice(5)) - 1];
  const diff = cur.revenue - prev.revenue;
  const top = cur.top;

  const text =
    `סיכום ${monthName} בדוכן "${storeName}":\n` +
    `נכנסו ₪${formatPrice(cur.revenue)} מ-${cur.orders} ${cur.orders === 1 ? "הזמנה" : "הזמנות"}` +
    (cur.units ? `, ${cur.units} ${cur.units === 1 ? "מוצר" : "מוצרים"}` : "") +
    `.\n` +
    (top ? `הכי נמכר: ${top.name}.\n` : "") +
    (prev.orders ? `בחודש שעבר: ₪${formatPrice(prev.revenue)}.` : "");

  return (
    <section className="mx-gutter mt-4 bg-white border border-[var(--line)]" data-testid="month-report" aria-labelledby="month-title">
      <h2 id="month-title" className="px-4 pt-3.5 text-[14px] font-bold">{monthName} בדוכן</h2>
      <div className="grid grid-cols-3 px-1 py-2.5">
        {[
          [`₪${formatPrice(cur.revenue)}`, "נכנסו"],
          [String(cur.orders), cur.orders === 1 ? "הזמנה" : "הזמנות"],
          [String(cur.units), cur.units === 1 ? "מוצר נמכר" : "מוצרים נמכרו"],
        ].map(([n, l]) => (
          <div key={l} className="px-3">
            <div className="text-[18px] font-bold leading-tight"><bdi>{n}</bdi></div>
            <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      {prev.orders > 0 && (
        <p className="px-4 text-[12.5px] text-[var(--muted)]" data-testid="month-compare">
          {diff > 0
            ? `₪${formatPrice(diff)} יותר מבחודש שעבר.`
            : diff < 0
              ? `בחודש שעבר נכנסו ₪${formatPrice(prev.revenue)}. החודש עוד לא נגמר.`
              : "בדיוק כמו בחודש שעבר."}
        </p>
      )}
      {top && top.qty > 1 && (
        /* שאלה אחת של חשבון על המחיר. לומדים תמחור על מוצר אמיתי שלהם. */
        <p className="mx-4 mt-2.5 px-3 py-2.5 bg-[var(--sub)] text-[12.5px] leading-relaxed" data-testid="month-question">
          החודש נמכרו {top.qty} של «{top.name}». אם המחיר היה גבוה בשקל אחד, ונמכרה אותה כמות, היו נכנסים עוד ₪{top.qty}.
          כדאי? תלוי אם הקונים עדיין היו קונים.
        </p>
      )}
      <div className="px-4 pt-3 pb-3.5">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center border border-[var(--line)] py-2.5 min-h-11 text-[13px] font-medium"
          data-testid="month-share-parents"
        >
          לשלוח את הסיכום להורים
        </a>
      </div>
    </section>
  );
}
