"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, mediaUrl, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { isPayoutLink } from "@/lib/payouts";
import { COVERS, coverCss } from "@/lib/covers";

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
    order_intro: "",
    order_outro: "",
  });
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

  useEffect(() => {
    if (!store) return;
    setName(store.display_name);
    setTagline(store.tagline ?? "");
    setEmoji(store.emoji);
    setTheme(store.theme);
    setPhone(displayPhone(store.contact_phone));
    setCoverPreview(mediaUrl(store.cover_key));
    setPreset(store.cover_preset ?? null);
    setInfo({
      about: store.about ?? "",
      city: store.city ?? "",
      age: store.age == null ? "" : String(store.age),
      ships: store.ships ?? false,
      shipping_note: store.shipping_note ?? "",
      shipping_price: store.shipping_price == null ? "" : String(store.shipping_price),
      order_intro: store.order_intro ?? "",
      order_outro: store.order_outro ?? "",
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
      about: info.about.trim() || null,
      city: info.city.trim() || null,
      age: info.age !== "" && Number(info.age) >= 5 && Number(info.age) <= 18 ? Number(info.age) : null,
      ships: info.ships,
      shipping_note: info.ships ? info.shipping_note.trim() || null : null,
      shipping_price: info.ships && info.shipping_price !== "" ? Math.max(0, Math.min(200, Math.round(Number(info.shipping_price) || 0))) : null,
      order_intro: info.order_intro.trim() || null,
      order_outro: info.order_outro.trim() || null,
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
    showToast(next === "paused" ? "החנות בהפסקה. הלינק מציג 'החנות סגורה'" : "החנות פתוחה שוב 🎉");
  }

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  const storeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${store.slug}`;

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
        <h1 className="text-lg font-bold">החנות שלי</h1>
      </header>

      {/* ניווט מהיר — הדבר הראשון שרואים, כדי שאין צורך לגלול כדי למצוא משהו */}
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
                {store.status === "active" ? "החנות פתוחה" : "החנות בהפסקה"}
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {store.status === "active"
                  ? "כולן יכולות להיכנס ולהזמין"
                  : "הלינק מציג 'החנות סגורה כרגע'. הכל נשמר."}
              </div>
            </div>
            <button
              onClick={togglePause}
              className={`w-11 h-6.5 relative transition ${store.status === "active" ? "bg-[var(--ok-ink)]" : "bg-[var(--stone)]"}`}
              style={{ width: 44, height: 26 }}
              aria-label="פתיחה או הפסקה של החנות"
            >
              <i
                className="absolute top-[3px] w-[20px] h-[20px] bg-white transition-all"
                style={{ right: store.status === "active" ? 21 : 3 }}
              />
            </button>
          </div>
        )}

        {/* תצוגה מקדימה חיה.
            לא דוגמית קטנה אלא הדוכן עצמו: אותו קאבר, אותה תמונה, אותו שם,
            ומוצר אמיתי אחד עם כפתור בצבע הערכה. הכל לחיץ, כך שאפשר לערוך
            מכאן במקום לחפש למטה איזה שדה שייך למה. */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="t-label">ככה הדוכן נראה לקונות</span>
            <a href={`/s/${store.slug}`} target="_blank" rel="noreferrer" className="text-[11px] underline text-[var(--muted)]">
              לפתוח את הדוכן האמיתי
            </a>
          </div>
          <div
            className="overflow-hidden border border-[var(--line)]"
            style={{ background: t.bg, color: t.ink, fontFamily: t.font }}
          >
            <button
              onClick={() => coverRef.current?.click()}
              aria-label="החלפת תמונת הקאבר"
              className="block w-full h-24 overflow-hidden relative group"
              style={coverPreview ? undefined : { background: coverCss(preset) }}
            >
              {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
              <span className="absolute bottom-1 left-1 bg-black/55 text-white text-[10px] px-1.5 py-0.5">
                החלפת קאבר
              </span>
            </button>

            <div className="text-center -mt-7 px-3 pb-3">
              <button
                onClick={() => avatarRef.current?.click()}
                aria-label="החלפת תמונת הפרופיל"
                className="relative inline-flex w-14 h-14 items-center justify-center text-2xl overflow-hidden"
                style={{ background: t.surface, border: `2px solid ${t.bg}` }}
              >
                {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : emoji}
                <span
                  className="absolute -bottom-0.5 -left-0.5 w-5 h-5 flex items-center justify-center text-[10px] bg-[var(--ink)] text-white"
                  style={{ borderRadius: "999px" }}
                  aria-hidden
                >
                  ✎
                </span>
              </button>

              <div className="font-bold text-[15px] mt-1.5">{name || "החנות שלך"}</div>
              {tagline && <div className="text-[12px] opacity-70 mt-0.5">{tagline}</div>}
              {/* עיר מוצגת לקונות, גיל לעולם לא */}
              {info.city.trim() && (
                <div className="text-[11px] opacity-60 mt-0.5">{info.city.trim()}</div>
              )}
              {info.about.trim() && (
                <div className="text-[11.5px] opacity-75 mt-1.5 leading-relaxed">{info.about.trim()}</div>
              )}

              {/* מוצר לדוגמה: כאן רואים בפועל את צבע הכפתור של הערכה */}
              <div className="mt-3 text-right" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
                <div className="h-20 flex items-center justify-center text-3xl opacity-70">🧁</div>
                <div className="px-2.5 pb-2.5">
                  <div className="text-[12.5px] font-medium">מוצר לדוגמה</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[13px] font-bold">₪15</span>
                    <span
                      className="px-3 py-1.5 text-[11.5px] font-bold"
                      style={{ background: t.primary, color: t.onPrimary }}
                    >
                      הוספה לסל
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1.5">
            לחיצה על הקאבר או על התמונה העגולה מחליפה אותם. הגיל לא מופיע כאן
            ולא בדוכן.
          </p>
        </div>

        {/* קאבר: תמונה אמיתית או אחד מהמוכנים. תמונה תמיד גוברת. */}
        <input ref={coverRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
        <div id="identity" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">הקאבר של הדוכן</div>
          <div
            className="h-24 mt-2 overflow-hidden relative border border-[var(--line)]"
            style={coverPreview ? undefined : { background: coverCss(preset) }}
          >
            {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => coverRef.current?.click()}
              className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold"
            >
              העלאת תמונה
            </button>
            {coverPreview && (
              <button onClick={removeCover} className="border border-[var(--line)] px-3 text-[12.5px]">
                הסרה
              </button>
            )}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-2.5 mb-1">או רקע מוכן:</div>
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
          </div>
        </div>

        <label className="text-[11px] text-[var(--muted)]">
          שם החנות
          <input value={name} maxLength={40} aria-label="שם החנות"
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]" />
        </label>

        <label className="text-[11px] text-[var(--muted)]">
          משפט אחד עלייך
          <input value={tagline} maxLength={60}
            onChange={(e) => { setTagline(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]" />
        </label>

        <div>
          <span className="text-[11px] text-[var(--muted)]">תמונת פרופיל</span>
          <input ref={avatarRef} type="file" accept="image/*" hidden
            onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />
          <div className="flex items-center gap-3 mt-1 bg-white border border-[var(--line)] p-2.5">
            <div className="w-12 h-12 bg-[var(--canvas)] flex items-center justify-center text-2xl overflow-hidden">
              {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : emoji}
            </div>
            <button onClick={() => avatarRef.current?.click()}
              className="border border-[var(--line)] px-3 py-2 text-xs font-medium">
              📷 העלאת תמונה
            </button>
            {avatarPreview && (
              <button onClick={removeAvatar} className="text-xs text-[var(--muted)] underline">
                חזרה לאמוג'י
              </button>
            )}
          </div>
        </div>

        <div>
          <span className="text-[11px] text-[var(--muted)]">או אמוג'י</span>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { setEmoji(e); setDirty(true); }}
                className={`w-9 h-9 border-[1.5px] bg-white text-lg ${emoji === e && !avatarPreview ? "border-[var(--ink)]" : "border-[var(--line)]"}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div id="design" className="scroll-mt-14">
          <span className="text-[11px] text-[var(--muted)]">ערכת נושא</span>
          <p className="text-[11px] text-[var(--faint)] mt-0.5">כל ערכה משנה את צבעי החנות. לוחצים ורואים למעלה בתצוגה המקדימה.</p>
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
                <span className="block text-[11px] font-medium mt-1.5" style={{ color: th.ink }}>
                  {th.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="text-[11px] text-[var(--muted)]">
          הטלפון שלך (וואטסאפ)
          <input value={phone} inputMode="tel" dir="ltr"
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-left text-[var(--ink)]" />
        </label>
        {/* תצוגה מקדימה של הכפתור — כדי לראות שהמספר באמת עובד */}
        {normalizePhone(phone) && (
          <a href={`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent("בדיקה, זו אני 🙂")}`}
            target="_blank" rel="noreferrer"
            className="text-xs text-center text-[var(--ok-ink)] underline -mt-1">
            בדיקה: פתיחת וואטסאפ למספר {displayPhone(normalizePhone(phone)!)}
          </a>
        )}

        {/* על הדוכן: מה שקונה שואלת לפני שהיא קונה */}
        <div id="about" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">על הדוכן</div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed mt-0.5">
            מוצג מתחת לשם, בדף שקונים רואים.
          </p>
          <label className="block text-[11px] text-[var(--muted)] mt-2.5 mb-1">כמה מילים עלייך ועל הדוכן</label>
          <textarea
            value={info.about}
            onChange={(e) => { setInfo({ ...info, about: e.target.value }); setDirty(true); }}
            placeholder="לדוגמה: אני בת/בן 11, ואני מכינה צמידים מחוטים ומוכרת סקווישים שכבר לא בשימוש."
            maxLength={300}
            rows={3}
            aria-label="על הדוכן"
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] resize-none"
          />
          <div className="flex gap-2 mt-2">
            <div className="w-20">
              <label className="block text-[11px] text-[var(--muted)] mb-1">גיל</label>
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
              <label className="block text-[11px] text-[var(--muted)] mb-1">עיר</label>
              <input
                value={info.city}
                onChange={(e) => { setInfo({ ...info, city: e.target.value }); setDirty(true); }}
                placeholder="למשל: רמת גן"
                maxLength={30}
                aria-label="עיר"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">
            הגיל לא מוצג בחנות ולעולם לא בקוד המקור. רק עיר, לעולם לא כתובת, זה מספיק כדי שקונה תדע אם מסירה הגיונית.
          </p>
        </div>

        {/* משלוחים */}
        <div className="bg-white border border-[var(--line)] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-bold">משלוחים</div>
              <div className="text-[11px] text-[var(--muted)]">
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
              <label className="block text-[11px] text-[var(--muted)] mt-2.5 mb-1">איך ולאן</label>
              <textarea
                value={info.shipping_note}
                onChange={(e) => { setInfo({ ...info, shipping_note: e.target.value }); setDirty(true); }}
                placeholder="שולחת בדואר לכל הארץ, מגיע תוך שבוע. באזור שלי אפשר גם למסור ביד."
                maxLength={200}
                rows={2}
                aria-label="פרטי משלוח"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] resize-none"
              />
              <label className="block text-[11px] text-[var(--muted)] mt-2 mb-1">מחיר משלוח (₪)</label>
              <input
                value={info.shipping_price}
                onChange={(e) => { setInfo({ ...info, shipping_price: e.target.value.replace(/\D/g, "") }); setDirty(true); }}
                inputMode="numeric"
                placeholder="למשל: 15"
                maxLength={3}
                aria-label="מחיר משלוח"
                className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
              />
              <p className="text-[11px] text-[var(--muted)] mt-1">
                אפשר להשאיר ריק, ואז כתוב רק שיש משלוח והמחיר נסגר בוואטסאפ.
              </p>
            </>
          )}
        </div>

        {/* איך ההזמנה מגיעה אלייך */}
        <div id="order-msg" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">ההודעה שהקונה שולחת לך</div>
          {/* השאלה הראשונה כאן היא "מי כותב את זה ומתי", ובלי תשובה לזה
              שתי התיבות למטה נראות כמו טופס בלי הקשר. */}
          <ol className="text-[11.5px] text-[var(--muted)] leading-relaxed mt-1.5 flex flex-col gap-1">
            <li>1. הקונה בוחרת מוצרים בדוכן ולוחצת "שליחה בוואטסאפ".</li>
            <li>2. וואטסאפ נפתח <b>אצלה</b>, וההודעה כבר כתובה בפנים.</li>
            <li>3. היא לוחצת שלח, וההודעה מגיעה אלייך כהודעה רגילה.</li>
          </ol>
          <p className="text-[11.5px] text-[var(--muted)] leading-relaxed mt-2">
            את רשימת המוצרים והסכום המערכת כותבת לבד. מה שאת קובעת כאן זה רק
            המשפט שפותח את ההודעה והמשפט שסוגר אותה.
          </p>
          <label className="block text-[11px] text-[var(--muted)] mt-2.5 mb-1">שורת פתיחה</label>
          <input
            value={info.order_intro}
            onChange={(e) => { setInfo({ ...info, order_intro: e.target.value }); setDirty(true); }}
            placeholder={`היי ${store.display_name.split(" ").pop()}! 👋`}
            maxLength={80}
            aria-label="שורת פתיחה"
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
          />
          <label className="block text-[11px] text-[var(--muted)] mt-2 mb-1">שורת סיום</label>
          <input
            value={info.order_outro}
            onChange={(e) => { setInfo({ ...info, order_outro: e.target.value }); setDirty(true); }}
            placeholder="תודה! אחזור אלייך היום 💛"
            maxLength={80}
            aria-label="שורת סיום"
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
          />
          {/* הצהוב הוא מה שהיא כתבה, האפור הוא מה שנכתב לבד. בלי ההפרדה
              הזו אי אפשר לדעת על מה משפיעות שתי התיבות שלמעלה. */}
          <div className="mt-3 bg-[var(--canvas)] border border-[var(--line)] p-3 text-[12.5px] leading-relaxed whitespace-pre-line">
            <mark className="bg-[var(--warn-bg)] text-[var(--ink)] px-1">
              {info.order_intro.trim() || `היי ${store.display_name.split(" ").pop()}! 👋`}
            </mark>
            {`
ראיתי את הדוכן ואני רוצה להזמין:

• סקוויש אבוקדו × 1 · ₪18

סה"כ: ₪18${info.ships ? `\nמשלוח: ${info.shipping_note.trim() || "בתיאום"}${info.shipping_price ? ` · ₪${info.shipping_price}` : ""}` : ""}
אשלם ב${payout.payout_bit ? "ביט" : payout.payout_paybox ? "פייבוקס" : "מזומן"}

הזמנה #1
`}
            <mark className="bg-[var(--warn-bg)] text-[var(--ink)] px-1">
              {info.order_outro.trim() || "תודה! אחזור אלייך היום 💛"}
            </mark>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-2">
            <span className="bg-[var(--warn-bg)] px-1">המסומן בצהוב</span> הוא מה שאת
            כותבת. השאר נכתב לבד לפי מה שהקונה בחרה.
          </p>
        </div>

        {/* איך משלמים לי — הכסף של הילדה. לא קשור לתשלום ההקמה לדוכן. */}
        <div id="payment" className="scroll-mt-14 bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">איך משלמים לי</div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed mt-0.5">
            מה שתסמני יופיע לקונה לפני שהיא שולחת את ההזמנה, וגם בהודעת הוואטסאפ.
            הכסף עובר ישירות אלייך, דוכן לא נוגע בו ולא לוקח עמלה.
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
                <span className={`w-4 h-4 flex items-center justify-center text-[10px] ${
                  payout[key] ? "bg-[var(--ink)] text-white" : "border border-[#D3D5DC]"
                }`}>
                  {payout[key] ? "✓" : ""}
                </span>
                <span className="text-[13px] font-medium flex-1">{label}</span>
                <span className="text-[11px] text-[var(--muted)]">{hint}</span>
              </button>
            ))}
          </div>
          {/* לינק תשלום — הופך "תשלמי לי בפייבוקס" ללחיצה אחת.
              מותרים רק לינקים של ביט ופייבוקס, וזה נאכף גם בדאטהבייס. */}
          <label className="block text-[11px] text-[var(--muted)] mt-3 mb-1">
            לינק לתשלום (לא חובה)
          </label>
          <input
            value={payout.payout_link ?? ""}
            onChange={(e) => { setPayout({ ...payout, payout_link: e.target.value }); setDirty(true); }}
            placeholder="להדביק כאן לינק מביט או מפייבוקס"
            aria-label="לינק לתשלום"
            dir="ltr"
            maxLength={200}
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
          />
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
            בפייבוקס או בביט: פותחים את האפליקציה, "בקשת תשלום" או "הלינק שלי",
            ומעתיקים. הקונה תראה כפתור שמעביר אותה ישר לשם.
          </p>
          {!!payout.payout_link?.trim() && !isPayoutLink(payout.payout_link.trim()) && (
            <p className="text-[11px] text-[var(--danger)] mt-1">
              זה לא נראה כמו לינק של ביט או פייבוקס. מטעמי בטיחות אפשר רק אותם.
            </p>
          )}

          <label className="block text-[11px] text-[var(--muted)] mt-3 mb-1">
            הערה לקונה (לא חובה)
          </label>
          <input
            value={payout.payout_note ?? ""}
            onChange={(e) => { setPayout({ ...payout, payout_note: e.target.value }); setDirty(true); }}
            placeholder='למשל: "ביט לאמא: 052-1234567"'
            aria-label="הערה לקונה"
            maxLength={80}
            className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
          />
          {!payout.payout_bit && !payout.payout_paybox && !payout.payout_cash && (
            <p className="text-[11px] text-[var(--warn-ink)] mt-1.5">
              לא סימנת כלום, הקונה תצטרך לשאול אותך בוואטסאפ איך לשלם.
            </p>
          )}
        </div>

        {dirty && (
          <button onClick={save} className="bg-[var(--ink)] text-white py-3 text-sm font-bold">
            שמירת שינויים
          </button>
        )}

        {/* הלינק עובד תמיד. לפני הפרסום הוא תצוגה מקדימה: חברות רואות הכל
            ולא יכולות להזמין, וזה בדיוק מה שהופך את הפרסום לבחירה ולא לחסם. */}
        <div className="bg-white border border-[var(--line)] p-3 mt-1">
          {!store.activated_at && (
            <div className="text-[11px] text-[var(--warn-ink)] mb-1.5">
              👀 תצוגה מקדימה. אפשר לשלוח, אבל עדיין אי אפשר להזמין
            </div>
          )}
          <div className="text-[11px] text-[var(--muted)] font-mono mb-2" dir="ltr">{storeUrl}</div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(storeUrl); showToast("הלינק הועתק"); }}
              className="flex-1 border border-[var(--line)] py-2.5 text-xs font-medium">
              העתקה
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`בואי לראות את החנות שלי! ${storeUrl}`)}`}
              className="flex-1 bg-[var(--ink)] text-white py-2.5 text-xs font-medium text-center">
              שיתוף בוואטסאפ
            </a>
          </div>
        </div>

        {!store.activated_at && (
          <a href="/activate" className="bg-[var(--ink)] text-white p-3.5 mt-1 block">
            <div className="text-[13px] font-bold">
              {store.payment_claimed_at ? "⏳ מחכות לאישור התשלום" : "🚀 לפרסם את הדוכן"}
            </div>
            <div className="text-[11px] opacity-70 leading-relaxed mt-0.5">
              {store.payment_claimed_at
                ? "ברגע שנאשר, אפשר יהיה לקבל הזמנות."
                : "הכל בנוי ושמור. פרסום פותח את ההזמנות →"}
            </div>
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
