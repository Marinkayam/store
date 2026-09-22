"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deliveryLine, formatPayPhone, payMethods, paymentLinkLine, payoutLine, payoutSummary, payoutTarget, type PayMethod } from "@/lib/payouts";
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
  /* כתובת מובנית (0046): עיר, רחוב, בניין/בית פרטי — ולבניין גם
     קומה, דירה וקוד כניסה. מה שהשליח באמת צריך. */
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [homeType, setHomeType] = useState<"building" | "private" | null>(null);
  const [shipFloor, setShipFloor] = useState("");
  const [shipApartment, setShipApartment] = useState("");
  const [shipEntryCode, setShipEntryCode] = useState("");
  /* ההזמנה כבר לא קופצת לוואטסאפ — היא נקלטת כאן. כשנבחר ביט/פייבוקס
     ויש לינק תואם, קודם מופיע מסך התשלום ("נשאר רק לשלם") ורק אחרי
     "שילמתי" מגיע האישור — מרינה: אישור לפני תשלום מרגיש כאילו סיימנו. */
  const [confirmed, setConfirmed] = useState<{
    orderNumber: number;
    total: number;
    waUrl: string;
    /** עוד לא עברה את מסך התשלום */
    payFirst: boolean;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  // null = לא בעלת החנות (או שעוד לא נבדק). קונה לא רואה מזה כלום.
  const [owner, setOwner] = useState<{ newOrders: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // אמצעי התשלום שהחנות מקבלת — שמות בלבד, בלי מספרים ובלי פרטי חשבון
  const paySummary = payoutSummary(store);
  const methods = payMethods(store);
  // ברירת מחדל: האמצעי הראשון שהחנות מקבלת. קונה שלא נגעה בכלום עדיין
  // שולחת הזמנה שאומרת איך היא משלמת, במקום "נסגור בוואטסאפ".
  const [payWith, setPayWith] = useState<PayMethod | null>(null);
  const chosenPay = payWith ?? methods[0]?.key ?? null;
  // היעד של האמצעי שנבחר: לינק (פותח את האפליקציה) או מספר להעתקה —
  // ביט ופייבוקס יכולים להוביל לשני אנשים שונים
  const payTarget = payoutTarget(store, chosenPay);

  /** העתקת מספר התשלום — הפעולה של מי שאין לה לינק */
  function copyPayPhone(phone: string) {
    try {
      navigator.clipboard.writeText(phone);
      showToast("המספר הועתק 📋");
    } catch {
      showToast("לא הצלחנו להעתיק — אפשר להקליד אותו");
    }
  }

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

  /* סינון לפי קטגוריה שהמוכרת הגדירה. מוצר יכול לשבת בכמה קטגוריות
     (0046); category הישנה עדיין מכובדת. מוצגות רק קטגוריות שיש בהן
     מוצר — קטגוריה ריקה בצ'יפים היא לחיצה שמובילה ל"אין כלום". */
  const [category, setCategory] = useState<string | null>(null);
  const productCats = (p: PublicProduct): string[] =>
    p.categories?.length ? p.categories : p.category ? [p.category] : [];
  const categories = useMemo(() => {
    const used = new Set(products.flatMap(productCats));
    return (store.categories ?? []).filter((c) => used.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.categories, products]);

  const sorted = useMemo(
    () =>
      [...products]
        .filter((p) => !category || productCats(p).includes(category))
        .sort(
          (a, b) =>
            Number(a.track_stock && a.stock === 0) - Number(b.track_stock && b.stock === 0)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, category]
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
    // טלפון חובה: ההזמנה כבר לא עוברת בוואטסאפ, ובלי מספר אין למוכרת
    // דרך לחזור לקונה. אותה בדיקה רצה גם בשרת.
    if (!buyerPhone.trim()) {
      showToast("צריך מספר טלפון, כדי שהמוכרת תוכל לחזור אלייך");
      return;
    }
    const shipping = store.ships && wantsShipping;
    if (shipping && (shipStreet.trim().length < 2 || shipCity.trim().length < 2)) {
      showToast("למשלוח צריך עיר ורחוב");
      return;
    }
    if (shipping && !homeType) {
      showToast("בניין או בית פרטי? כדי שהשליח ידע");
      return;
    }
    if (shipping && homeType === "building" && (!shipFloor.trim() || !shipApartment.trim())) {
      showToast("לבניין צריך גם קומה ומספר דירה");
      return;
    }
    // הנוסח המלא לתצוגה אצל המוכרת + הפירוק המובנה
    const shipDetails =
      shipping && homeType
        ? {
            street: shipStreet.trim(),
            homeType,
            ...(homeType === "building"
              ? {
                  floor: shipFloor.trim(),
                  apartment: shipApartment.trim(),
                  ...(shipEntryCode.trim() ? { entryCode: shipEntryCode.trim() } : {}),
                }
              : {}),
          }
        : undefined;
    const composedAddress = shipDetails
      ? `${shipDetails.street}${
          homeType === "building"
            ? ` · קומה ${shipFloor.trim()} · דירה ${shipApartment.trim()}${shipEntryCode.trim() ? ` · קוד ${shipEntryCode.trim()}` : ""}`
            : " · בית פרטי"
        }`
      : undefined;
    setSending(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          items: cart.map((l) => ({ productId: l.id, qty: l.qty, option: l.option })),
          note: note.trim() || undefined,
          buyerPhone: buyerPhone.trim(),
          buyerName: buyerName.trim(),
          wantsShipping: store.ships ? wantsShipping : false,
          shipAddress: composedAddress,
          shipCity: shipping ? shipCity.trim() : undefined,
          shipDetails,
          payMethod: chosenPay ?? undefined,
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
      // שתי השורות האלה מתארות את מה ש*הקונה בחרה*, ולא את מה שהדוכן
      // מציע. בעלת הדוכן כבר יודעת מה היא מקבלת ואיך היא מוסרת; מה שהיא
      // צריכה מההודעה זה מה נבחר בפועל בהזמנה הזו.
      const pay = payoutLine(store, chosenPay);
      // הקישור של הילדה נשלח מיד עם ההזמנה — הקונה משלמת בלי לחכות
      // שהילדה תשלח אותו בחזרה. רק כשהוא תואם את אמצעי התשלום שנבחר.
      const payLinkMsg = paymentLinkLine(store, chosenPay);
      const ship = deliveryLine({
        ships: store.ships,
        wantsShipping,
        note: store.shipping_note,
        price: store.shipping_price,
      });
      const shipLine = ship ? `\n${ship}` : "";
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
        (pay ? `\n${pay}` : "") +
        (payLinkMsg ? `\n${payLinkMsg}` : "");

      /* ההזמנה נקלטה במערכת — המוכרת רואה אותה בדשבורד. וואטסאפ ירד
         מ"ההזמנה עצמה" לכפתור קשר למי שמתקשה; ההודעה המוכנה נשארת
         כדי שהשיחה, אם תיפתח, תגיע עם כל ההקשר. */
      setCart([]);
      setNote("");
      setBuyerPhone("");
      setBuyerName("");
      setShipStreet("");
      setShipCity("");
      setHomeType(null);
      setShipFloor("");
      setShipApartment("");
      setShipEntryCode("");
      setWantsShipping(true);
      setOrderOpen(false);
      setConfirmed({
        orderNumber: data.orderNumber,
        total: data.total,
        waUrl: `https://wa.me/${data.phone}?text=${encodeURIComponent(msg)}`,
        // תשלום קודם — רק כשיש לינק שתואם את מה שהיא בחרה (לא במזומן)
        // payTarget כבר מחושב לפי האמצעי שנבחר — קיים = יש מה לשלם עכשיו
        payFirst: !!payTarget,
      });
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
        <div data-testid="preview-banner" className="bg-[var(--warn-bg)] text-[var(--warn-ink)] border-b border-[var(--warn-line)]" dir="rtl">
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

      {/* ── ההודעה של בעלת הדוכן ──
          יושבת בין הכותרת למוצרים בכוונה: מבצע שמופיע מתחת לרשת נקרא
          אחרי שכבר החליטו מה לקנות, וזה בדיוק מאוחר מדי. היא לובשת את
          ערכת הנושא של הדוכן — זו הודעה *שלה*, לא רצועת מערכת. */}
      {store.promo_on && store.promo_text?.trim() && (
        /* pb-4 ולא pb-1: מעל הבאנר יש 16px מה-pb-4 של גוש הכותרת, ולרשת
           אין ריפוד עליון משלה. כל ערך אחר כאן יוצר באנר שנצמד למוצרים
           ומרחף מתחת לכותרת — נראה כאילו הוא שייך לרשת ולא הודעה בפני
           עצמה. שני הצדדים נמדדים בבדיקה, כדי שלא ייפרד בשקט. */
        <div className="px-3 pb-4">
          <div
            data-testid="store-promo"
            className="mx-auto max-w-sm border-[1.5px] px-3.5 py-3 text-center"
            style={{ background: "var(--s-surface)", borderColor: "var(--s-primary)" }}
          >
            <div className="text-[12px] font-bold tracking-wide" style={{ color: "var(--s-primary)" }}>
              {store.promo_title?.trim() || "מבצע החודש"}
            </div>
            <p className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-line">
              {store.promo_text}
            </p>
          </div>
        </div>
      )}

      {/* ── צ'יפים של קטגוריות — רק כשהמוכרת הגדירה ויש בהן מוצרים ── */}
      {categories.length > 0 && (
        <div className="px-3 pb-3 flex gap-1.5 overflow-x-auto" data-testid="category-chips">
          {[null, ...categories].map((c) => {
            const on = category === c;
            return (
              <button
                key={c ?? "__all"}
                onClick={() => setCategory(c)}
                aria-pressed={on}
                className="shrink-0 px-3.5 py-2 text-[12.5px] font-semibold border-[1.5px]"
                style={
                  on
                    ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                    : { background: "var(--s-surface)", borderColor: "currentColor", opacity: 0.7 }
                }
              >
                {c ?? "הכל"}
              </button>
            );
          })}
        </div>
      )}

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
        data-testid="cart-bar"
        role="button"
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
              {/* עד שש בחירות — שורות מלאות ונוחות. מעל זה (יש מוכרות עם
                  30 וריאציות) — רשת צ'יפים, אחרת הגיליון הופך למגילה. */}
              <div className={current.options.length > 6 ? "grid grid-cols-3 gap-1.5" : "flex flex-col gap-2"}>
                {current.options.map((o) => {
                  const on = choice === o;
                  const compact = current.options!.length > 6;
                  if (compact)
                    return (
                      <button
                        key={o}
                        onClick={() => setChoice(o)}
                        aria-pressed={on}
                        aria-label={`${safeOptionLabel(current.option_label)}: ${o}`}
                        className="min-h-11 px-2 py-2 border-2 text-[13px] font-semibold truncate"
                        style={{
                          background: "var(--s-surface)",
                          borderColor: on ? "var(--s-primary)" : "currentColor",
                          color: "var(--s-ink)",
                          opacity: on ? 1 : 0.65,
                          fontWeight: on ? 700 : 500,
                        }}
                      >
                        {o}
                      </button>
                    );
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
          className="fixed bottom-0 inset-x-0 z-50 max-h-[92%] flex flex-col"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          {/* אזור גלילה — הסיכום והכפתור יושבים קבועים מתחתיו */}
          <div className="overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
          <div className="w-9 h-1 bg-current opacity-15 mx-auto mb-5" />
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[19px] font-bold">ההזמנה שלך</h2>
            <span className="text-[12.5px] opacity-55">
              {cartCount === 1 ? "פריט אחד" : `${cartCount} פריטים`}
            </span>
          </div>
          {/* כל שורה ניתנת לעריכה כאן. קונה שרוצה שניים במקום אחד לא אמורה
              לצאת, לנקות את הסל ולהתחיל מחדש — היא פשוט תוותר. */}
          <div className="flex flex-col">
          {cart.map((l) => {
            const max = lineMax(l);
            return (
              <div
                key={lineKey(l.id, l.option)}
                data-cart-line=""
                className="flex items-center gap-3 text-[13.5px] py-3 border-b border-black/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium" data-line-name="">
                    {l.name}
                    {l.option ? ` (${l.option})` : ""}
                  </div>
                  <div className="opacity-50 text-[12px] mt-0.5">₪{l.price} ליחידה</div>
                </div>

                <div className="flex items-center border-[1.5px] border-black/10">
                  <button
                    onClick={() => setLineQty(l.id, l.option, l.qty - 1)}
                    aria-label={`פחות, ${l.name}`}
                    className="w-9 h-9 text-base leading-none active:opacity-60"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-[13.5px] font-bold">{l.qty}</span>
                  <button
                    onClick={() => setLineQty(l.id, l.option, Math.min(max, l.qty + 1))}
                    disabled={l.qty >= max}
                    aria-label={`עוד, ${l.name}`}
                    className="w-9 h-9 text-base leading-none disabled:opacity-25 active:opacity-60"
                  >
                    +
                  </button>
                </div>

                <span className="w-12 text-left font-bold text-[13.5px]">₪{l.price * l.qty}</span>
                <button
                  onClick={() => setLineQty(l.id, l.option, 0)}
                  aria-label={`הסרה, ${l.name}`}
                  className="w-8 h-9 opacity-35 text-[16px] active:opacity-70"
                >
                  ×
                </button>
              </div>
            );
          })}
          </div>

          {cart.length === 0 && (
            <p className="text-[13px] opacity-60 py-8 text-center">
              הסל ריק. אפשר לסגור ולהמשיך לבחור.
            </p>
          )}

          {/* בחירה לכל הזמנה, לא רק הגדרת ברירת מחדל של החנות — קונה שרוצה
              לאסוף בעצמה לא צריכה "לקבל" משלוח שהיא לא ביקשה. */}
          {store.ships && (
            <section className="mt-5">
              <h3 className="text-[13.5px] font-bold mb-2.5">📦 איך תרצי לקבל?</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setWantsShipping(true)}
                  aria-pressed={wantsShipping}
                  className="flex-1 min-h-11 border-[1.5px] text-[13px] font-semibold transition-opacity"
                  style={
                    wantsShipping
                      ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                      : { borderColor: "currentColor", background: "var(--s-surface)", opacity: 0.55 }
                  }
                >
                  משלוח
                </button>
                <button
                  onClick={() => setWantsShipping(false)}
                  aria-pressed={!wantsShipping}
                  className="flex-1 min-h-11 border-[1.5px] text-[13px] font-semibold transition-opacity"
                  style={
                    !wantsShipping
                      ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                      : { borderColor: "currentColor", background: "var(--s-surface)", opacity: 0.55 }
                  }
                >
                  מסירה אישית
                </button>
              </div>
              {wantsShipping && (
                <p className="opacity-55 text-[12.5px] mt-2 leading-relaxed">
                  {store.shipping_note || "בתיאום"}
                  {typeof store.shipping_price === "number" && ` · ₪${store.shipping_price}`}
                </p>
              )}
              {/* משלוח אמיתי צריך יעד מפורק — מה שהשליח באמת שואל.
                  הכל נראה רק למוכרת, לא נכנס לשום דף פומבי. */}
              {wantsShipping && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <label className="flex-1 min-w-0 block">
                      <span className="block text-[11.5px] opacity-60 mb-1">עיר *</span>
                      <input
                        value={shipCity}
                        onChange={(e) => setShipCity(e.target.value)}
                        placeholder="למשל: רמת גן"
                        aria-label="עיר למשלוח"
                        maxLength={40}
                        className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                      />
                    </label>
                    <label className="flex-1 min-w-0 block">
                      <span className="block text-[11.5px] opacity-60 mb-1">רחוב ומספר *</span>
                      <input
                        value={shipStreet}
                        onChange={(e) => setShipStreet(e.target.value)}
                        placeholder="למשל: הרצל 12"
                        aria-label="רחוב למשלוח"
                        maxLength={80}
                        className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    {([["building", "בניין"], ["private", "בית פרטי"]] as const).map(([k, label]) => {
                      const on = homeType === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setHomeType(k)}
                          aria-pressed={on}
                          aria-label={label}
                          className="flex-1 min-h-11 border-[1.5px] text-[13px] font-semibold transition-opacity"
                          style={
                            on
                              ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                              : { borderColor: "currentColor", background: "var(--s-surface)", opacity: 0.55 }
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {homeType === "building" && (
                    <div className="flex gap-2">
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[11.5px] opacity-60 mb-1">קומה *</span>
                        <input
                          value={shipFloor}
                          onChange={(e) => setShipFloor(e.target.value)}
                          placeholder="3"
                          aria-label="קומה"
                          inputMode="numeric"
                          maxLength={6}
                          className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                        />
                      </label>
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[11.5px] opacity-60 mb-1">דירה *</span>
                        <input
                          value={shipApartment}
                          onChange={(e) => setShipApartment(e.target.value)}
                          placeholder="8"
                          aria-label="מספר דירה"
                          inputMode="numeric"
                          maxLength={6}
                          className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                        />
                      </label>
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[11.5px] opacity-60 mb-1">קוד כניסה</span>
                        <input
                          value={shipEntryCode}
                          onChange={(e) => setShipEntryCode(e.target.value)}
                          placeholder="אם יש"
                          aria-label="קוד כניסה"
                          maxLength={12}
                          className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* שם פרטי בלבד — אין כאן שם משפחה או גיל. הטלפון חובה מאז
              שההזמנה נקלטת במערכת: זו הדרך של המוכרת לחזור לקונה. */}
          <section className="mt-5">
            <h3 className="text-[13.5px] font-bold mb-2.5">👋 הפרטים שלך</h3>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <label className="flex-1 min-w-0 block">
                  <span className="block text-[11.5px] opacity-60 mb-1">איך קוראים לך? *</span>
                  <input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="שם פרטי"
                    aria-label="השם שלך"
                    maxLength={24}
                    className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                  />
                </label>
                <label className="flex-1 min-w-0 block">
                  <span className="block text-[11.5px] opacity-60 mb-1">מספר טלפון *</span>
                  <input
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="050-0000000"
                    inputMode="tel"
                    maxLength={20}
                    aria-label="מספר טלפון"
                    className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-[11.5px] opacity-60 mb-1">הערה למוכרת (לא חובה)</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="למשל: אפשר בורוד?"
                  maxLength={200}
                  className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                />
              </label>
            </div>
          </section>
          {(paySummary || payTarget) && (
            <section className="mt-5">
              {/* הקונה בוחרת איך היא משלמת, והמוכרת רואה את הבחירה על
                  ההזמנה. בלי זה כל הזמנה נגמרת ב"ואיך משלמים לך?". */}
              {methods.length > 0 && (
                <>
                  <h3 className="text-[13.5px] font-bold mb-2.5">💜 איך תשלמי?</h3>
                  <div className="flex gap-2">
                    {methods.map((m) => {
                      const on = chosenPay === m.key;
                      return (
                        <button
                          key={m.key}
                          onClick={() => setPayWith(m.key)}
                          aria-pressed={on}
                          aria-label={`תשלום ב${m.label}`}
                          className="flex-1 min-h-11 border-[1.5px] text-[13px] font-semibold transition-opacity"
                          style={
                            on
                              ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                              : { borderColor: "currentColor", background: "var(--s-surface)", opacity: 0.55 }
                          }
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {!methods.length && paySummary && (
                <p className="text-[13px]">
                  <span className="font-bold">אפשר לשלם ב:</span> {paySummary}
                </p>
              )}
              {store.payout_note && (
                <p className="opacity-60 text-[12.5px] mt-2">{store.payout_note}</p>
              )}
              {/* לינק נפתח בלשונית חדשה; מספר מוצג עם העתקה. הסל והטופס
                  נשארים כאן, והקונה חוזרת לשלוח אחרי ששילמה. */}
              {payTarget?.kind === "link" && (
                <a
                  href={payTarget.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 block text-center py-3 text-[13.5px] font-bold"
                  style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
                >
                  {payTarget.label} ←
                </a>
              )}
              {payTarget?.kind === "phone" && (
                <div className="mt-3 flex items-center justify-between gap-2 border-[1.5px] border-black/10 px-3 py-2.5">
                  <span className="text-[13px]">
                    {payTarget.method === "bit" ? "ביט" : "פייבוקס"} למספר{" "}
                    <b dir="ltr" className="text-[14px]">{formatPayPhone(payTarget.phone)}</b>
                  </span>
                  <button
                    onClick={() => copyPayPhone(payTarget.phone)}
                    aria-label="העתקת מספר התשלום"
                    className="shrink-0 px-3 py-2 text-[12.5px] font-bold border-[1.5px]"
                    style={{ borderColor: "var(--s-primary)", color: "var(--s-primary)" }}
                  >
                    העתקה 📋
                  </button>
                </div>
              )}
            </section>
          )}
          </div>

          {/* ── הסיכום והשליחה — קבועים בתחתית, לא נעלמים בגלילה ── */}
          <div
            className="px-5 pt-3 pb-6 border-t border-black/10"
            style={{ background: "var(--s-surface)" }}
          >
            <div className="flex justify-between items-baseline mb-2.5">
              <span className="text-[13.5px] font-bold">סה"כ לתשלום</span>
              <span className="text-[19px] font-bold">₪{cartTotal}</span>
            </div>
            <button
              onClick={sendOrder}
              disabled={sending || cart.length === 0}
              className="w-full py-4 text-[15.5px] font-bold disabled:opacity-40 active:translate-y-px"
              /* צבע הערכה ולא ירוק וואטסאפ: ההזמנה כבר לא יוצאת מהאתר —
                 היא נקלטת כאן, בחנות של הילדה. */
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {sending ? "רגע…" : "שליחת ההזמנה"}
            </button>
            <p className="text-[11.5px] opacity-50 text-center mt-2">
              ההזמנה נשלחת ישר למוכרת, והאישור יופיע כאן.
            </p>
          </div>
        </div>
      )}

      {/* ── אישור הזמנה ──
          מה שחנות טובה מציגה אחרי קנייה: מספר, סכום, איך משלמים, ודרך
          ליצור קשר אם משהו לא ברור. הקונה לא נזרקת לאפליקציה אחרת. */}
      {confirmed && (
        <div
          className="fixed inset-0 bg-black/45 z-40"
          /* סגירה באמצע מסך התשלום לא מעלימה את ההזמנה — עוברים לאישור */
          onClick={() => setConfirmed(confirmed.payFirst ? { ...confirmed, payFirst: false } : null)}
        />
      )}
      {/* מסך התשלום — לפני האישור. ההזמנה כבר שמורה אצל המוכרת, אבל
          הקנייה מרגישה גמורה רק אחרי שמשלמים, אז זה הסדר. */}
      {confirmed?.payFirst && payTarget && (
        <div
          data-testid="order-pay-first"
          className="fixed bottom-0 inset-x-0 z-50 px-5 pt-6 pb-7 text-center"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <div className="text-4xl mb-2" aria-hidden>💳</div>
          <h2 className="text-lg font-bold">נשאר רק לשלם</h2>
          <p className="text-[13px] opacity-75 mt-1 leading-relaxed">
            ההזמנה שלך (#{confirmed.orderNumber}) שמורה אצל המוכרת.
            <br />
            משלמים ₪{confirmed.total} וסוגרים עניין:
          </p>
          {payTarget.kind === "link" ? (
            <a
              href={payTarget.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-4 block py-3.5 text-[15px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.label} · ₪{confirmed.total} ←
            </a>
          ) : (
            <div className="mt-4">
              {/* אין לביט ולפייבוקס כתובת שפותחת העברה עם מספר וסכום —
                  אז נותנים את הדבר הכי קרוב: המספר בענק, והעתקה בלחיצה. */}
              <div
                className="py-3 border-[1.5px]"
                style={{ borderColor: "var(--s-primary)" }}
                data-testid="pay-phone"
              >
                <div className="text-[12px] opacity-60 mb-0.5">
                  {payTarget.method === "bit" ? "מעבירים בביט למספר" : "מעבירים בפייבוקס למספר"}
                </div>
                <div dir="ltr" className="text-[24px] font-bold tracking-wide">
                  {formatPayPhone(payTarget.phone)}
                </div>
              </div>
              <button
                onClick={() => copyPayPhone(payTarget.phone)}
                aria-label="העתקת מספר התשלום"
                className="mt-2 w-full py-3.5 text-[15px] font-bold"
                style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
              >
                העתקת המספר 📋
              </button>
              <p className="text-[12px] opacity-60 mt-2 leading-relaxed">
                פותחים את {payTarget.method === "bit" ? "ביט" : "פייבוקס"} → העברה →
                מדביקים את המספר → ₪{confirmed.total}
              </p>
            </div>
          )}
          <button
            onClick={() => setConfirmed({ ...confirmed, payFirst: false })}
            className="mt-2 w-full py-3 text-[13.5px] font-bold border-[1.5px]"
            style={{ borderColor: "currentColor", opacity: 0.85 }}
          >
            שילמתי ✓
          </button>
          <a
            href={confirmed.waUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-3 block text-[12.5px] opacity-60 underline"
          >
            משהו לא מסתדר? דברי עם המוכרת בוואטסאפ
          </a>
        </div>
      )}

      {confirmed && !confirmed.payFirst && (
        <div
          data-testid="order-confirmed"
          className="fixed bottom-0 inset-x-0 z-50 px-5 pt-6 pb-7 text-center"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <div className="text-4xl mb-2" aria-hidden>🎉</div>
          <h2 className="text-lg font-bold">ההזמנה נשלחה!</h2>
          <p className="text-[13.5px] opacity-75 mt-1">
            הזמנה #{confirmed.orderNumber} · ₪{confirmed.total}
          </p>
          <p className="text-[13px] opacity-70 mt-2 leading-relaxed">
            המוכרת קיבלה את כל הפרטים ותחזור אלייך לטלפון שהשארת.
          </p>
          {payTarget?.kind === "link" && (
            <a
              href={payTarget.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-4 block py-3 text-[14px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.label} · ₪{confirmed.total} ←
            </a>
          )}
          {payTarget?.kind === "phone" && (
            <button
              onClick={() => copyPayPhone(payTarget.phone)}
              aria-label="העתקת מספר התשלום"
              className="mt-4 w-full py-3 text-[14px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.method === "bit" ? "ביט" : "פייבוקס"} · {formatPayPhone(payTarget.phone)} · העתקה 📋
            </button>
          )}
          {/* וואטסאפ נשאר כדרך קשר, לא כדרך הזמנה — ההודעה המוכנה נושאת
              את פרטי ההזמנה כדי שהשיחה תיפתח עם הקשר מלא. */}
          <a
            href={confirmed.waUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 block py-3 text-[13.5px] font-bold border-[1.5px]"
            style={{ borderColor: "currentColor", opacity: 0.85 }}
          >
            יצירת קשר עם המוכרת בוואטסאפ
          </a>
          <button
            onClick={() => setConfirmed(null)}
            className="mt-3 text-[13px] opacity-60 underline"
          >
            סגירה
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
