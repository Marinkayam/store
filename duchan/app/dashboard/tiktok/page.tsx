"use client";

import { useEffect, useState } from "react";
import { useStore } from "../use-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shortStoreLink, storePath } from "@/lib/short-link";
import { productPath } from "@/lib/product-link";
import { formatPrice } from "@/lib/money";
import TikTokCard from "../settings/tiktok-card";
import { coverSlide, fontsReady, mediaSrc, productSlide, type SlideProduct } from "./slides";

/**
 * לטיקטוק ולאינסטגרם.
 *
 * מרינה, 11.2026: "להרבה ילדים יש טיקטוק ואינסטגרם וצריך למצוא איזשהי דרך
 * לממשק בין דוכן לטיקטוק". בנתונים (30 יום): טיקטוק הוא המקור השני של
 * מבקרים, ומי שמגיע משם מוסיף לסל יותר ממי שמגיע מוואטסאפ.
 *
 * מה יש כאן:
 *   1. תמונות מוכנות: פתיחה עם שם הדוכן, ותמונה לכל מוצר עם מחיר והלינק של
 *      המוצר (duchan.app/abcde/12). בטיקטוק מעלים אותן כמצגת תמונות, בלי
 *      לצלם פנים. אותן תמונות מתאימות לסטורי באינסטגרם, עם סטיקר קישור.
 *   2. הלינק הקצר, ורעיונות לסרטון (TikTokCard).
 *   3. לינק לכל מוצר, להעתקה.
 *
 * אין כאן חיבור לחשבון טיקטוק ואין העלאה אוטומטית: זה דורש כניסה של ילדים
 * לטיקטוק דרכנו, וזה לא מתאים לילדים. מגיל 13 בלבד, וכתוב.
 */

type Row = { id: string; name: string; price: number; image_key: string | null; deleted_at: string | null; is_visible: boolean | null };
type Slide = { key: string; label: string; url: string; file: File };

const MAX = 10;

