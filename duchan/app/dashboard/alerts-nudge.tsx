"use client";

import { useEffect, useState } from "react";
import OrderAlerts from "./order-alerts";

/**
 * "לקבל התראה על כל הזמנה", במסך ההזמנות.
 *
 * מרינה, 11.2026: "האם יש פוש כשמגיעה הזמנה?" ... "כן תבנה". יש (0061),
 * אבל הכפתור הופיע רק בצעדים הראשונים, לפני ההזמנה הראשונה. בנתונים: מתוך
 * 20 דוכנים שקיבלו הזמנות בחודש, ל-8 לא היה אף מכשיר עם התראות, והם גילו
 * על הזמנות רק כשנכנסו לאתר.
 *
 * מופיע רק כשכבר יש הזמנות, ואין לבעלי הדוכן אף מכשיר רשום. "לא עכשיו"
 * מסתיר לשבועיים, בטלפון הזה.
 */
const KEY = (id: string) => `duchan-alerts-later-${id}`;

export default function AlertsNudge({ storeId }: { storeId: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(KEY(storeId)) ?? 0);
      if (Date.now() - t < 14 * 864e5) return;
    } catch {}
    fetch(`/api/push?storeId=${encodeURIComponent(storeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.available && (d.endpoints ?? []).length === 0) setShow(true);
      })
      .catch(() => {});
  }, [storeId]);
  if (!show) return null;
  return (
    <section className="mx-gutter mt-4 bg-white border-[1.5px] border-[var(--ink)] p-4 flex flex-col gap-3" data-testid="alerts-nudge" aria-labelledby="alerts-nudge-title">
      <div>
        <h2 id="alerts-nudge-title" className="text-[15px] font-bold">לקבל התראה על כל הזמנה</h2>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5">
          ככה לא מפספסים קונים שמחכים. באייפון קודם שומרים את הדוכן במסך הבית, ופותחים משם.
        </p>
      </div>
      <OrderAlerts storeId={storeId} cta="להפעיל התראות" />
      <button
        onClick={() => {
          try {
            localStorage.setItem(KEY(storeId), String(Date.now()));
          } catch {}
          setShow(false);
        }}
        className="text-[12.5px] underline text-[var(--muted)] min-h-9 self-center"
        data-testid="alerts-nudge-later"
      >
        לא עכשיו
      </button>
    </section>
  );
}
