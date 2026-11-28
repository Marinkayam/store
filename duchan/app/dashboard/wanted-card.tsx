"use client";

import { useEffect, useState } from "react";

/**
 * "רצו מוצרים שאזלו": מוצר שאזל ואנשים ניסו לקנות בשבועיים האחרונים.
 * מרינה, 11.2026 ("תתחיל הכל", סבב 3 סעיף 2). הכפתור פותח את המוצר לעריכה,
 * ישר על המלאי. בלי שום פרט של מי רצה.
 */
type Item = { id: string; name: string; wanted: number };

export default function WantedCard({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    fetch(`/api/stats/wanted?storeId=${storeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, [storeId]);
  if (!items.length) return null;
  return (
    <section className="mx-gutter mt-4 bg-white border border-[var(--line)]" data-testid="wanted-card" aria-labelledby="wanted-title">
      <h2 id="wanted-title" className="px-4 pt-3.5 text-[14px] font-bold">רצו מוצרים שאזלו</h2>
      <ul className="px-4 pb-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-3 border-b border-[var(--sand)] last:border-b-0" data-testid="wanted-row">
            <span className="flex-1 min-w-0 text-[13px] leading-snug">
              {it.wanted === 1 ? "מישהו ניסה" : `${it.wanted} אנשים ניסו`} לקנות את «<b>{it.name}</b>»
            </span>
            <a
              href={`/dashboard/products?edit=${it.id}`}
              className="shrink-0 border border-[var(--line)] px-3 min-h-10 inline-flex items-center text-[12.5px] font-medium"
            >
              להוסיף למלאי
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
