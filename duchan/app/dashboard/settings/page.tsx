"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { THEMES, themeCssVars, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, scaledImage, mediaUrl, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { deliveryLine, isBitLink, isPayboxLink, isPayPhone, payMethods, payoutLabels, payoutLine } from "@/lib/payouts";
import { COVERS, coverCss } from "@/lib/covers";
import { lookCssVars, hasCustomBg, readablePlate, ALL_LOOK_FONTS_HREF, LOOKS, LOOK_KEYS, PATTERNS, PATTERN_KEYS, isLookKey, isPatternKey, lookOrBase, patternCss, storeBackground, type LookKey } from "@/lib/looks";
import { ACTIVATION_PRICE } from "@/lib/pricing";
import { formatPrice, parsePrice, typedPrice } from "@/lib/money";
import CategoryBar from "@/app/category-bar";
import CategoryDesigner from "../products/category-designer";
import { cleanMeta, layoutOrDefault, sizeOrDefault } from "@/lib/category-style";
import SettingsHub, { type HubGroup } from "./hub";
import Choice from "@/app/choice";
import SellerCoupons from "../share/seller-coupons";

// "החנות שלי" — המסך שמחזיק את המוצר. תצוגה מקדימה חיה: בוחרים ערכה והחנות משתנה מולך.

/**
 * המקטעים של "החנות שלי". כל אחד נפתח במסך משלו מתוך מסך הבית (hub.tsx).
 * המפתח הוא גם ה-hash בכתובת (#design), כך שכפתור "חזרה" של הטלפון
 * עובד, ואפשר לשלוח קישור ישר למקטע.
 */
