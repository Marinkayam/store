"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SHARE_TEXTS, inviteText, type ShareContext } from "@/lib/share-texts";
import type { Store } from "@/lib/types";
import TikTokCard from "./tiktok-card";
import { storePath } from "@/lib/short-link";
import GiftBagsArt from "@/app/gift-bags-art";

/**
 * "לשתף את הדוכן" — מקטע ב"החנות שלי". בא במקום הלשונית "להפיץ".
 *
 * מרינה: "להפיץ מבלבל ומיותר — אפשר לצמצם ולשים בתוך העריכה". אז שלושה
 * דברים בלבד, מהחשוב לפחות חשוב:
 *   1. הלינק לדוכן — מה הוא, העתקה ושליחה בוואטסאפ.
 *   2. הודעה מוכנה — בוחרים אחת מהשורה, משנים אם רוצים, שולחים.
 *   3. להזמין חברה לפתוח דוכן.
 *
 * שיתוף נפתח רק אחרי מוצר אחד: דוכן ריק ששולחים לחברות הוא הכישלון הכי
 * יקר כאן — החברה רואה מדף ריק ולא חוזרת.
 */
export default function ShareSection({ store, onToast }: { store: Store; onToast: (m: string) => void }) {
  const [products, setProducts] = useState<number | null>(null);
  const [topProduct, setTopProduct] = useState<string | null>(null);
  const [pick, setPick] = useState("launch");
  const [edited, setEdited] = useState<Record<string, string>>({});

  useEffect(() => {
    supabaseBrowser()
      .from("products")
      .select("name")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setProducts(data?.length ?? 0);
        setTopProduct(data?.[0]?.name ?? null);
      });
  }, [store.id]);

  if (products === null) return <p className="text-[12.5px] text-[var(--muted)] px-1">רגע…</p>;

  if (products === 0)
    return (
      <div className="bg-white border border-[var(--line)] p-5 text-center flex flex-col items-center gap-2" data-testid="share-empty">
        <div className="text-4xl" aria-hidden>📦</div>
        <div className="text-[14px] font-bold">רגע לפני ששולחים</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed max-w-xs">
          בדוכן עוד אין מוצרים. חברים שייכנסו עכשיו יראו מדף ריק — שווה להוסיף מוצר אחד קודם.
        </p>
        <a href="/dashboard/products?new=1" className="mt-1 bg-[var(--ink)] text-white px-5 py-2.5 text-[13px] font-bold">
          להוסיף מוצר ראשון
        </a>
      </div>
    );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // הלינק הקצר (duchan.app/qkubk) — אותו לינק בכל מקום בשיתוף, גם בטיקטוק
  const link = `${origin}${storePath(store.slug)}`;
  const refLink = `${origin}/?ref=${store.slug}`;
  const ctx: ShareContext = { name: store.display_name, link, products, topProduct };
  const current = SHARE_TEXTS.find((t) => t.key === pick) ?? SHARE_TEXTS[0];
  const text = edited[current.key] ?? current.build(ctx);

  const send = (t: string) => window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank");
  const copy = (t: string, msg: string) => {
    navigator.clipboard?.writeText(t).then(() => onToast(msg), () => onToast("לא הצלחנו להעתיק"));
  };

  const launch = (SHARE_TEXTS.find((t) => t.key === "launch") ?? SHARE_TEXTS[0]).build(ctx);

  /* מרינה: "ממש עמוס ומלא דברים לא רלוונטיים — מינימליסטי וברור".
     במסך: איור, משפט אחד, הלינק, ושני כפתורים. כל השאר (הודעות אחרות,
     טיקטוק, להזמין חברים לפתוח דוכן) מקופל תחת "עוד דרכים לשתף". */
  return (
    <div className="flex flex-col gap-4" data-testid="share-section">
      <div className="flex flex-col items-center text-center gap-2 pt-1">
        <GiftBagsArt className="w-full max-w-[300px] block" />
        <h3 className="text-[20px] font-black leading-tight">שולחים לחברים, והם מזמינים</h3>
        <p className="text-[13px] text-[var(--muted)] leading-relaxed max-w-[19rem]">
          {store.activated_at
            ? "כל מי שמקבל את הלינק נכנס לדוכן ויכול להזמין."
            : "אפשר כבר לשלוח ולהראות. הזמנות נפתחות אחרי שמפרסמים את הדוכן."}
        </p>
      </div>

      {/* הלינק — שורה אחת, נלחצת להעתקה */}
      <button
        onClick={() => copy(link, "הלינק הועתק 🔗")}
        className="flex items-center gap-2 border-b-[1.5px] border-[var(--ink)] pb-2 text-right"
        aria-label="העתקת הלינק לדוכן"
      >
        <span className="flex-1 min-w-0 text-[15px] font-bold truncate text-left" dir="ltr" data-testid="share-link">
          {link.replace(/^https?:\/\//, "")}
        </span>
        <span className="shrink-0 text-[12.5px] font-bold text-[var(--muted)]">העתקה</span>
      </button>

      <button
        data-testid="share-send"
        onClick={() => send(launch)}
        className="fx-press w-full bg-[var(--whatsapp)] text-white py-3.5 text-[15px] font-bold"
      >
        שליחה בוואטסאפ
      </button>

      {/* כל השאר — למי שרוצה */}
      <details className="border-t border-[var(--line)] group" data-testid="share-more">
        <summary className="min-h-12 flex items-center justify-between cursor-pointer text-[14px] font-bold list-none">
          עוד דרכים לשתף
          <span className="text-[var(--muted)] transition-transform group-open:rotate-180" aria-hidden>⌄</span>
        </summary>
        <div className="flex flex-col gap-5 pb-2">
          {/* הודעה אחרת */}
          <section>
            <div className="text-[13.5px] font-bold">הודעה מוכנה אחרת</div>
            <div className="flex flex-wrap gap-1.5 mt-2" role="radiogroup" aria-label="בחירת הודעה">
              {SHARE_TEXTS.map((t) => (
                <button
                  key={t.key}
                  role="radio"
                  aria-checked={pick === t.key}
                  onClick={() => setPick(t.key)}
                  className={`px-2.5 py-1.5 text-[12.5px] border ${
                    pick === t.key ? "border-[var(--ink)] bg-[var(--ink)] text-white font-bold" : "border-[var(--line)] bg-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setEdited({ ...edited, [current.key]: e.target.value })}
              aria-label="ההודעה"
              rows={Math.max(4, text.split("\n").length + 1)}
              className="w-full mt-2 border border-[var(--line)] p-3 text-[13px] leading-relaxed bg-white"
            />
            <div className="flex gap-2 mt-2">
              <button data-testid="share-send-picked" onClick={() => send(text)} className="fx-press flex-1 bg-[var(--whatsapp)] text-white py-2.5 text-[12.5px] font-bold">
                שליחה בוואטסאפ
              </button>
              <button onClick={() => copy(text, "ההודעה הועתקה")} className="fx-press flex-1 border border-[var(--line)] py-2.5 text-[12.5px] font-medium">
                העתקה
              </button>
            </div>
          </section>

          <TikTokCard store={store} onToast={onToast} />

          {/* להזמין חברים לפתוח דוכן */}
          <section>
            <div className="text-[13.5px] font-bold">להזמין חברים לפתוח דוכן</div>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5">
              כשחברים פותחים דוכנים, כולם מוכרים יותר, כי כולם גם קונים.
              {store.ref_clicks > 0 && ` כבר ${store.ref_clicks} נכנסו דרך לינק ההזמנה שלך.`}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => send(inviteText(ctx, refLink))} className="fx-press bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold">
                שליחת הזמנה
              </button>
              <button onClick={() => copy(refLink, "לינק ההזמנה הועתק")} className="fx-press border border-[var(--line)] py-2.5 text-[12.5px] font-medium">
                העתקת לינק ההזמנה
              </button>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
