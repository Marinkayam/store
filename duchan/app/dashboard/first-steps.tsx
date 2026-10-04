"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";
import VSteps from "@/app/v-steps";

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

  const steps: { key: StepKey; title: string; sub: string; body?: React.ReactNode }[] = [
    { key: "open", title: "פתחת דוכן", sub: `הדוכן "${store.display_name}" נוצר ונשמר.` },
    {
      key: "product",
      title: "להוסיף מוצר ראשון",
      sub: "מצלמים, כותבים שם ומחיר. לוקח דקה.",
      body: (
        <a href="/dashboard/products?new=1" className="btn btn-primary w-full" data-testid="first-steps-product">
          להוסיף מוצר
        </a>
      ),
    },
    {
      key: "publish",
      title: claimed ? "הדוכן מחכה לאישור" : "לפרסם את הדוכן",
      sub: claimed
        ? "קיבלנו את הדיווח על התשלום. אחרי שנאשר, הדוכן ייפתח להזמנות. בינתיים אפשר כבר לשלוח את הלינק."
        : "עכשיו הדוכן בתצוגה מקדימה: רואים אותו, אבל עוד אי אפשר להזמין. פרסום פותח אותו להזמנות.",
      body: claimed ? null : (
        <a href="/activate" className="btn btn-primary w-full" data-testid="first-steps-publish">
          לפרסם את הדוכן
        </a>
      ),
    },
    {
      key: "share",
      title: "לשלוח את הלינק לחברים",
      sub: "מי שמקבל את הלינק נכנס לדוכן ויכול להזמין. על כל כניסה מקבלים גם מטבעות לקופה.",
      body: (
        <div className="flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markShared}
            className="flex-1 bg-[var(--whatsapp)] text-white text-center py-3 text-[13.5px] font-bold"
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
            className="flex-1 border-[1.5px] border-[var(--ink)] py-3 text-[13.5px] font-bold"
            data-testid="orders-empty-copy"
          >
            העתקת הלינק
          </button>
        </div>
      ),
    },
    {
      key: "order",
      title: "ההזמנה הראשונה מגיעה",
      sub: "היא מופיעה כאן וגם בוואטסאפ. כשמקבלים את הכסף מסמנים \"שולם\", וכשהמוצר אצל הקונה מסמנים \"נמסר\".",
    },
  ];

  return (
    <section data-testid="orders-empty" aria-labelledby="first-steps-title">
      <div className="pt-1 pb-3">
        <h2 id="first-steps-title" className="text-[17px] font-bold leading-tight">
          ככה הדוכן מתחיל לעבוד
        </h2>
        <p className="text-[13px] text-[var(--muted)] mt-1 leading-relaxed">
          עוד אין הזמנות, וזה בסדר. עושים את הצעדים לפי הסדר, וכל צעד שנעשה מקבל ✓.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <VSteps
          steps={steps.map((st) => {
            const isDone = done[st.key];
            const isCurrent = st.key === current;
            const waiting = st.key === "publish" && claimed && !published;
            const state = isDone ? "done" : isCurrent ? "current" : waiting ? "waiting" : "later";
            const showSub = isCurrent || waiting || (st.key === "order" && !isDone);
            return {
              key: st.key,
              testid: `first-step-${st.key}`,
              state,
              title: st.key === "publish" ? <span data-testid="store-state-banner">{st.title}</span> : st.title,
              sub: showSub ? st.sub : undefined,
              body: isCurrent && st.body ? st.body : st.key === "share" && isDone ? (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(link).catch(() => {});
                    onCopied();
                  }}
                  className="text-[12.5px] underline text-[var(--muted)]"
                >
                  להעתיק את הלינק שוב
                </button>
              ) : undefined,
            };
          })}
        />
      </div>
    </section>
  );
}
