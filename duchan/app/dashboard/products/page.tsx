"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import {
  squareImage,
  posterFrom,
  validateGalleryVideo,
  startRecording,
  openCamera,
  mediaUrl,
  RECORD_SECONDS,
  type RecorderHandle,
} from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { QUOTAS } from "@/lib/quotas";
import type { Product } from "@/lib/types";

// מוצרים: CRUD + מדיה. מחיקה היא תמיד soft delete (שחזור 30 יום).
// טיוטת עריכה נשמרת ב-localStorage לפי מזהה מוצר — טופס לא מתנקה עד שהשרת אישר.

interface EditState {
  id: string | null; // null = חדש
  name: string;
  description: string;
  price: string;
  trackStock: boolean;
  stock: number;
  isVisible: boolean;
  optionLabel: string;   // "צבע" · "מידה" — ריק = אין אפשרויות
  optionsText: string;   // "ורוד, כחול, צהוב" — נשמר כמערך
  imageKey: string | null;
  videoKey: string | null;
  posterKey: string | null;
  pendingImage: Blob | null;
  pendingVideo: Blob | null;
  pendingPoster: Blob | null;
  previewUrl: string | null;
  previewIsVideo: boolean;
}

const EMPTY_EDIT: EditState = {
  id: null,
  name: "",
  description: "",
  price: "",
  trackStock: true,
  stock: 1,
  isVisible: true,
  optionLabel: "",
  optionsText: "",
  imageKey: null,
  videoKey: null,
  posterKey: null,
  pendingImage: null,
  pendingVideo: null,
  pendingPoster: null,
  previewUrl: null,
  previewIsVideo: false,
};

