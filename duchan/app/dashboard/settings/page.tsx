"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, mediaUrl, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { isPayoutLink } from "@/lib/payouts";

// "החנות שלי" — המסך שמחזיק את המוצר. תצוגה מקדימה חיה: בוחרים ערכה והחנות משתנה מולך.

const EMOJIS = ["🦄", "🍩", "🐼", "🍦", "🌈", "🍓", "🐻", "⭐", "🧁", "🐸"];

export default function SettingsPage() {
  const { store, setStore, loading } = useStore();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [emoji, setEmoji] = useState("🦄");
  const [theme, setTheme] = useState<ThemeKey>("cloud");
  const [phone, setPhone] = useState("");
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    setName(store.display_name);
    setTagline(store.tagline ?? "");
    setEmoji(store.emoji);
    setTheme(store.theme);
    setPhone(displayPhone(store.contact_phone));
    setCoverPreview(mediaUrl(store.cover_key));
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
      showToast("מספר הוואטסאפ לא נראה תקין — בדקי אותו שוב");
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
    };
    const { error } = await supa.from("stores").update(patch).eq("id", store.id);
    if (error) {
      showToast("השמירה נכשלה — נסי שוב");
      return;
    }
    setStore({ ...store, ...patch });
    refreshStorePage(store.slug);
    setDirty(false);
    showToast("נשמר ✨");
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
      showToast("משהו השתבש, נסי שוב");
      return;
    }
    setStore({ ...store, status: next });
    await refreshStorePage(store.slug);
    showToast(next === "paused" ? "החנות בהפסקה — הלינק מציג 'החנות סגורה'" : "החנות פתוחה שוב 🎉");
  }

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  const storeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${store.slug}`;

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
        <h1 className="text-lg font-bold">החנות שלי</h1>
      </header>

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

        {/* תצוגה מקדימה חיה — מתעדכנת תוך כדי */}
        <div
          className=" overflow-hidden border border-[var(--line)]"
          style={{ background: t.bg, color: t.ink, fontFamily: t.font }}
        >
          <div className="h-14 overflow-hidden" style={{ background: coverPreview ? undefined : "linear-gradient(135deg,var(--cream),var(--sand))" }}>
            {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="text-center -mt-5 pb-3">
            <span className="inline-flex w-10 h-10 items-center justify-center text-xl  overflow-hidden" style={{ background: t.surface }}>
              {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : emoji}
            </span>
            <div className="font-bold text-sm mt-1">{name || "החנות שלך"}</div>
            {tagline && <div className="text-[11px] opacity-70">{tagline}</div>}
            <span className="inline-block mt-2 px-3 py-1 text-[11px] font-bold" style={{ background: t.primary, color: t.onPrimary }}>
              ככה נראה כפתור ההזמנה
            </span>
          </div>
        </div>

        {/* קאבר */}
        <input ref={coverRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
        <button
          onClick={() => coverRef.current?.click()}
          className="h-24 border border-[var(--line)] overflow-hidden relative bg-white"
        >
          {coverPreview ? (
            <img src={coverPreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium bg-[linear-gradient(135deg,var(--cream),var(--sand))]">
              <span className="bg-white/90 px-3.5 py-1.5 ">+ תמונת קאבר</span>
            </span>
          )}
        </button>

        <label className="text-[11px] text-[var(--muted)]">
          שם החנות
          <input value={name} maxLength={40}
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

        <div>
          <span className="text-[11px] text-[var(--muted)]">ערכת נושא</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, th]) => (
              <button key={k} onClick={() => { setTheme(k); setDirty(true); }}
                className={` border-[1.5px] bg-white p-2 ${theme === k ? "border-[var(--ink)]" : "border-[var(--line)]"}`}>
                <div className="h-6 mb-1 flex items-center justify-center"
                  style={{ background: th.bg, border: "1px solid rgba(0,0,0,.07)" }}>
                  <i className="w-3 h-3 block" style={{ background: th.primary }} />
                </div>
                <span className="text-[11px] font-medium">{th.label}</span>
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
          <a href={`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent("בדיקה — זו אני 🙂")}`}
            target="_blank" rel="noreferrer"
            className="text-xs text-center text-[var(--ok-ink)] underline -mt-1">
            בדיקה: פתיחת וואטסאפ למספר {displayPhone(normalizePhone(phone)!)}
          </a>
        )}

        {/* איך משלמים לי — הכסף של הילדה. לא קשור לתשלום ההקמה לדוכן. */}
        <div className="bg-white border border-[var(--line)] p-3">
          <div className="text-[13px] font-bold">איך משלמים לי</div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed mt-0.5">
            מה שתסמני יופיע לקונה לפני שהיא שולחת את ההזמנה, וגם בהודעת הוואטסאפ.
            הכסף עובר ישירות אלייך — דוכן לא נוגע בו ולא לוקח עמלה.
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
              לא סימנת כלום — הקונה תצטרך לשאול אותך בוואטסאפ איך לשלם.
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
              👀 תצוגה מקדימה — אפשר לשלוח, אי אפשר עדיין להזמין
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
