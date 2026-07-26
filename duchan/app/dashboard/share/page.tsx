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
      });
  }, [store]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  if (loading) return <div className="p-6 text-sm text-[#7A7D8A]">רגע…</div>;
  if (!store) return null;

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
    showToast("הועתק — אפשר להדביק בכל מקום");
  };

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[#E6E7EC]">
        <h1 className="text-lg font-bold">להפיץ</h1>
        <p className="text-xs text-[#7A7D8A] font-light">
          הודעות מוכנות. בוחרים, משנים אם בא לך, ושולחים.
        </p>
      </header>

      {!store.activated_at && (
        <a href="/activate" className="block mx-3 mt-3 bg-[#15161B] text-white rounded-xl p-3.5">
          <div className="text-[13.5px] font-bold">הלינק עוד לא פעיל</div>
          <div className="text-[11.5px] opacity-70 leading-relaxed">
            אפשר להכין את ההודעות כבר עכשיו. לפרסום החנות →
          </div>
        </a>
      )}

      <div className="p-3 flex flex-col gap-2">
        {SHARE_TEXTS.map((t) => {
          const open = openKey === t.key;
          const text = textFor(t.key);
          return (
            <div key={t.key} className="bg-white border border-[#E6E7EC] rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenKey(open ? "" : t.key)}
                className="w-full flex items-center gap-3 p-3 text-right"
              >
                <span className="text-xl">{t.icon}</span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold">{t.label}</div>
                  <div className="text-[11px] text-[#7A7D8A]">{t.when}</div>
                </div>
                <span className="text-[#A2A5B0] text-xs">{open ? "▲" : "▼"}</span>
              </button>

              {open && (
                <div className="px-3 pb-3">
                  <textarea
                    value={text}
                    onChange={(e) => setEdited({ ...edited, [t.key]: e.target.value })}
                    rows={Math.max(4, text.split("\n").length + 1)}
                    className="w-full border border-[#E6E7EC] rounded-xl p-3 text-[13px] leading-relaxed bg-[#FAFBFC]"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => send(text)}
                      className="flex-1 bg-[#25D366] text-white rounded-lg py-2.5 text-[12.5px] font-bold"
                    >
                      שליחה בוואטסאפ
                    </button>
                    <button
                      onClick={() => copy(text)}
                      className="flex-1 border border-[#E6E7EC] rounded-lg py-2.5 text-[12.5px] font-medium"
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
                        className="border border-[#E6E7EC] rounded-lg px-3 text-[12.5px] text-[#7A7D8A]"
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
        <div className="bg-[#FFF9EE] border border-[#F5E3C2] rounded-xl p-3.5 mt-2">
          <div className="text-[13.5px] font-bold">להזמין חברה לפתוח חנות</div>
          <p className="text-[12px] text-[#A85B00] leading-relaxed mt-1">
            כשחברות פותחות חנויות, כולן מוכרות יותר — כי כולן גם קונות.
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
              className="flex-1 bg-[#15161B] text-white rounded-lg py-2.5 text-[12.5px] font-bold"
            >
              שליחת הזמנה
            </button>
            <button
              onClick={() => copy(refLink)}
              className="flex-1 bg-white border border-[#F5E3C2] rounded-lg py-2.5 text-[12.5px] font-medium"
            >
              העתקת הלינק
            </button>
          </div>
        </div>

        <div className="text-center text-[11.5px] text-[#7A7D8A] leading-relaxed px-4 py-4">
          טיפ: הודעה אחת לקבוצה עובדת פחות טוב מחמש הודעות אישיות.
          <br />
          אנשים עונים למי שפונה אליהם בשם.
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[#1B1C22] text-white px-4 py-2.5 rounded-3xl text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