const SECTIONS = {
  identity: { icon: "🪪", title: "שם ותמונה", intro: "לוחצים על השם, התיאור או התמונה ועורכים במקום. ככה הקונים רואים את הדוכן." },
  design: { icon: "🎨", title: "עיצוב", intro: "צבעים, סגנון, רקע וקטגוריות. כל לחיצה מופיעה מיד בדוכן הקטן." },
  products: { icon: "⭐", title: "המוצרים בדוכן", intro: "מה מופיע בראש הדוכן, ומה קורה כשמשהו נגמר." },
  promo: { icon: "📣", title: "הודעה לקונים", intro: "מבצע, מתנה או עדכון. מופיע בדוכן מתחת לשם." },
  coupons: { icon: "🏷️", title: "קופונים", intro: "יוצרים כאן קוד הנחה, ושולחים אותו לחברים." },
  payment: { icon: "💳", title: "איך משלמים לי", intro: "ביט, פייבוקס או מזומן — ולאן מעבירים." },
  shipping: { icon: "🚚", title: "משלוחים", intro: "רק מסירה ביד, או גם משלוח — ובכמה." },
  order: { icon: "💬", title: "ההזמנה בוואטסאפ", intro: "ככה נראית הזמנה שמגיעה אלייך. היא נכתבת לבד, אין מה למלא." },
  details: { icon: "📱", title: "הפרטים שלי", intro: "לאן מגיעות ההזמנות, וקצת עלייך. אף פעם לא כתובת." },
} as const;
type SectionKey = keyof typeof SECTIONS;
/* העוגנים של הגרסה הקודמת (גלילה אחת) — קישורים ישנים ממשיכים לעבוד */
const SECTION_ALIASES: Record<string, SectionKey> = { "products-display": "products", about: "details", "order-msg": "order" };
const asSection = (hash: string): SectionKey | null => {
  const k = decodeURIComponent(hash.replace(/^#/, ""));
  const key = (SECTION_ALIASES[k] ?? k) as SectionKey;
  return key in SECTIONS ? key : null;
};

const EMOJIS = ["🦄", "🍩", "🐼", "🍦", "🌈", "🍓", "🐻", "⭐", "🧁", "🐸"];

export default function SettingsPage() {
  const { store, setStore, loading } = useStore();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [emoji, setEmoji] = useState("🦄");
  const [theme, setTheme] = useState<ThemeKey>("cloud");
  /* סגנון ורקע (0050). null = בסיס. התמונה עצמה נשמרת מיד בהעלאה,
     הבחירה ביניהם עוברת דרך "שמירת שינויים" כמו הערכה. */
  const [look, setLook] = useState<LookKey | null>(null);
  const [bgPattern, setBgPattern] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [catDesignOpen, setCatDesignOpen] = useState(false);
  /* איך המוצרים מוצגים בדוכן (0053) */
  const [featuredTitle, setFeaturedTitle] = useState("");
  const [showSoldOut, setShowSoldOut] = useState(false);
  const bgRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  // מה שהחנות מספרת על עצמה, ואיך ההזמנה מגיעה אליה
  const [info, setInfo] = useState({
    about: "",
    city: "",
    age: "" as string,
    ships: false,
    shipping_note: "",
    shipping_price: "" as string,
  });
  /* ההודעה לקונות — "מבצע החודש". נשמרת גם כשהיא כבויה, כדי שכיבוי
     לא ימחק מה שנכתב. */
  const [promo, setPromo] = useState({ promo_on: false, promo_title: "", promo_text: "" });
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  // איך הקונה משלמת לילדה. נפרד לגמרי מתשלום ההקמה לדוכן (activated_at / payment_*).
  const [payout, setPayout] = useState({
    payout_bit: true,
    payout_paybox: false,
    payout_cash: true,
    payout_note: "" as string | null,
    payout_link: "" as string | null,
    payout_bit_link: "" as string | null,
    payout_paybox_link: "" as string | null,
    payout_bit_phone: "" as string | null,
    payout_paybox_phone: "" as string | null,
    payout_whatsapp: false,
  });
  const coverRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // המוצרים האמיתיים, כדי שהעריכה תיראה על הדוכן עצמו ולא על דוגמה
  const [products, setProducts] = useState<
    { id: string; name: string; price: number; image_key: string | null; poster_key: string | null }[]
  >([]);

  useEffect(() => {
    if (!store) return;
    setName(store.display_name);
    // תיאור אחד. חנות שכבר כתבה גם משפט קצר וגם תיאור ארוך רואה את שניהם
    // מאוחדים לשדה אחד, כדי שכלום ממה שהיא כתבה לא ייעלם מהמסך.
    setTagline([store.tagline, store.about].filter(Boolean).join(" ").trim().slice(0, 140));
    setEmoji(store.emoji);
    setTheme(store.theme);
    setLook(isLookKey(store.look) ? store.look : null);
    setBgPattern(isPatternKey(store.bg_pattern) || (store.bg_pattern === "photo" && store.bg_key) ? store.bg_pattern! : null);
    setBgPreview(mediaUrl(store.bg_key ?? null));
    setFeaturedTitle(store.featured_title ?? "");
    setShowSoldOut(store.show_sold_out === true);
    setPhone(displayPhone(store.contact_phone));
    setCoverPreview(mediaUrl(store.cover_key));
    setPreset(store.cover_preset ?? null);
    setPromo({
      promo_on: store.promo_on ?? false,
      promo_title: store.promo_title ?? "",
      promo_text: store.promo_text ?? "",
    });
    setInfo({
      about: store.about ?? "",
      city: store.city ?? "",
      age: store.age == null ? "" : String(store.age),
      ships: store.ships ?? false,
      shipping_note: store.shipping_note ?? "",
      shipping_price: store.shipping_price == null ? "" : String(store.shipping_price),
    });
    setAvatarPreview(mediaUrl(store.avatar_key));
    setPayout({
      payout_bit: store.payout_bit ?? true,
      payout_paybox: store.payout_paybox ?? false,
      payout_cash: store.payout_cash ?? true,
      payout_note: store.payout_note ?? "",
      payout_link: store.payout_link ?? "",
      // הלינק הישן נודד לשדה לפי הסוג שלו — המסך מציג רק את השניים החדשים
      payout_bit_link: store.payout_bit_link ?? (store.payout_link && isBitLink(store.payout_link) ? store.payout_link : ""),
      payout_paybox_link: store.payout_paybox_link ?? (store.payout_link && isPayboxLink(store.payout_link) ? store.payout_link : ""),
      payout_bit_phone: store.payout_bit_phone ?? "",
      payout_paybox_phone: store.payout_paybox_phone ?? "",
      payout_whatsapp: store.payout_whatsapp ?? false,
    });
  }, [store]);

  // המוצרים האמיתיים של הדוכן, להצגה מתחת לעריכה
  useEffect(() => {
    if (!store) return;
    supabaseBrowser()
      .from("products")
      .select("id, name, price, image_key, poster_key")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(6)
      .then(({ data }) => setProducts(data ?? []));
  }, [store]);

  /* איזה מקטע פתוח. null = מסך הבית. מסונכרן עם ה-hash בכתובת. */
  const [section, setSection] = useState<SectionKey | null>(null);
  const pushedRef = useRef(false);
  useEffect(() => {
    const read = () => {
      setSection(asSection(window.location.hash));
      window.scrollTo(0, 0);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const openSection = (key: string) => {
    if (!(key in SECTIONS)) return;
    pushedRef.current = true;
    window.location.hash = key;
  };
  /* חזרה: אם נכנסנו מכאן — אחורה בהיסטוריה (כמו כפתור החזרה של הטלפון).
     אם הגענו מקישור ישיר למקטע — פשוט למסך הבית, בלי לצאת מהאתר. */
  const closeSection = () => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
      setSection(null);
      window.scrollTo(0, 0);
    }
  };

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  /** מרעננת את דף החנות מיד — אחרת השינוי מופיע לקונות רק אחרי דקה */
  const refreshStorePage = (slug: string) =>
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});

  const t = themeOrDefault(theme);
  const lk = lookOrBase(look);
  const previewBg = hasCustomBg(bgPattern, bgPreview);

  async function save() {
    if (!store) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      showToast("מספר הוואטסאפ לא נראה תקין, לבדוק שוב");
      return;
    }
    const bitLink = payout.payout_bit_link?.trim();
    if (bitLink && !isBitLink(bitLink)) {
      showToast("לינק הביט לא נראה כמו לינק מאפליקציית ביט");
      return;
    }
    const payboxLink = payout.payout_paybox_link?.trim();
    if (payboxLink && !isPayboxLink(payboxLink)) {
      showToast("לינק הפייבוקס לא נראה כמו לינק מאפליקציית פייבוקס");
      return;
    }
    const bitPhone = payout.payout_bit_phone?.trim();
    if (bitPhone && !isPayPhone(bitPhone)) {
      showToast("מספר הביט לא נראה כמו מספר נייד ישראלי");
      return;
    }
    const payboxPhone = payout.payout_paybox_phone?.trim();
    if (payboxPhone && !isPayPhone(payboxPhone)) {
      showToast("מספר הפייבוקס לא נראה כמו מספר נייד ישראלי");
      return;
    }
    const supa = supabaseBrowser();
    const patch = {
      display_name: name.trim() || store.display_name,
      tagline: tagline.trim() || null,
      emoji,
      theme,
      look,
      bg_pattern: bgPattern,
      featured_title: featuredTitle.trim().slice(0, 40) || null,
      show_sold_out: showSoldOut,
      contact_phone: normalized,
      payout_bit: payout.payout_bit,
      payout_paybox: payout.payout_paybox,
      payout_cash: payout.payout_cash,
      payout_note: payout.payout_note?.trim() || null,
      payout_link: payout.payout_link?.trim() || null,
      payout_bit_link: payout.payout_bit_link?.trim() || null,
      payout_paybox_link: payout.payout_paybox_link?.trim() || null,
      payout_bit_phone: payout.payout_bit_phone?.replace(/\D/g, "") || null,
      payout_paybox_phone: payout.payout_paybox_phone?.replace(/\D/g, "") || null,
      payout_whatsapp: payout.payout_whatsapp,
      // התיאור כולו יושב ב-tagline. about מתאפס בשמירה כדי שהדוכן לא יציג
      // את אותו טקסט פעמיים, אחרי שהתוכן שלו כבר אוחד לשדה היחיד.
      about: null,
      city: info.city.trim() || null,
      age: info.age !== "" && Number(info.age) >= 5 && Number(info.age) <= 18 ? Number(info.age) : null,
      ships: info.ships,
      shipping_note: info.ships ? info.shipping_note.trim() || null : null,
      shipping_price: info.ships && info.shipping_price !== "" ? Math.min(200, parsePrice(info.shipping_price) ?? 0) : null,
      promo_on: promo.promo_on,
      promo_title: promo.promo_title.trim().slice(0, 40) || null,
      promo_text: promo.promo_text.trim().slice(0, 180) || null,
    };
    /**
     * שמירה שעומדת בפער סכמה.
     *
     * העדכון נוגע בעמודות שנוספו במיגרציות מאוחרות (payout_link, about,
     * city, age, ships, order_intro…). מספיק שאחת מהן חסרה בדאטהבייס כדי
     * ש-PostgREST יחזיר 400 על *כל* הבקשה, וגם שינוי שם החנות לא נשמר.
     * זה בדיוק מה שנראה מבחוץ כמו "לא נשמרים לי שינויים".
     *
     * PostgREST אומר בשגיאה איזו עמודה חסרה, אז מורידים אותה ומנסים שוב.
     * מה שאפשר לשמור נשמר, ומה שלא נאמר במפורש במקום להיבלע.
     */
    const attempt: Record<string, unknown> = { ...patch };
    const dropped: string[] = [];
    let lastError = "";

    for (let i = 0; i <= 8; i++) {
      const { error } = await supa.from("stores").update(attempt).eq("id", store.id);
      if (!error) break;
      lastError = error.message;
      const missing = /'([a-z_]+)' column/.exec(error.message)?.[1];
      if (!missing || !(missing in attempt) || i === 8) {
        console.error("[settings] save failed:", error.message);
        showToast("השמירה נכשלה, לנסות שוב");
        return;
      }
      delete attempt[missing];
      dropped.push(missing);
    }

    setStore({ ...store, ...(attempt as Partial<typeof store>) });
    refreshStorePage(store.slug);
    setDirty(false);
    if (dropped.length) {
      console.error("[settings] saved without missing columns:", dropped.join(", "), lastError);
      showToast(`נשמר, חוץ מ-${dropped.length} שדות שצריך עדכון דאטהבייס`);
    } else {
      showToast("נשמר ✨");
    }
  }

  async function onCover(file: File) {
    if (!store) return;
    let blob: Blob;
    try {
      blob = await squareImage(file, 1200);
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
      return;
    }
    const r = await uploadBlob("cover", blob, store.id);
    if ("error" in r) {
      showToast(r.error);
      return;
    }
    const supa = supabaseBrowser();
    await supa.from("stores").update({ cover_key: r.key }).eq("id", store.id);
    setCoverPreview(URL.createObjectURL(blob));
    setStore({ ...store, cover_key: r.key });
    refreshStorePage(store.slug);
    showToast("תמונת הקאבר עודכנה");
  }

  /** רקע מוכן. תמונה שהועלתה גוברת עליו, אז מסירים אותה. */
  async function pickPreset(key: string) {
    if (!store) return;
    const supa = supabaseBrowser();
    await supa.from("stores").update({ cover_preset: key, cover_key: null }).eq("id", store.id);
    setPreset(key);
    setCoverPreview(null);
    setStore({ ...store, cover_preset: key, cover_key: null });
    refreshStorePage(store.slug);
    showToast("הרקע עודכן");
  }

  async function removeCover() {
    if (!store) return;
    const supa = supabaseBrowser();
    await supa.from("stores").update({ cover_key: null }).eq("id", store.id);
    setCoverPreview(null);
    setStore({ ...store, cover_key: null });
    refreshStorePage(store.slug);
    showToast("התמונה הוסרה, חזרנו לרקע");
  }

  /** תמונת רקע לכל הדף, בפרופורציות המקוריות. עוברת בקנבס (EXIF), ונשמרת מיד. */
  async function onBackground(file: File) {
    if (!store) return;
    let blob: Blob;
    try {
      blob = await scaledImage(file, 1600);
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
      return;
    }
    const r = await uploadBlob("background", blob, store.id);
    if ("error" in r) {
      showToast(r.error);
      return;
    }
    const { error } = await supabaseBrowser()
      .from("stores")
      .update({ bg_key: r.key, bg_pattern: "photo" })
      .eq("id", store.id);
    if (error) {
      showToast("השמירה נכשלה, לנסות שוב");
      return;
    }
    setBgPreview(URL.createObjectURL(blob));
    setBgPattern("photo");
    setStore({ ...store, bg_key: r.key, bg_pattern: "photo" });
    refreshStorePage(store.slug);
    showToast("תמונת הרקע עודכנה");
  }

  /** הסרת התמונה: הקובץ נשאר ב-R2 (כמו קאבר), הדוכן חוזר לרקע אחר. נשמר מיד. */
  async function removeBackground() {
    if (!store) return;
    const next = bgPattern === "photo" ? null : bgPattern;
    const { error } = await supabaseBrowser()
      .from("stores")
      .update({ bg_key: null, bg_pattern: next })
      .eq("id", store.id);
    if (error) {
      showToast("משהו השתבש, לנסות שוב");
      return;
    }
    setBgPreview(null);
    setBgPattern(next);
    setStore({ ...store, bg_key: null, bg_pattern: next });
    refreshStorePage(store.slug);
    showToast("תמונת הרקע הוסרה");
  }

  /** בסיס = בלי סגנון ובלי רקע. הצבעים נשארים — הם בחירה נפרדת. */
  function resetDesign() {
    setLook(null);
    setBgPattern(null);
    setDirty(true);
    showToast("חזרנו לבסיס — לשמור כדי שזה יופיע בדוכן");
  }

  async function onAvatar(file: File) {
    if (!store) return;
    let blob: Blob;
    try {
      blob = await squareImage(file, 400);
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
      return;
    }
    const r = await uploadBlob("avatar", blob, store.id);
    if ("error" in r) {
      showToast(r.error);
      return;
    }
    const supa = supabaseBrowser();
    await supa.from("stores").update({ avatar_key: r.key }).eq("id", store.id);
    setAvatarPreview(URL.createObjectURL(blob));
    setStore({ ...store, avatar_key: r.key });
    refreshStorePage(store.slug);
    showToast("תמונת הפרופיל עודכנה");
  }

  async function removeAvatar() {
    if (!store) return;
    const supa = supabaseBrowser();
    await supa.from("stores").update({ avatar_key: null }).eq("id", store.id);
    setAvatarPreview(null);
    setStore({ ...store, avatar_key: null });
    refreshStorePage(store.slug);
    showToast("חזרנו לאמוג'י");
  }

  async function logout() {
    const supa = supabaseBrowser();
    await supa.auth.signOut();
    window.location.href = "/";
  }

  // מצב חופשה: השהיה עצמית. blocked שמור לאדמין — הבעלות לא יכולה לשנות אותו.
  async function togglePause() {
    if (!store || store.status === "blocked") return;
    const next = store.status === "active" ? "paused" : "active";
    const supa = supabaseBrowser();
    const { error } = await supa.from("stores").update({ status: next }).eq("id", store.id);
    if (error) {
      showToast("משהו השתבש, לנסות שוב");
      return;
    }
    setStore({ ...store, status: next });
    await refreshStorePage(store.slug);
    showToast(next === "paused" ? "הדוכן בהפסקה. הלינק מציג 'הדוכן סגור'" : "הדוכן פתוח שוב 🎉");
  }

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  const storeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${store.slug}`;

  /* שורת התשלום בהודעה מונה את כל מה שסומן, ולא את מה שהקונה בחרה:
     בשלב ההודעה עוד לא שילמו, אז מה שמועיל זה מה שהדוכן מקבל. */
  const payLabels = payoutLabels(payout);
  /* התצוגה מדגימה קונה שבחרה — לכן האמצעי הראשון שסימנת, ולא הרשימה
     כולה. זה בדיוק מה שיגיע אלייך בפועל. */
  const payExampleLine = payoutLine(payout, payMethods(payout)[0]?.key ?? null);
  const shipExampleLine = deliveryLine({
    ships: info.ships,
    wantsShipping: true,
    note: info.shipping_note,
    price: info.shipping_price === "" ? null : Number(info.shipping_price),
  });

  /* ── מסך הבית ── */
  const statusChip =
    store.status === "blocked" ? { t: "⛔ הושבת", bg: "var(--danger-bg)", fg: "var(--danger)" }
    : store.status !== "active" ? { t: "⏸️ בהפסקה", bg: "var(--warn-bg)", fg: "var(--warn-ink)" }
    : !store.activated_at ? { t: "👀 תצוגה מקדימה", bg: "var(--warn-bg)", fg: "var(--warn-ink)" }
    : { t: "🟢 פתוח להזמנות", bg: "var(--ok-bg)", fg: "var(--ok-ink)" };

  const hero = (
    <div
      className="overflow-hidden border border-[var(--line)]"
      style={{ background: storeBackground(t, bgPattern, bgPreview), color: t.ink, fontFamily: lk.font }}
      data-testid="settings-hero"
    >
      <div
        className="h-20"
        style={
          coverPreview
            ? { backgroundImage: `url(${coverPreview})`, backgroundSize: "cover", backgroundPosition: "center" }
            : previewBg ? undefined : { background: coverCss(preset) }
        }
      />
      <div className="px-4 pb-4 -mt-9 text-center">
        <span
          className="inline-flex w-[72px] h-[72px] items-center justify-center text-4xl overflow-hidden"
          style={{ background: t.surface, border: `3px solid ${t.bg}`, borderRadius: lk.radius }}
        >
          {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : emoji}
        </span>
        <div
          className={previewBg ? "mt-2 px-3 py-2 inline-block" : "mt-1"}
          style={previewBg ? { ...readablePlate(t), borderRadius: lk.radius } : undefined}
        >
          <div className="text-[19px] font-bold leading-tight">{name || "הדוכן שלך"}</div>
          <span
            className="inline-block mt-1.5 text-[11.5px] font-bold px-2.5 py-1"
            style={{ background: statusChip.bg, color: statusChip.fg, fontFamily: "var(--font-body)" }}
            data-testid="store-status-chip"
          >
            {statusChip.t}
          </span>
        </div>
        {!store.activated_at && (
          <div
            data-testid="preview-notice"
            className="mt-3 bg-white/90 px-3 py-2 text-[12px] text-[var(--warn-ink)] leading-relaxed"
            style={{ fontFamily: "var(--font-body)" }}
          >
            הדוכן בתצוגה מקדימה: רואים הכל, וההזמנות נפתחות אחרי הפרסום.
          </div>
        )}
        <a
          href={storeUrl}
          className="fx-press block mt-3 bg-white/95 border border-black/10 py-2.5 text-[13px] font-bold text-[var(--ink)]"
          style={{ fontFamily: "var(--font-body)" }}
          data-testid="view-store"
        >
          👀 לראות את הדוכן כמו שהקונים רואים
        </a>
      </div>
    </div>
  );

  const statusRow =
    store.status === "blocked" ? (
      <div className=" bg-[var(--danger-bg)] border border-[var(--danger-line)] p-3.5 text-[13px] text-[var(--danger)]">
        החנות הושבתה על ידי הנהלת דוכן.
      </div>
    ) : (
      <div className=" bg-white border border-[var(--line)] p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 flex items-center justify-center text-[19px] bg-[var(--sand)]" aria-hidden>
          {store.status === "active" ? "🟢" : "⏸️"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold">{store.status === "active" ? "הדוכן פתוח" : "הדוכן בהפסקה"}</div>
          {/* הטוגל לבדו לא אמר שאפשר לחזור אחורה, וזה מה שגרם להיסוס:
              צריך לכתוב במפורש שסגירה היא זמנית ושום דבר לא נמחק. */}
          <div className="text-[12px] text-[var(--muted)] leading-snug mt-0.5">
            {store.status === "active"
              ? "צריכה הפסקה? סוגרים כאן, ופותחים שוב מתי שרוצים."
              : "הלינק מציג 'סגור כרגע'. הכל נשמר — לחיצה פותחת שוב."}
          </div>
        </div>
        </div>
        <Choice
          value={store.status === "active"}
          onChange={() => togglePause()}
          on="🟢 פתוח להזמנות"
          off="⏸️ בהפסקה"
          label="הדוכן פתוח או בהפסקה"
          testid="store-open"
        />
      </div>
    );

  const bgLabel = bgPattern === "photo" ? "התמונה שלי" : bgPattern && isPatternKey(bgPattern) ? PATTERNS[bgPattern].label : "בלי רקע";
  const catCount = store.categories?.length ?? 0;
  const groups: HubGroup[] = [
    {
      title: "איך הדוכן נראה",
      rows: [
        { key: "identity", icon: "🪪", tint: "#f2d9dc", title: "שם ותמונה", summary: [name || "בלי שם", tagline].filter(Boolean).join(" · ") },
        {
          key: "design", icon: "🎨", tint: "#ece2f3", title: "עיצוב",
          summary: [themeOrDefault(theme).label, lookOrBase(look).label, bgLabel, catCount ? `${catCount} קטגוריות` : null].filter(Boolean).join(" · "),
        },
      ],
    },
    {
      title: "מה רואים בדוכן",
      rows: [
        {
          key: "products", icon: "⭐", tint: "#f8f1e3", title: "המוצרים בדוכן",
          summary: `${featuredTitle.trim() || "המומלצים שלי"} · ${showSoldOut ? "מציג גם מה שאזל" : "מה שאזל מוסתר"}`,
        },
        {
          key: "promo", icon: "📣", tint: "#eef3ec", title: "הודעה לקונים",
          summary: promo.promo_on && promo.promo_text.trim() ? `מופיעה: ${promo.promo_title.trim() || promo.promo_text.trim()}` : "כבויה",
        },
        {
          key: "coupons", icon: "🏷️", tint: "#e6eef6", title: "קופונים",
          summary: "קוד הנחה שקונים מקלידים בהזמנה", testid: "settings-coupons-link",
        },
      ],
    },
    {
      title: "הזמנות וכסף",
      rows: [
        { key: "payment", icon: "💳", tint: "#e9efe3", title: "איך משלמים לי", summary: payLabels.length ? payLabels.join(" · ") : "עוד לא סומן" },
        {
          key: "shipping", icon: "🚚", tint: "#f6efe6", title: "משלוחים",
          summary: info.ships ? (info.shipping_price !== "" ? `משלוח ₪${formatPrice(parsePrice(info.shipping_price))}` : "משלוח · המחיר בתיאום") : "מסירה ביד בלבד",
        },
        { key: "order", icon: "💬", tint: "#e3f5ea", title: "ההזמנה בוואטסאפ", summary: "ככה נראית הזמנה שמגיעה אלייך" },
      ],
    },
    {
      title: "חשבון",
      rows: [
        { key: "details", icon: "📱", tint: "#ece6de", title: "הפרטים שלי", summary: [normalizePhone(phone) ? displayPhone(normalizePhone(phone)!) : phone, info.city].filter(Boolean).join(" · ") },
      ],
    },
  ];

  return (
    <div>
      {/* הגופנים של כל הסגנונות — לדוכן הקטן בכל המקטעים. בלי precedence:
          כשל טעינה צריך להיות שקט, לא שגיאת JS */}
      <link rel="stylesheet" href={ALL_LOOK_FONTS_HREF} />

      {!section ? (
        <SettingsHub
          hero={hero}
          status={statusRow}
          groups={groups}
          onOpen={openSection}
          /* התשלום היה מוסתר מאחורי "לפרסם את הדוכן", ולא היה ברור שיש כאן
             שני שלבים: משלמים, ואז מרינה מאשרת. עכשיו זה כתוב במפורש. */
          before={
            !store.activated_at ? (
              <a href="/activate" data-testid="publish-cta" className="fx-shine bg-[var(--ink)] text-white p-4 block">
                <div className="text-[13px] font-bold">
                  {store.payment_claimed_at ? "⏳ מחכים לאישור ממרינה" : "🚀 לפתוח את הדוכן להזמנות"}
                </div>
                {store.payment_claimed_at ? (
                  <div className="text-[12px] opacity-80 leading-relaxed mt-1">
                    סימנתם ששילמתם. ברגע שמרינה תאשר, הדוכן יתחיל לקבל הזמנות.
                  </div>
                ) : (
                  <ol className="text-[12px] opacity-80 leading-relaxed mt-1.5 flex flex-col gap-0.5">
                    <li>1. משלמים ₪{ACTIVATION_PRICE} פעם אחת בפייבוקס (חינם) או בביט</li>
                    <li>2. מרינה מאשרת שהתשלום הגיע</li>
                    <li>3. הדוכן נפתח והחברים יכולים להזמין</li>
                  </ol>
                )}
              </a>
            ) : null
          }
          after={
            <button onClick={logout} className="w-full text-center text-[13px] text-[var(--muted)] py-3">
              יציאה מהחשבון
            </button>
          }
        />
      ) : (
        <>
          {/* כותרת המקטע: חזרה, אייקון ושם. דביקה, כדי שהדרך חזרה תמיד על המסך */}
          <div className="sticky top-0 z-30 h-[54px] flex items-center gap-2 px-1.5 bg-white/95 backdrop-blur border-b border-[var(--line)]">
            <button
              onClick={closeSection}
              aria-label="חזרה להחנות שלי"
              data-testid="section-back"
              className="w-11 h-11 flex items-center justify-center text-[20px] text-[var(--ink)]"
            >
              →
            </button>
            <span className="text-[19px]" aria-hidden>{SECTIONS[section].icon}</span>
            <h1 className="text-[16px] font-bold text-[var(--ink)]">{SECTIONS[section].title}</h1>
          </div>

          <div key={section} className="fx-slide p-3 flex flex-col gap-3" data-testid={`section-${section}`}>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed px-1">{SECTIONS[section].intro}</p>
          {section === "identity" && (
            <>
        {/* הדוכן עצמו, ניתן לעריכה במקום.
            אין כאן "תצוגה מקדימה" למעלה ו"שדות" למטה: השם נערך במקום שבו
            הוא מופיע, וכך גם המשפט, התיאור, העיר, התמונה והקאבר. מה שרואים
            זה מה שהקונות יראו, ומתחת המוצרים האמיתיים. */}
        <div>

          <input ref={coverRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />

          <div
            id="identity"
            className="scroll-mt-14 overflow-hidden border border-[var(--line)]"
            style={{ background: storeBackground(t, bgPattern, bgPreview), color: t.ink, fontFamily: lk.font }}
          >
            {/* קאבר */}
            <button
              onClick={() => coverRef.current?.click()}
              aria-label="החלפת תמונת הקאבר"
              className="block w-full h-28 overflow-hidden relative"
              style={coverPreview || previewBg ? undefined : { background: coverCss(preset) }}
            >
              {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
              <span className="absolute bottom-1.5 left-1.5 bg-black/55 text-white text-[11.5px] px-2 py-1">
                ✎ קאבר
              </span>
            </button>

            <div className="px-4 pb-4 -mt-8">
              {/* תמונת פרופיל.
                  ה-overflow-hidden יושב על העטיפה הפנימית ולא על הכפתור:
                  כשהוא היה על הכפתור הוא חתך את תג העיפרון שיוצא מהפינה. */}
              <div className="text-center">
                <button
                  onClick={() => avatarRef.current?.click()}
                  aria-label="החלפת תמונת הפרופיל"
                  className="relative inline-block w-16 h-16 align-middle"
                >
                  <span
                    className="flex w-full h-full items-center justify-center text-3xl overflow-hidden"
                    style={{ background: t.surface, border: `2px solid ${t.bg}`, borderRadius: lk.radius }}
                  >
                    {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : emoji}
                  </span>
                  <span
                    className="absolute -bottom-1 -left-1 w-5 h-5 flex items-center justify-center text-[11px] bg-[var(--ink)] text-white z-10"
                    style={{ borderRadius: "999px", border: "1.5px solid var(--white)" }}
                    aria-hidden
                  >
                    ✎
                  </span>
                </button>
              </div>

              {/* על רקע — אותו לוח קריא שיש בדוכן עצמו, כדי שמה שרואים כאן
                  יהיה בדיוק מה שהקונות יראו */}
              <div
                className={previewBg ? "mt-2 px-2 py-2" : ""}
                style={previewBg ? { ...readablePlate(t), borderRadius: lk.radius } : undefined}
              >
              {/* שם, תיאור ועיר נערכים בדיוק במקום שבו הם מוצגים.
                  בלי קווים מקווקווים ובלי רווחים מיותרים: הכותרת מעל הכרטיס
                  כבר אומרת שאפשר ללחוץ על הכל, והקווים רק הרעישו. */}
              {/* שם הדוכן מקבל עיפרון משלו ולא רק קו תחתון.
                  זה השדה שמחפשים בפועל כשרוצים לשנות משהו, והוא היחיד
                  שנראה בדיוק כמו כותרת של הדוכן — אז הוא צריך לומר
                  במפורש שהוא שדה, כמו הקאבר והתמונה שכבר עושים את זה. */}
              <div className="relative">
                <input
                  value={name}
                  maxLength={40}
                  aria-label="שם החנות"
                  placeholder="שם הדוכן שלך"
                  onChange={(e) => { setName(e.target.value); setDirty(true); }}
                  className="editable block w-full text-center font-bold text-[15px] pe-6"
                  style={{ color: t.ink }}
                />
                <span
                  className="absolute end-0 top-1/2 -translate-y-1/2 text-[12px] opacity-55 pointer-events-none"
                  aria-hidden
                >
                  ✎
                </span>
              </div>
              {/* תיאור אחד ולא שניים. קודם היו כאן גם "משפט אחד עלייך" וגם
                  "כמה מילים על הדוכן", והם נראו כמו שתי הערות שאומרות את אותו
                  דבר. מה שהיה כתוב בתיאור הארוך עולה לכאן בטעינה ונשמר יחד. */}
              <textarea
                value={tagline}
                maxLength={140}
                rows={2}
                aria-label="תיאור הדוכן"
                placeholder="פה כותבים את מה שאתם מוכרים בדוכן"
                onChange={(e) => { setTagline(e.target.value); setDirty(true); }}
                className="editable block w-full text-center text-[12px] resize-none leading-snug opacity-85"
                style={{ color: t.ink }}
              />

              {/* עיר ומשלוחים בשורה אחת, בדיוק כמו בדוכן האמיתי.
                  המשלוחים מופיעים רק כשהם דלוקים, וזו התשובה ל"אם מפעילים,
                  רואים?" — ההדלקה עצמה נמצאת למטה במסך. */}
              <div className="flex items-center justify-center gap-1.5 text-[12px] opacity-75 flex-wrap">
                <span aria-hidden>📍</span>
                <input
                  value={info.city}
                  maxLength={30}
                  aria-label="עיר"
                  placeholder="עיר (לא חובה)"
                  onChange={(e) => { setInfo({ ...info, city: e.target.value }); setDirty(true); }}
                  className="editable text-center w-28"
                  style={{ color: t.ink }}
                />
                {info.ships && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      🚚 משלוח
                      {info.shipping_price !== "" ? ` ₪${formatPrice(parsePrice(info.shipping_price))}` : " בתיאום"}
                    </span>
                  </>
                )}
              </div>

              </div>

              {/* המוצרים האמיתיים */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {(products.length ? products : [null]).map((p, i) =>
                  p ? (
                    <div key={p.id} className="overflow-hidden"
                      style={{ background: t.surface, border: lk.border(t), borderRadius: lk.radius, boxShadow: lk.shadow(t) }}>
                      <div className="h-20 flex items-center justify-center text-2xl overflow-hidden opacity-90">
                        {mediaUrl(p.poster_key) ?? mediaUrl(p.image_key) ? (
                          <img src={(mediaUrl(p.poster_key) ?? mediaUrl(p.image_key))!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          "🛍️"
                        )}
                      </div>
                      <div className="px-2 pb-2">
                        <div className="text-[12.5px] truncate">{p.name}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[12px] font-bold">₪{formatPrice(p.price)}</span>
                          <span className="px-2 py-1 text-[11px] font-bold"
                            style={{ background: t.primary, color: t.onPrimary, borderRadius: lk.radius }}>
                            לסל
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="col-span-2 border border-dashed py-6 text-center text-[12.5px] opacity-60"
                      style={{ borderColor: t.border }}>
                      עוד אין מוצרים בדוכן
                    </div>
                  )
                )}
              </div>
              <a href="/dashboard/products"
                className="block text-center text-[12.5px] underline mt-2.5 opacity-70"
                style={{ color: t.ink }}>
                לעריכת המוצרים
              </a>
            </div>
          </div>

          {/* אפשרויות משניות לקאבר ולתמונה — מתחת לדוכן, לא במקומו */}
          <div className="bg-white border border-[var(--line)] p-3 mt-2.5">
            <div className="text-[12px] text-[var(--muted)] mb-1.5">רקע מוכן לקאבר</div>
            <div className="flex gap-1.5 flex-wrap">
              {COVERS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => pickPreset(c.key)}
                  aria-label={`רקע ${c.label}`}
                  className={`w-11 h-8 border-2 ${
                    !coverPreview && preset === c.key ? "border-[var(--ink)]" : "border-[var(--line)]"
                  }`}
                  style={{ background: c.css }}
                />
              ))}
              {coverPreview && (
                <button onClick={removeCover} className="text-[12px] underline text-[var(--muted)] px-2">
                  הסרת התמונה
                </button>
              )}
            </div>

            <div className="text-[12px] text-[var(--muted)] mt-3 mb-1.5">או אמוג׳י במקום תמונת פרופיל</div>
            <div className="flex gap-1.5 flex-wrap">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { setEmoji(e); setDirty(true); }}
                  aria-label={`אמוג׳י ${e}`}
                  className={`w-9 h-9 border-[1.5px] bg-white text-lg ${emoji === e && !avatarPreview ? "border-[var(--ink)]" : "border-[var(--line)]"}`}>
                  {e}
                </button>
              ))}
              {avatarPreview && (
                <button onClick={removeAvatar} className="text-[12px] underline text-[var(--muted)] px-2">
                  חזרה לאמוג׳י
                </button>
              )}
            </div>
          </div>
        </div>

            </>
          )}
          {section === "design" && (
            <>
        {/* ── עיצוב הדוכן ──
            שלוש בחירות עצמאיות, בסדר שבו ילדה חושבת עליהן: קודם צבע, אחר
            כך צורה, ובסוף מה מאחורה. כל לחיצה משנה מיד את הדוכן שלמעלה,
            ו"חזרה לבסיס" מחזירה צורה ורקע בלי לגעת בצבעים שבחרה. */}
        <div id="design" className="scroll-mt-14 flex flex-col gap-4">
          {/* הגופנים של כל הסגנונות — כדי שהאריחים והתצוגה יראו אותם באמת.
              בלי precedence: כשל טעינה צריך להיות שקט, לא שגיאת JS */}

          <div className="flex items-baseline justify-end gap-2 -mb-2">
            {(look || bgPattern) && (
              <button
                onClick={resetDesign}
                data-testid="reset-design"
                className="shrink-0 text-[12px] font-semibold underline text-[var(--muted)] min-h-11 px-1"
              >
                ↺ חזרה לבסיס
              </button>
            )}
          </div>

          {/* הדוכן הקטן — צמוד למעלה בזמן שגוללים בין הבחירות. בלעדיו כל
              לחיצה על סגנון או רקע שינתה משהו שנמצא מחוץ למסך. */}
          <div
            data-testid="design-preview"
            aria-label="תצוגה מקדימה של הדוכן"
            className="sticky top-[54px] z-20 border border-[var(--line)] overflow-hidden"
            style={{ background: storeBackground(t, bgPattern, bgPreview), color: t.ink, fontFamily: lk.font }}
          >
            <div className="p-2.5 flex flex-col gap-2">
              <div
                className="text-center px-2 py-1.5"
                style={previewBg ? { ...readablePlate(t), borderRadius: lk.radius, border: lk.border(t), boxShadow: lk.shadow(t) } : undefined}
              >
                <div className="text-[13.5px] font-bold truncate">{emoji} {name || "הדוכן שלך"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => {
                  const p = products[i];
                  const img = p ? mediaUrl(p.poster_key) ?? mediaUrl(p.image_key) : null;
                  return (
                    <div key={i} className="overflow-hidden"
                      style={{ background: t.surface, border: lk.border(t), borderRadius: lk.radius, boxShadow: lk.shadow(t) }}>
                      <div className="h-11 flex items-center justify-center text-lg overflow-hidden" style={{ background: t.thumb }}>
                        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : p ? "🛍️" : i ? "🧸" : "🧁"}
                      </div>
                      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
                        <span className="text-[10.5px] font-bold" style={{ color: t.primary }}>
                          ₪{p ? formatPrice(p.price) : i ? "12.90" : "15"}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9.5px] font-bold"
                          style={{ background: t.primary, color: t.onPrimary, borderRadius: lk.radius }}>
                          לסל
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <span className="text-[12px] font-semibold">1. צבעים</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, th]) => (
                /* כל ערכה היא כרטיס מוצר קטן ולא ריבועי צבע מופשטים: ככה רואים
                   מראש איך כפתור "הוספה לסל" ייראה בפועל, וזה מה שבאמת משתנה */
                <button key={k} onClick={() => { setTheme(k); setDirty(true); }}
                  aria-label={`ערכת ${th.label}`}
                  aria-pressed={theme === k}
                  className={`border-[1.5px] p-1.5 text-right ${theme === k ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                  style={{ background: th.bg }}
                >
                  <div className="p-1" style={{ border: th.border, background: th.surface, borderRadius: lk.radius }}>
                    <div className="h-6 flex items-center justify-center text-[13px] opacity-70">🧁</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[8.5px] font-bold" style={{ color: th.ink }}>₪15</span>
                      <span className="px-1.5 py-[3px] text-[8px] font-bold"
                        style={{ background: th.primary, color: th.onPrimary, borderRadius: lk.radius }}>
                        לסל
                      </span>
                    </div>
                  </div>
                  <span className="block text-[12px] font-medium mt-1.5" style={{ color: th.ink }}>
                    {th.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[12px] font-semibold">2. סגנון</span>
            <span className="text-[12px] text-[var(--faint)]"> · הצורה של הכרטיסים, הכפתורים והכתב</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5" data-testid="look-picker">
              {([null, ...LOOK_KEYS] as (LookKey | null)[]).map((k) => {
                const l = lookOrBase(k);
                const on = look === k;
                return (
                  <button key={k ?? "base"} onClick={() => { setLook(k); setDirty(true); }}
                    aria-label={`סגנון ${l.label}`}
                    aria-pressed={on}
                    className={`border-[1.5px] p-1.5 text-right min-h-11 ${on ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                    style={{ background: t.bg, fontFamily: l.font }}
                  >
                    <div className="p-1 overflow-hidden"
                      style={{ border: l.border(t), background: t.surface, borderRadius: l.radius, boxShadow: l.shadow(t) }}>
                      <div className="h-6 flex items-center justify-center text-[13px] opacity-70">🧸</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[8.5px] font-bold" style={{ color: t.ink }}>₪15</span>
                        <span className="px-1.5 py-[3px] text-[8px] font-bold"
                          style={{ background: t.primary, color: t.onPrimary, borderRadius: l.radius }}>
                          לסל
                        </span>
                      </div>
                    </div>
                    <span className="block text-[12.5px] font-bold mt-1.5" style={{ color: t.ink }}>{l.label}</span>
                    <span className="block text-[10.5px] leading-tight opacity-60" style={{ color: t.ink }}>{l.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[12px] font-semibold">3. רקע</span>
            <span className="text-[12px] text-[var(--faint)]"> · מה שמאחורי המוצרים</span>
            <input ref={bgRef} type="file" accept="image/*" hidden data-testid="bg-upload-input"
              onChange={(e) => { if (e.target.files?.[0]) onBackground(e.target.files[0]); e.target.value = ""; }} />

            {/* תמונה משלה — שורה בולטת משלה ולא עוד אריח בסוף הרשת, שם
                היא נחבאה מתחת לקפל */}
            {bgPreview ? (
              <div className="flex items-stretch gap-2 mt-1.5" data-testid="bg-photo-row">
                <button
                  onClick={() => { setBgPattern("photo"); setDirty(true); }}
                  aria-label="רקע תמונה שלי"
                  aria-pressed={bgPattern === "photo"}
                  className={`relative w-24 h-16 shrink-0 border-2 overflow-hidden ${bgPattern === "photo" ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                >
                  <img src={bgPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  {bgPattern === "photo" && (
                    <span className="absolute top-1 right-1 bg-[var(--ink)] text-white text-[10px] font-bold px-1.5">✓ נבחר</span>
                  )}
                </button>
                <div className="flex flex-col justify-center gap-1 min-w-0">
                  <span className="text-[12.5px] font-semibold">התמונה שלי</span>
                  <div className="flex gap-3">
                    <button onClick={() => bgRef.current?.click()} className="text-[12px] underline text-[var(--muted)] min-h-9">
                      החלפה
                    </button>
                    <button onClick={removeBackground} className="text-[12px] underline text-[var(--muted)] min-h-9">
                      הסרה
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => bgRef.current?.click()}
                aria-label="העלאת תמונת רקע"
                className="w-full mt-1.5 min-h-12 border-2 border-dashed border-[var(--line)] bg-white flex items-center justify-center gap-2 text-[13px] font-semibold"
              >
                <span aria-hidden>📷</span> להעלות רקע משלך
              </button>
            )}

            <div className="text-[12px] text-[var(--faint)] mt-2.5 mb-1.5">או רקע מוכן, בצבעים של הדוכן:</div>
            <div className="grid grid-cols-3 gap-1.5" data-testid="bg-picker">
              <button onClick={() => { setBgPattern(null); setDirty(true); }}
                aria-label="בלי רקע"
                aria-pressed={bgPattern === null}
                className={`h-16 border-2 flex items-end justify-center pb-1 ${bgPattern === null ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                style={{ background: t.bg }}
              >
                <span className="text-[11px] font-semibold px-1.5" style={{ ...readablePlate(t), color: t.ink }}>בלי</span>
              </button>
              {PATTERN_KEYS.map((k) => (
                <button key={k} onClick={() => { setBgPattern(k); setDirty(true); }}
                  aria-label={`רקע ${PATTERNS[k].label}`}
                  aria-pressed={bgPattern === k}
                  className={`h-16 border-2 flex items-end justify-center pb-1 ${bgPattern === k ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                  style={{ background: patternCss(k, t) }}
                >
                  <span className="text-[11px] font-semibold px-1.5" style={{ ...readablePlate(t), color: t.ink }}>
                    {PATTERNS[k].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. קטגוריות — אותו עורך שיש בדף המוצרים. כאן כי זה המקום שבו
              מחפשים "עיצוב"; שם כי שם מגדירים את הקטגוריות עצמן. */}
          <div data-testid="settings-categories">
            <span className="text-[12px] font-semibold">4. קטגוריות</span>
            <span className="text-[12px] text-[var(--faint)]"> · איך נראית שורת הקטגוריות בדוכן</span>
            {(store.categories?.length ?? 0) > 0 ? (
              <>
                <div
                  className="s-look mt-1.5 border border-[var(--line)] pt-3 overflow-hidden"
                  style={{
                    ...(themeCssVars(t) as Record<string, string>),
                    ...lookCssVars(t, look),
                    background: storeBackground(t, bgPattern, bgPreview),
                    color: t.ink,
                    fontFamily: lk.font,
                  }}
                >
                  <CategoryBar
                    categories={store.categories ?? []}
                    active={null}
                    onSelect={() => setCatDesignOpen(true)}
                    layout={layoutOrDefault(store.category_layout)}
                    size={sizeOrDefault(store.category_size)}
                    meta={cleanMeta(store.category_meta)}
                  />
                </div>
                <button
                  onClick={() => setCatDesignOpen(true)}
                  data-testid="settings-open-category-designer"
                  className="w-full mt-2 min-h-12 border-2 border-[var(--ink)] bg-white text-[13px] font-bold"
                >
                  🎨 עיצוב הקטגוריות · צורה, גודל, אייקונים ותמונות
                </button>
              </>
            ) : (
              <div className="mt-1.5 bg-white border border-dashed border-[var(--line)] p-3.5 text-[12.5px] text-[var(--muted)] leading-relaxed">
                עוד אין קטגוריות בדוכן. מוסיפים אותן בדף המוצרים, ואז חוזרים לכאן לעצב אותן.
                <a href="/dashboard/products" className="block mt-2 text-[var(--ink)] font-semibold underline">
                  לדף המוצרים
                </a>
              </div>
            )}
          </div>
        </div>

            </>
          )}
          {section === "products" && (
            <>
        <div id="products-display" className="scroll-mt-14 bg-white border border-[var(--line)] p-4 flex flex-col gap-4" data-testid="products-display">
          <div>
            <label htmlFor="featured-title" className="block text-[12px] text-[var(--muted)] mb-1.5">
              כותרת לחלק המומלצים
            </label>
            <input
              id="featured-title"
              value={featuredTitle}
              maxLength={40}
              aria-label="כותרת המומלצים"
              placeholder="המומלצים שלי"
              onChange={(e) => { setFeaturedTitle(e.target.value); setDirty(true); }}
              className="w-full border border-[var(--line)] bg-white px-3 py-2.5 text-[13px]"
            />
            <p className="text-[11.5px] text-[var(--faint)] mt-1.5 leading-snug">
              מסמנים ⭐ מומלץ בעריכת מוצר, והוא מופיע בחלק הזה בראש הדוכן.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <span className="block text-[13px] font-semibold">מוצר שאזל</span>
              <span className="block text-[11.5px] text-[var(--muted)] leading-snug mt-0.5">
                {showSoldOut
                  ? "מופיע בסוף הדוכן עם תווית \"אזל\"."
                  : "יורד מהדוכן לבד, וחוזר כשמוסיפים מלאי. לא צריך למחוק אותו."}
              </span>
            </div>
            <Choice
              value={!showSoldOut}
              onChange={(hide) => { setShowSoldOut(!hide); setDirty(true); }}
              on="🙈 להסתיר אותו"
              off="🏷️ להציג עם 'אזל'"
              label="מה קורה למוצר שאזל"
              testid="show-sold-out-toggle"
            />
          </div>
        </div>

            </>
          )}
          {section === "promo" && (
            <>
        {/* ── הודעה לקונות ──
            המקום היחיד לכתוב "בקנייה מעל ₪50 מקבלים מתנה" היה עד היום
            התיאור, והוא מיועד לספר מה יש בדוכן — לא להכריז על מבצע
            שנגמר בסוף החודש. */}
        <div id="promo" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-bold">ההודעה בדוכן</div>
              <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
                מופיעה בדוכן מתחת לשם, מעל המוצרים.
              </p>
            </div>

          </div>

          <div className="mt-2.5">
            <Choice
              value={promo.promo_on}
              onChange={(v) => { setPromo({ ...promo, promo_on: v }); setDirty(true); }}
              on="📣 מופיעה בדוכן"
              off="💤 כבויה"
              label="להציג את ההודעה בדוכן"
              testid="promo-toggle"
            />
          </div>

          <label className="block text-[12px] text-[var(--muted)] mt-3 mb-1">כותרת קצרה</label>
          <input
            value={promo.promo_title}
            onChange={(e) => { setPromo({ ...promo, promo_title: e.target.value }); setDirty(true); }}
            placeholder="מבצע החודש"
            aria-label="כותרת ההודעה"
            maxLength={40}
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
          />

          <label className="block text-[12px] text-[var(--muted)] mt-2.5 mb-1">מה ההודעה?</label>
          <textarea
            value={promo.promo_text}
            onChange={(e) => { setPromo({ ...promo, promo_text: e.target.value }); setDirty(true); }}
            placeholder="למשל: בקנייה מעל ₪50 מקבלים מחזיק מפתחות מתנה 🎁"
            aria-label="תוכן ההודעה"
            maxLength={180}
            rows={3}
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] resize-none"
          />
          <div className="text-[11.5px] text-[var(--faint)] mt-1 text-start">
            {promo.promo_text.length}/180
          </div>

          {/* תצוגה מקדימה בערכת הנושא של הדוכן — כדי שלא צריך לפרסם
              ואז לבדוק איך זה נראה */}
          {promo.promo_text.trim() && (
            <>
              <div className="text-[12px] text-[var(--muted)] mt-2 mb-1">ככה זה ייראה:</div>
              <div
                data-testid="promo-preview"
                className="border-[1.5px] px-3.5 py-3 text-center"
                style={{ background: t.surface, borderColor: t.primary, color: t.ink }}
              >
                <div className="text-[12px] font-bold" style={{ color: t.primary }}>
                  {promo.promo_title.trim() || "מבצע החודש"}
                </div>
                <p className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-line">{promo.promo_text}</p>
              </div>
            </>
          )}

          {!promo.promo_on && promo.promo_text.trim() && (
            <p className="text-[12px] text-[var(--warn-ink)] mt-2">
              ההודעה כבויה כרגע ולא מופיעה בדוכן. מה שכתבת נשמר.
            </p>
          )}
        </div>

            </>
          )}
          {section === "coupons" && (
            <div className="bg-white border border-[var(--line)] p-3" id="coupons" data-testid="seller-coupons">
              <SellerCoupons store={store} />
            </div>
          )}
          {section === "payment" && (
            <>
        {/* איך משלמים לי — הכסף של הילדה. לא קשור לתשלום ההקמה לדוכן. */}
        <div id="payment" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">מה מקבלים ממך?</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            מה שמסומן מופיע לקונים לפני ההזמנה וגם בהודעה. הכסף עובר ישירות
            אלייך — דוכן לא נוגע בו ולא לוקח עמלה.
          </p>
          <div className="flex flex-col gap-1.5 mt-2.5">
            {([
              ["payout_bit", "ביט", "למספר הוואטסאפ שלך"],
              ["payout_paybox", "פייבוקס", "אם יש לך"],
              ["payout_cash", "מזומן", "במסירה, פנים אל פנים"],
            ] as const).map(([key, label, hint]) => (
              <button
                key={key}
                onClick={() => { setPayout({ ...payout, [key]: !payout[key] }); setDirty(true); }}
                className={`flex items-center gap-2.5 border-[1.5px] px-3 py-2.5 text-right ${
                  payout[key] ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-[var(--line)]"
                }`}
              >
                <span className={`w-4 h-4 flex items-center justify-center text-[11px] ${
                  payout[key] ? "bg-[var(--ink)] text-white" : "border border-[#D3D5DC]"
                }`}>
                  {payout[key] ? "✓" : ""}
                </span>
                <span className="text-[13px] font-medium flex-1">{label}</span>
                <span className="text-[12px] text-[var(--muted)]">{hint}</span>
              </button>
            ))}
          </div>
          {/* לכל אמצעי — מספר או לינק, ואפשר ששניהם יובילו לאנשים שונים
              (אבא בביט, אח בפייבוקס). לינק פותח את האפליקציה ישר על
              ההעברה; מספר מוצג לקונה עם כפתור העתקה. */}
          <div className="mt-3 border border-[var(--line)] p-3">
            <div className="text-[12.5px] font-bold mb-2">ביט — לאן מעבירים?</div>
            <input
              value={payout.payout_bit_phone ?? ""}
              onChange={(e) => { setPayout({ ...payout, payout_bit_phone: e.target.value }); setDirty(true); }}
              placeholder="מספר הביט, למשל 050-1234567"
              aria-label="מספר ביט"
              inputMode="tel"
              dir="ltr"
              maxLength={14}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] text-right"
            />
            {!!payout.payout_bit_phone?.trim() && !isPayPhone(payout.payout_bit_phone) && (
              <p className="text-[12px] text-[var(--danger)] mt-1">זה לא נראה כמו מספר נייד ישראלי.</p>
            )}
            <input
              value={payout.payout_bit_link ?? ""}
              onChange={(e) => { setPayout({ ...payout, payout_bit_link: e.target.value }); setDirty(true); }}
              placeholder="או לינק מאפליקציית ביט (אם יש)"
              aria-label="לינק ביט"
              dir="ltr"
              maxLength={200}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] text-right mt-1.5"
            />
            {!!payout.payout_bit_link?.trim() && !isBitLink(payout.payout_bit_link.trim()) && (
              <p className="text-[12px] text-[var(--danger)] mt-1">
                זה לא נראה כמו לינק של ביט. מטעמי בטיחות אפשר רק אותו.
              </p>
            )}
          </div>
          <div className="mt-2 border border-[var(--line)] p-3">
            <div className="text-[12.5px] font-bold mb-2">פייבוקס — לאן מעבירים?</div>
            <input
              value={payout.payout_paybox_phone ?? ""}
              onChange={(e) => { setPayout({ ...payout, payout_paybox_phone: e.target.value }); setDirty(true); }}
              placeholder="מספר הפייבוקס, למשל 052-7654321"
              aria-label="מספר פייבוקס"
              inputMode="tel"
              dir="ltr"
              maxLength={14}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] text-right"
            />
            {!!payout.payout_paybox_phone?.trim() && !isPayPhone(payout.payout_paybox_phone) && (
              <p className="text-[12px] text-[var(--danger)] mt-1">זה לא נראה כמו מספר נייד ישראלי.</p>
            )}
            <input
              value={payout.payout_paybox_link ?? ""}
              onChange={(e) => { setPayout({ ...payout, payout_paybox_link: e.target.value }); setDirty(true); }}
              placeholder="או לינק מאפליקציית פייבוקס (אם יש)"
              aria-label="לינק פייבוקס"
              dir="ltr"
              maxLength={200}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] text-right mt-1.5"
            />
            {!!payout.payout_paybox_link?.trim() && !isPayboxLink(payout.payout_paybox_link.trim()) && (
              <p className="text-[12px] text-[var(--danger)] mt-1">
                זה לא נראה כמו לינק של פייבוקס. מטעמי בטיחות אפשר רק אותו.
              </p>
            )}
          </div>
          <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed">
            מספיק מספר. הקונות יראו אותו עם כפתור העתקה ואת הסכום להעברה.
            לינק (מ"בקשת תשלום" באפליקציה) פותח להן את האפליקציה ישר — אם יש, עדיף.
          </p>
          {/* אופציה שלישית: בלי מספר ובלי לינק — סוגרים את התשלום בשיחה.
              הכפתור אצל הקונה נפתח עם הודעה מוכנה על ההזמנה והסכום. */}
          <button
            onClick={() => { setPayout({ ...payout, payout_whatsapp: !payout.payout_whatsapp }); setDirty(true); }}
            aria-pressed={payout.payout_whatsapp}
            aria-label="לסגור תשלום בוואטסאפ"
            className={`mt-2 w-full flex items-center gap-2.5 border-[1.5px] px-3 py-3 text-right ${
              payout.payout_whatsapp ? "border-[var(--ink)]" : "border-[var(--line)]"
            }`}
          >
            <span className={`w-5 h-5 shrink-0 border-[1.5px] flex items-center justify-center text-[12px] ${
              payout.payout_whatsapp ? "bg-[var(--ink)] border-[var(--ink)] text-white" : "border-[var(--line)]"
            }`} aria-hidden>{payout.payout_whatsapp ? "✓" : ""}</span>
            <span className="flex-1">
              <span className="block text-[13px] font-medium">💬 לסגור תשלום בוואטסאפ</span>
              <span className="block text-[12px] text-[var(--muted)] mt-0.5">
                הקונה תקבל כפתור שפותח איתך שיחה על ההזמנה, ותקבעו ביניכן איך משלמים.
              </span>
            </span>
          </button>

          {/* "הערה לקונה" ירדה: היא נדחפה לתוך הודעת הוואטסאפ בלי שהיה
              ברור איפה היא מופיעה, ורוב מה שנכתב בה היה מספר טלפון —
              בדיוק מה שאסור שיישב בהודעה. */}
          {!payout.payout_bit && !payout.payout_paybox && !payout.payout_cash && (
            <p className="text-[12px] text-[var(--warn-ink)] mt-1.5">
              לא סומן כלום, הקונים יצטרכו לשאול אותך בוואטסאפ איך לשלם.
            </p>
          )}
        </div>

            </>
          )}
          {section === "shipping" && (
            <>
        {/* משלוחים */}
        <div className="bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">איך המוצרים מגיעים לקונים?</div>
          <div className="text-[12px] text-[var(--muted)] mb-2.5">
            {info.ships ? "המשלוח מופיע בדוכן ובהודעת ההזמנה." : "הקונים יודעים שמוסרים ביד ומתאמים בוואטסאפ."}
          </div>
          <Choice
            value={info.ships}
            onChange={(v) => { setInfo({ ...info, ships: v }); setDirty(true); }}
            on="🚚 גם משלוח"
            off="🤝 רק מסירה ביד"
            label="יש משלוחים"
            testid="ships-choice"
          />
          {info.ships && (
            <>
              <label className="block text-[12px] text-[var(--muted)] mt-2.5 mb-1">איך ולאן</label>
              <textarea
                value={info.shipping_note}
                onChange={(e) => { setInfo({ ...info, shipping_note: e.target.value }); setDirty(true); }}
                placeholder="שולחת בדואר לכל הארץ, מגיע תוך שבוע. באזור שלי אפשר גם למסור ביד."
                maxLength={200}
                rows={2}
                aria-label="פרטי משלוח"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] resize-none"
              />
              <label className="block text-[12px] text-[var(--muted)] mt-2 mb-1">מחיר משלוח (₪)</label>
              <input
                value={info.shipping_price}
                onChange={(e) => { setInfo({ ...info, shipping_price: typedPrice(e.target.value, 3) }); setDirty(true); }}
                inputMode="decimal"
                placeholder="למשל: 15 או 12.90"
                maxLength={6}
                aria-label="מחיר משלוח"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
              <p className="text-[12px] text-[var(--muted)] mt-1">
                אפשר להשאיר ריק, ואז כתוב רק שיש משלוח והמחיר נסגר בוואטסאפ.
              </p>
            </>
          )}
        </div>

            </>
          )}
          {section === "order" && (
            <>
        {/* איך ההזמנה מגיעה אליך */}
        <div id="order-msg" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <ol className="text-[12.5px] text-[var(--muted)] leading-relaxed flex flex-col gap-1">
            <li>1. בוחרים מוצרים בדוכן ולוחצים "שליחה בוואטסאפ".</li>
            <li>2. וואטסאפ נפתח <b>אצלם</b>, וההודעה כבר כתובה בפנים.</li>
            <li>3. לוחצים שלח, וההודעה נוחתת אצלך כהודעת וואטסאפ רגילה.</li>
          </ol>
          <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-2">
            ההודעה נכתבת לבד, אין מה למלא כאן. השם ומספר ההזמנה בשורה הראשונה,
            כדי שתדעי איזו הודעה שייכת לאיזו הזמנה כבר מרשימת השיחות:
          </p>
          {/* בלי "שורת פתיחה" ו"שורת סיום": שתי תיבות שביקשו טקסט לפני
              שבכלל היה ברור מה ההודעה, וההודעה מסתדרת מצוין בלעדיהן. */}
          <div className="mt-2 bg-[var(--canvas)] border border-[var(--line)] p-3 text-[12.5px] leading-relaxed whitespace-pre-line">
            {`היי! 👋 אני נועה · הזמנה #7
ראיתי את הדוכן שלך ואני רוצה להזמין:

• סקוויש אבוקדו × 1 · ₪18
• צמיד קשת × 2 · ₪30

סה"כ: ₪48${shipExampleLine ? `\n${shipExampleLine}` : ""}${payExampleLine ? `\n${payExampleLine}` : ""}`}
          </div>
          <p className="text-[12px] text-[var(--muted)] mt-2 leading-relaxed">
            {payLabels.length
              ? `הקונה בוחרת בקופה מתוך מה שסימנת למטה (${payLabels.join(" / ")}), ומה שהיא בחרה מופיע בהודעה.`
              : "עוד לא סומן איך משלמים לך, אז אין שורת תשלום בהודעה."}
          </p>
        </div>

            </>
          )}
          {section === "details" && (
            <>
        {/* שלושת הפרטים שאינם חלק מהתצוגה של הדוכן, בכרטיס אחד.
            הטלפון ישב קודם לבדו באמצע המסך עם רווחים גדולים סביבו ובלי
            להסביר למה הוא שם. העיר מופיעה כאן וגם על הדוכן למעלה, ושתי
            התיבות קשורות לאותו ערך — מה שמקלידים בזו מתעדכן בזו. */}
        <div id="about" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <label className="block text-[12px] text-[var(--muted)] mb-1">
            הטלפון שלך בוואטסאפ, לשם מגיעות ההזמנות
          </label>
          <input
            value={phone}
            inputMode="tel"
            dir="ltr"
            aria-label="טלפון וואטסאפ"
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            className="w-full border border-[var(--line)] bg-white px-3 py-2.5 text-[13px] text-right text-[var(--ink)]"
          />
          {normalizePhone(phone) && (
            <a
              href={`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent("בדיקה, זו אני 🙂")}`}
              target="_blank"
              rel="noreferrer"
              className="block text-[12px] text-[var(--ok-ink)] underline mt-1"
            >
              בדיקה: פתיחת וואטסאפ למספר {displayPhone(normalizePhone(phone)!)}
            </a>
          )}

          <div className="flex gap-2 mt-3">
            <div className="w-24">
              <label className="block text-[12px] text-[var(--muted)] mb-1">גיל</label>
              <input
                value={info.age}
                onChange={(e) => { setInfo({ ...info, age: e.target.value.replace(/\D/g, "").slice(0, 2) }); setDirty(true); }}
                placeholder="11"
                inputMode="numeric"
                maxLength={2}
                aria-label="גיל"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] text-[var(--muted)] mb-1">עיר בארץ</label>
              <input
                value={info.city}
                onChange={(e) => { setInfo({ ...info, city: e.target.value }); setDirty(true); }}
                placeholder="למשל: רמת גן"
                maxLength={30}
                aria-label="עיר בארץ"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
            </div>
          </div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-1.5">
            הגיל לא מופיע בדוכן ולא בקוד המקור. העיר כן מופיעה, למעלה מתחת
            לשם, כדי שהקונים ידעו אם המסירה הגיונית. אף פעם לא כתובת.
          </p>
        </div>

            </>
          )}
          </div>
        </>
      )}

      {catDesignOpen && (
        <CategoryDesigner
          store={store}
          onClose={() => setCatDesignOpen(false)}
          onSaved={(patch) => {
            setStore({ ...store, ...patch });
            setCatDesignOpen(false);
            showToast("עיצוב הקטגוריות נשמר ✨");
          }}
        />
      )}

      {/* הכפתור ישב פעם בתחתית הדף הארוך — מי ששינתה את השם למעלה לא
          ידעה שיש בכלל מה ללחוץ, ריעננה, והשינוי נעלם. עכשיו הוא צף
          מעל שורת הניווט ברגע שיש שינוי, תמיד על המסך. */}
      {dirty && <div className="h-12" aria-hidden />}
      {dirty && (
        <div className="fixed bottom-[64px] inset-x-0 max-w-md mx-auto px-3 z-40">
          <button
            data-testid="save-settings"
            onClick={save}
            className="w-full bg-[var(--ink)] text-white py-3 text-sm font-bold"
          >
            שמירת שינויים
          </button>
        </div>
      )}


      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
