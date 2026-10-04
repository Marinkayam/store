"use client";

import CloseX from "@/app/close-x";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "@/lib/media";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deliveryLine, formatPayPhone, payMethods, paymentLinkLine, payoutLine, payoutSummary, payoutTarget, type PayMethod } from "@/lib/payouts";
import { BADGES, badgeFor } from "@/lib/badges";
import Icon from "@/app/icons";
import CategoryBar from "@/app/category-bar";
import { cleanMeta, layoutOrDefault, sizeOrDefault } from "@/lib/category-style";
import { coverCss } from "@/lib/covers";
import { hasCustomBg, hasPhotoBg, lookOrBase, readablePlate, storeBackground } from "@/lib/looks";
import { themeOrDefault } from "@/lib/themes";
import { safeOptionLabel } from "@/lib/product-options";
import { formatPrice, lineTotal, sumPrices } from "@/lib/money";
import type { PublicProduct, PublicStore } from "@/lib/types";
import { dropTime, dropWhen } from "@/lib/drop";
import DropCountdown from "@/app/drop-countdown";
import MysteryBag from "@/app/mystery-bag";
import { confettiBurst } from "@/app/confetti";

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
  hasCoupons = false,
  buyerConfetti = false,
  footer,
}: {
  store: PublicStore;
  products: PublicProduct[];
  bestSellerId: string | null;
  /** מוצרים שכבר נמכרו — קובע אם "אחרון במלאי" באמת אומר משהו */
  soldIds: string[];
  /** יש בדוכן קופון חי — רק אז מופיע "יש לך קוד קופון?" */
  hasCoupons?: boolean;
  /** קונפטי אחרי הזמנה — קישוט שבעלי הדוכן קנו בקופה */
  buyerConfetti?: boolean;
  /** הדוכן עוד לא פורסם: רואים הכל, אי אפשר להזמין. */
  preview?: boolean;
  /** מה שבא אחרי המוצרים ("רוצה גם דוכן כזה?"). חייב לשבת בתוך השכבה של
   *  הדוכן: מחוץ לה, תמונת הרקע הקבועה נצבעת מעליו ומעלימה אותו. */
  footer?: ReactNode;
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
    /** שיחת תשלום בוואטסאפ — כשהמוכרת הדליקה "לסגור תשלום בוואטסאפ" */
    waPayUrl: string | null;
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

  /* מוצר שאזל יורד מהדוכן לבד, וחוזר כשמוסיפים מלאי — המוכרת לא צריכה
     למחוק אותו. חנות שרוצה להציג אותם עם "אזל" מדליקה את זה בהגדרות. */
  const visibleProducts = useMemo(
    () => (store.show_sold_out ? products : products.filter((p) => !(p.track_stock && p.stock === 0))),
    [products, store.show_sold_out]
  );

  const categories = useMemo(() => {
    const used = new Set(visibleProducts.flatMap(productCats));
    return (store.categories ?? []).filter((c) => used.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.categories, visibleProducts]);

  const sorted = useMemo(
    () =>
      [...visibleProducts]
        .filter((p) => !category || productCats(p).includes(category))
        .sort(
          (a, b) =>
            Number(a.track_stock && a.stock === 0) - Number(b.track_stock && b.stock === 0)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleProducts, category]
  );

  /* "המומלצים" — חלק קבוע בראש הדוכן, לא קטגוריה ולא כפתור. מופיע כשאין
     סינון; כשבוחרים קטגוריה רואים רק אותה. */
  const featured = category ? [] : sorted.filter((p) => p.featured);
  const rest = featured.length ? sorted.filter((p) => !p.featured) : sorted;

  /* ── דרופ (0056) ──
     מוצר עם drop_at בעתיד מוצג עם ספירה לאחור ונעול להזמנה. השעון: שעון
     הטלפון, מתוקן לפי שעון השרת (/api/time). הדף מתרנדר רק ברגע שדרופ
     נפתח — המספרים עצמם מתקתקים בקומפוננטה משלהם (DropCountdown).
     לפני שהדף עלה בדפדפן (SSR) כל דרופ נחשב נעול ובלי שעה — אחרת השרת
     והדפדפן מציירים טקסט שונה. */
  const hasDrops = products.some((p) => p.drop_at);
  const [clock, setClock] = useState<{ now: number; offset: number } | null>(null);
  useEffect(() => {
    if (!hasDrops) return;
    let alive = true;
    setClock({ now: Date.now(), offset: 0 });
    const t0 = Date.now();
    fetch("/api/time", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || typeof d?.now !== "number") return;
        const offset = Math.round(d.now - (t0 + Date.now()) / 2);
        setClock({ now: Date.now() + offset, offset });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hasDrops]);
  const locked = (p: PublicProduct) => {
    const t = dropTime(p.drop_at);
    return t !== null && (clock ? t > clock.now : true);
  };
  // הדרופ הקרוב — לבאנר בראש הדוכן
  const nextDrop = useMemo(() => {
    if (!clock) return null;
    return (
      visibleProducts
        .filter((p) => (dropTime(p.drop_at) ?? 0) > clock.now)
        .sort((a, b) => dropTime(a.drop_at)! - dropTime(b.drop_at)!)[0] ?? null
    );
  }, [visibleProducts, clock]);
  // ברגע שהדרופ הקרוב נפתח — מרנדרים מחדש (הכפתור נפתח) ואומרים את זה
  useEffect(() => {
    if (!clock) return;
    const upcoming = products.map((p) => dropTime(p.drop_at)).filter((t): t is number => t !== null && t > clock.now);
    if (!upcoming.length) return;
    const next = Math.min(...upcoming);
    // setTimeout מוגבל ל-~24.8 ימים; דרופ רחוק יותר פשוט מתוזמן מחדש
    const id = setTimeout(() => {
      const n = Date.now() + clock.offset;
      setClock((c) => c && { ...c, now: n });
      if (n >= next) showToast("🔥 הדרופ נפתח! אפשר להזמין");
    }, Math.min(next - clock.now + 300, 2_000_000_000));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, products]);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = sumPrices(cart.map((l) => lineTotal(l.price, l.qty)));

  /* ── קופון ── השרת מחשב (לפי המחירים בדאטהבייס), כאן רק מציגים.
     כל שינוי בסל בודק את הקוד מחדש — מינימום שכבר לא מתקיים מוריד אותו. */
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; label: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const payable = coupon ? sumPrices([cartTotal, -coupon.discount]) : cartTotal;

  async function applyCoupon(raw: string) {
    const code = raw.trim();
    if (!code) {
      setCouponError("צריך להקליד קוד");
      return;
    }
    setCouponBusy(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          code,
          items: cart.map((l) => ({ productId: l.id, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCoupon(null);
        setCouponError(data.error ?? "לא הצלחנו לבדוק את הקוד. אפשר לנסות שוב");
        return;
      }
      setCoupon({ code: data.code, label: data.label, discount: Number(data.discount) });
      setCouponInput(data.code);
    } catch {
      setCouponError("אין חיבור. הקוד לא נבדק, אפשר לנסות שוב");
    } finally {
      setCouponBusy(false);
    }
  }

  // הסל השתנה → הקוד נבדק שוב (סכום, מינימום)
  const cartSig = cart.map((l) => `${l.id}:${l.qty}`).join(",");
  useEffect(() => {
    if (!coupon) return;
    if (!cart.length) {
      setCoupon(null);
      return;
    }
    applyCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSig]);

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
      return [...c, { id: p.id, name: p.name, price: Number(p.price), qty: amount, ...(option ? { option } : {}) }];
    });
    showToast("נוסף לסל");
  }

  function addToCart() {
    if (!current || locked(current)) return;
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
    if (locked(p)) {
      showToast(p.drop_at && clock ? `נפתח ${dropWhen(p.drop_at)}` : "עוד לא נפתח");
      return;
    }
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
      showToast("צריך לכתוב שם, כדי שבעלי הדוכן ידעו מי הזמין");
      return;
    }
    // טלפון חובה: ההזמנה כבר לא עוברת בוואטסאפ, ובלי מספר אין למוכרת
    // דרך לחזור לקונה. אותה בדיקה רצה גם בשרת.
    if (!buyerPhone.trim()) {
      showToast("צריך מספר טלפון, כדי שבעלי הדוכן יוכלו לחזור אליכם");
      return;
    }
    const shipping = store.ships && wantsShipping;
    if (shipping && (shipStreet.trim().length < 2 || shipCity.trim().length < 2)) {
      showToast("למשלוח צריך עיר ורחוב");
      return;
    }
    // סוג הבית נגזר ממה שמילאו: קומה או דירה = בניין (ואז צריך את שתיהן)
    const homeType: "building" | "private" | null = shipping
      ? shipFloor.trim() || shipApartment.trim() ? "building" : "private"
      : null;
    if (shipping && homeType === "building" && (!shipFloor.trim() || !shipApartment.trim())) {
      showToast("בבניין צריך גם קומה וגם מספר דירה");
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
          couponCode: coupon?.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.field === "coupon") {
          // הקוד נפל בדרך (נוצל, פג). ההזמנה לא נשלחה; הסל והפרטים נשמרו.
          setCoupon(null);
          setCouponOpen(true);
          setCouponError(data.error ?? "הקוד כבר לא תקף");
          showToast("ההזמנה לא נשלחה כי הקוד כבר לא תקף. אפשר לשלוח שוב בלי הקוד");
          return;
        }
        showToast(data.error ?? "משהו השתבש וההזמנה לא נשלחה. אפשר לנסות שוב");
        return; // לא מנקים את הסל עד שהשרת אישר
      }

      // בונים את הלינק רק אחרי שהשרת ענה — המספר לא יושב ב-HTML
      const lines = (data.items as { name: string; qty: number; price: number; option?: string; mystery?: boolean }[])
        .map(
          (i) =>
            `• ${i.mystery ? "🎁 " : ""}${i.name}${i.option ? ` (${i.option})` : ""} × ${i.qty} · ₪${formatPrice(lineTotal(i.price, i.qty))}`
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
        (data.discount
          ? `סכום: ₪${formatPrice(data.subtotal)}\nקופון ${data.couponCode}: −₪${formatPrice(data.discount)}\n`
          : "") +
        `סה"כ: ₪${formatPrice(data.total)}` +
        (note.trim() ? `\nהערה: ${note.trim()}` : "") +
        shipLine +
        (pay ? `\n${pay}` : "") +
        (payLinkMsg ? `\n${payLinkMsg}` : "");

      /* ההזמנה נקלטה במערכת — המוכרת רואה אותה בדשבורד. וואטסאפ ירד
         מ"ההזמנה עצמה" לכפתור קשר למי שמתקשה; ההודעה המוכנה נשארת
         כדי שהשיחה, אם תיפתח, תגיע עם כל ההקשר. */
      setCart([]);
      setCoupon(null);
      setCouponInput("");
      setCouponOpen(false);
      setCouponError("");
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
      /* שיחת תשלום: הודעה קצרה וממוקדת — לא ההזמנה כולה, רק "בואי
         נקבע איך משלמים". המספר מגיע מתשובת השרת, לא מה-HTML. */
      const waPayUrl = store.payout_whatsapp
        ? `https://wa.me/${data.phone}?text=${encodeURIComponent(
            chosenPay === "bit" || chosenPay === "paybox"
              ? `היי! שלחתי עכשיו הזמנה #${data.orderNumber} בדוכן שלך 🛍️ (סה"כ ₪${formatPrice(data.total)}). בחרתי לשלם ב${chosenPay === "bit" ? "ביט" : "פייבוקס"} — לאן להעביר?`
              : `היי! שלחתי עכשיו הזמנה #${data.orderNumber} בדוכן שלך 🛍️ (סה"כ ₪${formatPrice(data.total)}). איך הכי נוח לך שאשלם?`
          )}`
        : null;
      setConfirmed({
        orderNumber: data.orderNumber,
        total: data.total,
        waUrl: `https://wa.me/${data.phone}?text=${encodeURIComponent(msg)}`,
        waPayUrl,
        // יש מה לסגור עכשיו: יעד דיגיטלי, או שיחת תשלום שהמוכרת הדליקה.
        // מזומן = אין מה לשלם מרחוק.
        payFirst: (!!payTarget || !!waPayUrl) && chosenPay !== "cash",
      });
      if (buyerConfetti) {
        for (let i = 0; i < 3; i++) setTimeout(() => confettiBurst(window.innerWidth / 2, window.innerHeight * 0.45, 18), i * 220);
      }
    } catch {
      showToast("אין חיבור, ההזמנה לא נשלחה. אפשר לנסות שוב עוד רגע");
    } finally {
      setSending(false);
    }
  }

  const sold = useMemo(() => new Set(soldIds), [soldIds]);
  const roundedLook = lookOrBase(store.look).radius !== "0px";
  const theme = themeOrDefault(store.theme);
  const bgPhoto = mediaUrl(store.bg_key ?? null);
  const photoBg = hasPhotoBg(store.bg_pattern, bgPhoto);
  /* נבחר רקע — טקסט שיושב ישירות על הדף (שם, תיאור, שורת הפרטים, הקרדיט)
     עובר ללוח קריא. בלי רקע הדף נשאר בדיוק כמו שהיה. */
  const customBg = hasCustomBg(store.bg_pattern, bgPhoto);
  const plate = customBg ? readablePlate(theme) : undefined;
  const cover = mediaUrl(store.cover_key);

  /** כרטיס מוצר אחד ברשת. משותף לחלק המומלצים ולשאר המוצרים. */
  const renderCard = (p: PublicProduct, i: number) => {
              const out = p.track_stock && p.stock === 0;
              const isLocked = !out && locked(p);
              const img = mediaUrl(p.image_key);
              const vid = mediaUrl(p.video_key);
              const poster = mediaUrl(p.poster_key);
              const inCartQty = inCart(p.id);
              return (
                // div ולא button: בתוך הכרטיס יש כפתור הוספה מהירה משלו,
                // וכפתור בתוך כפתור אינו HTML תקין ומתנהג שונה בין דפדפנים
                <div
                  key={p.id}
                  // אזל: הכרטיס עצמו נשאר אטום ורק התוכן דוהה — כרטיס שקוף על
                  // רקע של דוגמה או תמונה נראה כמו כתם
                  className={`s-r text-right overflow-hidden relative flex flex-col ${out ? "pointer-events-none" : ""}`}
                  style={{
                    background: "var(--s-surface)",
                    border: "var(--s-border)" as string,
                    boxShadow: out ? "none" : ("var(--s-shadow)" as string),
                  }}
                >
                <button
                  onClick={() => !out && openProduct(p)}
                  aria-label={p.name}
                  className={`text-right transition active:translate-y-[1px] ${out ? "opacity-45" : ""}`}
                >
                  {out ? (
                    // רצועה על התמונה — קונה סורקת רשת ולא קוראת שבבים קטנים
                    <span className="absolute inset-x-0 top-1/4 z-10 bg-[var(--ink)]/78 text-white text-[13px] font-semibold text-center py-1.5 tracking-wide">
                      אזל
                    </span>
                  ) : isLocked ? (
                    // דרופ שעוד לא נפתח: רצועה עם ספירה לאחור, באותו מקום של "אזל"
                    <span
                      className="absolute inset-x-0 top-1/4 z-10 bg-[var(--ink)]/85 text-white text-[13px] font-bold text-center py-1.5"
                      data-testid="drop-strip"
                    >
                      🔥 דרופ{" "}
                      {clock && p.drop_at ? (
                        <>· <DropCountdown at={dropTime(p.drop_at)!} offset={clock.offset} /></>
                      ) : (
                        "· בקרוב"
                      )}
                    </span>
                  ) : p.is_mystery ? (
                    <span
                      className={`absolute z-10 bg-white text-[11px] font-semibold px-1.5 py-0.5 ${
                        roundedLook ? "top-2 right-2 border s-r" : "top-0 right-0 border-b border-r-0 border-t-0 border-l"
                      }`}
                      style={{ color: "var(--s-primary-text)", borderColor: "currentColor" }}
                      data-testid="mystery-chip"
                    >
                      🎁 הפתעה
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
                          className={`absolute z-10 bg-white text-[11px] font-semibold px-1.5 py-0.5 ${
                            // בסגנון עגול הפינה נחתכת — אז השבב זז פנימה והופך לגלולה
                            roundedLook ? "top-2 right-2 border s-r" : "top-0 right-0 border-b border-r-0 border-t-0 border-l"
                          }`}
                          style={{ color: b.text, borderColor: b.bg }}
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
                    ) : p.is_mystery ? (
                      <MysteryBag className="w-24 h-24" />
                    ) : (
                      <span className="squish" style={{ animationDelay: `${i * 0.4}s` }}>🛍️</span>
                    )}
                  </div>
                  <div className="px-3.5 pt-3 pb-2 text-right">
                    <div className="text-[13.5px] font-semibold leading-snug">{p.name}</div>
                    {p.description && (
                      <div className="text-[12px] opacity-75 truncate">{p.description}</div>
                    )}
                    <div className="text-[17px] font-bold mt-1.5" style={{ color: "var(--s-primary-text)" }}>
                      ₪{formatPrice(p.price)}
                    </div>
                  </div>
                </button>

                {/* הוספה מהירה — הכפתור שמאפשר לקנות בלי לפתוח כלום */}
                {!out && !preview && isLocked && (
                  <div
                    className="mt-auto mx-3.5 mb-3.5 py-2.5 text-[12px] font-bold text-center"
                    style={{ background: "var(--s-thumb)", color: "var(--s-ink)" }}
                    data-testid="drop-locked"
                  >
                    🔒 {clock && p.drop_at ? `נפתח ${dropWhen(p.drop_at)}` : "נפתח בקרוב"}
                  </div>
                )}
                {!out && !preview && !isLocked && (
                  <button
                    onClick={() => quickAdd(p)}
                    aria-label={`הוספה מהירה, ${p.name}`}
                    className="mt-auto mx-3.5 mb-3.5 py-2.5 text-[12.5px] font-bold"
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
  };

  return (
    <div
      className="s-look relative min-h-screen flex flex-col"
      style={{
        // הרקע שהמוכרת בחרה (lib/looks.ts). בלי בחירה — הרקע השטוח של הערכה.
        // תמונה יושבת בשכבה נפרדת למטה; כאן רק הצבע שמתחתיה.
        background: photoBg ? theme.bg : storeBackground(theme, store.bg_pattern, bgPhoto),
        color: "var(--s-ink)",
        fontFamily: "var(--s-font)",
        // השכבה הקבועה (z שלילי) נצבעת מעל הרקע של הדף ומתחת לתוכן
        isolation: "isolate",
      }}
    >
      {/* תמונת הרקע: קבועה בגובה המסך ולא מתוחה על כל הדף — בדוכן ארוך
          cover על כל הגובה הגדיל אותה פי כמה, ו-attachment: fixed לא עובד באייפון */}
      {photoBg && (
        <div
          aria-hidden
          data-testid="store-bg-photo"
          className="fixed inset-0 -z-10 pointer-events-none"
          style={{ background: storeBackground(theme, store.bg_pattern, bgPhoto) }}
        />
      )}
      {/* רצועת הבעלים — נצמדת למעלה, אפור-שחור ולא בערכה של החנות, כדי שיהיה
          ברור שזו המערכת ולא הדף שהקונות רואות. קונה לא מקבלת אותה בכלל. */}
      {owner && (
        <div className="sticky top-0 z-40 bg-[var(--ink)] text-white" dir="rtl">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[12px] opacity-80 leading-tight">
              זה הדוכן שלך
              <br />
              <span className="opacity-70">ככה הקונים רואים אותו</span>
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
                תצוגה מקדימה: אפשר כבר לשלוח את הלינק לחברים
                <br />
                <span className="opacity-75">ההזמנות נפתחות אחרי פרסום הדוכן</span>
              </span>
              <a
                href="/activate"
                className="shrink-0 bg-[var(--warn-ink)] text-white px-3 py-2 text-[12.5px] font-bold"
              >
                לפרסם את הדוכן
              </a>
            </div>
          ) : (
            <p className="px-3 py-2 text-[12.5px] text-center leading-tight">
              👀 תצוגה מקדימה: הדוכן הזה עוד לא נפתח להזמנות
            </p>
          )}
        </div>
      )}

      {/* hero */}
      <div className="relative">
        <div
          data-testid="store-cover"
          className="h-36 overflow-hidden"
          // רקע שנבחר רץ מלמעלה — קאבר מוכן מעליו היה רקע שני שמתחרה בו.
          // תמונת קאבר שהועלתה עדיין גוברת.
          style={{ background: cover || customBg ? undefined : coverCss(store.cover_preset) }}
        >
          {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
        </div>
        <div
          className="s-r absolute z-10 -bottom-8 right-1/2 translate-x-1/2 w-18 h-18 flex items-center justify-center text-3xl overflow-hidden"
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

      <div
        data-testid="store-header"
        className={customBg ? "s-r text-center pt-10 px-4 pb-5 mx-4 mt-2 mb-5" : "text-center pt-10 px-5 pb-4"}
        // הלוח לובש את הקו והצל של הסגנון, כמו כרטיסי המוצרים שמתחתיו
        style={plate && { ...plate, border: "var(--s-border)", boxShadow: "var(--s-shadow)" }}
      >
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
          <span>{visibleProducts.length === 1 ? "מוצר אחד" : `${visibleProducts.length} מוצרים`}</span>
          {store.ships && (
            <>
              <span aria-hidden>·</span>
              <span>
                משלוח{typeof store.shipping_price === "number" ? ` ₪${formatPrice(store.shipping_price)}` : ""}
              </span>
            </>
          )}
        </div>

        {store.ships && store.shipping_note && (
          <div
            className="s-r mt-3 mx-auto max-w-sm border-[1.5px] px-3 py-2 text-[12px] leading-relaxed text-start"
            style={{ borderColor: "currentColor", opacity: 0.75 }}
          >
            <b>משלוחים:</b> {store.shipping_note}
            {typeof store.shipping_price === "number" && ` · ₪${formatPrice(store.shipping_price)}`}
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
        <div className="px-4 pb-4">
          <div
            data-testid="store-promo"
            className="s-r mx-auto max-w-sm border-[1.5px] px-3.5 py-3 text-center"
            style={{ background: "var(--s-surface)", borderColor: "var(--s-primary)" }}
          >
            <div className="text-[12px] font-bold tracking-wide" style={{ color: "var(--s-primary-text)" }}>
              {store.promo_title?.trim() || "מבצע החודש"}
            </div>
            <p className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-line">
              {store.promo_text}
            </p>
          </div>
        </div>
      )}

      {/* ── קטגוריות — רק כשהמוכרת הגדירה ויש בהן מוצרים. הצורה, הגודל
          והאייקונים לפי מה שהיא עיצבה (lib/category-style.ts) ── */}
      {categories.length > 0 && (
        <CategoryBar
          categories={categories}
          active={category}
          onSelect={setCategory}
          layout={layoutOrDefault(store.category_layout)}
          size={sizeOrDefault(store.category_size)}
          meta={cleanMeta(store.category_meta)}
        />
      )}

      {/* באנר הדרופ הקרוב — לוחצים ופותחים את המוצר */}
      {nextDrop && clock && !category && (
        <div className="px-4 mb-3.5">
          <button
            onClick={() => openProduct(nextDrop)}
            data-testid="drop-banner"
            className="s-r w-full px-4 py-3 text-right flex items-center justify-between gap-3"
            style={{ background: "var(--s-ink)", color: "var(--s-surface)" }}
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-extrabold">🔥 דרופ: {nextDrop.name}</span>
              <span className="block text-[12px] opacity-80">{dropWhen(nextDrop.drop_at!)}</span>
            </span>
            <span className="shrink-0 text-[16px] font-extrabold">
              <DropCountdown at={dropTime(nextDrop.drop_at)!} offset={clock.offset} />
            </span>
          </button>
        </div>
      )}

      {/* grid */}
      <div className={`flex-1 px-4 ${footer ? "pb-6" : "pb-24"}`} ref={gridRef}>
        {sorted.length === 0 ? (
          <div className="text-center pt-14">
            <p className={customBg ? "s-r inline-block text-sm px-4 py-2" : "text-sm opacity-75"} style={plate}>
              {/* יש מוצרים אבל כולם אזלו — לא "אין כאן כלום", שנראה כמו דוכן נטוש */}
              {products.length > 0 ? "הכל נמכר! 🎉 מוצרים חדשים בקרוב" : "עוד אין כאן מוצרים."}
            </p>
          </div>
        ) : featured.length ? (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-3.5" data-testid="featured-section">
              <SectionTitle text={store.featured_title?.trim() || "המומלצים שלי"} star plate={plate} testId="featured-title" />
              <div className="grid grid-cols-2 gap-3.5">{featured.map((p, i) => renderCard(p, i))}</div>
            </section>
            {rest.length > 0 && (
              <section className="flex flex-col gap-3.5 mt-3">
                <SectionTitle text="עוד מוצרים" plate={plate} testId="rest-title" />
                <div className="grid grid-cols-2 gap-3.5">{rest.map((p, i) => renderCard(p, featured.length + i))}</div>
              </section>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">{sorted.map((p, i) => renderCard(p, i))}</div>
        )}
        <p
          className={customBg ? "s-r w-fit mx-auto mt-6 mb-1 px-3 py-1.5 text-center text-[11px]" : "text-center text-[11px] opacity-75 pt-6 pb-1"}
          style={plate}
        >
          {store.display_name} ·{" "}
          <a href="/" className="underline">
            נבנה בדוכן
          </a>
          {" · "}
          <a href="/terms" className="underline">תנאים</a>
        </p>
      </div>
      {footer}

      {/* cart bar */}
      <div
        data-testid="cart-bar"
        role="button"
        className={`s-sheet fixed bottom-0 inset-x-0 z-40 flex justify-between items-center px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] cursor-pointer transition-transform ${cartCount ? "" : "translate-y-full"}`}
        style={{ background: "var(--s-primary)", color: "var(--s-onprimary)", boxShadow: "0 -2px 16px rgba(0,0,0,0.08)" }}
        onClick={() => cartCount && setOrderOpen(true)}
      >
        <span className="text-sm">{cartCount === 1 ? "פריט אחד" : `${cartCount} פריטים`} · ₪{formatPrice(cartTotal)}</span>
        <span
          className="s-r px-4 py-1.5 text-[13px] font-bold"
          style={{ background: "var(--s-onprimary)", color: "var(--s-primary)" }}
        >
          להזמנה
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
          className="s-sheet fixed bottom-0 inset-x-0 z-50 px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88%] overflow-y-auto overscroll-contain flex flex-col gap-4"
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
          <div className="flex items-center justify-between -mb-2">
            <span className="w-11" aria-hidden />
            <div className="w-9 h-1 bg-current opacity-15" />
            <CloseX onClick={() => setCurrent(null)} testid="product-close" />
          </div>
          <div>
            <div
              className="s-r h-52 flex items-center justify-center text-6xl overflow-hidden"
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
              ) : current.is_mystery ? (
                <MysteryBag className="w-32 h-32" />
              ) : (
                "🛍️"
              )}
            </div>
            <h2 className="text-lg font-bold text-center mt-3">{current.name}</h2>
            {current.description && (
              <p className="text-[13px] opacity-70 text-center mt-1 leading-relaxed">{current.description}</p>
            )}
            <p className="text-xl font-bold text-center mt-2" style={{ color: "var(--s-primary-text)" }}>
              ₪{formatPrice(current.price)}
            </p>
            {current.track_stock && current.stock <= 3 && (
              <p className="text-[12px] opacity-75 text-center mt-1">{current.stock === 1 ? "נשאר אחד במלאי" : `נשארו ${current.stock} במלאי`}</p>
            )}
            {current.is_mystery && (
              <p className="text-[13px] font-semibold text-center mt-2" data-testid="mystery-note">
                🤫 מה בפנים? זו ההפתעה!
              </p>
            )}
            {locked(current) && (
              <div className="s-r mt-3 px-4 py-3 text-center" style={{ background: "var(--s-thumb)" }} data-testid="drop-box">
                <div className="text-[15px] font-extrabold">
                  🔥 דרופ!{" "}
                  {clock && current.drop_at ? (
                    <>נפתח בעוד <DropCountdown at={dropTime(current.drop_at)!} offset={clock.offset} /></>
                  ) : (
                    "נפתח בקרוב"
                  )}
                </div>
                {clock && current.drop_at && (
                  <div className="text-[12.5px] opacity-80 mt-0.5">{dropWhen(current.drop_at)}</div>
                )}
              </div>
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
                          opacity: on ? 1 : 0.75,
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
                        opacity: on ? 1 : 0.75,
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
                <p className="text-[12px] text-center mt-2.5 opacity-75">
                  צריך לבחור {safeOptionLabel(current.option_label)} לפני שמוסיפים לסל
                </p>
              )}
            </div>
          )}

          <div className="border-t border-current/10 pt-3.5">
            <div className="text-[12px] opacity-75 text-center mb-2">כמות</div>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="פחות"
                className="w-11 h-11 border-2 border-current opacity-75 disabled:opacity-20 text-xl"
              >
                −
              </button>
              <span className="text-xl font-bold min-w-8 text-center">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(maxQty(current), q + 1))}
                disabled={qty >= maxQty(current)}
                aria-label="עוד"
                className="w-11 h-11 border-2 border-current opacity-75 disabled:opacity-20 text-xl"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={addToCart}
            aria-label="הוספה לסל"
            style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            disabled={preview || locked(current) || maxQty(current) === 0 || (!!current.options?.length && !choice)}
            className="w-full py-4 text-[16px] font-bold disabled:opacity-40 sticky bottom-0"
          >
            {/* בתצוגה מקדימה אומרים את זה על הכפתור עצמו, ולא נותנים להוסיף
                לסל ואז לחסום — חברה שבחרה מוצר ונתקעת חושבת שהחנות שבורה. */}
            {preview
              ? "הדוכן עוד לא נפתח להזמנות"
              : locked(current)
                ? "🔒 עוד לא נפתח"
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
          className="s-sheet fixed bottom-0 inset-x-0 z-50 max-h-[92%] flex flex-col"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          {/* אזור גלילה — הסיכום והכפתור יושבים קבועים מתחתיו */}
          <div className="overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
          <div className="w-9 h-1 bg-current opacity-15 mx-auto mb-5" />
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[19px] font-bold">ההזמנה שלך</h2>
            <span className="flex items-center gap-2">
              <span className="text-[12.5px] opacity-75">
                {cartCount === 1 ? "פריט אחד" : `${cartCount} פריטים`}
              </span>
              <CloseX onClick={() => setOrderOpen(false)} testid="order-close" />
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
                className="flex items-center gap-3 text-[13.5px] py-3.5 border-b border-black/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium" data-line-name="">
                    {l.name}
                    {l.option ? ` (${l.option})` : ""}
                  </div>
                  <div className="opacity-75 text-[12px] mt-0.5">₪{formatPrice(l.price)} ליחידה</div>
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

                <span className="w-12 text-left font-bold text-[13.5px]">₪{formatPrice(lineTotal(l.price, l.qty))}</span>
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
            <p className="text-[13px] opacity-75 py-8 text-center">
              הסל ריק. אפשר לסגור ולהמשיך לבחור.
            </p>
          )}

          {/* ── קוד קופון — רק בדוכן שיש בו קופון חי, ומקופל כברירת מחדל:
              שדה פתוח שולח את כל מי שאין לה קוד לחפש אחד ── */}
          {/* בעלת הדוכן שמזמינה מעצמה ועוד אין לה קופון — רואה רק היא, ושולח
              ליצירה. קונות לא רואות כלום עד שיש קופון חי. */}
          {!hasCoupons && owner && cart.length > 0 && (
            <a
              href="/dashboard/settings#coupons"
              data-testid="coupon-owner-hint"
              className="mt-4 flex items-center gap-2 border-[1.5px] border-dashed px-3.5 py-3 text-[12.5px] leading-snug"
              style={{ borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}
            >
              <span aria-hidden>🏷️</span>
              <span className="flex-1">
                <b>קופונים:</b> עוד אין לך קופון בדוכן, אז הקונים לא רואים כאן שדה קוד.
                <span className="block opacity-75">ההודעה הזו מופיעה רק לך.</span>
              </span>
              <span className="font-bold underline shrink-0">ליצירת קופון ←</span>
            </a>
          )}

          {hasCoupons && cart.length > 0 && (
            <div className="mt-4" data-testid="coupon-box">
              {coupon ? (
                <div
                  data-testid="coupon-applied"
                  className="s-r flex items-center gap-2 px-3.5 py-3 border-2"
                  style={{ borderColor: "var(--s-primary)" }}
                >
                  <span aria-hidden>🏷️</span>
                  <span className="flex-1 min-w-0 text-[13px]">
                    {/* הקוד באנגלית ומספרים — בתוך bdi, אחרת הוא מערבב את כיוון השורה */}
                    <span className="block font-extrabold tracking-wider"><bdi>{coupon.code}</bdi></span>
                    <span className="block text-[12px] opacity-75">
                      {coupon.label} · חסכת <bdi>₪{formatPrice(coupon.discount)}</bdi>
                    </span>
                  </span>
                  <button
                    onClick={() => { setCoupon(null); setCouponInput(""); setCouponError(""); }}
                    className="text-[12px] underline opacity-70 min-h-11 px-1"
                  >
                    הסרה
                  </button>
                </div>
              ) : !couponOpen ? (
                <button
                  onClick={() => setCouponOpen(true)}
                  data-testid="coupon-open"
                  className="text-[13px] font-semibold underline underline-offset-4 min-h-11"
                >
                  🏷️ יש לך קוד קופון?
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="coupon-code" className="text-[12px] opacity-70">קוד קופון</label>
                    {/* מרינה: "קוד קופון — תן אופציה לבטל לסגור" */}
                    <button
                      type="button"
                      onClick={() => { setCouponOpen(false); setCouponInput(""); setCouponError(""); }}
                      data-testid="coupon-cancel"
                      className="text-[12.5px] underline opacity-75 min-h-11 px-1"
                    >
                      ביטול
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="coupon-code"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon(couponInput)}
                      aria-label="קוד קופון"
                      aria-invalid={!!couponError}
                      aria-describedby={couponError ? "coupon-error" : undefined}
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={20}
                      placeholder="הקוד שקיבלת"
                      className="flex-1 min-w-0 border-[1.5px] border-black/15 px-3 py-3 text-[14px] tracking-wide"
                      style={{ background: "var(--s-surface)" }}
                    />
                    <button
                      onClick={() => applyCoupon(couponInput)}
                      disabled={couponBusy}
                      data-testid="coupon-apply"
                      className="shrink-0 px-5 text-[13.5px] font-bold disabled:opacity-50"
                      style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
                    >
                      {couponBusy ? "בודקים…" : "הפעלה"}
                    </button>
                  </div>
                  {couponError && (
                    <p id="coupon-error" role="alert" data-testid="coupon-error" className="text-[12.5px] text-[var(--danger)] leading-snug">
                      {couponError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* בחירה לכל הזמנה, לא רק הגדרת ברירת מחדל של החנות — קונה שרוצה
              לאסוף בעצמה לא צריכה "לקבל" משלוח שהיא לא ביקשה. */}
          {store.ships && (
            <section className="mt-8">
              <h3 className="text-[13.5px] font-bold mb-3">📦 איך לקבל את ההזמנה?</h3>
              <PickRows
                label="איך לקבל את ההזמנה"
                value={wantsShipping ? "ship" : "pickup"}
                onChange={(v) => setWantsShipping(v === "ship")}
                options={[
                  {
                    key: "ship",
                    title: "🚚 משלוח",
                    sub: [store.shipping_note || "עד הבית", typeof store.shipping_price === "number" ? `₪${formatPrice(store.shipping_price)}` : ""]
                      .filter(Boolean).join(" · "),
                  },
                  { key: "pickup", title: "🤝 מסירה אישית", sub: "קובעים עם בעלי הדוכן איפה ומתי" },
                ]}
              />
              {/* כתובת — טופס רגיל: עיר, רחוב, ואם גרים בבניין גם קומה ודירה.
                  קודם היו כאן כפתורי "בניין / בית פרטי" בלי כותרת, ומרינה:
                  "זה לא התנהגות נורמלית ומבלבלת". עכשיו סוג הבית נגזר ממה שמילאו. */}
              {wantsShipping && (
                <div className="mt-5 flex flex-col gap-4" data-testid="ship-address">
                  <h3 className="text-[13.5px] font-bold">🏠 לאן לשלוח?</h3>
                  <label className="block">
                    <span className="block text-[12px] opacity-75 mb-1.5">עיר *</span>
                    <input
                      value={shipCity}
                      onChange={(e) => setShipCity(e.target.value)}
                      placeholder="למשל: רמת גן"
                      aria-label="עיר למשלוח"
                      autoComplete="address-level2"
                      maxLength={40}
                      className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[12px] opacity-75 mb-1.5">רחוב ומספר בית *</span>
                    <input
                      value={shipStreet}
                      onChange={(e) => setShipStreet(e.target.value)}
                      placeholder="למשל: הרצל 12"
                      aria-label="רחוב למשלוח"
                      autoComplete="address-line1"
                      maxLength={80}
                      className="w-full border-[1.5px] border-black/15 bg-transparent px-3 py-3 text-[14px]"
                    />
                  </label>
                  <div>
                    <span className="block text-[12px] opacity-75 mb-1.5">גרים בבניין? ממלאים גם קומה ודירה (בבית פרטי — משאירים ריק)</span>
                    <div className="flex gap-3">
                      <label className="flex-1 min-w-0 block">
                        <span className="block text-[11.5px] opacity-75 mb-1">קומה</span>
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
                        <span className="block text-[11.5px] opacity-75 mb-1">דירה</span>
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
                        <span className="block text-[11.5px] opacity-75 mb-1">קוד כניסה</span>
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
                  </div>
                </div>
              )}
            </section>
          )}

          {/* שם פרטי בלבד — אין כאן שם משפחה או גיל. הטלפון חובה מאז
              שההזמנה נקלטת במערכת: זו הדרך של המוכרת לחזור לקונה. */}
          <section className="mt-8">
            <h3 className="text-[13.5px] font-bold mb-3.5">👋 הפרטים שלך</h3>
            <div className="flex flex-col gap-4">
              <div className="flex gap-3">
                <label className="flex-1 min-w-0 block">
                  <span className="block text-[11.5px] opacity-75 mb-1.5">איך קוראים לך? *</span>
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
                  <span className="block text-[11.5px] opacity-75 mb-1.5">מספר טלפון *</span>
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
                <span className="block text-[11.5px] opacity-75 mb-1.5">הערה לבעלי הדוכן (לא חובה)</span>
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
            <section className="mt-8">
              {/* הקונה בוחרת איך היא משלמת, והמוכרת רואה את הבחירה על
                  ההזמנה. בלי זה כל הזמנה נגמרת ב"ואיך משלמים לך?". */}
              {methods.length > 0 && (
                <>
                  <h3 className="text-[13.5px] font-bold mb-3">💜 איך משלמים?</h3>
                  <PickRows
                    label="איך משלמים"
                    value={chosenPay ?? ""}
                    onChange={(v) => setPayWith(v as PayMethod)}
                    options={methods.map((m) => ({ key: m.key, title: m.label, aria: `תשלום ב${m.label}` }))}
                  />
                </>
              )}
              {!methods.length && paySummary && (
                <p className="text-[13px]">
                  <span className="font-bold">אפשר לשלם ב:</span> {paySummary}
                </p>
              )}
              {store.payout_note && (
                <p className="opacity-75 text-[12.5px] mt-2">{store.payout_note}</p>
              )}
              {/* מה יקרה אחרי השליחה — משלמים *אחרי* שההזמנה נשלחה, לא לפני.
                  קודם הופיע כאן כפתור תשלום, וזה גרם לשלם לפני שהזמינו. */}
              {chosenPay && (
                <p className="text-[12.5px] mt-2.5 leading-relaxed s-r px-3 py-2.5" style={{ background: "var(--s-thumb)" }} data-testid="pay-next">
                  {chosenPay === "cash"
                    ? "💵 משלמים במזומן כשמקבלים את ההזמנה."
                    : payTarget?.kind === "link"
                      ? `👉 אחרי שליחת ההזמנה יופיע כפתור לתשלום ב${chosenPay === "bit" ? "ביט" : "פייבוקס"}.`
                      : payTarget?.kind === "phone"
                        ? `👉 אחרי שליחת ההזמנה יופיע המספר להעברה ב${chosenPay === "bit" ? "ביט" : "פייבוקס"}.`
                        : store.payout_whatsapp
                          ? `👉 אחרי שליחת ההזמנה כותבים לבעלי הדוכן בוואטסאפ, והם שולחים לאן להעביר ב${chosenPay === "bit" ? "ביט" : "פייבוקס"}.`
                          : `👉 אחרי שליחת ההזמנה בעלי הדוכן יחזרו אליך עם פרטי התשלום ב${chosenPay === "bit" ? "ביט" : "פייבוקס"}.`}
                </p>
              )}
            </section>
          )}
          </div>

          {/* ── הסיכום והשליחה — קבועים בתחתית, לא נעלמים בגלילה ── */}
          <div
            className="px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-black/10"
            style={{ background: "var(--s-surface)" }}
          >
            {coupon && (
              <div className="flex flex-col gap-1 mb-2 text-[12.5px]" data-testid="coupon-summary">
                <div className="flex justify-between opacity-70">
                  <span>סכום המוצרים</span>
                  <span>₪{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex justify-between font-semibold" style={{ color: "var(--s-primary-text)" }}>
                  <span>קופון <bdi>{coupon.code}</bdi></span>
                  <bdi dir="ltr">−₪{formatPrice(coupon.discount)}</bdi>
                </div>
              </div>
            )}
            <div className="flex justify-between items-baseline mb-2.5">
              <span className="text-[13.5px] font-bold">סה"כ לתשלום</span>
              <span className="text-[19px] font-bold" data-testid="order-total">₪{formatPrice(payable)}</span>
            </div>
            <button
              onClick={sendOrder}
              disabled={sending || cart.length === 0}
              className="w-full py-4 text-[15.5px] font-bold disabled:opacity-40 active:translate-y-px"
              /* צבע הערכה ולא ירוק וואטסאפ: ההזמנה כבר לא יוצאת מהאתר —
                 היא נקלטת כאן, בחנות של הילדה. */
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {sending ? "שולחים…" : "שליחת ההזמנה"}
            </button>
            <p className="text-[11.5px] opacity-75 text-center mt-2">
              ההזמנה נשלחת ישר לבעלי הדוכן, והאישור יופיע כאן.
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
      {confirmed?.payFirst && (payTarget || confirmed.waPayUrl) && (
        <div
          data-testid="order-pay-first"
          className="s-sheet fixed bottom-0 inset-x-0 z-50 px-5 pt-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-center"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <OrderBadge pending />
          <h2 className="text-lg font-bold">
            {/* ההזמנה כבר נשלחה — זה רק התשלום */}
            ההזמנה נשלחה · נשאר לשלם
          </h2>
          <p className="text-[13px] opacity-75 mt-1 leading-relaxed">
            הזמנה #{confirmed.orderNumber} · ₪{formatPrice(confirmed.total)}
            {chosenPay === "bit" || chosenPay === "paybox" ? ` · ב${chosenPay === "bit" ? "ביט" : "פייבוקס"}` : ""}
          </p>
          {!payTarget && confirmed.waPayUrl && (
            <p className="text-[13.5px] mt-3 leading-relaxed" data-testid="pay-whatsapp-explain">
              {chosenPay === "bit" || chosenPay === "paybox"
                ? `בעלי הדוכן שולחים את פרטי ה${chosenPay === "bit" ? "ביט" : "פייבוקס"} בוואטסאפ. לוחצים כאן, ההודעה כבר כתובה — רק לשלוח:`
                : "קובעים עם בעלי הדוכן בוואטסאפ איך משלמים. ההודעה כבר כתובה — רק לשלוח:"}
            </p>
          )}
          {!payTarget && confirmed.waPayUrl ? (
            <a
              href={confirmed.waPayUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              data-testid="pay-whatsapp"
              className="s-r mt-4 flex items-center justify-center gap-2 py-3.5 text-[15px] font-bold text-white"
              style={{ background: "var(--whatsapp)" }}
            >
              <Icon name="chat" size={20} tone="transparent" />
              {chosenPay === "bit" || chosenPay === "paybox"
                ? `לקבל את פרטי ה${chosenPay === "bit" ? "ביט" : "פייבוקס"} בוואטסאפ`
                : "לקבוע את התשלום בוואטסאפ"}
            </a>
          ) : payTarget?.kind === "link" ? (
            <a
              href={payTarget.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="s-r mt-4 block py-3.5 text-[15px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.label} · ₪{formatPrice(confirmed.total)} ←
            </a>
          ) : payTarget ? (
            <div className="mt-4">
              {/* אין לביט ולפייבוקס כתובת שפותחת העברה עם מספר וסכום —
                  אז נותנים את הדבר הכי קרוב: המספר בענק, והעתקה בלחיצה. */}
              <div
                className="s-r py-3 border-[1.5px]"
                style={{ borderColor: "var(--s-primary)" }}
                data-testid="pay-phone"
              >
                <div className="text-[12px] opacity-75 mb-0.5">
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
                העתקת המספר
              </button>
              <p className="text-[12px] opacity-75 mt-2 leading-relaxed">
                פותחים את {payTarget.method === "bit" ? "ביט" : "פייבוקס"} → העברה →
                מדביקים את המספר → ₪{formatPrice(confirmed.total)}
              </p>
            </div>
          ) : null}
          <button
            onClick={() => setConfirmed({ ...confirmed, payFirst: false })}
            className="s-r mt-2 w-full py-3 text-[13.5px] font-bold border-[1.5px]"
            style={{ borderColor: "currentColor", opacity: 0.85 }}
          >
            {/* בוואטסאפ עוד לא שילמו — רק שלחו הודעה */}
            {!payTarget ? "שלחתי הודעה ✓" : "שילמתי ✓"}
          </button>
          {/* כשהכפתור הראשי כבר וואטסאפ — בלי קישור וואטסאפ שני */}
          {payTarget && (
            <a
              href={confirmed.waUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-3 block text-[12.5px] opacity-75 underline"
            >
              משהו לא מסתדר? אפשר לכתוב לבעלי הדוכן בוואטסאפ
            </a>
          )}
        </div>
      )}

      {confirmed && !confirmed.payFirst && (
        <div
          data-testid="order-confirmed"
          className="s-sheet fixed bottom-0 inset-x-0 z-50 px-5 pt-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-center"
          style={{ background: "var(--s-surface)", color: "var(--s-ink)", fontFamily: "var(--s-font)" }}
        >
          <OrderBadge />
          <h2 className="text-lg font-bold">ההזמנה נשלחה!</h2>
          <p className="text-[13.5px] opacity-75 mt-1">
            הזמנה #{confirmed.orderNumber} · ₪{formatPrice(confirmed.total)}
          </p>
          <p className="text-[13px] opacity-70 mt-2 leading-relaxed">
            בעלי הדוכן קיבלו את כל הפרטים, ויחזרו אליכם לטלפון שהשארתם.
          </p>
          {payTarget?.kind === "link" && (
            <a
              href={payTarget.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="s-r mt-4 block py-3 text-[14px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.label} · ₪{formatPrice(confirmed.total)} ←
            </a>
          )}
          {payTarget?.kind === "phone" && (
            <button
              onClick={() => copyPayPhone(payTarget.phone)}
              aria-label="העתקת מספר התשלום"
              className="mt-4 w-full py-3 text-[14px] font-bold"
              style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
            >
              {payTarget.method === "bit" ? "ביט" : "פייבוקס"} · {formatPayPhone(payTarget.phone)} · העתקה
            </button>
          )}
          {/* וואטסאפ נשאר כדרך קשר, לא כדרך הזמנה — ההודעה המוכנה נושאת
              את פרטי ההזמנה כדי שהשיחה תיפתח עם הקשר מלא. */}
          <a
            href={confirmed.waUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="s-r mt-2 block py-3 text-[13.5px] font-bold border-[1.5px]"
            style={{ borderColor: "currentColor", opacity: 0.85 }}
          >
            יצירת קשר עם בעלי הדוכן בוואטסאפ
          </a>
          <button
            onClick={() => setConfirmed(null)}
            className="mt-3 text-[13px] opacity-75 underline"
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

/**
 * בחירה אחת מכמה — שורות עם עיגול סימון, כותרת ושורת הסבר.
 * לקופה: איך מקבלים ואיך משלמים. ברור יותר מזוג "גלולות" בלי כותרת:
 * רואים מה נבחר (עיגול מלא + מסגרת בצבע הדוכן) ומה כל אפשרות אומרת.
 */
function PickRows({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { key: string; title: string; sub?: string; aria?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria ?? o.title.replace(/^\S+\s/, "")}
            onClick={() => onChange(o.key)}
            className="s-r w-full text-right px-4 py-3 min-h-12 border-2 flex items-center gap-3"
            style={{
              background: "var(--s-surface)",
              borderColor: on ? "var(--s-primary)" : "color-mix(in srgb, currentColor 22%, transparent)",
            }}
          >
            <span
              className="w-5 h-5 shrink-0 flex items-center justify-center"
              style={{ borderRadius: "999px", border: `2px solid ${on ? "var(--s-primary)" : "currentColor"}`, opacity: on ? 1 : 0.6 }}
              aria-hidden
            >
              {on && <span className="w-2.5 h-2.5" style={{ borderRadius: "999px", background: "var(--s-primary)" }} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[14px] ${on ? "font-bold" : "font-semibold"}`}>{o.title}</span>
              {o.sub && <span className="block text-[12px] opacity-75 mt-0.5 leading-snug">{o.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** כותרת חלק ברשת ("המומלצים שלי", "עוד מוצרים"). על רקע — יושבת על לוח קריא. */
function SectionTitle({
  text,
  star = false,
  plate,
  testId,
}: {
  text: string;
  star?: boolean;
  plate?: Record<string, string>;
  testId: string;
}) {
  return (
    <h2
      data-testid={testId}
      className={`text-[17px] font-bold leading-tight flex items-center gap-2 ${plate ? "s-r w-fit px-3.5 py-2" : ""}`}
      style={plate}
    >
      {star && <span aria-hidden style={{ color: "var(--s-primary-text)" }}>★</span>}
      {text}
    </h2>
  );
}

/**
 * הסמל של מסך "ההזמנה נשלחה": קבלה שנוחתת, ועליה ✓ — או שעון חול כשעוד
 * נשאר לשלם. בשפת האייקונים של דוכן ובצבעי הדוכן, ובפינות של הסגנון
 * שנבחר (s-r) — מרינה: "איקון כמו בשפה של הדוכן, איזושהי אנימציה".
 */
function OrderBadge({ pending = false }: { pending?: boolean }) {
  return (
    <div className="order-land relative w-16 h-16 mx-auto mb-3" aria-hidden data-testid="order-badge">
      <div
        className="s-r order-sway w-16 h-16 flex items-center justify-center"
        style={{ background: "var(--s-thumb)", color: "var(--s-primary-text)" }}
      >
        <Icon name="receipt" size={38} tone="var(--s-surface)" />
      </div>
      <span
        className="s-r order-mark absolute -bottom-1.5 -left-1.5 w-7 h-7 flex items-center justify-center"
        style={{ background: "var(--s-primary)", color: "var(--s-onprimary)" }}
      >
        <Icon name={pending ? "hourglass" : "check"} size={16} tone="transparent" />
      </span>
    </div>
  );
}
