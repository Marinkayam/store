"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import { payoutOrderLine, payoutSummary } from "@/lib/payouts";
import { BADGES, badgeFor } from "@/lib/badges";
import { coverCss } from "@/lib/covers";
import type { PublicProduct, PublicStore } from "@/lib/types";

interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
  option?: string; // "ורוד" — אותו מוצר בשני צבעים הוא שתי שורות בסל
}

/** מזהה שורת סל: מוצר + בחירה. */
const lineKey = (id: string, option?: string) => `${id}\u0000${option ?? ""}`;

export default function StoreView({
  store,
  products,
  bestSellerId,
}: {
  store: PublicStore;
  products: PublicProduct[];
  bestSellerId: string | null;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [current, setCurrent] = useState<PublicProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [choice, setChoice] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  // null = לא בעלת החנות (או שעוד לא נבדק). קונה לא רואה מזה כלום.
  const [owner, setOwner] = useState<{ newOrders: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // אמצעי התשלום שהחנות מקבלת — שמות בלבד, בלי מספרים ובלי פרטי חשבון
  const paySummary = payoutSummary(store);
  const payLine = payoutOrderLine(store);

  // ספירת כניסה — פעם אחת לביקור (sessionStorage מונע ספירה כפולה בניווט פנימי)
  useEffect(() => {
    const key = `duchan-visited-${store.slug}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    // sendBeacon שורד סגירת טאב — קונה שנוחתת ויוצאת מיד עדיין נספרת
    const payload = JSON.stringify({ slug: store.slug });
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
    if (!sent) {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [store.slug]);

  /**
   * הילדה רואה את החנות *וגם* את הדרך לניהול; הקונות רואות חנות בלבד.
   * הבדיקה נשענת על RLS — השורה חוזרת רק לבעלת החנות, ולכן אין כאן שום
   * מידע שאפשר להוציא מהדף בתור מבקרת. גם מספר ההזמנות החדשות מגיע מ-RLS.
   */
  useEffect(() => {
    const supa = supabaseBrowser();
    let alive = true;
    (async () => {
      const { data } = await supa.from("stores").select("id").eq("slug", store.slug).maybeSingle();
      if (!alive || !data) return;
      const { count } = await supa
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", data.id)
        .eq("status", "sent");
      if (alive) setOwner({ newOrders: count ?? 0 });
    })();
    return () => {
      alive = false;
    };
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

  const inCart = (id: string) =>
    cart.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);
  const maxQty = (p: PublicProduct) => (p.track_stock ? Math.max(0, p.stock - inCart(p.id)) : 99);

  function openProduct(p: PublicProduct) {
    setCurrent(p);
    setQty(1);
    // בחירה יחידה נבחרת מראש — אין מה להחליט
    setChoice(p.options?.length === 1 ? p.options[0] : null);
  }

  function addToCart() {
    if (!current) return;
    const opt = choice ?? undefined;
    const key = lineKey(current.id, opt);
    setCart((c) => {
      const ex = c.find((l) => lineKey(l.id, l.option) === key);
      if (ex) {
        return c.map((l) =>
          lineKey(l.id, l.option) === key ? { ...l, qty: l.qty + qty } : l
        );
      }
      return [
        ...c,
        { id: current.id, name: current.name, price: current.price, qty, ...(opt ? { option: opt } : {}) },
      ];
    });
    setCurrent(null);
    setChoice(null);
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
          items: cart.map((l) => ({ productId: l.id, qty: l.qty, option: l.option })),
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
      const lines = (data.items as { name: string; qty: number; price: number; option?: string }[])
        .map(
          (i) =>
            `• ${i.name}${i.option ? ` (${i.option})` : ""} × ${i.qty} — ₪${i.price * i.qty}`
        )
        .join("\n");
      const msg =
        `היי ${firstName}! 👋\n` +
        `ראיתי את החנות ואני רוצה להזמין:\n\n${lines}\n\n` +
        `סה"כ: ₪${data.total}` +
        (note.trim() ? `\nהערה: ${note.trim()}` : "") +
        (payLine ? `\n\n${payLine}` : "") +
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
      {/* רצועת הבעלים — נצמדת למעלה, אפור-שחור ולא בערכה של החנות, כדי שיהיה
          ברור שזו המערכת ולא הדף שהקונות רואות. קונה לא מקבלת אותה בכלל. */}
      {owner && (
        <div className="sticky top-0 z-40 bg-[#262626] text-white" dir="rtl">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[11px] opacity-80 leading-tight">
              זו החנות שלך
              <br />
              <span className="opacity-70">ככה הקונות רואות אותה</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <a href="/dashboard" className="relative bg-white text-[#15161B] rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold">
                הזמנות
                {owner.newOrders > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-4 h-4 px-1 rounded-full bg-[#E4405F] text-white text-[9.5px] font-bold flex items-center justify-center">
                    {owner.newOrders}
                  </span>
                )}
              </a>
              <a href="/dashboard/products" className="border border-white/30 rounded-lg px-2.5 py-1.5 text-[11.5px]">
                מוצרים
              </a>
              <a href="/dashboard/settings" className="border border-white/30 rounded-lg px-2.5 py-1.5 text-[11.5px]">
                עיצוב
              </a>
            </div>
          </div>
        </div>
      )}

      {/* hero */}
      <div className="relative">
        <div
          className="h-36 overflow-hidden"
          style={{ background: cover ? undefined : coverCss(store.cover_preset) }}
        >
          {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
        </div>
        <div
          className="absolute -bottom-8 right-1/2 translate-x-1/2 w-18 h-18 flex items-center justify-center text-3xl overflow-hidden"
          style={{
            background: "var(--s-surface)",
            border: "var(--s-border)" as string,
            boxShadow: "var(--s-shadow)" as string,
            width: 72,
            height: 72,
          }}
        >
          {mediaUrl(store.avatar_key) ? (
            <img src={mediaUrl(store.avatar_key)!} alt="" className="w-full h-full object-cover" />
          ) : (
            store.emoji
          )}
        </div>
      </div>

      <div className="text-center pt-10 px-5 pb-4">
        <h1 className="text-2xl font-bold">{store.display_name}</h1>
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
                  className={`text-right overflow-hidden relative transition active:translate-y-[1px] ${out ? "opacity-45 pointer-events-none" : ""}`}
                  style={{
                    background: "var(--s-surface)",
                    border: "var(--s-border)" as string,
                    boxShadow: out ? "none" : ("var(--s-shadow)" as string),
                  }}
                >
                  {out ? (
                    // רצועה על התמונה — קונה סורקת רשת ולא קוראת שבבים קטנים
                    <span className="absolute inset-x-0 top-1/4 z-10 bg-[#262626]/78 text-white text-[13px] font-semibold text-center py-1.5 tracking-wide">
                      אזל
                    </span>
                  ) : (
                    (() => {
                      // תגית אחת לכרטיס, לפי סדר עדיפות. שלוש תגיות ברשת של
                      // שתי עמודות הופכות את כולן לרעש. הצבע קבוע לכל תגית
                      // ולא נגזר מהערכה — "מבצע" חייב להיראות אותו דבר בכל
                      // חנות, אחרת הוא מפסיק להיות שפה משותפת בין החנויות.
                      const key = badgeFor(p, bestSellerId);
                      if (!key) return null;
                      const b = BADGES[key];
                      // רצועה על כל רוחב הכרטיס ולא שבב בפינה: "אחרון במלאי"
                      // ארוך מהכרטיס בטלפון וגלש החוצה. רצועה לא יכולה לגלוש.
                      return (
                        <span
                          className="absolute inset-x-0 top-0 z-10 text-[10.5px] font-semibold text-center py-1"
                          style={{ background: b.bg, color: b.fg }}
                        >
                          {b.emoji} {b.label}
                        </span>
                      );
                    })()
                  )}
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
                  <div className="px-2.5 py-2.5 text-right">
                    <div className="text-[13.5px] font-semibold leading-tight">{p.name}</div>
                    {p.description && (
                      <div className="text-[11px] opacity-60 truncate">{p.description}</div>
                    )}
                    <div className="text-[17px] font-bold mt-1" style={{ color: "var(--s-primary)" }}>
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
          {" · "}
          <a href="/terms" className="underline">תנאים</a>
        </p>
      </div>

      {/* cart bar */}
      <div
        className={`fixed bottom-0 inset-x-0 z-40 flex justify-between items-center px-5 pt-4 pb-5 cursor-pointer transition-transform ${cartCount ? "" : "translate-y-full"}`}
        style={{ background: "var(--s-primary)", color: "var(--s-onprimary)", boxShadow: "0 -2px 16px rgba(0,0,0,0.08)" }}
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

          {/* בחירה — חייבים לבחור לפני הוספה לסל */}
          {current.options && current.options.length > 0 && (
            <div className="mt-4">
              <div className="text-[12px] opacity-60 text-center mb-2">
                {current.option_label || "בחרי"}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {current.options.map((o) => (
                  <button
                    key={o}
                    onClick={() => setChoice(o)}
                    className="text-[13px] font-medium rounded-full px-4 py-2 border-[1.5px] transition"
                    style={
                      choice === o
                        ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                        : { borderColor: "currentColor", opacity: 0.55 }
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
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
            disabled={maxQty(current) === 0 || (!!current.options?.length && !choice)}
            className="w-full rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-40"
            style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
          >
            {maxQty(current) === 0
              ? "אין יותר במלאי"
              : current.options?.length && !choice
                ? `קודם בוחרים ${current.option_label || "אפשרות"}`
                : "הוספה לסל"}
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
            <div key={lineKey(l.id, l.option)} className="flex justify-between text-[13px] py-1">
              <span>
                {l.name}
                {l.option ? ` (${l.option})` : ""} × {l.qty}
              </span>
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
          {paySummary && (
            <div className="rounded-xl border-[1.5px] border-black/10 px-3 py-2.5 text-[12px] leading-relaxed mb-3">
              <span className="font-bold">אפשר לשלם ב:</span> {paySummary}
              {store.payout_note && (
                <div className="opacity-70 mt-0.5">{store.payout_note}</div>
              )}
            </div>
          )}
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
