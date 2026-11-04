"use client";

import { useEffect, useRef, useState } from "react";
import { squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { parsePrice, typedPrice } from "@/lib/money";
import CloseX from "@/app/close-x";

/**
 * כמה מוצרים בבת אחת.
 *
 * מרינה, 11.2026: "להעלות מוצרים … ממש סזיפי וידני". קודם: מוצר חדש ←
 * תמונה ← שם ← מחיר ← שמירה, ושוב, ושוב. עכשיו בוחרים כמה תמונות יחד
 * מהגלריה, ולכל אחת יש כרטיס קטן: שם, מחיר וכמה יש. "מחיר לכולם" ממלא
 * את כל המחירים הריקים בבת אחת — הרבה דוכנים מוכרים הכל באותו מחיר.
 *
 * כל תמונה עוברת בקנבס (squareImage) כמו בעורך הרגיל: ריבוע, דחיסה,
 * ובלי מיקום ה-GPS שבתמונה (CLAUDE.md §6).
 */

type Item = { key: string; blob: Blob; url: string; name: string; price: string; stock: number };

const MAX = 20;

export default function BulkAdd({
  storeId,
  startOrder,
  files,
  onClose,
  onSaved,
}: {
  storeId: string;
  startOrder: number;
  files: File[];
  onClose: () => void;
  onSaved: (n: number) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState(0);
  const [allPrice, setAllPrice] = useState("");
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState("");
  const firstName = useRef<HTMLInputElement>(null);

  // התמונות עוברות בקנבס אחת-אחת (טלפון ישן לא אוהב עשרים במקביל)
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Item[] = [];
      let bad = 0;
      for (const f of files.slice(0, MAX)) {
        try {
          const blob = await squareImage(f, 900, "cover", { x: 50, y: 50 });
          out.push({ key: `${f.name}-${f.size}-${out.length}`, blob, url: URL.createObjectURL(blob), name: "", price: "", stock: 1 });
        } catch (e) {
          bad++;
          if (!(e instanceof MediaError)) console.error("[bulk] image failed", e);
        }
        if (!alive) return;
      }
      setItems(out);
      setSkipped(bad + Math.max(0, files.length - MAX));
      setLoading(false);
      setTimeout(() => firstName.current?.focus(), 50);
    })();
    return () => {
      alive = false;
    };
  }, [files]);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);

  const set = (key: string, patch: Partial<Item>) =>
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const ready = (i: Item) => !!i.name.trim() && (parsePrice(i.price) ?? 0) > 0;
  const missing = items.filter((i) => !ready(i)).length;

  function fillPrices() {
    if (!parsePrice(allPrice)) return;
    setItems((cur) => cur.map((i) => (i.price.trim() ? i : { ...i, price: allPrice })));
  }

  async function saveAll() {
    if (missing || !items.length) return;
    setErr("");
    setSaving({ done: 0, total: items.length });
    const supa = supabaseBrowser();
    let done = 0;
    const left: Item[] = [];
    for (const [n, it] of items.entries()) {
      const up = await uploadBlob("image", it.blob, storeId);
      if ("error" in up) {
        setErr(up.error);
        left.push(it);
        continue;
      }
      const { error } = await supa.from("products").insert({
        store_id: storeId,
        name: it.name.trim().slice(0, 40),
        price: parsePrice(it.price) ?? 0,
        image_key: up.key,
        track_stock: true,
        stock: Math.max(0, it.stock),
        sort_order: startOrder + n,
      });
      if (error) {
        setErr("חלק מהמוצרים לא נשמרו. אפשר לנסות שוב");
        left.push(it);
        continue;
      }
      done++;
      setSaving({ done, total: items.length });
    }
    setSaving(null);
    if (left.length) {
      // מה שלא נשמר נשאר על המסך — לא מוחקים טופס לפני שהשרת אישר
      setItems(left);
      if (done) onSaved(done);
      return;
    }
    onSaved(done);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="כמה מוצרים בבת אחת"
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white max-h-[92%] flex flex-col"
        data-testid="bulk-add"
      >
        <div className="px-4 pt-3 pb-2 border-b border-[var(--line)]">
          <div className="w-9 h-1 bg-black/15 mx-auto mb-3" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">
              {loading ? "מכינים את התמונות…" : `${items.length} מוצרים חדשים`}
            </h2>
            {!saving && <CloseX onClick={onClose} testid="bulk-close" />}
          </div>
          {!loading && items.length > 1 && (
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-[13px] shrink-0">מחיר לכולם:</span>
              <div className="relative flex-1 min-w-0">
                <input
                  value={allPrice}
                  onChange={(e) => setAllPrice(typedPrice(e.target.value))}
                  inputMode="decimal"
                  placeholder="למשל 15"
                  aria-label="מחיר לכל המוצרים"
                  className="w-full border border-[var(--line)] px-3 py-2 pl-7 text-[14px]"
                  data-testid="bulk-all-price"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[13px]" aria-hidden>₪</span>
              </div>
              <button
                onClick={fillPrices}
                disabled={!parsePrice(allPrice)}
                className="shrink-0 border border-[var(--ink)] px-3 py-2 text-[13px] font-bold disabled:opacity-40"
                data-testid="bulk-fill-prices"
              >
                למלא
              </button>
            </div>
          )}
        </div>

        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {loading && <p className="text-center text-[13px] text-[var(--muted)] py-8">רגע, מסדרים את התמונות לריבועים…</p>}
          {skipped > 0 && !loading && (
            <p className="text-[12.5px] text-[var(--warn-ink)] bg-[var(--warn-bg)] px-3 py-2">
              {skipped === 1 ? "תמונה אחת לא נכנסה" : `${skipped} תמונות לא נכנסו`} (עד {MAX} בכל פעם, ורק תמונות).
            </p>
          )}
          {items.map((it, i) => (
            <div key={it.key} className="flex gap-3 border border-[var(--line)] p-2.5" data-testid="bulk-item">
              <img src={it.url} alt="" className="w-20 h-20 object-cover shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <input
                  ref={i === 0 ? firstName : undefined}
                  value={it.name}
                  onChange={(e) => set(it.key, { name: e.target.value.slice(0, 40) })}
                  placeholder="איך קוראים לזה?"
                  aria-label={`שם מוצר ${i + 1}`}
                  className={`w-full border px-2.5 py-2 text-[14px] ${!it.name.trim() && saving === null && err ? "border-[var(--danger)]" : "border-[var(--line)]"}`}
                  data-testid="bulk-name"
                />
                <div className="flex gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      value={it.price}
                      onChange={(e) => set(it.key, { price: typedPrice(e.target.value) })}
                      inputMode="decimal"
                      placeholder="מחיר"
                      aria-label={`מחיר מוצר ${i + 1}`}
                      className="w-full border border-[var(--line)] px-2.5 py-2 pl-6 text-[14px]"
                      data-testid="bulk-price"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[13px]" aria-hidden>₪</span>
                  </div>
                  <div className="flex items-center border border-[var(--line)] shrink-0" aria-label={`כמה יש ממוצר ${i + 1}`}>
                    <button type="button" onClick={() => set(it.key, { stock: Math.max(0, it.stock - 1) })} aria-label="פחות" className="w-8 h-full text-[16px]">−</button>
                    <span className="min-w-5 text-center text-[14px] font-bold tabular-nums">{it.stock}</span>
                    <button type="button" onClick={() => set(it.key, { stock: it.stock + 1 })} aria-label="עוד" className="w-8 h-full text-[16px]">+</button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItems((cur) => cur.filter((x) => x.key !== it.key))}
                aria-label={`להוריד את מוצר ${i + 1}`}
                className="self-start w-8 h-8 text-[var(--muted)] text-[16px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--line)]">
          {err && <p role="alert" className="text-[12.5px] text-[var(--danger)] mb-2">{err}</p>}
          <button
            onClick={saveAll}
            disabled={loading || !!saving || !items.length || missing > 0}
            className="w-full h-12 bg-[var(--ink)] text-white text-[15px] font-bold disabled:opacity-40"
            data-testid="bulk-save"
          >
            {saving
              ? `שומרים ${saving.done} מתוך ${saving.total}…`
              : missing
                ? missing === 1 ? "חסר שם או מחיר במוצר אחד" : `חסר שם או מחיר ב-${missing} מוצרים`
                : items.length === 1 ? "לשמור את המוצר" : `לשמור את כל ה-${items.length}`}
          </button>
        </div>
      </div>
    </>
  );
}
