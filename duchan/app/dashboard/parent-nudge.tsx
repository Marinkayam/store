"use client";

import { useEffect, useState } from "react";
import type { Store } from "@/lib/types";
import { ACTIVATION_PRICE, TEAM_FUND } from "@/lib/pricing";
import { storePath } from "@/lib/short-link";

/**
 * "הדוכן מוכן, נשאר רק שההורים יאשרו": שליחה להורים ישר מהדשבורד, ותזכורת.
 *
 * מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיף 1). בנתונים (26.11.2026):
 * 38 דוכנים עם שני מוצרים או יותר שעוד לא הופעלו. הילדים עשו את העבודה,
 * וזה נתקע אצל ההורים. אין לנו טלפון של הורים (וטוב שכך), אז התזכורת עוברת
 * דרך הילדים: כפתור וואטסאפ עם הלינק האישי להורה (/parent/…) ועם הלינק
 * לדוכן, כדי שההורים יראו מה נבנה ולא רק בקשה לכסף.
 *
 * מתי שלחו נשמר במכשיר (duchan-parent-sent-{id}), גם מהמסך של /activate.
 * אחרי יומיים בלי תשלום הכפתור הופך ל"לשלוח שוב" עם הודעה קצרה ועדינה.
 */

export const parentSentKey = (storeId: string) => `duchan-parent-sent-${storeId}`;

export function markParentSent(storeId: string) {
  try {
    localStorage.setItem(parentSentKey(storeId), String(Date.now()));
  } catch {}
}

function ago(ms: number): string {
  const d = Math.floor(ms / 864e5);
  return d <= 0 ? "היום" : d === 1 ? "אתמול" : d === 2 ? "לפני יומיים" : `לפני ${d} ימים`;
}

export default function ParentNudge({ store, products }: { store: Store; products: number }) {
  const [parentUrl, setParentUrl] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(parentSentKey(store.id)) ?? 0);
      setSentAt(v > 0 ? v : null);
    } catch {}
    fetch(`/api/stores/parent-link?storeId=${store.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.path && setParentUrl(`${window.location.origin}${d.path}`))
      .catch(() => {});
  }, [store.id]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const storeUrl = `${origin}${storePath(store.slug)}`;
  const explain = parentUrl ?? `${origin}/price`;
  const reminder = sentAt != null && Date.now() - sentAt > 2 * 864e5;

  const text = reminder
    ? `תזכורת קטנה: הדוכן שלי "${store.display_name}" מוכן ומחכה רק לאישור שלכם.\n\n` +
      `ככה הוא נראה: ${storeUrl}\n\n` +
      `כל ההסבר, ואיך משלמים:\n${explain}`
    : `היי! בניתי דוכן באינטרנט: "${store.display_name}", ` +
      (products === 1 ? "עם מוצר ראשון." : `עם ${products} מוצרים.`) +
      `\nככה הוא נראה: ${storeUrl}\n\n` +
      `כדי שחברים יוכלו להזמין, צריך שתאשרו ותשלמו פעם אחת ₪${ACTIVATION_PRICE}` +
      (TEAM_FUND.active ? `, וכל הכסף עובר כתרומה ל${TEAM_FUND.short}` : "") +
      `. בלי מנוי ובלי עמלות.\n\n` +
      `כל ההסבר, ואיך משלמים:\n${explain}`;

  return (
    <div className="flex flex-col gap-2.5" data-testid="parent-nudge" data-reminder={reminder ? "1" : "0"}>
      {sentAt != null && (
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed" data-testid="parent-nudge-sent">
          שלחתם להורים {ago(Date.now() - sentAt)}.
          {reminder ? " אם הם עוד לא ראו, אפשר להזכיר." : " כשהם משלמים, הדוכן נפתח להזמנות."}
        </p>
      )}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          markParentSent(store.id);
          setSentAt(Date.now());
        }}
        className="block text-center bg-[var(--whatsapp)] text-white py-3.5 text-[15px] font-bold"
        data-testid="parent-nudge-send"
      >
        {reminder ? "להזכיר להורים בוואטסאפ" : sentAt != null ? "לשלוח שוב להורים" : "לשלוח להורים בוואטסאפ"}
      </a>
      <a href="/activate" className="text-center text-[13px] underline min-h-10 flex items-center justify-center" data-testid="first-steps-publish">
        ההורה לידי, להמשיך
      </a>
    </div>
  );
}
