"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { SHARE_TEXTS, inviteText, type ShareContext } from "@/lib/share-texts";

// "להפיץ" — המסך שהופך חנות לחנות שיש בה אנשים.
// הילדה לא צריכה להמציא ניסוח: היא בוחרת הודעה, עורכת אם בא לה, ושולחת.

export default function SharePage() {
  const { store, loading } = useStore();
  const [products, setProducts] = useState(0);
  // null עד שהספירה חוזרת — בלי זה מסך "קודם מוצר אחד" מהבהב לרגע לכל אחת
  const [counted, setCounted] = useState(false);
  const [topProduct, setTopProduct] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string>("launch");
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!store) return;
    const supa = supabaseBrowser();
    supa
      .from("products")
      .select("name")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setProducts(data?.length ?? 0);
        setTopProduct(data?.[0]?.name ?? null);
        setCounted(true);
      });
  }, [store]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  if (loading || !counted) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  /**
   * שיתוף נפתח רק אחרי מוצר אחד.
   *
   * דוכן ריק ששולחים לחברות הוא הכישלון הכי יקר כאן: החברה נכנסת, רואה
   * "עוד אין כאן מוצרים", ולא חוזרת. הסדר הוא לא גחמה — קודם יש מה למכור,
   * ורק אז מזמינים אנשים לראות.
   */
  if (products === 0)
    return (
      <div>
        <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
          <h1 className="text-lg font-bold">להפיץ</h1>
        </header>
        <div className="px-6 py-16 text-center flex flex-col items-center gap-3">
          <div className="text-5xl">📦</div>
          <h2 className="text-[15px] font-bold">רגע לפני ששולחים</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed max-w-xs">
            בדוכן שלך עוד אין מוצרים.
            <br />
            חברה שתיכנס עכשיו תראה מדף ריק, שווה להוסיף מוצר אחד קודם.
          </p>
          <a
            href="/dashboard/products?new=1"
            className="mt-2 bg-[var(--ink)] text-white px-6 py-3 text-[13.5px] font-bold"
          >
            נוסיף את המוצר הראשון
          </a>
        </div>
      </div>
    );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/s/${store.slug}`;
  const refLink = `${origin}/?ref=${store.slug}`;
  const ctx: ShareContext = { name: store.display_name, link, products, topProduct };

  const textFor = (key: string) => {
    if (edited[key] !== undefined) return edited[key];
    const t = SHARE_TEXTS.find((s) => s.key === key);
    return t ? t.build(ctx) : "";
  };

  const send = (text: string) =>
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("הועתק, אפשר להדביק בכל מקום");
  };

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
        <h1 className="text-lg font-bold">להפיץ</h1>
        <p className="text-xs text-[var(--muted)] font-light">
          הודעות מוכנות. בוחרים, משנים אם בא לך, ושולחים.
        </p>
      </header>

      {!store.activated_at && (
        <a href="/activate" className="block mx-3 mt-3 bg-[var(--ink)] text-white p-3.5">
          <div className="text-[13.5px] font-bold">הלינק עובד, בתצוגה מקדימה</div>
          <div className="text-[12.5px] opacity-70 leading-relaxed">
            חברות כבר יכולות להיכנס ולראות הכל. כדי שיוכלו גם להזמין, לפרסום הדוכן →
          </div>
        </a>
      )}

      <div className="p-3 flex flex-col gap-2">
        {SHARE_TEXTS.map((t) => {
          const open = openKey === t.key;
          const text = textFor(t.key);
          return (
            <div key={t.key} className="bg-white border border-[var(--line)] overflow-hidden">
              <button
                onClick={() => setOpenKey(open ? "" : t.key)}
                className="w-full flex items-center gap-3 p-3 text-right"
              >
                <span className="text-xl">{t.icon}</span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold">{t.label}</div>
                  <div className="text-[12px] text-[var(--muted)]">{t.when}</div>
                </div>
                <span className="text-[var(--faint)] text-xs">{open ? "▲" : "▼"}</span>
              </button>

              {open && (
                <div className="px-3 pb-3">
                  <textarea
                    value={text}
                    onChange={(e) => setEdited({ ...edited, [t.key]: e.target.value })}
                    rows={Math.max(4, text.split("\n").length + 1)}
                    className="w-full border border-[var(--line)] p-3 text-[13px] leading-relaxed bg-[var(--canvas)]"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => send(text)}
                      className="flex-1 bg-[var(--whatsapp)] text-white py-2.5 text-[12.5px] font-bold"
                    >
                      שליחה בוואטסאפ
                    </button>
                    <button
                      onClick={() => copy(text)}
                      className="flex-1 border border-[var(--line)] py-2.5 text-[12.5px] font-medium"
                    >
                      העתקה
                    </button>
                    {edited[t.key] !== undefined && (
                      <button
                        onClick={() => {
                          const next = { ...edited };
                          delete next[t.key];
                          setEdited(next);
                        }}
                        className="border border-[var(--line)] px-3 text-[12.5px] text-[var(--muted)]"
                      >
                        איפוס
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* הזמנת חברות לפתוח חנות — הלולאה שמייצרת את הרשת */}
        <div className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3.5 mt-2">
          <div className="text-[13.5px] font-bold">להזמין חברה לפתוח חנות</div>
          <p className="text-[12px] text-[var(--warn-ink)] leading-relaxed mt-1">
            כשחברות פותחות חנויות, כולן מוכרות יותר, כי כולן גם קונות.
            {store.ref_clicks > 0 && (
              <>
                <br />
                כבר {store.ref_clicks} לחצו על זה מהחנות שלך.
              </>
            )}
          </p>
          <div className="flex gap-1.5 mt-2.5">
            <button
              onClick={() => send(inviteText(ctx, refLink))}
              className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold"
            >
              שליחת הזמנה
            </button>
            <button
              onClick={() => copy(refLink)}
              className="flex-1 bg-white border border-[var(--warn-line)] py-2.5 text-[12.5px] font-medium"
            >
              העתקת הלינק
            </button>
          </div>
        </div>

        <div className="text-center text-[12.5px] text-[var(--muted)] leading-relaxed px-4 py-4">
          טיפ: הודעה אחת לקבוצה עובדת פחות טוב מחמש הודעות אישיות.
          <br />
          אנשים עונים למי שפונה אליהם בשם.
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
