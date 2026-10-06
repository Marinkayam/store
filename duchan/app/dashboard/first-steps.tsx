"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";
import Icon from "@/app/icons";
import OrderAlerts from "./order-alerts";

/**
 * המסך הראשון אחרי פתיחת דוכן — כשעוד אין אף הזמנה.
 *
 * מרינה: "הדף של ההזמנות הראשון שם נוחתים בו לא ברור בכלל, צריך להיות
 * אונבורדינג ממש ממש ברור". קודם היו כאן ארבעה כרטיסים שכל אחד אמר משהו
 * אחר (באנר שחור, "מה חסר", "הדוכן עוד לא פתוח", מסך הבית). עכשיו יש
 * מסלול אחד: חמישה צעדים לפי הסדר, מה כבר נעשה מסומן ב-✓, והצעד הבא
 * פתוח עם כפתור אחד גדול. השאר סגורים ומחכים לתורם.
 *
 * "שלחת את הלינק" נשמר במכשיר (לחיצה על שליחה/העתקה) — אין לנו דרך לדעת
 * מהשרת שהלינק נשלח, ואין צורך: זה רק סימן ✓ בשבילה.
 */

type StepKey = "open" | "product" | "publish" | "share" | "order";

export default function FirstSteps({
  store,
  link,
  shareText,
  onCopied,
}: {
  store: Store;
  link: string;
  shareText: string;
  onCopied: () => void;
}) {
  const [products, setProducts] = useState<number | null>(null);
  const [shared, setShared] = useState(false);
  const sharedKey = `duchan-shared-${store.id}`;

  useEffect(() => {
    supabaseBrowser()
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .then(({ count }) => setProducts(count ?? 0));
    try {
      setShared(!!localStorage.getItem(sharedKey));
    } catch {}
  }, [store.id, sharedKey]);

  const markShared = () => {
    setShared(true);
    try {
      localStorage.setItem(sharedKey, "1");
    } catch {}
  };

  const published = !!store.activated_at;
  const claimed = !!store.payment_claimed_at;
  const done: Record<StepKey, boolean> = {
    open: true,
    product: (products ?? 0) > 0,
    publish: published,
    share: shared,
    order: false,
  };
  const order: StepKey[] = ["open", "product", "publish", "share", "order"];
  /* הצעד הפתוח: הראשון שלא נעשה. בזמן שהתשלום בבדיקה אפשר כבר לשלוח
     את הלינק, אז הצעד הבא נפתח במקביל. */
  const current = order.find((k) => !done[k] && !(k === "publish" && claimed)) ?? "order";

  /* מרינה, 10.2026, צילום מהטלפון: "המסכים האלו עמוסים מאוד, לא ברורים".
     קודם: חמישה צעדים, כל אחד עם פסקה, ומתחת עוד רשימת "לא חובה".
     עכשיו: פס התקדמות קצר (ארבע מילים), וכרטיס אחד — מה עושים עכשיו,
     במשפט אחד, עם כפתור אחד. */
  const TRACK: { key: Exclude<StepKey, "order">; label: string }[] = [
    { key: "open", label: "דוכן" },
    { key: "product", label: "מוצר" },
    { key: "publish", label: "פרסום" },
    { key: "share", label: "חברים" },
  ];

  const card: Record<StepKey, { title: React.ReactNode; line: string; body?: React.ReactNode }> = {
    open: { title: "פתחת דוכן", line: "" },
    product: {
      title: "מוסיפים מוצר ראשון",
      line: "תמונה, שם ומחיר. לוקח דקה.",
      body: (
        <a href="/dashboard/products?new=1" className="btn btn-primary w-full" data-testid="first-steps-product">
          להוסיף מוצר ←
        </a>
      ),
    },
    publish: {
      title: <span data-testid="store-state-banner">עכשיו מפרסמים את הדוכן</span>,
      line: "ככה החברים יוכלו להזמין.",
      body: (
        <a href="/activate" className="btn btn-primary w-full" data-testid="first-steps-publish">
          לפרסם את הדוכן ←
        </a>
      ),
    },
    share: {
      title: "שולחים את הלינק לחברים",
      line: claimed && !published ? "התשלום בבדיקה. בינתיים אפשר כבר לשלוח." : "מי שמקבל את הלינק יכול להזמין.",
      body: (
        <div className="flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markShared}
            className="flex-1 bg-[var(--whatsapp)] text-white text-center py-3 text-[14px] font-bold"
            data-testid="orders-empty-whatsapp"
          >
            שליחה בוואטסאפ
          </a>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link).catch(() => {});
              markShared();
              onCopied();
            }}
            className="flex-1 border-[1.5px] border-[var(--ink)] py-3 text-[14px] font-bold"
            data-testid="orders-empty-copy"
          >
            העתקת הלינק
          </button>
        </div>
      ),
    },
    order: {
      title: "ועכשיו מחכים להזמנה הראשונה, שתופיע לכם פה!",
      line: "אגב, אפשר לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה.",
      body: <OrderAlerts storeId={store.id} cta="לחצו כאן לשמור על מסך הבית ולהפעיל התראות" />,
    },
  };
  const now = card[current];
  const waiting = claimed && !published;

  return (
    <section data-testid="orders-empty" aria-labelledby="first-steps-title" className="flex flex-col gap-4">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="ההתקדמות של הדוכן">
        {TRACK.map((t) => {
          const state = done[t.key] ? "done" : t.key === current ? "current" : t.key === "publish" && waiting ? "waiting" : "later";
          return (
            <li key={t.key} data-testid={`first-step-${t.key}`} data-state={state} className="flex flex-col gap-1.5">
              <span
                className="h-[5px]"
                aria-hidden
                style={{ background: state === "done" ? "var(--olive)" : state === "current" ? "var(--ink)" : state === "waiting" ? "var(--warn-ink)" : "var(--sand)" }}
              />
              <span className={`flex items-center gap-1 text-[12.5px] ${state === "later" ? "text-[var(--muted)]" : "text-[var(--ink)] font-medium"}`}>
                {state === "done" && <Icon name="check" size={13} tone="var(--olive)" />}
                {t.label}
                <span className="sr-only">{state === "done" ? " — נעשה" : state === "current" ? " — עכשיו" : state === "waiting" ? " — בבדיקה" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="bg-white border border-[var(--line)] p-5 flex flex-col gap-3" data-testid={current === "order" ? "first-step-order" : "first-step-card"}>
        <h2 id="first-steps-title" className="text-[20px] font-bold leading-snug">{now.title}</h2>
        {now.line && <p className="text-[14px] text-[var(--muted)] leading-relaxed -mt-1">{now.line}</p>}
        {now.body}
      </div>
    </section>
  );
}
