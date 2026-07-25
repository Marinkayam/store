"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "../use-store";
import { THEMES, themeOrDefault, type ThemeKey } from "@/lib/themes";
import { squareImage, mediaUrl } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { displayPhone, normalizePhone } from "@/lib/phone";

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
  const coverRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    setName(store.display_name);
    setTagline(store.tagline ?? "");
    setEmoji(store.emoji);
    setTheme(store.theme);
    setPhone(displayPhone(store.contact_phone));
    setCoverPreview(mediaUrl(store.cover_key));
  }, [store]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const t = themeOrDefault(theme);

  async function save() {
    if (!store) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      showToast("מספר הוואטסאפ לא נראה תקין — בדקי אותו שוב");
      return;
    }
    const supa = supabaseBrowser();
    const patch = {
      display_name: name.trim() || store.display_name,
      tagline: tagline.trim() || null,
      emoji,
      theme,
      contact_phone: normalized,
    };
    const { error } = await supa.from("stores").update(patch).eq("id", store.id);
    if (error) {
      showToast("השמירה נכשלה — נסי שוב");
      return;
    }
    setStore({ ...store, ...patch });
    setDirty(false);
    showToast("נשמר ✨");
  }

  async function onCover(file: File) {
    if (!store) return;
    const blob = await squareImage(file, 1200);
    const r = await uploadBlob("cover", blob);
    if ("error" in r) {
      showToast(r.error);
      return;
    }
    const supa = supabaseBrowser();
    await supa.from("stores").update({ cover_key: r.key }).eq("id", store.id);
    setCoverPreview(URL.createObjectURL(blob));
    setStore({ ...store, cover_key: r.key });
    showToast("תמונת הקאבר עודכנה");
  }

  async function logout() {
    const supa = supabaseBrowser();
    await supa.auth.signOut();
    window.location.href = "/";
  }

  if (loading) return <div className="p-6 text-sm text-[#7A7D8A]">רגע…</div>;
  if (!store) return null;

  const storeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${store.slug}`;

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[#E6E7EC]">
        <h1 className="text-lg font-bold">החנות שלי</h1>
      </header>

      <div className="p-3 flex flex-col gap-3">
        {/* תצוגה מקדימה חיה — מתעדכנת תוך כדי */}
        <div
          className="rounded-2xl overflow-hidden border border-[#E6E7EC]"
          style={{ background: t.bg, color: t.ink, fontFamily: t.font }}
        >
          <div className="h-14 overflow-hidden" style={{ background: coverPreview ? undefined : "linear-gradient(135deg,#C9D6FF,#E2C6F7)" }}>
            {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="text-center -mt-5 pb-3">
            <span className="inline-flex w-10 h-10 rounded-full items-center justify-center text-xl shadow" style={{ background: t.surface }}>
              {emoji}
            </span>
            <div className="font-bold text-sm mt-1">{name || "החנות שלך"}</div>
            {tagline && <div className="text-[11px] opacity-70">{tagline}</div>}
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: t.primary, color: t.onPrimary }}>
              ככה נראה כפתור ההזמנה
            </span>
          </div>
        </div>

        {/* קאבר */}
        <input ref={coverRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])} />
        <button
          onClick={() => coverRef.current?.click()}
          className="h-24 rounded-xl border border-[#E6E7EC] overflow-hidden relative bg-white"
        >
          {coverPreview ? (
            <img src={coverPreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium bg-[linear-gradient(135deg,#C9D6FF,#E2C6F7)]">
              <span className="bg-white/90 px-3.5 py-1.5 rounded-full">+ תמונת קאבר</span>
            </span>
          )}
        </button>

        <label className="text-[11px] text-[#7A7D8A]">
          שם החנות
          <input value={name} maxLength={40}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[#E6E7EC] bg-white rounded-lg px-3 py-2.5 text-sm text-[#15161B]" />
        </label>

        <label className="text-[11px] text-[#7A7D8A]">
          משפט אחד עלייך
          <input value={tagline} maxLength={60}
            onChange={(e) => { setTagline(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[#E6E7EC] bg-white rounded-lg px-3 py-2.5 text-sm text-[#15161B]" />
        </label>

        <div>
          <span className="text-[11px] text-[#7A7D8A]">האמוג'י של החנות</span>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { setEmoji(e); setDirty(true); }}
                className={`w-9 h-9 rounded-lg border-[1.5px] bg-white text-lg ${emoji === e ? "border-[#15161B]" : "border-[#E6E7EC]"}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[11px] text-[#7A7D8A]">ערכת נושא</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {(Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]).map(([k, th]) => (
              <button key={k} onClick={() => { setTheme(k); setDirty(true); }}
                className={`rounded-xl border-[1.5px] bg-white p-2 ${theme === k ? "border-[#15161B]" : "border-[#E6E7EC]"}`}>
                <div className="h-6 rounded-md mb-1 flex items-center justify-center"
                  style={{ background: th.bg, border: "1px solid rgba(0,0,0,.07)" }}>
                  <i className="w-3 h-3 rounded-full block" style={{ background: th.primary }} />
                </div>
                <span className="text-[11px] font-medium">{th.label}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="text-[11px] text-[#7A7D8A]">
          הטלפון שלך (וואטסאפ)
          <input value={phone} inputMode="tel" dir="ltr"
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            className="mt-1 w-full border border-[#E6E7EC] bg-white rounded-lg px-3 py-2.5 text-sm text-left text-[#15161B]" />
        </label>
        {/* תצוגה מקדימה של הכפתור — כדי לראות שהמספר באמת עובד */}
        {normalizePhone(phone) && (
          <a href={`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent("בדיקה — זו אני 🙂")}`}
            target="_blank" rel="noreferrer"
            className="text-xs text-center text-[#1F7A42] underline -mt-1">
            בדיקה: פתיחת וואטסאפ למספר {displayPhone(normalizePhone(phone)!)}
          </a>
        )}

        {dirty && (
          <button onClick={save} className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-bold">
            שמירת שינויים
          </button>
        )}

        {/* לינק */}
        <div className="bg-white border border-[#E6E7EC] rounded-xl p-3 mt-1">
          <div className="text-[11px] text-[#7A7D8A] font-mono mb-2" dir="ltr">{storeUrl}</div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(storeUrl); showToast("הלינק הועתק"); }}
              className="flex-1 border border-[#E6E7EC] rounded-lg py-2.5 text-xs font-medium">
              העתקה
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`בואי לראות את החנות שלי! ${storeUrl}`)}`}
              className="flex-1 bg-[#15161B] text-white rounded-lg py-2.5 text-xs font-medium text-center">
              שיתוף בוואטסאפ
            </a>
          </div>
        </div>

        <a href={storeUrl} className="text-center text-xs text-[#7A7D8A] underline py-1">
          צפייה בחנות כמו שקונות רואות אותה ←
        </a>

        <button onClick={logout} className="text-center text-xs text-[#7A7D8A] py-2">
          יציאה מהחשבון
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[#1B1C22] text-white px-4 py-2.5 rounded-3xl text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