export default function ProductsPage() {
  const { store, loading } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  // הקלטה
  const [recOpen, setRecOpen] = useState(false);
  const [recLive, setRecLive] = useState(false);
  const [recProgress, setRecProgress] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const handleRef = useRef<RecorderHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef(0);

  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // כתיבה אוטומטית (פרימיום)
  const [aiBusy, setAiBusy] = useState(false);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  /**
   * הבחירות כפי שיישמרו: "ורוד, כחול,, ורוד " → ["ורוד","כחול"].
   * מקור אמת אחד גם לשבבים בעורך וגם לשמירה — אחרת היא רואה שלוש בחירות
   * ובחנות מופיעות שתיים.
   */
  const optionValues = useMemo(
    () => [...new Set((edit?.optionsText ?? "").split(",").map((o) => o.trim()).filter(Boolean))].slice(0, 12),
    [edit?.optionsText]
  );

  /** דף החנות מוגש מקאש של 60 שניות — מרעננים אותו מיד אחרי שינוי מוצרים */
  const refreshStorePage = () => {
    if (!store) return;
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug }),
    }).catch(() => {});
  };

  /** מבקש מה-AI תיאור למוצר על סמך התמונה שבעורך */
  async function writeDescription() {
    if (!edit || !store || aiBusy) return;
    const blob = edit.pendingImage;
    if (!blob) {
      showToast("קודם מוסיפים תמונה");
      return;
    }
    setAiBusy(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1] ?? "");
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const resp = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          imageBase64: base64,
          mediaType: blob.type,
          productName: edit.name,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error ?? "לא הצלחנו לכתוב תיאור");
        return;
      }
      setEdit((e) => e && { ...e, description: data.description });
      showToast("כתבנו תיאור — אפשר לשנות אותו");
    } catch {
      showToast("אין חיבור — נסי שוב");
    } finally {
      setAiBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    if (!store) return;
    const supa = supabaseBrowser();
    const { data } = await supa
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setProducts((data as Product[]) ?? []);
  }, [store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ---------- טיוטות ---------- */
  const draftKey = (id: string | null) => `duchan-product-draft-${id ?? "new"}`;

  function openEditor(p: Product | null) {
    let base: EditState;
    if (p) {
      base = {
        ...EMPTY_EDIT,
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        price: String(p.price),
        trackStock: p.track_stock,
        optionLabel: p.option_label ?? "",
        optionsText: (p.options ?? []).join(", "),
        stock: p.stock,
        isVisible: p.is_visible !== false,
        imageKey: p.image_key,
        videoKey: p.video_key,
        posterKey: p.poster_key,
        previewUrl: mediaUrl(p.video_key) ?? mediaUrl(p.image_key),
        previewIsVideo: !!p.video_key,
      };
    } else {
      if (products.length >= QUOTAS.productsPerStore) {
        showToast(`אפשר עד ${QUOTAS.productsPerStore} מוצרים בחנות`);
        return;
      }
      base = { ...EMPTY_EDIT };
    }
    // שחזור טיוטה אם יש
    try {
      const raw = localStorage.getItem(draftKey(p?.id ?? null));
      if (raw) {
        const d = JSON.parse(raw);
        base = {
          ...base,
          name: d.name ?? base.name,
          description: d.description ?? base.description,
          price: d.price ?? base.price,
          optionLabel: d.optionLabel ?? base.optionLabel,
          optionsText: d.optionsText ?? base.optionsText,
        };
      }
    } catch {}
    setEdit(base);
  }

  useEffect(() => {
    if (!edit) return;
    localStorage.setItem(
      draftKey(edit.id),
      JSON.stringify({
        name: edit.name,
        description: edit.description,
        price: edit.price,
        optionLabel: edit.optionLabel,
        optionsText: edit.optionsText,
      })
    );
  }, [edit]);

  /* ---------- מדיה ---------- */
  async function onPhoto(file: File) {
    const blob = await squareImage(file);
    setEdit((e) =>
      e && {
        ...e,
        pendingImage: blob,
        pendingVideo: null,
        pendingPoster: null,
        videoKey: null,
        posterKey: null,
        previewUrl: URL.createObjectURL(blob),
        previewIsVideo: false,
      }
    );
  }

  async function onGalleryVideo(file: File) {
    const check = await validateGalleryVideo(file);
    if (!check.ok) {
      showToast(check.reason);
      return;
    }
    const url = URL.createObjectURL(file);
    const poster = await posterFrom(url);
    setEdit((e) =>
      e && {
        ...e,
        pendingVideo: file,
        pendingPoster: poster,
        pendingImage: null,
        imageKey: null,
        previewUrl: url,
        previewIsVideo: true,
      }
    );
  }

  async function openRecorder() {
    setRecOpen(true);
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      showToast("אין גישה למצלמה — נסי 'מהגלריה'");
      setRecOpen(false);
    }
  }

  function closeRecorder() {
    handleRef.current?.cancel();
    handleRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setRecLive(false);
    setRecProgress(0);
    setRecOpen(false);
  }

  async function recStart() {
    if (!streamRef.current || recLive) return;
    setRecLive(true);
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / (RECORD_SECONDS * 1000));
      setRecProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    const handle = await startRecording(streamRef.current);
    handleRef.current = handle;
    const blob = await handle.result;
    cancelAnimationFrame(rafRef.current);
    setRecLive(false);
    setRecProgress(0);

    if (blob && blob.size > 0) {
      const url = URL.createObjectURL(blob);
      const poster = await posterFrom(url);
      setEdit((e) =>
        e && {
          ...e,
          pendingVideo: blob,
          pendingPoster: poster,
          pendingImage: null,
          imageKey: null,
          previewUrl: url,
          previewIsVideo: true,
        }
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecOpen(false);
      showToast(`הוידאו נשמר · עד ${RECORD_SECONDS} שניות`);
    }
  }

  function recStop() {
    handleRef.current?.stop();
  }

  /* ---------- שמירה ---------- */
  async function save() {
    if (!edit || !store || busy) return;
    setBusy(true);
    try {
      const supa = supabaseBrowser();

      // מעלים מדיה קודם — אם נכשל, הטופס נשאר מלא
      let { imageKey, videoKey, posterKey } = edit;
      if (edit.pendingImage) {
        const r = await uploadBlob("image", edit.pendingImage, store.id);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        imageKey = r.key;
        videoKey = null;
        posterKey = null;
      }
      if (edit.pendingVideo) {
        const r = await uploadBlob("video", edit.pendingVideo, store.id);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        videoKey = r.key;
        imageKey = null;
        if (edit.pendingPoster) {
          const pr = await uploadBlob("poster", edit.pendingPoster, store.id);
          if (!("error" in pr)) posterKey = pr.key;
        }
      }

      const row = {
        name: edit.name.trim() || "מוצר",
        description: edit.description.trim() || null,
        price: Math.max(0, Math.floor(Number(edit.price) || 0)),
        track_stock: edit.trackStock,
        option_label: optionValues.length ? edit.optionLabel.trim() || "בחרי" : null,
        options: optionValues.length ? optionValues : null,
        stock: Math.max(0, edit.stock),
        is_visible: edit.isVisible,
        image_key: imageKey,
        video_key: videoKey,
        poster_key: posterKey,
      };

      let error;
      if (edit.id) {
        ({ error } = await supa.from("products").update(row).eq("id", edit.id));
      } else {
        ({ error } = await supa.from("products").insert({ ...row, store_id: store.id }));
      }
      if (error) {
        showToast("השמירה נכשלה — נסי שוב");
        return;
      }

      localStorage.removeItem(draftKey(edit.id));
      showToast(edit.trackStock && edit.stock === 0 ? "המוצר סומן כאזל" : edit.id ? "המוצר עודכן" : "המוצר נוסף לחנות");
      setEdit(null);
      refresh();
      refreshStorePage();
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!edit?.id) return;
    const supa = supabaseBrowser();
    await supa.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", edit.id);
    localStorage.removeItem(draftKey(edit.id));
    setEdit(null);
    showToast("המוצר נמחק — אפשר לשחזר תוך 30 יום");
    refresh();
    refreshStorePage();
    loadDeleted();
  }

  /* ---------- שכפול ---------- */
  async function duplicateProduct() {
    if (!edit?.id || !store) return;
    if (products.length >= QUOTAS.productsPerStore) {
      showToast(`אפשר עד ${QUOTAS.productsPerStore} מוצרים בחנות`);
      return;
    }
    const src = products.find((p) => p.id === edit.id);
    if (!src) return;
    const supa = supabaseBrowser();
    // מפתחות המדיה משותפים — אף פעם לא מוחקים אובייקטים מ-R2, אז שיתוף בטוח
    const { error } = await supa.from("products").insert({
      store_id: store.id,
      name: `${src.name} (עותק)`.slice(0, 40),
      description: src.description,
      price: src.price,
      track_stock: src.track_stock,
      option_label: src.option_label,
      options: src.options,
      stock: src.stock,
      is_visible: src.is_visible,
      image_key: src.image_key,
      video_key: src.video_key,
      poster_key: src.poster_key,
      sort_order: src.sort_order + 1,
    });
    if (error) {
      showToast("השכפול נכשל — נסי שוב");
      return;
    }
    setEdit(null);
    showToast("המוצר שוכפל ✨");
    refresh();
    refreshStorePage();
  }

  /* ---------- סידור ---------- */
  async function move(p: Product, dir: -1 | 1) {
    const idx = products.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= products.length) return;
    const next = [...products];
    [next[idx], next[target]] = [next[target], next[idx]];
    setProducts(next); // אופטימי
    const supa = supabaseBrowser();
    await Promise.all(
      next.map((prod, i) =>
        prod.sort_order !== i
          ? supa.from("products").update({ sort_order: i }).eq("id", prod.id)
          : null
      )
    );
    refresh();
    refreshStorePage();
  }

  /* ---------- מלאי מהיר ---------- */
  async function quickStock(p: Product, delta: number) {
    const stock = Math.max(0, p.stock + delta);
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, stock } : x))); // אופטימי
    const supa = supabaseBrowser();
    const { error } = await supa.from("products").update({ stock }).eq("id", p.id);
    if (error) refresh();
    else refreshStorePage();
  }

  /* ---------- שחזור ---------- */
  const [deleted, setDeleted] = useState<Product[]>([]);
  const [deletedOpen, setDeletedOpen] = useState(false);

  const loadDeleted = useCallback(async () => {
    if (!store) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const supa = supabaseBrowser();
    const { data } = await supa
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .not("deleted_at", "is", null)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false });
    setDeleted((data as Product[]) ?? []);
  }, [store]);

  useEffect(() => {
    loadDeleted();
  }, [loadDeleted]);

  async function restore(p: Product) {
    if (products.length >= QUOTAS.productsPerStore) {
      showToast(`אין מקום — אפשר עד ${QUOTAS.productsPerStore} מוצרים`);
      return;
    }
    const supa = supabaseBrowser();
    await supa.from("products").update({ deleted_at: null }).eq("id", p.id);
    showToast("המוצר חזר לחנות 🎉");
    refresh();
    refreshStorePage();
    loadDeleted();
  }

  if (loading) return <div className="p-6 text-sm text-[#7A7D8A]">רגע…</div>;
  if (!store) return null;

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[#E6E7EC]">
        <h1 className="text-lg font-bold">המוצרים שלי</h1>
        <p className="text-xs text-[#7A7D8A] font-light">
          {products.length} מתוך {QUOTAS.productsPerStore}
        </p>
      </header>

      <div className="p-3 flex flex-col gap-2">
        {products.length === 0 && (
          <p className="text-center py-14 text-sm text-[#7A7D8A] leading-loose">
            עוד לא הוספת מוצרים.
            <br />
            לוחצים על + ומתחילים.
          </p>
        )}
        {products.map((p, idx) => {
          const out = p.track_stock && p.stock === 0;
          const hidden = p.is_visible === false;
          const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
          return (
            <div
              key={p.id}
              onClick={() => openEditor(p)}
              className={`bg-white border border-[#E6E7EC] rounded-xl p-2.5 flex gap-2.5 items-center text-right cursor-pointer ${out || hidden ? "opacity-55" : ""}`}
            >
              {/* סידור */}
              <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => move(p, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 rounded border border-[#E6E7EC] bg-[#F5F6F9] text-[10px] leading-none disabled:opacity-25"
                  aria-label="להזיז למעלה"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(p, 1)}
                  disabled={idx === products.length - 1}
                  className="w-6 h-6 rounded border border-[#E6E7EC] bg-[#F5F6F9] text-[10px] leading-none disabled:opacity-25"
                  aria-label="להזיז למטה"
                >
                  ▼
                </button>
              </div>
              <div className="w-13 h-13 min-w-13 rounded-lg bg-[#F5F6F9] flex items-center justify-center text-2xl overflow-hidden relative">
                {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                {p.video_key && (
                  <span className="absolute bottom-0.5 left-1 text-[9px] bg-black/60 text-white px-1 rounded">
                    וידאו
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-[#7A7D8A] truncate">{p.description}</div>
                )}
                <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                  <span className="text-[13px] font-medium">₪{p.price}</span>
                  {hidden && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EDEEF1] text-[#6B6E7A]">מוסתר</span>
                  )}
                  {!p.track_stock ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F6F9] text-[#7A7D8A]">בלי מעקב</span>
                  ) : out ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FBE9EA] text-[#D2373B] font-bold">אזל</span>
                  ) : p.stock <= 2 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFF3E0] text-[#A85B00]">נשארו {p.stock}</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F6F9] text-[#7A7D8A]">{p.stock} במלאי</span>
                  )}
                </div>
              </div>
              {/* מלאי מהיר */}
              {p.track_stock && (
                <div className="flex flex-col gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => quickStock(p, 1)}
                    className="w-7 h-7 rounded-lg border border-[#E6E7EC] bg-white text-sm"
                    aria-label="הוספה למלאי"
                  >
                    +
                  </button>
                  <button
                    onClick={() => quickStock(p, -1)}
                    disabled={p.stock === 0}
                    className="w-7 h-7 rounded-lg border border-[#E6E7EC] bg-white text-sm disabled:opacity-25"
                    aria-label="הורדה מהמלאי"
                  >
                    −
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {deleted.length > 0 && (
          <button
            onClick={() => setDeletedOpen(true)}
            className="text-center text-xs text-[#7A7D8A] underline py-2"
          >
            מוצרים שנמחקו ({deleted.length}) — אפשר לשחזר תוך 30 יום
          </button>
        )}
      </div>

      {/* היה עיגול "+" בלי מילה, וקל היה לפספס אותו לגמרי */}
      <button
        onClick={() => openEditor(null)}
        aria-label="מוצר חדש"
        className="fixed bottom-20 inset-x-0 mx-auto max-w-[calc(28rem-1.5rem)] w-[calc(100%-1.5rem)] h-12 rounded-2xl bg-[#15161B] text-white text-[15px] font-bold shadow-lg z-30 flex items-center justify-center gap-2"
      >
        <span className="text-xl font-light">+</span> מוצר חדש
      </button>

      {/* editor sheet */}
      {edit && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setEdit(null)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white rounded-t-3xl px-4 pt-3 pb-6 max-h-[90%] overflow-y-auto">
            <div className="w-9 h-1 rounded bg-black/15 mx-auto mb-3.5" />
            <h2 className="text-base font-bold mb-3">{edit.id ? "עריכת מוצר" : "מוצר חדש"}</h2>

            <div className="h-38 rounded-xl bg-[#F5F6F9] border-[1.5px] border-dashed border-[#D3D5DC] flex items-center justify-center text-5xl overflow-hidden relative mb-2.5" style={{ height: "9.5rem" }}>
              {edit.previewUrl ? (
                <>
                  <button
                    onClick={() =>
                      setEdit((e) => e && {
                        ...e,
                        previewUrl: null, previewIsVideo: false,
                        pendingImage: null, pendingVideo: null, pendingPoster: null,
                        imageKey: null, videoKey: null, posterKey: null,
                      })
                    }
                    className="absolute top-1.5 left-1.5 bg-black/55 text-white w-6 h-6 rounded-full text-sm z-10"
                  >
                    ✕
                  </button>
                  {edit.previewIsVideo ? (
                    <video src={edit.previewUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
                  ) : (
                    <img src={edit.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </>
              ) : (
                "🛍️"
              )}
            </div>

            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            <input ref={galleryRef} type="file" accept="video/*" hidden
              onChange={(e) => e.target.files?.[0] && onGalleryVideo(e.target.files[0])} />

            <div className="flex gap-2 mb-3.5">
              <button onClick={openRecorder} className="flex-1 border border-[#E6E7EC] rounded-lg py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <span className="text-base">🎬</span>הקלטת וידאו
              </button>
              <button onClick={() => photoRef.current?.click()} className="flex-1 border border-[#E6E7EC] rounded-lg py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <span className="text-base">📷</span>תמונה
              </button>
              <button onClick={() => galleryRef.current?.click()} className="flex-1 border border-[#E6E7EC] rounded-lg py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <span className="text-base">🖼️</span>מהגלריה
              </button>
            </div>

            <label className="block text-[11px] text-[#7A7D8A] mb-1">שם המוצר</label>
            <input value={edit.name} maxLength={40} aria-label="שם המוצר"
              onChange={(e) => setEdit((s) => s && { ...s, name: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3" />

            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-[#7A7D8A]">תיאור קצר</label>
              {store.ai_enabled && edit.pendingImage && (
                <button onClick={writeDescription} disabled={aiBusy}
                  className="text-[11px] text-[#15161B] border border-[#E6E7EC] rounded-lg px-2 py-1 disabled:opacity-50">
                  {aiBusy ? "כותבים…" : "✨ כתבי לי תיאור"}
                </button>
              )}
            </div>
            <textarea value={edit.description} maxLength={120} rows={2} placeholder="רך במיוחד, חוזר לאט"
              onChange={(e) => setEdit((s) => s && { ...s, description: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3 resize-none" />

            <label className="block text-[11px] text-[#7A7D8A] mb-1">מחיר (₪)</label>
            <input value={edit.price} type="number" inputMode="numeric" aria-label="מחיר"
              onChange={(e) => setEdit((s) => s && { ...s, price: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3" />

            {/* אפשרויות לבחירה — צבע, מידה, טעם. אחת פר מוצר, בלי מלאי נפרד. */}
            <label className="block text-[11px] text-[#7A7D8A] mb-1">
              אפשרויות לבחירה (לא חובה)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                value={edit.optionLabel}
                maxLength={12}
                placeholder="צבע"
                aria-label="שם האפשרות"
                onChange={(e) => setEdit((s) => s && { ...s, optionLabel: e.target.value })}
                className="w-24 border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm"
              />
              <input
                value={edit.optionsText}
                maxLength={120}
                placeholder="ורוד, כחול, צהוב"
                aria-label="הבחירות"
                onChange={(e) => setEdit((s) => s && { ...s, optionsText: e.target.value })}
                className="flex-1 border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
            {optionValues.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {optionValues.map((o) => (
                  <span key={o} className="text-[11px] bg-[#F5F6F9] rounded-full px-2.5 py-1">
                    {o}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#A2A5B0] mb-3">
                מפרידים בפסיק. הקונה תבחר אחת לפני שהיא מוסיפה לסל.
              </p>
            )}

            <div className="flex justify-between items-center border border-[#E6E7EC] rounded-lg px-3 py-2.5 mb-3">
              <span className="text-[13px]">מוצג בחנות</span>
              <button
                onClick={() => setEdit((s) => s && { ...s, isVisible: !s.isVisible })}
                className={`w-10 h-6 rounded-full relative transition ${edit.isVisible ? "bg-[#1F7A42]" : "bg-[#D6D8DE]"}`}
              >
                <i className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${edit.isVisible ? "right-[19px]" : "right-[3px]"}`} />
              </button>
            </div>

            <div className="flex justify-between items-center border border-[#E6E7EC] rounded-lg px-3 py-2.5 mb-3">
              <span className="text-[13px]">מעקב מלאי</span>
              <button
                onClick={() => setEdit((s) => s && { ...s, trackStock: !s.trackStock })}
                className={`w-10 h-6 rounded-full relative transition ${edit.trackStock ? "bg-[#1F7A42]" : "bg-[#D6D8DE]"}`}
              >
                <i className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${edit.trackStock ? "right-[19px]" : "right-[3px]"}`} />
              </button>
            </div>

            {edit.trackStock && (
              <>
                <label className="block text-[11px] text-[#7A7D8A] mb-1">כמה יש לי כאלה</label>
                <div className="flex items-center gap-3 border border-[#E6E7EC] rounded-lg px-3 py-2 mb-3">
                  <button onClick={() => setEdit((s) => s && { ...s, stock: Math.max(0, s.stock - 1) })}
                    className="w-8 h-8 rounded-lg border border-[#E6E7EC] bg-[#F5F6F9] text-base">−</button>
                  <span className="flex-1 text-center text-base font-semibold">{edit.stock}</span>
                  <button onClick={() => setEdit((s) => s && { ...s, stock: s.stock + 1 })}
                    className="w-8 h-8 rounded-lg border border-[#E6E7EC] bg-[#F5F6F9] text-base">+</button>
                </div>
              </>
            )}

            <button onClick={save} disabled={busy}
              className="w-full bg-[#15161B] text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">
              {busy ? "שומרים…" : "שמירה"}
            </button>
            {edit.id && (
              <>
                <button onClick={duplicateProduct}
                  className="w-full mt-2 border border-[#E6E7EC] rounded-xl py-2.5 text-sm">
                  שכפול המוצר
                </button>
                <button onClick={softDelete}
                  className="w-full mt-2 border border-[#F0CFD0] text-[#D2373B] rounded-xl py-2.5 text-sm">
                  מחיקת המוצר
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* deleted products sheet */}
      {deletedOpen && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setDeletedOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white rounded-t-3xl px-4 pt-3 pb-6 max-h-[70%] overflow-y-auto">
            <div className="w-9 h-1 rounded bg-black/15 mx-auto mb-3.5" />
            <h2 className="text-base font-bold mb-3">מוצרים שנמחקו</h2>
            {deleted.length === 0 && (
              <p className="text-sm text-[#7A7D8A] py-4 text-center">אין מוצרים לשחזור.</p>
            )}
            {deleted.map((p) => {
              const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
              return (
                <div key={p.id} className="flex gap-3 items-center py-2 border-b border-[#F0F1F4] last:border-0">
                  <div className="w-10 h-10 rounded-lg bg-[#F5F6F9] flex items-center justify-center text-lg overflow-hidden">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-[#7A7D8A]">
                      נמחק ב-{new Date(p.deleted_at!).toLocaleDateString("he-IL")} · ₪{p.price}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(p)}
                    className="bg-[#15161B] text-white rounded-lg px-3.5 py-2 text-xs font-medium"
                  >
                    שחזור
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* recorder overlay */}
      {recOpen && (
        <div className="fixed inset-0 bg-[#0B0B0F] z-[70] flex flex-col items-center justify-between py-8">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-90" />
          <button onClick={closeRecorder} className="absolute top-5 left-4 bg-black/45 text-white w-8 h-8 rounded-full z-10">✕</button>
          <div className="relative z-10 text-white text-xs bg-black/45 px-3.5 py-1.5 rounded-full">
            לחיצה ארוכה כדי להקליט · עד {RECORD_SECONDS} שניות · בלי קול
          </div>
          <div
            className="relative z-10 w-21 h-21 flex items-center justify-center select-none"
            style={{ width: 84, height: 84, touchAction: "none" }}
            onPointerDown={(e) => { e.preventDefault(); recStart(); }}
            onPointerUp={recStop}
            onPointerLeave={recStop}
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="39" fill="none" strokeWidth="5" stroke="rgba(255,255,255,.28)" />
              <circle cx="42" cy="42" r="39" fill="none" strokeWidth="5" stroke="#FF4757"
                strokeDasharray="245" strokeDashoffset={245 * (1 - recProgress)} />
            </svg>
            <div className={`bg-[#FF4757] transition-all ${recLive ? "w-9 h-9 rounded-xl" : "w-15 h-15 rounded-full"}`}
              style={recLive ? { width: 34, height: 34 } : { width: 60, height: 60 }} />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[#1B1C22] text-white px-4 py-2.5 rounded-3xl text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
