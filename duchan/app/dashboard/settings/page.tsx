"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, mediaUrl, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { deliveryLine, isPayoutLink, payMethods, payoutLabels, payoutLine } from "@/lib/payouts";
import { COVERS, coverCss } from "@/lib/covers";
import { ACTIVATION_PRICE } from "@/lib/pricing";

// "החנות שלי" — המסך שמחזיק את המוצר. תצוגה מקדימה חיה: בוחרים ערכה והחנות משתנה מולך.

const EMOJIS = ["🦄", "🍩", "🐼", "🍦", "🌈", "🍓", "🐻", "⭐", "🧁", "🐸"];

export default function SettingsPage() {
  const { store, setStore, loading } = useStore();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [emoji, setEmoji] = useState("🦄");
  const [theme, setTheme] = useState<ThemeKey>("cloud");
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

  async function save() {
    if (!store) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      showToast("מספר הוואטסאפ לא נראה תקין, לבדוק שוב");
      return;
    }
    const link = payout.payout_link?.trim();
    if (link && !isPayoutLink(link)) {
      showToast("אפשר להדביק כאן רק לינק של ביט או פייבוקס");
      return;
    }
    const supa = supabaseBrowser();
    const patch = {
      display_name: name.trim() || store.display_name,
      tagline: tagline.trim() || null,
      emoji,
      theme,
      contact_phone: normalized,
      payout_bit: payout.payout_bit,
      payout_paybox: payout.payout_paybox,
      payout_cash: payout.payout_cash,
      payout_note: payout.payout_note?.trim() || null,
      payout_link: payout.payout_link?.trim() || null,
      // התיאור כולו יושב ב-tagline. about מתאפס בשמירה כדי שהדוכן לא יציג
      // את אותו טקסט פעמיים, אחרי שהתוכן שלו כבר אוחד לשדה היחיד.
      about: null,
      city: info.city.trim() || null,
      age: info.age !== "" && Number(info.age) >= 5 && Number(info.age) <= 18 ? Number(info.age) : null,
      ships: info.ships,
      shipping_note: info.ships ? info.shipping_note.trim() || null : null,
      shipping_price: info.ships && info.shipping_price !== "" ? Math.max(0, Math.min(200, Math.round(Number(info.shipping_price) || 0))) : null,
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

  return (
    <div>
      {/* בלי כותרת "החנות שלי" מעל: היא לא אמרה כלום שהמסך לא אומר בעצמו,
          ודחפה את הניווט המהיר מטה. הניווט הוא הדבר הראשון שרואים. */}
      <div className="sticky top-0 z-30 flex gap-1.5 px-3 py-2.5 bg-white border-b border-[var(--line)] overflow-x-auto">
        <a
          href="/dashboard/products"
          className="shrink-0 flex items-center gap-1 bg-[var(--ink)] text-white px-3 py-1.5 text-[12px] font-bold"
        >
          📦 עריכת מוצרים
        </a>
        <a href="#identity" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          זהות
        </a>
        <a href="#design" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          עיצוב
        </a>
        <a href="#about" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          פרטי הדוכן
        </a>
        <a href="#order-msg" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          הודעת הזמנה
        </a>
        <a href="#promo" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          הודעה לקונות
        </a>
        <a href="#payment" className="shrink-0 border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium">
          תשלום
        </a>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* מצב חופשה */}
        {store.status === "blocked" ? (
          <div className="bg-[var(--danger-bg)] border border-[var(--danger-line)] p-3 text-[13px] text-[var(--danger)]">
            החנות הושבתה על ידי הנהלת דוכן.
          </div>
        ) : (
          <div className="bg-white border border-[var(--line)] p-3 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">
                {store.status === "active" ? "הדוכן פתוח" : "הדוכן בהפסקה"}
              </div>
              {/* הטוגל לבדו לא אמר שאפשר לחזור אחורה, וזה מה שגרם להיסוס:
                  צריך לכתוב במפורש שסגירה היא זמנית ושום דבר לא נמחק. */}
              <div className="text-[12px] text-[var(--muted)] leading-relaxed">
                {store.status === "active"
                  ? "כולם יכולים להיכנס ולהזמין. אפשר לסגור את הדוכן מתי שרוצים בלחיצה כאן, ולפתוח שוב אחר כך."
                  : "הלינק מציג 'הדוכן סגור כרגע'. המוצרים וההזמנות נשמרו, לחיצה כאן פותחת שוב."}
              </div>
            </div>
            <button
              onClick={togglePause}
              className={`w-11 h-6.5 relative transition ${store.status === "active" ? "bg-[var(--ok-ink)]" : "bg-[var(--stone)]"}`}
              style={{ width: 44, height: 26 }}
              aria-label="פתיחה או סגירה של הדוכן"
            >
              <i
                className="absolute top-[3px] w-[20px] h-[20px] bg-white transition-all"
                style={{ right: store.status === "active" ? 21 : 3 }}
              />
            </button>
          </div>
        )}

        {/* הדוכן עצמו, ניתן לעריכה במקום.
            אין כאן "תצוגה מקדימה" למעלה ו"שדות" למטה: השם נערך במקום שבו
            הוא מופיע, וכך גם המשפט, התיאור, העיר, התמונה והקאבר. מה שרואים
            זה מה שהקונות יראו, ומתחת המוצרים האמיתיים. */}
        <div>
          <div className="t-label mb-1.5">הדוכן שלך — לחיצה על השם, התיאור או התמונה עורכת אותם</div>

          <input ref={coverRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />

          <div
            id="identity"
            className="scroll-mt-14 overflow-hidden border border-[var(--line)]"
            style={{ background: t.bg, color: t.ink, fontFamily: t.font }}
          >
            {/* קאבר */}
            <button
              onClick={() => coverRef.current?.click()}
              aria-label="החלפת תמונת הקאבר"
              className="block w-full h-28 overflow-hidden relative"
              style={coverPreview ? undefined : { background: coverCss(preset) }}
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
                    style={{ background: t.surface, border: `2px solid ${t.bg}` }}
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
                      {info.shipping_price !== "" ? ` ₪${info.shipping_price}` : " בתיאום"}
                    </span>
                  </>
                )}
              </div>

              {/* המוצרים האמיתיים */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {(products.length ? products : [null]).map((p, i) =>
                  p ? (
                    <div key={p.id} style={{ background: t.surface, border: `1px solid ${t.border}` }}>
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
                          <span className="text-[12px] font-bold">₪{p.price}</span>
                          <span className="px-2 py-1 text-[11px] font-bold"
                            style={{ background: t.primary, color: t.onPrimary }}>
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

        <div id="design" className="scroll-mt-14">
          <span className="text-[12px] text-[var(--muted)]">ערכת נושא</span>
          <p className="text-[12px] text-[var(--faint)] mt-0.5">כל ערכה משנה את צבעי החנות. לוחצים ורואים למעלה בתצוגה המקדימה.</p>
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
                <div className="p-1" style={{ border: `1px solid ${th.border}`, background: th.surface }}>
                  <div className="h-6 flex items-center justify-center text-[13px] opacity-70">🧁</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[8.5px] font-bold" style={{ color: th.ink }}>₪15</span>
                    <span className="px-1.5 py-[3px] text-[8px] font-bold"
                      style={{ background: th.primary, color: th.onPrimary }}>
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

        {/* שלושת הפרטים שאינם חלק מהתצוגה של הדוכן, בכרטיס אחד.
            הטלפון ישב קודם לבדו באמצע המסך עם רווחים גדולים סביבו ובלי
            להסביר למה הוא שם. העיר מופיעה כאן וגם על הדוכן למעלה, ושתי
            התיבות קשורות לאותו ערך — מה שמקלידים בזו מתעדכן בזו. */}
        <div id="about" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">פרטים שלך</div>

          <label className="block text-[12px] text-[var(--muted)] mt-2 mb-1">
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

        {/* משלוחים */}
        <div className="bg-white border border-[var(--line)] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-bold">משלוחים</div>
              <div className="text-[12px] text-[var(--muted)]">
                {info.ships ? "מוצג בדף החנות ובהודעת ההזמנה" : "כרגע: מסירה ביד בלבד"}
              </div>
            </div>
            <button
              onClick={() => { setInfo({ ...info, ships: !info.ships }); setDirty(true); }}
              aria-label="יש משלוחים"
              aria-pressed={info.ships}
              className={`relative ${info.ships ? "bg-[var(--ok-ink)]" : "bg-[var(--stone)]"}`}
              style={{ width: 44, height: 26 }}
            >
              <i
                className="absolute top-[3px] w-[20px] h-[20px] bg-white transition-all"
                style={{ right: info.ships ? 21 : 3 }}
              />
            </button>
          </div>
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
                onChange={(e) => { setInfo({ ...info, shipping_price: e.target.value.replace(/\D/g, "") }); setDirty(true); }}
                inputMode="numeric"
                placeholder="למשל: 15"
                maxLength={3}
                aria-label="מחיר משלוח"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
              <p className="text-[12px] text-[var(--muted)] mt-1">
                אפשר להשאיר ריק, ואז כתוב רק שיש משלוח והמחיר נסגר בוואטסאפ.
              </p>
            </>
          )}
        </div>

        {/* איך ההזמנה מגיעה אליך */}
        <div id="order-msg" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">
            זה מה שיגיע לך בוואטסאפ כשמישהו רוצה להזמין
          </div>
          <ol className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1.5 flex flex-col gap-1">
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

        {/* ── הודעה לקונות ──
            המקום היחיד לכתוב "בקנייה מעל ₪50 מקבלים מתנה" היה עד היום
            התיאור, והוא מיועד לספר מה יש בדוכן — לא להכריז על מבצע
            שנגמר בסוף החודש. */}
        <div id="promo" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-bold">הודעה לקונות</div>
              <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
                מופיעה בדוכן מתחת לשם, מעל המוצרים.
              </p>
            </div>
            <button
              onClick={() => { setPromo({ ...promo, promo_on: !promo.promo_on }); setDirty(true); }}
              aria-pressed={promo.promo_on}
              aria-label="הצגת ההודעה בדוכן"
              data-testid="promo-toggle"
              className={`shrink-0 w-12 h-7 border-[1.5px] flex items-center px-0.5 ${
                promo.promo_on ? "bg-[var(--ink)] border-[var(--ink)] justify-end" : "border-[var(--line)] justify-start"
              }`}
            >
              <span className={`w-5 h-5 ${promo.promo_on ? "bg-white" : "bg-[#D3D5DC]"}`} />
            </button>
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

        {/* איך משלמים לי — הכסף של הילדה. לא קשור לתשלום ההקמה לדוכן. */}
        <div id="payment" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">איך משלמים לי</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            מה שמסומן כאן יופיע לקונים לפני שהם שולחים את ההזמנה, וגם בהודעת
            הוואטסאפ. הכסף עובר ישירות אליך, דוכן לא נוגע בו ולא לוקח עמלה.
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
          {/* לינק תשלום — הופך "תשלמי לי בפייבוקס" ללחיצה אחת.
              מותרים רק לינקים של ביט ופייבוקס, וזה נאכף גם בדאטהבייס. */}
          <label className="block text-[12px] text-[var(--muted)] mt-3 mb-1">
            לינק לתשלום אם יש (לא חובה)
          </label>
          <input
            value={payout.payout_link ?? ""}
            onChange={(e) => { setPayout({ ...payout, payout_link: e.target.value }); setDirty(true); }}
            placeholder="להדביק כאן לינק מביט או מפייבוקס"
            aria-label="לינק לתשלום"
            /* dir=ltr כדי שהכתובת תיקרא נכון, text-right כדי שהיא תתחיל
               באותו צד כמו כל שאר השדות במסך ולא תיתקע בשמאל */
            dir="ltr"
            maxLength={200}
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] text-right"
          />
          <p className="text-[12px] text-[var(--muted)] mt-1 leading-relaxed">
            בפייבוקס או בביט: פותחים את האפליקציה, "בקשת תשלום" או "הלינק שלי",
            ומעתיקים. הקונים יראו כפתור שמעביר אותם ישר לשם.
          </p>
          {!!payout.payout_link?.trim() && !isPayoutLink(payout.payout_link.trim()) && (
            <p className="text-[12px] text-[var(--danger)] mt-1">
              זה לא נראה כמו לינק של ביט או פייבוקס. מטעמי בטיחות אפשר רק אותם.
            </p>
          )}

          {/* "הערה לקונה" ירדה: היא נדחפה לתוך הודעת הוואטסאפ בלי שהיה
              ברור איפה היא מופיעה, ורוב מה שנכתב בה היה מספר טלפון —
              בדיוק מה שאסור שיישב בהודעה. */}
          {!payout.payout_bit && !payout.payout_paybox && !payout.payout_cash && (
            <p className="text-[12px] text-[var(--warn-ink)] mt-1.5">
              לא סומן כלום, הקונים יצטרכו לשאול אותך בוואטסאפ איך לשלם.
            </p>
          )}
        </div>

        {dirty && (
          <button data-testid="save-settings" onClick={save} className="bg-[var(--ink)] text-white py-3 text-sm font-bold">
            שמירת שינויים
          </button>
        )}

        {/* הקופסה הזו הייתה כתובת אינטרנט ערומה ושני כפתורים, ולילד זה לא
            אמר כלום. עכשיו היא אומרת קודם *מתי* משתמשים בה, ורק אחר כך
            מראה את הקישור. */}
        <div className="bg-white border border-[var(--line)] p-3 mt-1">
          <div className="text-[13px] font-bold leading-relaxed">
            {products.length
              ? "יש כבר מוצרים בדוכן, ואתם מוכנים לשתף את החברים? לחצו כאן"
              : "אחרי שתכניסו כמה מוצרים לדוכן, פה משתפים אותו עם החברים"}
          </div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-1">
            זה הקישור לדוכן שלך. כל מי שלוחץ עליו רואה את המוצרים ויכול להזמין.
          </p>
          {!store.activated_at && (
            <div data-testid="preview-notice" className="text-[12px] text-[var(--warn-ink)] leading-relaxed mt-1.5">
              👀 כרגע זו תצוגה מקדימה: אפשר לשלוח והחברים יראו הכל, אבל עדיין
              אי אפשר להזמין. הפרסום למטה פותח את ההזמנות.
            </div>
          )}
          <div className="text-[12px] text-[var(--muted)] font-mono my-2" dir="ltr">{storeUrl}</div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(storeUrl); showToast("הלינק הועתק"); }}
              className="flex-1 border border-[var(--line)] py-2.5 text-[12px] font-medium">
              העתקת הקישור
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`בואו לראות את הדוכן שלי! ${storeUrl}`)}`}
              className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12px] font-medium text-center">
              שליחה לחברים
            </a>
          </div>
        </div>

        {/* התשלום היה מוסתר מאחורי "לפרסם את הדוכן", ולא היה ברור שיש כאן
            שני שלבים: משלמים, ואז מרינה מאשרת. עכשיו זה כתוב במפורש. */}
        {!store.activated_at && (
          <a href="/activate" data-testid="publish-cta" className="bg-[var(--ink)] text-white p-3.5 mt-1 block">
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
        )}

        <a href={storeUrl} className="text-center text-xs text-[var(--muted)] underline py-1">
          צפייה בחנות כמו שקונות רואות אותה ←
        </a>

        <button onClick={logout} className="text-center text-xs text-[var(--muted)] py-2">
          יציאה מהחשבון
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