export default function TikTokPage() {
  const { store, loading } = useStore();
  const [products, setProducts] = useState<SlideProduct[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [toast, setToast] = useState("");
  const [host, setHost] = useState("duchan.app");

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    setHost(window.location.host);
    if (!store) return;
    // כל המוצרים, כולל שנמחקו, לפי סדר ההוספה: זה מה שקובע את מספר המוצר בלינק
    supabaseBrowser()
      .from("products")
      .select("id, name, price, image_key, deleted_at, is_visible")
      .eq("store_id", store.id)
      .order("created_at")
      .order("id")
      .then(({ data }) => {
        const all = (data as Row[]) ?? [];
        const list = all
          .map((p, i) => ({ ...p, no: i + 1 }))
          .filter((p) => !p.deleted_at && p.is_visible !== false && p.image_key)
          .map((p) => ({ id: p.id, no: p.no, name: p.name, price: p.price, image_key: p.image_key! }));
        setProducts(list);
        setPicked(new Set(list.slice(0, 6).map((p) => p.id)));
      });
  }, [store]);

  useEffect(() => () => slides.forEach((s) => URL.revokeObjectURL(s.url)), [slides]);

  if (loading || !store) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;

  const storeLink = shortStoreLink(host, store.slug);
  const linkOf = (p: SlideProduct) => `${host}${productPath(store.slug, p.no)}`;
  const chosen = (products ?? []).filter((p) => picked.has(p.id));

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX) n.add(id);
      return n;
    });
  }

  async function make() {
    if (!store) return;
    setBusy(true);
    slides.forEach((s) => URL.revokeObjectURL(s.url));
    setSlides([]);
    try {
      await fontsReady();
      const out: Slide[] = [];
      const add = (key: string, label: string, b: Blob | null) => {
        if (b) out.push({ key, label, url: URL.createObjectURL(b), file: new File([b], `duchan-${out.length + 1}.png`, { type: "image/png" }) });
      };
      add("cover", "פתיחה", await coverSlide(store.display_name, store.tagline ?? null, chosen, storeLink));
      for (const p of chosen) add(p.id, p.name, await productSlide(p, linkOf(p)));
      setSlides(out);
      const files = out.map((s) => s.file);
      // בטלפון: מסך השיתוף עם כל התמונות, ומשם טיקטוק או אינסטגרם
      if (navigator.canShare?.({ files })) {
        try {
          await navigator.share({ files });
        } catch {}
      }
    } catch {
      showToast("לא הצלחנו להכין את התמונות. אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  function saveAll() {
    slides.forEach((s, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = s.url;
        a.download = s.file.name;
        a.click();
      }, i * 350)
    );
  }

  const copy = (t: string, m: string) => navigator.clipboard?.writeText(t).then(() => showToast(m), () => showToast("לא הצלחנו להעתיק"));

  return (
    <div data-testid="tiktok-page">
      <header className="bg-[var(--canvas)] px-gutter pt-2 pb-4 border-b border-[var(--line)]">
        <a href="/dashboard" className="inline-flex items-center gap-1 min-h-11 text-[13px] text-[var(--muted)]">
          <span aria-hidden>→</span> להזמנות
        </a>
        <h1 className="text-[20px] font-bold">לטיקטוק ולאינסטגרם</h1>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-0.5" data-testid="tiktok-age">
          טיקטוק ואינסטגרם מגיל 13. מתחת לגיל הזה, ההורים יכולים להעלות מהחשבון שלהם.
        </p>
      </header>

      <div className="px-gutter pt-5 pb-10 flex flex-col gap-6">
        {/* ── 1. תמונות ── */}
        <section className="bg-white border border-[var(--line)] p-4 flex flex-col gap-3" aria-labelledby="slides-title">
          <h2 id="slides-title" className="text-[16px] font-bold">תמונות מוכנות להעלאה</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed -mt-1.5">
            תמונה עם שם הדוכן, ותמונה לכל מוצר עם המחיר והלינק שלו. בלי לצלם את עצמכם.
          </p>

          {products === null ? (
            <p className="text-[13px] text-[var(--muted)]">רגע…</p>
          ) : products.length === 0 ? (
            <p className="text-[13px]" data-testid="slides-empty">
              צריך מוצר עם תמונה. <a href="/dashboard/products?new=1" className="underline">להוסיף מוצר</a>
            </p>
          ) : (
            <>
              <p className="text-[12.5px] font-medium">
                אילו מוצרים? <span className="text-[var(--muted)] font-normal">({chosen.length} מתוך עד {MAX})</span>
              </p>
              <ul className="grid grid-cols-4 gap-1.5" data-testid="slides-pick">
                {products.map((p) => {
                  const on = picked.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => toggle(p.id)}
                        aria-pressed={on}
                        aria-label={p.name}
                        className={`relative block w-full aspect-square border-2 ${on ? "border-[var(--ink)]" : "border-transparent opacity-50"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaSrc(p.image_key)} alt="" className="w-full h-full object-cover" />
                        {on && <span className="absolute top-0.5 right-0.5 bg-[var(--ink)] text-white text-[10px] font-bold px-1">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                onClick={make}
                disabled={busy || chosen.length === 0}
                className="bg-[var(--ink)] text-white min-h-12 text-[14px] font-bold disabled:opacity-40"
                data-testid="slides-make"
              >
                {busy ? "מכינים…" : `להכין ${chosen.length + 1} תמונות`}
              </button>
            </>
          )}

          {slides.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="slides-ready">
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {slides.map((s) => (
                  <li key={s.key} className="shrink-0 w-24">
                    <a href={s.url} download={s.file.name} aria-label={`לשמור: ${s.label}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={s.label} className="w-24 border border-[var(--line)]" data-testid="slide" />
                    </a>
                  </li>
                ))}
              </ul>
              <button onClick={saveAll} className="border-[1.5px] border-[var(--ink)] min-h-11 text-[13.5px] font-bold" data-testid="slides-save-all">
                לשמור את כל התמונות
              </button>
              <ol className="text-[12.5px] leading-relaxed list-decimal pr-4 flex flex-col gap-1" data-testid="slides-how">
                <li><b>טיקטוק:</b> לוחצים על +, «העלאה», בוחרים את כל התמונות, ומעלים כמצגת תמונות.</li>
                <li><b>אינסטגרם:</b> מעלים תמונה לסטורי ומוסיפים סטיקר «קישור» עם הלינק של הדוכן (שם הוא לחיץ!).</li>
                <li>על כל תמונה כבר כתוב הלינק, אז אפשר להקליד אותו גם בלי ללחוץ.</li>
              </ol>
            </div>
          )}
        </section>

        {/* ── 2. לינק לכל מוצר ── */}
        {products && products.length > 0 && (
          <section className="bg-white border border-[var(--line)] p-4" aria-labelledby="links-title" data-testid="product-links">
            <h2 id="links-title" className="text-[16px] font-bold">לינק לכל מוצר</h2>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">
              סרטון על מוצר אחד? כותבים את הלינק שלו, והקונים מגיעים ישר אליו.
            </p>
            <ul className="mt-2.5">
              {products.slice(0, 30).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 border-t border-[var(--sand)] first:border-t-0">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium truncate">{p.name}</span>
                    <span className="block text-[12px] text-[var(--muted)]" dir="ltr" style={{ textAlign: "right" }} data-testid="product-link">
                      {linkOf(p)}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-[var(--muted)] shrink-0">₪{formatPrice(p.price)}</span>
                  <button
                    onClick={() => copy(linkOf(p), "הלינק של המוצר הועתק")}
                    className="shrink-0 border border-[var(--line)] px-3 min-h-10 text-[12.5px] font-medium"
                  >
                    העתקה
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 3. הלינק ורעיונות לסרטון ── */}
        <div id="video">
          <TikTokCard store={store} onToast={showToast} />
        </div>

        <button onClick={() => copy(`${window.location.origin}${storePath(store.slug)}`, "הלינק הועתק. בסטיקר הקישור באינסטגרם מדביקים אותו")} className="text-[13px] underline min-h-11">
          להעתיק את הלינק המלא לסטיקר באינסטגרם
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">{toast}</div>
      )}
    </div>
  );
}
