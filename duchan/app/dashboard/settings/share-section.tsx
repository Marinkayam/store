"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SHARE_TEXTS, inviteText, type ShareContext } from "@/lib/share-texts";
import type { Store } from "@/lib/types";
import TikTokCard from "./tiktok-card";

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
          בדוכן עוד אין מוצרים. חברה שתיכנס עכשיו תראה מדף ריק — שווה להוסיף מוצר אחד קודם.
        </p>
        <a href="/dashboard/products?new=1" className="mt-1 bg-[var(--ink)] text-white px-5 py-2.5 text-[13px] font-bold">
          להוסיף מוצר ראשון
        </a>
      </div>
    );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/s/${store.slug}`;
  const refLink = `${origin}/?ref=${store.slug}`;
  const ctx: ShareContext = { name: store.display_name, link, products, topProduct };
  const current = SHARE_TEXTS.find((t) => t.key === pick) ?? SHARE_TEXTS[0];
  const text = edited[current.key] ?? current.build(ctx);

  const send = (t: string) => window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank");
  const copy = (t: string, msg: string) => {
    navigator.clipboard?.writeText(t).then(() => onToast(msg), () => onToast("לא הצלחנו להעתיק"));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="share-section">
      {/* 1. הלינק */}
      <div className="bg-white border border-[var(--line)] p-3.5">
        <div className="text-[13.5px] font-bold">🔗 הלינק לדוכן שלך</div>
        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
          שולחים אותו לחברים — הם נכנסים, רואים את המוצרים ומזמינים.
        </p>
        {!store.activated_at && (
          <p className="text-[12px] text-[var(--warn-ink)] leading-relaxed mt-1.5" data-testid="share-preview-note">
            👀 עכשיו זו תצוגה מקדימה: רואים הכל, וההזמנות נפתחות אחרי הפרסום.
          </p>
        )}
        <div className="mt-2.5 bg-[var(--canvas)] border border-[var(--line)] px-3 py-2 text-[12.5px] font-mono text-left truncate" dir="ltr" data-testid="share-link">
          {link}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={() => copy(link, "הלינק הועתק 🔗")} className="fx-press border border-[var(--line)] bg-white py-2.5 text-[12.5px] font-semibold">
            📋 העתקת הלינק
          </button>
          <button
            onClick={() => send(`בואו לראות את הדוכן שלי! ${link}`)}
            className="fx-press bg-[var(--whatsapp)] text-white py-2.5 text-[12.5px] font-bold"
          >
            💬 שליחה בוואטסאפ
          </button>
        </div>
      </div>

      {/* 🎵 טיקטוק — רוב הקהל שם */}
      <TikTokCard store={store} onToast={onToast} />

      {/* 2. הודעה מוכנה — שורה אחת של בחירות במקום שש קופסאות מתקפלות */}
      <div className="bg-white border border-[var(--line)] p-3.5">
        <div className="text-[13.5px] font-bold">✍️ הודעה מוכנה</div>
        <p className="text-[12px] text-[var(--muted)] mt-0.5">בוחרים למי, משנים אם רוצים, ושולחים.</p>
        <div className="flex flex-wrap gap-1.5 mt-2.5" role="radiogroup" aria-label="איזו הודעה">
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
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-[var(--faint)] mt-2">{current.when}</p>
        <textarea
          value={text}
          onChange={(e) => setEdited({ ...edited, [current.key]: e.target.value })}
          aria-label="ההודעה"
          rows={Math.max(4, text.split("\n").length + 1)}
          className="w-full mt-1 border border-[var(--line)] p-3 text-[13px] leading-relaxed bg-[var(--canvas)]"
        />
        <div className="flex gap-2 mt-2">
          <button data-testid="share-send" onClick={() => send(text)} className="fx-press flex-1 bg-[var(--whatsapp)] text-white py-2.5 text-[12.5px] font-bold">
            💬 שליחה בוואטסאפ
          </button>
          <button onClick={() => copy(text, "ההודעה הועתקה")} className="fx-press flex-1 border border-[var(--line)] py-2.5 text-[12.5px] font-medium">
            העתקה
          </button>
          {edited[current.key] !== undefined && (
            <button
              onClick={() => {
                const next = { ...edited };
                delete next[current.key];
                setEdited(next);
              }}
              className="border border-[var(--line)] px-3 text-[12.5px] text-[var(--muted)]"
            >
              איפוס
            </button>
          )}
        </div>
      </div>

      {/* 3. להזמין חברה לפתוח דוכן — הלולאה שמגדלת את הרשת */}
      <div className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3.5">
        <div className="text-[13.5px] font-bold">🎁 להזמין חברים לפתוח דוכן</div>
        <p className="text-[12px] text-[var(--warn-ink)] leading-relaxed mt-0.5">
          כשחברים פותחים דוכנים, כולם מוכרים יותר — כי כולם גם קונים.
          {store.ref_clicks > 0 && ` כבר ${store.ref_clicks} לחצו על זה מהדוכן שלך.`}
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <button onClick={() => send(inviteText(ctx, refLink))} className="fx-press bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold">
            שליחת הזמנה
          </button>
          <button onClick={() => copy(refLink, "לינק ההזמנה הועתק")} className="fx-press bg-white border border-[var(--warn-line)] py-2.5 text-[12.5px] font-medium">
            העתקת לינק ההזמנה
          </button>
        </div>
      </div>
    </div>
  );
}
