"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import { formatPrice } from "@/lib/money";

/**
 * "קיבלתם כסף?" על הזמנות שמחכות כבר כמה ימים.
 *
 * מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיף 2). בנתונים: 87 הזמנות
 * נשארו "חדשות" יותר משבוע. הן מבלבלות את המלאי ואת הקופה, ולא ברור אם
 * המכירה קרתה. כרטיס אחד בראש הרשימה, לחיצה אחת לכל הזמנה. "לא שילמו"
 * מבטל עם הסיבה unpaid (0073), אחרי עוד לחיצה לאישור.
 *
 * "אחר כך" מסתיר את הכרטיס ליום, בדפדפן הזה בלבד.
 */

export const STALE_DAYS = 3;
const KEY = "duchan-stale-later";

export function isStale(o: Order, now = Date.now()): boolean {
  return o.status === "sent" && now - new Date(o.created_at).getTime() > STALE_DAYS * 864e5;
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d === 1 ? "לפני יום" : d === 2 ? "לפני יומיים" : `לפני ${d} ימים`;
}

export default function StaleOrders({
  orders,
  onPaid,
  onUnpaid,
}: {
  orders: Order[];
  onPaid: (o: Order) => void;
  onUnpaid: (o: Order) => void;
}) {
  const [later, setLater] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(KEY) ?? 0);
      setLater(Date.now() - t < 864e5);
    } catch {
      setLater(false);
    }
  }, []);

  if (later || orders.length === 0) return null;
  // הוותיקות קודם: הן אלה שהכי סביר שכבר נסגרו בוואטסאפ
  const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const shown = showAll ? sorted : sorted.slice(0, 3);

  return (
    <section className="bg-white border border-[var(--warn-line)]" data-testid="stale-orders" aria-labelledby="stale-title">
      <div className="px-4 pt-3.5 pb-2.5 bg-[var(--warn-bg)]">
        <h2 id="stale-title" className="text-[14.5px] font-bold">
          {orders.length === 1 ? "קיבלתם כסף על ההזמנה הזו?" : "קיבלתם כסף על ההזמנות האלה?"}
        </h2>
        <p className="text-[12.5px] text-[var(--warn-ink)] leading-relaxed mt-0.5">
          {orders.length === 1 ? "היא מחכה" : `${orders.length} הזמנות מחכות`} כבר כמה ימים. מסמנים מה קרה, וזה גם מסדר את המלאי.
        </p>
      </div>
      <ul>
        {shown.map((o) => (
          <li key={o.id} className="px-4 py-3 border-t border-[var(--sand)]" data-testid="stale-row">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-bold truncate">
                {o.buyer_name || "בלי שם"} <span className="font-normal text-[var(--muted)]">· <bdi>#{o.order_number}</bdi></span>
              </span>
              <span className="text-[13.5px] font-bold shrink-0">₪{formatPrice(o.total)}</span>
            </div>
            <div className="text-[12px] text-[var(--muted)] mt-0.5">{daysAgo(o.created_at)}</div>
            {confirmId === o.id ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="flex-1 text-[12.5px]">לבטל את ההזמנה?</span>
                <button
                  onClick={() => {
                    setConfirmId(null);
                    onUnpaid(o);
                  }}
                  className="bg-[var(--ink)] text-white min-h-10 px-3.5 text-[12.5px] font-medium"
                  data-testid="stale-unpaid-yes"
                >
                  כן, לבטל
                </button>
                <button onClick={() => setConfirmId(null)} className="bg-white border border-[var(--line)] min-h-10 px-3.5 text-[12.5px]">
                  לא
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onPaid(o)}
                  className="flex-1 bg-[var(--ink)] text-white min-h-10 text-[13px] font-bold"
                  data-testid="stale-paid"
                >
                  כן, שילמו
                </button>
                <button
                  onClick={() => setConfirmId(o.id)}
                  className="flex-1 bg-white border border-[var(--line)] min-h-10 text-[13px]"
                  data-testid="stale-unpaid"
                >
                  לא שילמו
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--sand)] text-[12px] text-[var(--muted)]">
        {sorted.length > 3 && !showAll ? (
          <button onClick={() => setShowAll(true)} className="underline min-h-10">
            להראות את כל ה-{sorted.length}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => {
            try {
              localStorage.setItem(KEY, String(Date.now()));
            } catch {}
            setLater(true);
          }}
          className="underline min-h-10"
          data-testid="stale-later"
        >
          אחר כך
        </button>
      </div>
    </section>
  );
}
