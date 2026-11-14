"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl, squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { themeCssVars, themeOrDefault } from "@/lib/themes";
import { lookCssVars, storeBackground } from "@/lib/looks";
import CategoryBar from "@/app/category-bar";
import { useCategoryImages } from "@/app/use-category-images";
import {
  CATEGORY_ARRANGES,
  CATEGORY_EMOJIS,
  CATEGORY_IMAGE_HINT,
  CATEGORY_IMAGE_PX,
  CATEGORY_LAYOUTS,
  CATEGORY_PRESETS,
  CATEGORY_SIZES,
  arrangeOrDefault,
  cleanMeta,
  layoutOrDefault,
  packLayout,
  sizeOrDefault,
  type CategoryArrange,
  type CategoryLayout,
  type CategoryMeta,
  type CategorySize,
} from "@/lib/category-style";
import type { Store } from "@/lib/types";

/**
 * עיצוב הקטגוריות — גיליון מלא מעל דף המוצרים.
 *
 * למעלה, צמוד: שורת הקטגוריות האמיתית של הדוכן, בצבעים, בסגנון וברקע
 * שלו — אותו רכיב שהקונות רואות. כל בחירה למטה משנה אותה מיד.
 * שום דבר לא נשמר עד "שמירה", חוץ מהעלאת התמונה עצמה ל-R2.
 */
