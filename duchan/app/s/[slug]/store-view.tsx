"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import { payMethods, payoutLine, payoutLink, payoutSummary, type PayMethod } from "@/lib/payouts";
import { BADGES, badgeFor } from "@/lib/badges";
import Icon from "@/app/icons";
import { coverCss } from "@/lib/covers";
import { safeOptionLabel } from "@/lib/product-options";
import type { PublicProduct, PublicStore } from "@/lib/types";

interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
  option?: string; // "ורוד", אותו מוצר בשני צבעים הוא שתי שורות בסל
}

/** מזהה שורת סל: מוצר + בחירה. */
const lineKey = (id: string, option?: string) => `${id}\u0000${option ?? ""}`;

export default function StoreView({
  store,
  products,
  bestSellerId,
  soldIds,
  preview = false,
}: {
  store: PublicStore;
  products: PublicProduct[];
  bestSellerId: string | null;
  /** מוצרים שכבר נמכרו — קובע אם "אחרון במלאי" באמת אומר משהו */
  soldIds: string[];
  /** הדוכן עוד לא פורסם: רואים הכל, אי אפשר להזמין. */
  preview?: boolean;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [current, setCurrent] = useState<PublicProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [choice, setChoice] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [note, setNote] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  // null = לא בעלת החנות (או שעוד לא נבדק). קונה לא רואה מזה כלום.
  const [owner, setOwner] = useState<{ newOrders: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // אמצעי התשלום שהחנות מקבלת — שמות בלבד, בלי מספרים ובלי פרטי חשבון
  const paySummary = payoutSummary(store);
  const payLink = payoutLink(store);
  const methods = payMethods(store);
  // ברירת מחדל: האמצעי הראשון שהחנות מקבלת. קונה שלא נגעה בכלום עדיין
  // שולחת הזמנה שאומרת איך היא משלמת, במקום "נסגור בוואטסאפ".
  const [payWith, setPayWith] = useState<PayMethod | null>(null);
  const chosenPay = payWith ?? methods[0]?.key ?? null;

  // האם הקונה הזו רוצה משלוח או מסירה אישית — בחירה לכל הזמנה, לא הגדרה
  // קבועה של החנות. ברירת המחדל היא מה שהחנות מציעה, כי זו הסיבה שהיא
  // מוצגת מלכתחילה.
  const [wantsShipping, setWantsShipping] = useState(true);

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
   * בעלת/בעל החנות רואה אותה *וגם* את הדרך לניהול; קונים רואים חנות בלבד.
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

  /** מוסיף לסל. מקור אחד גם לגיליון המוצר וגם להוספה המהירה מהרשת. */
  function addLine(p: PublicProduct, amount: number, option?: string) {
    const key = lineKey(p.id, option);
    setCart((c) => {
      const ex = c.find((l) => lineKey(l.id, l.option) === key);
      if (ex) {
        return c.map((l) => (lineKey(l.id, l.option) === key ? { ...l, qty: l.qty + amount } : l));
      }
      return [...c, { id: p.id, name: p.name, price: p.price, qty: amount, ...(option ? { option } : {}) }];
    });
    showToast("נוסף לסל");
  }

  function addToCart() {
    if (!current) return;
    addLine(current, qty, choice ?? undefined);
    setCurrent(null);
    setChoice(null);
  }

  /** שינוי כמות בשורת סל. אפס מוריד את השורה. */
  function setLineQty(id: string, option: string | undefined, next: number) {
    const key = lineKey(id, option);
    setCart((c) =>
      next <= 0
        ? c.filter((l) => lineKey(l.id, l.option) !== key)
        : c.map((l) => (lineKey(l.id, l.option) === key ? { ...l, qty: next } : l))
    );
  }

  /** התקרה לשורה: המלאי, פחות מה שכבר בסל מאותו מוצר בבחירות אחרות. */
  function lineMax(l: CartLine): number {
    const p = products.find((x) => x.id === l.id);
    if (!p || !p.track_stock) return 99;
    const otherLines = cart
      .filter((x) => x.id === l.id && lineKey(x.id, x.option) !== lineKey(l.id, l.option))
      .reduce((s, x) => s + x.qty, 0);
    return Math.max(0, p.stock - otherLines);
  }

  /**
   * הוספה מהירה מהרשת, בלי לפתוח את המוצר.
   *
   * זה המסלול של קונה שכבר יודעת מה היא רוצה — היא לא צריכה לקרוא תיאור
   * כדי לקנות סקוויש שהיא רואה. מוצר עם בחירה (צבע, מידה) עדיין נפתח:
   * אי אפשר להוסיף לסל דבר שלא נבחר, וניחוש כאן יגיע להזמנה שגויה.
   */
  function quickAdd(p: PublicProduct) {
    if (preview) return;
    if (p.options?.length) {
      openProduct(p);
      return;
    }
    if (maxQty(p) === 0) {
      showToast("אין יותר במלאי");
      return;
    }
    addLine(p, 1);
  }

  async function sendOrder() {
    if (!cart.length || sending || preview) return;
    if (buyerName.trim().length < 2) {
      showToast("רק צריך את השם שלך, כדי שהיא תדע מי הזמינה");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          items: cart.map((l) => ({ productId: l.id, qty: l.qty, option: l.option })),
          note: note.trim() || undefined,
          buyerPhone: buyerPhone.trim() || undefined,
          buyerName: buyerName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "משהו השתבש, לנסות שוב");
        return; // לא מנקים את הסל עד שהשרת אישר
      }

      // בונים את הלינק רק אחרי שהשרת ענה — המספר לא יושב ב-HTML
      const lines = (data.items as { name: string; qty: number; price: number; option?: string }[])
        .map(
          (i) =>
            `• ${i.name}${i.option ? ` (${i.option})` : ""} × ${i.qty} · ₪${i.price * i.qty}`
        )
        .join("\n");
      // מה שהדוכן מקבל, לא מה שהקונה הבטיחה: בשלב ההודעה עוד לא שילמו.
      const pay = payoutLine(store);
      // הבחירה בין משלוח למסירה אישית היא של הקונה הזו, לא הגדרה קבועה של
      // החנות — אחרת כל הזמנה "מקבלת" משלוח גם ממי שמעדיפה למסור ביד.
      const shipLine =
        store.ships && wantsShipping
          ? `\nמשלוח: ${store.shipping_note || "בתיאום"}${store.shipping_price ? ` · ₪${store.shipping_price}` : ""}`
          : store.ships
            ? "\nמסירה אישית, בלי משלוח"
            : "";
      // בלי שורת פתיחה ובלי שורת סיום שהבעלות מנסחת: ההודעה קבועה וברורה,
      // ומה שמשתנה בה זה רק מה שהקונה באמת בחרה.
      // שם *הקונה* ומספר ההזמנה יושבים בשורה הראשונה ולא בסוף. ברשימת
      // הצ'אטים בוואטסאפ נראית רק תחילת ההודעה, וכך הרשימה עצמה הופכת
      // לאינדקס.
      //
      // הפתיחה היא "היי" יבש ובלי שם: קודם הופיע כאן שם הדוכן, ומכיוון
      // שדוכן נקרא "סקוויש" או "צמידים" ולא בשם של ילדה, ההודעה יצאה
      // "היי סקוויש!" — נשמע כאילו פונים למוצר.
      const msg =
        `היי! 👋 אני ${data.buyerName} · הזמנה #${data.orderNumber}\n` +
        `ראיתי את הדוכן שלך ואני רוצה להזמין:\n\n${lines}\n\n` +
        `סה"כ: ₪${data.total}` +
        (note.trim() ? `\nהערה: ${note.trim()}` : "") +
        shipLine +
        (pay ? `\n${pay}` : "");

      setCart([]);
      setNote("");
      setBuyerPhone("");
      setBuyerName("");
      setWantsShipping(true);
      setOrderOpen(false);
      window.location.href = `https://wa.me/${data.phone}?text=${encodeURIComponent(msg)}`;
    } catch {
      showToast("אין חיבור, לנסות שוב עוד רגע");
    } finally {
      setSending(false);
    }
  }

  const sold = useMemo(() => new Set(soldIds), [soldIds]);
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
        <div className="sticky top-0 z-40 bg-[var(--ink)] text-white" dir="rtl">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[12px] opacity-80 leading-tight">
              זו החנות שלך
              <br />
              <span className="opacity-70">ככה הקונות רואות אותה</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <a href="/dashboard" className="relative bg-white text-[var(--ink)] px-2.5 py-1.5 text-[12.5px] font-bold">
                הזמנות
                {owner.newOrders > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-4 h-4 px-1 bg-[var(--danger)] text-white text-[9.5px] font-bold flex items-center justify-center">
                    {owner.newOrders}
                  </span>
                )}
              </a>
              <a href="/dashboard/products" className="border border-white/30 px-2.5 py-1.5 text-[12.5px]">
                מוצרים
              </a>
              <a href="/dashboard/settings" className="border border-white/30 px-2.5 py-1.5 text-[12.5px]">
                עיצוב
              </a>
            </div>
          </div>
        </div>
      )}

      {/* תצוגה מקדימה — הדוכן בנוי ונראה, אבל עוד לא נפתח להזמנות.
          הרצועה מחוץ לערכת הנושא בכוונה: זו הודעת מערכת, לא חלק מהחנות. */}
      {preview && (
        <div className="bg-[var(--warn-bg)] text-[var(--warn-ink)] border-b border-[var(--warn-line)]" dir="rtl">
          {owner ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-[12.5px] leading-tight">
                תצוגה מקדימה, אפשר כבר לשלוח את הלינק לחברים
                <br />
                <span className="opacity-75">כדי לקבל הזמנות צריך לפרסם</span>
              </span>
              <a
                href="/activate"
                className="shrink-0 bg-[var(--warn-ink)] text-white px-3 py-2 text-[12.5px] font-bold"
              >
                פרסמי את הדוכן
              </a>
            </div>
          ) : (
            <p className="px-3 py-2 text-[12.5px] text-center leading-tight">
              👀 תצוגה מקדימה, הדוכן הזה עוד לא נפתח להזמנות
            </p>
          )}
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
        {/* תיאור אחד ולא שניים. קודם הופיעו כאן גם המשפט הקצר וגם התיאור
            הארוך, וזה נראה כמו שתי הערות שאומרות את אותו דבר. */}
        {(store.tagline || store.about) && (
          <p className="text-[13px] opacity-80 mt-1.5 leading-relaxed max-w-sm mx-auto whitespace-pre-line">
            {store.tagline || store.about}
          </p>
        )}

        {/* מה שקונה שואלת לפני שהיא קונה: מאיפה, כמה יש, ויש משלוח?
            כל שאלה כזו שנשארת בלי תשובה בדף היא הודעה בוואטסאפ, ולעיתים
            קרובות מכירה שלא נסגרה. */}
        <div className="flex items-center justify-center gap-2 mt-2 text-[12.5px] opacity-70 flex-wrap">
          {store.city && <span>📍 {store.city}</span>}
          {store.city && <span aria-hidden>·</span>}
          <span>{products.length} מוצרים</span>
          {store.ships && (
            <>
              <span aria-hidden>·</span>
              <span>
                משלוח{typeof store.shipping_price === "number" ? ` ₪${store.shipping_price}` : ""}
              </span>
            </>
          )}
        </div>

        {store.ships && store.shipping_note && (
          <div
            className="mt-3 mx-auto max-w-sm border-[1.5px] px-3 py-2 text-[12px] leading-relaxed text-start"
            style={{ borderColor: "currentColor", opacity: 0.75 }}
          >
            <b>משלוחים:</b> {store.shipping_note}
            {typeof store.shipping_price === "number" && ` · ₪${store.shipping_price}`}
          </div>
        )}
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
              const inCartQty = inCart(p.id);
              return (
                // div ולא button: בתוך הכרטיס יש כפתור הוספה מהירה משלו,
                // וכפתור בתוך כפתור אינו HTML תקין ומתנהג שונה בין דפדפנים
                <div
                  key={p.id}
                  className={`text-right overflow-hidden relative flex flex-col ${out ? "opacity-45 pointer-events-none" : ""}`}
                  style={{
                    background: "var(--s-surface)",
                    border: "var(--s-border)" as string,
                    boxShadow: out ? "none" : ("var(--s-shadow)" as string),
                  }}
                >
                <button
                  onClick={() => !out && openProduct(p)}
                  aria-label={p.name}
                  className="text-right transition active:translate-y-[1px]"
                >
                  {out ? (
                    // רצועה על התמונה — קונה סורקת רשת ולא קוראת שבבים קטנים
                    <span className="absolute inset-x-0 top-1/4 z-10 bg-[var(--ink)]/78 text-white text-[13px] font-semibold text-center py-1.5 tracking-wide">
                      אזל
                    </span>
                  ) : (
                    (() => {
                      // תגית אחת לכרטיס, לפי סדר עדיפות. שלוש תגיות ברשת של
                      // שתי עמודות הופכות את כולן לרעש. הצבע קבוע לכל תגית
                      // ולא נגזר מהערכה — "מבצע" חייב להיראות אותו דבר בכל
                      // חנות, אחרת הוא מפסיק להיות שפה משותפת בין החנויות.
                      const key = badgeFor(p, bestSellerId, sold);
                      if (!key) return null;
                      const b = BADGES[key];
                      // שבב קטן בפינת התמונה, לא רצועה על כל הרוחב: ברשת של
                      // שתי עמודות רצועה צבעונית מושכת יותר תשומת לב מהמוצר
                      // עצמו, ושש רצועות זו ליד זו הופכות את הדף לרעש.
                      // הרקע לבן והצבע יושב על הטקסט ועל הקו — קריא על כל תמונה.
                      return (
                        <span
                          className="absolute top-0 right-0 z-10 bg-white text-[11px] font-semibold px-1.5 py-0.5 border-b border-r-0 border-t-0 border-l"
                          style={{ color: b.bg, borderColor: b.bg }}
                        >
                          <Icon name={b.icon} size={12} tone="none" className="inline-block align-[-1px] ms-0.5" />{" "}
                          {b.label}
                        </span>
                      );
                    })()
                  )}
                  <div
                    className="h-40 flex items-center justify-center text-5xl overflow-hidden"
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
                      <div className="text-[12px] opacity-60 truncate">{p.description}</div>
                    )}
                    <div className="text-[17px] font-bold mt-1" style={{ color: "var(--s-primary)" }}>
                      ₪{p.price}
                    </div>
                  </div>
                </button>

                {/* הוספה מהירה — הכפתור שמאפשר לקנות בלי לפתוח כלום */}
                {!out && !preview && (
                  <button
                    onClick={() => quickAdd(p)}
                    aria-label={`הוספה מהירה, ${p.name}`}
                    className="mt-auto mx-2.5 mb-2.5 py-2 text-[12.5px] font-bold"
                    style={
                      inCartQty
                        ? { background: "var(--s-thumb)", color: "var(--s-ink)" }
                        : { background: "var(--s-primary)", color: "var(--s-onprimary)" }
                    }
                  >
                    {inCartQty
                      ? `בסל · ${inCartQty}`
                      : p.options?.length
                        ? `בחירת ${safeOptionLabel(p.option_label)}`
                        : "הוספה לסל"}
                  </button>
                )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-center text-[11px] opacity-45 pt-6 pb-1">
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
          className="px-4 py-1.5 text-[13px] font-bold"
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
          className="fixed bottom-0 inset-x-0 z-50 px-5 pt-3 pb-5 max-h-[88%] overflow-y-auto overscroll-contain flex flex-col gap-4"
          style={{
            background: "var(--s-surface)",
            color: "var(--s-ink)",
            fontFamily: "var(--s-font)",
            // בלי זה, גרירה בתוך הגיליון באייפון מגלגלת את הדף שמאחור
            // והבחירה שיושבת מתחת לקפל פשוט לא מגיעה למסך
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
        >
          <div className="w-9 h-1 bg-current opacity-15 mx-auto -mb-1" />
          <div>
            <div
              className="h-52 flex items-center justify-center text-6xl overflow-hidden"
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
              <p className="text-[12px] opacity-60 text-center mt-1">נשארו {current.stock} במלאי</p>
            )}
          </div>

          {/* בחירה — חייבים לבחור לפני הוספה לסל.
              רשימה פשוטה עם עיגול סימון, לא כפתור מלא-צבע: בלוק צבעוני גדול
              נראה כמו מדבקה או פרסומת, במיוחד כששם האפשרות מוזן לא נכון
              (למשל "לבן" בתור שם השדה במקום כאחת הבחירות) — עדיף שורה
              רגועה וברורה מאשר עיצוב שמנסה "לתקן" ניסוח עם צבע חזק. */}
          {current.options && current.options.length > 0 && (
            <div className="border-t border-current/10 pt-3.5">
              <div className="text-[13px] font-bold text-center mb-2.5 opacity-80">
                {safeOptionLabel(current.option_label)}
              </div>
              <div className="flex flex-col gap-2">
                {current.options.map((o) => {
                  const on = choice === o;
                  return (
                    <button
                      key={o}
                      onClick={() => setChoice(o)}
                      aria-pressed={on}
                      aria-label={`${safeOptionLabel(current.option_label)}: ${o}`}
                      className="w-full text-[15px] px-4 py-3.5 border-2 transition flex items-center justify-between gap-2"
                      style={{
                        background: "var(--s-surface)",
                        borderColor: on ? "var(--s-primary)" : "currentColor",
                        color: "var(--s-ink)",
                        opacity: on ? 1 : 0.65,
                        fontWeight: on ? 700 : 500,
                      }}
                    >
                      {o}
                      <span
                        className="w-5 h-5 flex items-center justify-center shrink-0"
                        style={{
                          borderRadius: "999px",
                          border: `2px solid ${on ? "var(--s-primary)" : "currentColor"}`,
                        }}
                        aria-hidden
                      >
                        {on && (
                          <span
                            className="w-2.5 h-2.5"
                            style={{ borderRadius: "999px", background: "var(--s-primary)" }}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!choice && (
                <p className="text-[12px] text-center mt-2.5 opacity-60">
                  צריך לבחור {safeOptionLabel(current.option_label)} לפני שמוסיפים לסל
                </p>
              )}
            </div>
          )}

          <div className="border-t border-current/10 pt-3.5">
            <div className="text-[12px] opacity-60 text-center mb-2">כמות</div>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="פחות"
                className="w-11 h-11 border-2 border-current opacity-55 disabled:opacity-20 text-xl"
              >
                −
              </button>
              <span className="text-xl font-bold min-w-8 text-center">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(maxQty(current), q + 1))}
                disabled={qty >= maxQty(current)}
                aria-label="עוד"
                className="w-11 h-11 border-2 border-current opacity-55 disabled:opacity-20 text-xl"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={addToCart}
            aria-label="הוספה לסל"
            style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            disabled={preview || maxQty(current) === 0 || (!!current.options?.length && !choice)}
            className="w-full py-4 text-[16px] font-bold disabled:opacity-40 sticky bottom-0"
          >
            {/* בתצוגה מקדימה אומרים את זה על הכפתור עצמו, ולא נותנים להוסיף
                לסל ואז לחסום — חברה שבחרה מוצר ונתקעת חושבת שהחנות שבורה. */}
            {preview
              ? "הדוכן עוד לא נפתח להזמנות"
              : maxQty(current) === 0
                ? "אין יותר במלאי"
                : current.options?.length && !choice
                  ? `קודם בוחרים ${safeOptionLabel(current.option_label)}`
                  : "הוספה לסל"}
          </button>
        </div>
      )}

      {/* order sheet */}
      {orderOpen && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOrderOpen(false)} />
      )}
      {orderOpen && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 px-5 pt-3 pb-7 max-h-[88%] overflow-y-auto"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <div className="w-9 h-1 bg-current opacity-15 mx-auto mb-4" />
          <h2 className="text-base font-bold mb-2.5">ההזמנה שלך</h2>
          {/* כל שורה ניתנת לעריכה כאן. קונה שרוצה שניים במקום אחד לא אמורה
              לצאת, לנקות את הסל ולהתחיל מחדש — היא פשוט תוותר. */}
          {cart.map((l) => {
            const max = lineMax(l);
            return (
              <div
                key={lineKey(l.id, l.option)}
                data-cart-line=""
                className="flex items-center gap-2 text-[13px] py-2 border-b border-black/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate" data-line-name="">
                    {l.name}
                    {l.option ? ` (${l.option})` : ""}
                  </div>
                  <div className="opacity-55 text-[12.5px]">₪{l.price} ליחידה</div>
                </div>

                <div className="flex items-center border-[1.5px] border-black/15">
                  <button
                    onClick={() => setLineQty(l.id, l.option, l.qty - 1)}
                    aria-label={`פחות, ${l.name}`}
                    className="w-8 h-8 text-base leading-none"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-[13px] font-bold">{l.qty}</span>
                  <button
                    onClick={() => setLineQty(l.id, l.option, Math.min(max, l.qty + 1))}
                    disabled={l.qty >= max}
                    aria-label={`עוד, ${l.name}`}
                    className="w-8 h-8 text-base leading-none disabled:opacity-25"
                  >
                    +
                  </button>
                </div>

                <span className="w-14 text-left font-medium">₪{l.price * l.qty}</span>
                <button
                  onClick={() => setLineQty(l.id, l.option, 0)}
                  aria-label={`הסרה, ${l.name}`}
                  className="w-7 h-8 opacity-45 text-[15px]"
                >
                  ×
                </button>
              </div>
            );
          })}

          {cart.length === 0 && (
            <p className="text-[13px] opacity-60 py-6 text-center">
              הסל ריק. אפשר לסגור ולהמשיך לבחור.
            </p>
          )}
          <div className="flex justify-between text-sm font-bold border-t border-black/10 mt-2 pt-2.5">
            <span>סה"כ</span>
            <span>₪{cartTotal}</span>
          </div>

          {/* בחירה לכל הזמנה, לא רק הגדרת ברירת מחדל של החנות — קונה שרוצה
              לאסוף בעצמה לא צריכה "לקבל" משלוח שהיא לא ביקשה. */}
          {store.ships && (
            <div className="border-[1.5px] border-black/10 px-3 py-2.5 text-[12px] leading-relaxed mt-3">
              <div className="font-bold mb-1.5">איך לקבל?</div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setWantsShipping(true)}
                  aria-pressed={wantsShipping}
                  className="flex-1 min-h-10 border-[1.5px] text-[12.5px] font-semibold"
                  style={
                    wantsShipping
                      ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                      : { borderColor: "currentColor", background: "var(--s-thumb)" }
                  }
                >
                  משלוח
                </button>
                <button
                  onClick={() => setWantsShipping(false)}
                  aria-pressed={!wantsShipping}
                  className="flex-1 min-h-10 border-[1.5px] text-[12.5px] font-semibold"
                  style={
                    !wantsShipping
                      ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                      : { borderColor: "currentColor", background: "var(--s-thumb)" }
                  }
                >
                  מסירה אישית
                </button>
              </div>
              {wantsShipping && (
                <p className="opacity-60 text-[12.5px] mt-1.5">
                  {store.shipping_note || "בתיאום"}
                  {typeof store.shipping_price === "number" && ` · ₪${store.shipping_price}`}
                </p>
              )}
            </div>
          )}

          {/* השדה היחיד שהוא חובה בקופה.
              בלעדיו כל ההזמנות אצלה נראות אותו דבר — מספר, מוצרים וסכום —
              והיא צריכה לפתוח צ'אט אחרי צ'אט בוואטסאפ כדי לדעת מי הזמינה
              מה. שם פרטי בלבד; אין כאן שם משפחה, כתובת או גיל. */}
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="איך קוראים לך?"
            aria-label="השם שלך"
            maxLength={24}
            className="w-full border-[1.5px] border-black/20 bg-transparent px-3 py-2.5 text-[13px] mt-3"
          />
          <p className="opacity-60 text-[12px] mb-2 mt-1">
            כדי שהיא תדע איזו הזמנה שלך. רק שם פרטי.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (לא חובה): אפשר בורוד?"
            maxLength={200}
            className="w-full border-[1.5px] border-black/20 bg-transparent px-3 py-2.5 text-[13px] mb-2"
          />
          {/* לא חובה, אבל שווה: איתו היא פותחת איתך שיחה בלחיצה אחת */}
          <input
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
            placeholder="מספר טלפון שלך (לא חובה, כדי שתדע לחזור אלייך)"
            inputMode="tel"
            maxLength={20}
            aria-label="מספר טלפון (לא חובה)"
            className="w-full border-[1.5px] border-black/20 bg-transparent px-3 py-2.5 text-[13px] mb-3"
          />
          {(paySummary || payLink) && (
            <div className="border-[1.5px] border-black/10 px-3 py-2.5 text-[12px] leading-relaxed mb-3">
              {/* הקונה בוחרת איך היא משלמת, וההודעה נושאת את ההוראות לאותו
                  אמצעי. בלי זה כל הזמנה נגמרת ב"ואיך משלמים לך?" בוואטסאפ. */}
              {methods.length > 0 && (
                <>
                  <div className="font-bold mb-1.5">איך תשלמי?</div>
                  <div className="flex gap-1.5 mb-1">
                    {methods.map((m) => {
                      const on = chosenPay === m.key;
                      return (
                        <button
                          key={m.key}
                          onClick={() => setPayWith(m.key)}
                          aria-pressed={on}
                          aria-label={`תשלום ב${m.label}`}
                          className="flex-1 min-h-10 border-[1.5px] text-[12.5px] font-semibold"
                          style={
                            on
                              ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                              : { borderColor: "currentColor", background: "var(--s-thumb)" }
                          }
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="opacity-60 text-[12.5px]">
                    ההוראות ייכנסו להודעה שתישלח בוואטסאפ.
                  </p>
                </>
              )}
              {!methods.length && paySummary && (
                <>
                  <span className="font-bold">אפשר לשלם ב:</span> {paySummary}
                </>
              )}
              {store.payout_note && <div className="opacity-70 mt-0.5">{store.payout_note}</div>}
              {/* לינק התשלום נפתח בלשונית חדשה: הסל והטופס נשארים כאן,
                  והקונה חוזרת לשלוח את ההזמנה אחרי ששילמה. */}
              {payLink && chosenPay === "paybox" && (
                <a
                  href={payLink.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-2 block text-center py-2.5 text-[13px] font-bold"
                  style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
                >
                  {payLink.label} ←
                </a>
              )}
            </div>
          )}
          <p className="text-[12px] opacity-60 text-center mb-3 leading-relaxed">
            ההזמנה תיפתח בוואטסאפ.
            <br />
            שם תסכמו תשלום ומסירה.
          </p>
          <button
            onClick={sendOrder}
            disabled={sending}
            className="w-full py-3.5 text-[15px] font-bold disabled:opacity-40"
            /* ירוק של וואטסאפ ולא צבע הערכה: הכפתור הזה מוציא את הקונה
               מהאתר אל אפליקציה אחרת, והצבע הוא ההבטחה לאן היא הולכת. */
            style={{ background: "var(--whatsapp)", color: "#ffffff" }}
          >
            {sending ? "רגע…" : "שליחה בוואטסאפ"}
          </button>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
