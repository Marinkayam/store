"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PublicProduct, PublicStore } from "@/lib/types";

interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export default function StoreView({
  store,
  products,
}: {
  store: PublicStore;
  products: PublicProduct[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [current, setCurrent] = useState<PublicProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [orderOpen, setOrderOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // כפתור עריכה צף — רק אם המחוברת היא בעלת החנות (RLS מחזיר את השורה רק לבעלים)
  useEffect(() => {
    const supa = supabaseBrowser();
    supa
      .from("stores")
      .select("id")
      .eq("slug", store.slug)
      .maybeSingle()
      .then(({ data }) => setIsOwner(!!data));
  }, [store.slug]);

  // מנגן רק את הסרטונים שנראים — שישה במקביל מקפיאים גלילה בטלפון ישן
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }),
      { threshold: 0.25 }
    );
    root.querySelectorAll("video").forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [products]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const sorted = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          Number(a.track_stock && a.stock === 0) - Number(b.track_stock && b.stock === 0)
      ),
    [products]
  );

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.qty * l.price, 0);

  const inCart = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;
  const maxQty = (p: PublicProduct) => (p.track_stock ? Math.max(0, p.stock - inCart(p.id)) : 99);

  function openProduct(p: PublicProduct) {
    setCurrent(p);
    setQty(1);
  }

  function addToCart() {
    if (!current) return;
    setCart((c) => {
      const ex = c.find((l) => l.id === current.id);
      if (ex) return c.map((l) => (l.id === current.id ? { ...l, qty: l.qty + qty } : l));
      return [...c, { id: current.id, name: current.name, price: current.price, qty }];
    });
    setCurrent(null);
    showToast("נוסף לסל");
  }

  async function sendOrder() {
    if (!cart.length || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          items: cart.map((l) => ({ productId: l.id, qty: l.qty })),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "משהו השתבש, נסי שוב");
        return; // לא מנקים את הסל עד שהשרת אישר
      }

      // בונים את הלינק רק אחרי שהשרת ענה — המספר לא יושב ב-HTML
      const firstName = data.storeName.replace(/^החנות של\s*/, "");
      const lines = (data.items as { name: string; qty: number; price: number }[])
        .map((i) => `• ${i.name} × ${i.qty} — ₪${i.price * i.qty}`)
        .join("\n");
      const msg =
        `היי ${firstName}! 👋\n` +
        `ראיתי את החנות ואני רוצה להזמין:\n\n${lines}\n\n` +
        `סה"כ: ₪${data.total}` +
        (note.trim() ? `\nהערה: ${note.trim()}` : "") +
        `\n\nהזמנה #${data.orderNumber}`;

      setCart([]);
      setNote("");
      setOrderOpen(false);
      window.location.href = `https://wa.me/${data.phone}?text=${encodeURIComponent(msg)}`;
    } catch {
      showToast("אין חיבור — נסי שוב עוד רגע");
    } finally {
      setSending(false);
    }
  }

  const cover = mediaUrl(store.cover_key);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "var(--s-bg)",
        color: "var(--s-ink)",
        fontFamily: "var(--s-font)",
      }}
    >
      {/* hero */}
      <div className="relative">
        <div
          className="h-36 overflow-hidden"
          style={{ background: cover ? undefined : "linear-gradient(135deg,#C9D6FF,#E2C6F7)" }}
        >
          {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
        </div>
        <div
          className="absolute -bottom-7 right-1/2 translate-x-1/2 w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg"
          style={{ background: "var(--s-surface)" }}
        >
          {store.emoji}
        </div>
      </div>

      <div className="text-center pt-10 px-5 pb-3">
        <h1 className="text-xl font-bold">{store.display_name}</h1>
        {store.tagline && <p className="text-xs opacity-70 mt-1">{store.tagline}</p>}
      </div>

      {/* grid */}
      <div className="flex-1 px-3 pb-24" ref={gridRef}>
        {sorted.length === 0 ? (
          <p className="text-center text-sm opacity-60 pt-14">עוד אין כאן מוצרים.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {sorted.map((p, i) => {
              const out = p.track_stock && p.stock === 0;
              const img = mediaUrl(p.image_key);
              const vid = mediaUrl(p.video_key);
              const poster = mediaUrl(p.poster_key);
              return (
                <button
                  key={p.id}
                  onClick={() => !out && openProduct(p)}
                  className={`text-right overflow-hidden relative active:scale-[.97] transition ${out ? "opacity-50 pointer-events-none" : ""}`}
                  style={{
                    background: "var(--s-surface)",
                    borderRadius: "var(--s-radius)",
                    border: "var(--s-border)" as string,
                  }}
                >
                  {out ? (
                    <span className="absolute top-2 right-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6B6B72] text-white">
                      אזל
                    </span>
                  ) : p.track_stock && p.stock <= 3 ? (
                    <span
                      className="absolute top-2 right-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
                    >
                      נשארו {p.stock}
                    </span>
                  ) : null}
                  <div
                    className="h-32 flex items-center justify-center text-5xl overflow-hidden"
                    style={{ background: "var(--s-thumb)" }}
                  >
                    {vid ? (
                      <video src={vid} poster={poster ?? undefined} muted loop playsInline className="w-full h-full object-cover" />
                    ) : img ? (
                      <img src={img} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="squish" style={{ animationDelay: `${i * 0.4}s` }}>🛍️</span>
                    )}
                  </div>
                  <div className="px-2 py-2 text-center">
                    <div className="text-[13px] font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-[11px] opacity-60 truncate">{p.description}</div>
                    )}
                    <div className="text-sm font-bold mt-0.5" style={{ color: "var(--s-primary)" }}>
                      ₪{p.price}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-center text-[10px] opacity-45 pt-6 pb-1">
          {store.display_name} ·{" "}
          <a href="/" className="underline">
            נבנתה בדוכן
          </a>
        </p>
      </div>

      {/* עריכה — לבעלת החנות בלבד */}
      {isOwner && (
        <a
          href="/dashboard"
          className="fixed bottom-24 left-4 z-30 px-4 py-2.5 rounded-full bg-[#15161B] text-white text-sm font-medium shadow-lg"
        >
          עריכה ✏️
        </a>
      )}

      {/* cart bar */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 flex justify-between items-center px-5 pt-3.5 pb-5 cursor-pointer transition-transform ${cartCount ? "" : "translate-y-full"}`}
        style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
        onClick={() => cartCount && setOrderOpen(true)}
      >
        <span className="text-sm">{cartCount} פריטים · ₪{cartTotal}</span>
        <span
          className="px-4 py-1.5 rounded-full text-[13px] font-bold"
          style={{ background: "var(--s-onprimary)", color: "var(--s-primary)" }}
        >
          הזמנה
        </span>
      </div>

      {/* scrim */}
      {(current || orderOpen) && (
        <div
          className="fixed inset-0 bg-black/45 z-40"
          onClick={() => {
            setCurrent(null);
            setOrderOpen(false);
          }}
        />
      )}

      {/* product sheet */}
      {current && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 rounded-t-3xl px-5 pt-3 pb-7 max-h-[88%] overflow-y-auto"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <div className="w-9 h-1 rounded bg-current opacity-15 mx-auto mb-4" />
          <div
            className="h-40 rounded-2xl flex items-center justify-center text-6xl overflow-hidden"
            style={{ background: "var(--s-thumb)" }}
          >
            {mediaUrl(current.video_key) ? (
              <video
                src={mediaUrl(current.video_key)!}
                poster={mediaUrl(current.poster_key) ?? undefined}
                muted loop playsInline autoPlay
                className="w-full h-full object-cover"
              />
            ) : mediaUrl(current.image_key) ? (
              <img src={mediaUrl(current.image_key)!} alt="" className="w-full h-full object-cover" />
            ) : (
              "🛍️"
            )}
          </div>
          <h2 className="text-lg font-bold text-center mt-3">{current.name}</h2>
          {current.description && (
            <p className="text-[13px] opacity-70 text-center mt-1 leading-relaxed">{current.description}</p>
          )}
          <p className="text-xl font-bold text-center mt-2" style={{ color: "var(--s-primary)" }}>
            ₪{current.price}
          </p>
          {current.track_stock && current.stock <= 3 && (
            <p className="text-[11px] opacity-60 text-center mt-1">נשארו {current.stock} במלאי</p>
          )}
          <div className="flex items-center justify-center gap-5 my-4">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-8 h-8 rounded-full border-[1.5px] border-current opacity-55 disabled:opacity-20 text-lg"
            >
              −
            </button>
            <span className="text-lg font-bold min-w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(maxQty(current), q + 1))}
              disabled={qty >= maxQty(current)}
              className="w-8 h-8 rounded-full border-[1.5px] border-current opacity-55 disabled:opacity-20 text-lg"
            >
              +
            </button>
          </div>
          <button
            onClick={addToCart}
            disabled={maxQty(current) === 0}
            className="w-full rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-40"
            style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
          >
            {maxQty(current) === 0 ? "אין יותר במלאי" : "הוספה לסל"}
          </button>
        </div>
      )}

      {/* order sheet */}
      {orderOpen && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 rounded-t-3xl px-5 pt-3 pb-7 max-h-[88%] overflow-y-auto"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <div className="w-9 h-1 rounded bg-current opacity-15 mx-auto mb-4" />
          <h2 className="text-base font-bold mb-2.5">ההזמנה שלך</h2>
          {cart.map((l) => (
            <div key={l.id} className="flex justify-between text-[13px] py-1">
              <span>{l.name} × {l.qty}</span>
              <span>₪{l.price * l.qty}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold border-t border-black/10 mt-2 pt-2.5">
            <span>סה"כ</span>
            <span>₪{cartTotal}</span>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (לא חובה) — אפשר בורוד?"
            maxLength={200}
            className="w-full border-[1.5px] border-black/20 bg-transparent rounded-xl px-3 py-2.5 text-[13px] my-3"
          />
          <p className="text-[11px] opacity-60 text-center mb-3 leading-relaxed">
            ההזמנה תיפתח בוואטסאפ.
            <br />
            שם תסכמו תשלום ומסירה.
          </p>
          <button
            onClick={sendOrder}
            disabled={sending}
            className="w-full rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-40"
            style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
          >
            {sending ? "רגע…" : "שליחה בוואטסאפ"}
          </button>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[#1B1C22] text-white px-4 py-2.5 rounded-3xl text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