export default function CategoryDesigner({
  store,
  onSaved,
  onClose,
}: {
  store: Store;
  onSaved: (patch: Partial<Store>) => void;
  onClose: () => void;
}) {
  const categories = store.categories ?? [];
  const [layout, setLayout] = useState<CategoryLayout>(layoutOrDefault(store.category_layout));
  const [arrange, setArrange] = useState<CategoryArrange>(arrangeOrDefault(store.category_layout));
  const [size, setSize] = useState<CategorySize>(sizeOrDefault(store.category_size));
  const [meta, setMeta] = useState<CategoryMeta>(cleanMeta(store.category_meta));
  const [active, setActive] = useState<string | null>(null);
  const [emojiFor, setEmojiFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  /* תמונה שרק הועלתה — מוצגת מה-blob המקומי, בלי לחכות ל-CDN */
  const [local, setLocal] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const theme = themeOrDefault(store.theme);
  const imageUrl = (key: string | null | undefined) => (key ? local[key] ?? mediaUrl(key) : null);
  const icons = layout !== "text";
  const productImages = useCategoryImages(store.id);

  function change<T>(set: (v: T) => void, v: T) {
    set(v);
    setDirty(true);
    setError("");
  }

  function setItem(name: string, item: { emoji?: string; image?: string } | null) {
    setMeta((m) => {
      const next = { ...m };
      if (!item || (!item.emoji && !item.image)) delete next[name];
      else next[name] = item;
      return next;
    });
    setDirty(true);
    setError("");
  }

  async function onFile(file: File) {
    const name = uploadTarget.current;
    if (!name) return;
    setUploading(name);
    setError("");
    try {
      const blob = await squareImage(file, CATEGORY_IMAGE_PX);
      const r = await uploadBlob("category", blob, store.id);
      if ("error" in r) {
        setError(`${r.error}. שום דבר אחר לא השתנה.`);
        return;
      }
      setLocal((l) => ({ ...l, [r.key]: URL.createObjectURL(blob) }));
      // תמונה גוברת על אמוג'י, אבל האמוג'י נשמר — הסרת התמונה מחזירה אותו
      setItem(name, { ...meta[name], image: r.key });
    } catch (e) {
      setError(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה. אפשר לנסות תמונה אחרת.");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    // רק קטגוריות שעדיין קיימות — שם שנמחק לא ממשיך לשבת במטא
    const kept: CategoryMeta = {};
    for (const c of categories) if (meta[c]) kept[c] = meta[c];
    const patch = {
      category_layout: packLayout(layout, arrange),
      category_size: size === "md" ? null : size,
      category_meta: Object.keys(kept).length ? kept : null,
    };
    const { error: err } = await supabaseBrowser().from("stores").update(patch).eq("id", store.id);
    setSaving(false);
    if (err) {
      console.error("[categories] design save failed:", err.message);
      setError(
        /column/.test(err.message)
          ? "עיצוב הקטגוריות עוד לא זמין בדאטהבייס. הבחירות נשארו במסך, אפשר לנסות שוב מאוחר יותר."
          : "השמירה לא הצליחה. הבחירות נשארו במסך, אפשר ללחוץ שוב."
      );
      return;
    }
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug }),
    }).catch(() => {});
    onSaved(patch as Partial<Store>);
  }

  function close() {
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?")) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--canvas)] flex flex-col" role="dialog" aria-label="עיצוב הקטגוריות" data-testid="category-designer">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="category-image-input"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }}
      />

      {/* כותרת */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[var(--line)]">
        <button onClick={close} className="text-[13px] text-[var(--muted)] min-h-11 px-1">ביטול</button>
        <div className="text-[14px] font-bold">🎨 עיצוב הקטגוריות</div>
        <span className="w-12" aria-hidden />
      </div>

      {/* התצוגה החיה — צמודה, בצבעים ובסגנון של הדוכן */}
      <div
        data-testid="category-preview"
        className="s-look shrink-0 border-b border-[var(--line)] pt-4 max-h-[44vh] overflow-y-auto"
        style={{
          ...(themeCssVars(theme) as Record<string, string>),
          ...lookCssVars(theme, store.look),
          background: storeBackground(theme, store.bg_pattern, mediaUrl(store.bg_key ?? null)),
          color: "var(--s-ink)",
          fontFamily: "var(--s-font)",
        }}
      >
        <div className="px-4 pb-2 text-[11.5px] font-semibold opacity-70">ככה זה ייראה בדוכן:</div>
        <CategoryBar
          categories={categories}
          active={active}
          onSelect={setActive}
          layout={layout}
          arrange={arrange}
          fallbackImages={productImages}
          size={size}
          meta={meta}
          imageUrl={imageUrl}
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-5 flex flex-col gap-8 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        {/* תצוגה מוכנה — הדרך הקצרה. השלבים שמתחת הם למי שרוצה לדייק. */}
        <section>
          <div className="text-[14px] font-bold mb-1">תצוגה מוכנה</div>
          <p className="text-[11.5px] text-[var(--muted)] leading-snug mb-3">בלחיצה אחת. אפשר לדייק אחר כך בשלבים שלמטה.</p>
          <div className="grid grid-cols-2 gap-3" data-testid="category-presets">
            {CATEGORY_PRESETS.map((p) => {
              const on = layout === p.layout && size === p.size && arrange === p.arrange;
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    setLayout(p.layout);
                    setSize(p.size);
                    change(setArrange, p.arrange);
                    setActive(null);
                  }}
                  aria-pressed={on}
                  aria-label={`תצוגה מוכנה: ${p.label}`}
                  className={`bg-white border-2 p-3.5 text-right min-h-11 flex flex-col gap-1 ${on ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                >
                  <ArrangeSketch arrange={p.arrange} />
                  <div className="text-[13px] font-bold mt-2.5">
                    {on && "✓ "}
                    {p.label}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] leading-snug">{p.hint}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 1. צורה */}
        <section>
          <div className="text-[14px] font-bold mb-3">1. צורה</div>
          <div className="grid grid-cols-2 gap-3" data-testid="category-layouts">
            {CATEGORY_LAYOUTS.map((l) => (
              <button
                key={l.key}
                onClick={() => change(setLayout, l.key)}
                aria-pressed={layout === l.key}
                aria-label={`צורה: ${l.label}`}
                className={`bg-white border-2 p-3.5 text-right min-h-11 flex flex-col gap-1 ${layout === l.key ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
              >
                <Sketch layout={l.key} />
                <div className="text-[13px] font-bold mt-2.5">
                  {layout === l.key && "✓ "}
                  {l.label}
                </div>
                <div className="text-[11px] text-[var(--muted)] leading-snug">{l.hint}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 2. גודל */}
        <section>
          <div className="text-[14px] font-bold mb-3">2. גודל</div>
          <div className="grid grid-cols-3 border border-[var(--line)] bg-white" data-testid="category-sizes">
            {CATEGORY_SIZES.map((s, i) => (
              <button
                key={s.key}
                onClick={() => change(setSize, s.key)}
                aria-pressed={size === s.key}
                aria-label={`גודל ${s.label}`}
                className={`min-h-11 text-[13px] font-semibold ${i ? "border-r border-[var(--line)]" : ""} ${size === s.key ? "bg-[var(--ink)] text-white" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* 3. איפה: שורה אחת שגוללים, או כולן פרושות בראש הדוכן */}
        <section>
          <div className="text-[14px] font-bold mb-3">3. איפה הן מופיעות</div>
          <div className="grid grid-cols-2 gap-3" data-testid="category-arranges">
            {CATEGORY_ARRANGES.map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  change(setArrange, a.key);
                  setActive(null); // שהתצוגה למעלה תראה את הפריסה המלאה
                }}
                aria-pressed={arrange === a.key}
                aria-label={`מיקום: ${a.label}`}
                className={`bg-white border-2 p-3.5 text-right min-h-11 flex flex-col gap-1 ${arrange === a.key ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
              >
                <ArrangeSketch arrange={a.key} />
                <div className="text-[13px] font-bold mt-2.5">
                  {arrange === a.key && "✓ "}
                  {a.label}
                </div>
                <div className="text-[11px] text-[var(--muted)] leading-snug">{a.hint}</div>
              </button>
            ))}
          </div>
          {arrange === "grid" && (
            <p className="text-[11.5px] text-[var(--muted)] mt-2.5 leading-snug">
              הקטגוריות יופיעו בראש הדוכן, ואחריהן המומלצים ושאר המוצרים. כשיש הרבה, הראשונות מוצגות והשאר מאחורי &quot;עוד קטגוריות&quot;.
            </p>
          )}
        </section>

        {/* 4. אייקון או תמונה לכל קטגוריה */}
        <section>
          <div className="text-[14px] font-bold mb-1">4. אייקון או תמונה לכל קטגוריה</div>
          <p className="text-[11.5px] text-[var(--muted)] mt-0.5 leading-snug" data-testid="category-image-hint">
            📐 {CATEGORY_IMAGE_HINT}
          </p>
          <p className="text-[11.5px] text-[var(--muted)] mt-1 leading-snug" data-testid="category-auto-image-hint">
            קטגוריה בלי תמונה ובלי אמוג&apos;י מציגה לבד את התמונה של המוצר הראשון שבה.
          </p>
          {!icons && (
            <p className="text-[11.5px] text-[var(--warn-ink)] mt-1 leading-snug">
              בצורה &quot;רק טקסט&quot; לא רואים אייקונים. אפשר להכין אותם עכשיו, והם יופיעו כשבוחרים צורה אחרת.
            </p>
          )}

          <div className="flex flex-col gap-3 mt-4" data-testid="category-rows">
            {categories.map((c) => {
              const m = meta[c];
              const img = imageUrl(m?.image);
              return (
                <div key={c} className="bg-white border border-[var(--line)] p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 shrink-0 flex items-center justify-center text-2xl bg-[var(--canvas)] overflow-hidden border border-[var(--line)]">
                      {uploading === c ? (
                        <span className="text-[11px] text-[var(--muted)]">מעלה…</span>
                      ) : img ? (
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      ) : m?.emoji ? (
                        m.emoji
                      ) : productImages[c] ? (
                        <img src={productImages[c]} alt="" className="w-full h-full object-cover opacity-80" />
                      ) : (
                        <span className="text-[18px] font-extrabold text-[var(--muted)]">{c.charAt(0)}</span>
                      )}
                    </span>
                    <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{c}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setEmojiFor(emojiFor === c ? null : c)}
                        aria-expanded={emojiFor === c}
                        aria-label={`אמוג'י ל${c}`}
                        className="min-h-11 px-2.5 border border-[var(--line)] text-[12px] font-semibold"
                      >
                        😊 אמוג&apos;י
                      </button>
                      <button
                        onClick={() => { uploadTarget.current = c; fileRef.current?.click(); }}
                        disabled={uploading !== null}
                        aria-label={`תמונה ל${c}`}
                        className="min-h-11 px-2.5 border border-[var(--line)] text-[12px] font-semibold disabled:opacity-50"
                      >
                        📷 תמונה
                      </button>
                    </div>
                  </div>

                  {m?.image && (
                    <button
                      onClick={() => setItem(c, { emoji: m.emoji })}
                      className="text-[12px] underline text-[var(--muted)] mt-1.5 min-h-9"
                    >
                      הסרת התמונה{m.emoji ? ` (יחזור ${m.emoji})` : ""}
                    </button>
                  )}

                  {emojiFor === c && (
                    <div className="mt-3 grid grid-cols-8 gap-1.5" data-testid="emoji-grid">
                      {CATEGORY_EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => { setItem(c, { ...m, emoji: e }); setEmojiFor(null); }}
                          aria-label={`אמוג'י ${e}`}
                          aria-pressed={m?.emoji === e}
                          className={`h-10 text-xl border ${m?.emoji === e ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-transparent"}`}
                        >
                          {e}
                        </button>
                      ))}
                      {m?.emoji && (
                        <button
                          onClick={() => { setItem(c, { image: m.image }); setEmojiFor(null); }}
                          className="col-span-8 text-[12px] underline text-[var(--muted)] min-h-9"
                        >
                          בלי אמוג&apos;י
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {error && (
          <p role="alert" className="text-[12.5px] text-[var(--danger)] leading-snug">{error}</p>
        )}
      </div>

      {/* שמירה */}
      <div className="absolute bottom-0 inset-x-0 bg-white border-t border-[var(--line)] px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={save}
          disabled={saving || uploading !== null}
          data-testid="save-category-design"
          className="w-full bg-[var(--ink)] text-white py-3.5 text-[14px] font-bold disabled:opacity-60"
        >
          {saving ? "שומרים…" : "שמירה"}
        </button>
      </div>
    </div>
  );
}

/** שרטוט קטן של כל צורה — רואים את ההבדל בלי לקרוא. */
function Sketch({ layout }: { layout: CategoryLayout }) {
  const ink = "#C9C2B8";
  const on = "#262626";
  const three = [0, 1, 2];
  if (layout === "text" || layout === "icon")
    return (
      <div className="flex gap-1 h-10 items-center" aria-hidden>
        {three.map((i) => (
          <span key={i} className="flex items-center gap-0.5 h-5 px-1.5 border" style={{ borderColor: i ? ink : on, background: i ? "#fff" : on }}>
            {layout === "icon" && <span className="w-2.5 h-2.5" style={{ background: i ? ink : "#fff" }} />}
            <span className="w-4 h-1" style={{ background: i ? ink : "#fff" }} />
          </span>
        ))}
      </div>
    );
  if (layout === "circle" || layout === "square")
    return (
      <div className="flex gap-1.5 h-10 items-end" aria-hidden>
        {three.map((i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span
              className="w-6 h-6 border-2"
              style={{ borderColor: i ? ink : on, borderRadius: layout === "circle" ? 999 : 0, background: "#F3EEE7" }}
            />
            <span className="w-5 h-1" style={{ background: i ? ink : on }} />
          </span>
        ))}
      </div>
    );
  return (
    <div className="flex gap-1 h-10 items-center" aria-hidden>
      {three.map((i) => (
        <span key={i} className="relative w-11 h-8 border overflow-hidden" style={{ borderColor: i ? ink : on, background: "#F3EEE7" }}>
          <span className="absolute inset-x-0 bottom-0 h-2" style={{ background: i ? "#fff" : on }} />
        </span>
      ))}
    </div>
  );
}

/** שרטוט קטן: שורה אחת שממשיכה הצידה, או רשת של כל הקטגוריות מעל המוצרים. */
function ArrangeSketch({ arrange }: { arrange: CategoryArrange }) {
  const ink = "#C9C2B8";
  const tile = (k: number, w: string) => <span key={k} className={`${w} h-4 border`} style={{ borderColor: ink, background: "#F3EEE7" }} />;
  if (arrange === "row")
    return (
      <div className="h-12 flex flex-col justify-center gap-1.5 overflow-hidden" aria-hidden>
        <div className="flex gap-1 -me-6">{[0, 1, 2, 3, 4].map((k) => tile(k, "w-7 shrink-0"))}</div>
        <div className="grid grid-cols-2 gap-1">{[0, 1].map((k) => <span key={k} className="h-3" style={{ background: ink }} />)}</div>
      </div>
    );
  return (
    <div className="h-12 flex flex-col justify-center gap-1" aria-hidden>
      <div className="grid grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((k) => tile(k, "w-full"))}</div>
      <div className="grid grid-cols-2 gap-1">{[0, 1].map((k) => <span key={k} className="h-1.5" style={{ background: ink }} />)}</div>
    </div>
  );
}
