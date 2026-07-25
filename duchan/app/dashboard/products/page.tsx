"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

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
        stock: p.stock,
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
        base = { ...base, name: d.name ?? base.name, description: d.description ?? base.description, price: d.price ?? base.price };
      }
    } catch {}
    setEdit(base);
  }

  useEffect(() => {
    if (!edit) return;
    localStorage.setItem(
      draftKey(edit.id),
      JSON.stringify({ name: edit.name, description: edit.description, price: edit.price })
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
        const r = await uploadBlob("image", edit.pendingImage);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        imageKey = r.key;
        videoKey = null;
        posterKey = null;
      }
      if (edit.pendingVideo) {
        const r = await uploadBlob("video", edit.pendingVideo);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        videoKey = r.key;
        imageKey = null;
        if (edit.pendingPoster) {
          const pr = await uploadBlob("poster", edit.pendingPoster);
          if (!("error" in pr)) posterKey = pr.key;
        }
      }

      const row = {
        name: edit.name.trim() || "מוצר",
        description: edit.description.trim() || null,
        price: Math.max(0, Math.floor(Number(edit.price) || 0)),
        track_stock: edit.trackStock,
        stock: Math.max(0, edit.stock),
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
        {products.map((p) => {
          const out = p.track_stock && p.stock === 0;
          const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
          return (
            <button
              key={p.id}
              onClick={() => openEditor(p)}
              className={`bg-white border border-[#E6E7EC] rounded-xl p-2.5 flex gap-3 items-center text-right ${out ? "opacity-55" : ""}`}
            >
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
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-[13px] font-medium">₪{p.price}</span>
                  {!p.track_stock ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F6F9] text-[#7A7D8A]">בלי מעקב</span>
                  ) : out ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FBE9EA] text-[#D2373B]">אזל</span>
                  ) : p.stock <= 2 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFF3E0] text-[#A85B00]">נשארו {p.stock}</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F6F9] text-[#7A7D8A]">{p.stock} במלאי</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => openEditor(null)}
        className="fixed bottom-20 left-4 w-12 h-12 rounded-full bg-[#15161B] text-white text-2xl font-light shadow-lg z-30"
      >
        +
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
            <input value={edit.name} maxLength={40}
              onChange={(e) => setEdit((s) => s && { ...s, name: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3" />

            <label className="block text-[11px] text-[#7A7D8A] mb-1">תיאור קצר</label>
            <textarea value={edit.description} maxLength={120} rows={2} placeholder="רך במיוחד, חוזר לאט"
              onChange={(e) => setEdit((s) => s && { ...s, description: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3 resize-none" />

            <label className="block text-[11px] text-[#7A7D8A] mb-1">מחיר (₪)</label>
            <input value={edit.price} type="number" inputMode="numeric"
              onChange={(e) => setEdit((s) => s && { ...s, price: e.target.value })}
              className="w-full border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm mb-3" />

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
              <button onClick={softDelete}
                className="w-full mt-2 border border-[#F0CFD0] text-[#D2373B] rounded-xl py-2.5 text-sm">
                מחיקת המוצר
              </button>
            )}
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
