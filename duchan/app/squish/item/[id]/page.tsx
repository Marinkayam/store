"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl, squareImage, MediaError, validateGalleryVideo, posterFrom } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import {
  SQUISH_CONDITIONS,
  SQUISH_SIZES,
  SQUISH_TRADE_CHOICES,
  SQUISH_TYPES,
  type SquishCondition,
  type SquishSize,
  type SquishTradeStatus,
  type SquishItem,
  type SquishyType,
} from "@/lib/squish";
import { SquishOutline, TradeBadge } from "../../components";

/**
 * עמוד פריט: עריכה במקום, ושינוי מצב הטרייד בלחיצה.
 *
 * כאן, בשונה ממסך בניית האוסף, כבר יש חשבון — ולכן זה המקום שבו אפשר גם
 * להעלות סרטון קצר: הוא נשלח ישר לאחסון ולא עובר דרך sessionStorage.
 */
export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<SquishItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const [mediaBusy, setMediaBusy] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supa = supabaseBrowser();
    const { data } = await supa.from("squish_items").select("*").eq("id", id).maybeSingle();
    setItem((data as SquishItem) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const patch = (p: Partial<SquishItem>) => {
    setItem((it) => (it ? { ...it, ...p } : it));
    setDirty(true);
  };

  async function save() {
    if (!item) return;
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("squish_items")
      .update({
        name: item.name.trim().slice(0, 40) || "סקווישי",
        squishy_type: item.squishy_type,
        custom_type: item.squishy_type === "other" ? item.custom_type?.trim() || null : null,
        size: item.size,
        condition: item.condition,
        condition_note: item.condition === "flawed" ? item.condition_note?.trim() || null : null,
        trade_status: item.trade_status,
        wanted_description: item.wanted_description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) {
      console.error("[squish] save failed:", error.message);
      showToast("השמירה נכשלה, לנסות שוב");
      return;
    }
    setDirty(false);
    showToast("נשמר ✨");
  }

  /** מצב הטרייד נשמר מיד — זו הפעולה שהיא תעשה הכי הרבה */
  async function setStatus(s: SquishTradeStatus) {
    if (!item) return;
    const supa = supabaseBrowser();
    setItem({ ...item, trade_status: s });
    const { error } = await supa.from("squish_items").update({ trade_status: s }).eq("id", item.id);
    if (error) showToast("לא הצלחנו לשמור, לנסות שוב");
    else showToast(s === "open_for_trade" ? "פתוח לטרייד" : "נשמר");
  }

  async function newImage(file: File) {
    if (!item) return;
    setMediaBusy("מעלים תמונה…");
    try {
      const blob = await squareImage(file, 900);
      const up = await uploadBlob("squish", blob);
      if ("error" in up) throw new Error(up.error);
      const supa = supabaseBrowser();
      await supa.from("squish_items").update({ image_key: up.key }).eq("id", item.id);
      setItem({ ...item, image_key: up.key });
      showToast("התמונה הוחלפה");
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "ההעלאה נכשלה");
    }
    setMediaBusy("");
  }

  async function newVideo(file: File) {
    if (!item) return;
    setMediaBusy("בודקים את הסרטון…");
    const ok = await validateGalleryVideo(file);
    if (!ok.ok) {
      setMediaBusy("");
      showToast(ok.reason);
      return;
    }
    setMediaBusy("מעלים סרטון…");
    try {
      const up = await uploadBlob("squish-video", file);
      if ("error" in up) throw new Error(up.error);
      // פוסטר חובה, אחרת הרשת מציגה ריבוע שחור עד שהסרטון נטען
      let posterKey: string | null = null;
      const poster = await posterFrom(URL.createObjectURL(file));
      if (poster) {
        const pu = await uploadBlob("squish-poster", poster);
        if (!("error" in pu)) posterKey = pu.key;
      }
      const supa = supabaseBrowser();
      await supa
        .from("squish_items")
        .update({ video_key: up.key, poster_key: posterKey })
        .eq("id", item.id);
      setItem({ ...item, video_key: up.key, poster_key: posterKey });
      showToast("הסרטון נוסף");
    } catch {
      showToast("ההעלאה נכשלה");
    }
    setMediaBusy("");
  }

  async function remove() {
    if (!item) return;
    const supa = supabaseBrowser();
    await supa
      .from("squish_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", item.id);
    router.push("/squish/collection");
  }

  if (loading) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;
  if (!item)
    return (
      <div className="p-8 text-center t-small text-[var(--muted)]">
        הפריט לא נמצא.
        <br />
        <a href="/squish/collection" className="underline text-[var(--ink)]">חזרה לאוסף ←</a>
      </div>
    );

  const poster = mediaUrl(item.poster_key) ?? mediaUrl(item.image_key);
  const video = mediaUrl(item.video_key);

  return (
    <main className="px-4 py-5 flex flex-col gap-3">
      <input ref={imgRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && newImage(e.target.files[0])} />
      <input ref={vidRef} type="file" accept="video/*" hidden
        onChange={(e) => e.target.files?.[0] && newVideo(e.target.files[0])} />

      <button onClick={() => router.push("/squish/collection")} className="t-small text-[var(--muted)] text-start">
        → חזרה לאוסף
      </button>

      <div className="relative aspect-square bg-[var(--cream)] border border-[var(--line)] overflow-hidden flex items-center justify-center">
        {video ? (
          <video src={video} poster={poster ?? undefined} muted loop playsInline autoPlay className="w-full h-full object-cover" />
        ) : poster ? (
          <img src={poster} alt="" className="w-full h-full object-cover" />
        ) : (
          <SquishOutline size={64} />
        )}
        <span className="absolute top-2 start-2">
          <TradeBadge status={item.trade_status} />
        </span>
      </div>

      <div className="flex gap-2">
        <button onClick={() => imgRef.current?.click()} className="btn btn-secondary flex-1 t-small">
          להחליף תמונה
        </button>
        <button onClick={() => vidRef.current?.click()} className="btn btn-secondary flex-1 t-small">
          {video ? "להחליף סרטון" : "להוסיף סרטון"}
        </button>
      </div>
      {mediaBusy && <p className="t-small text-[var(--muted)] text-center">{mediaBusy}</p>}
      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        סרטון עד 5 שניות, בלי קול. התמונות נשמרות בלי מידע על המקום שבו צולמו.
      </p>

      <input
        value={item.name}
        maxLength={40}
        aria-label="שם הסקווישי"
        onChange={(e) => patch({ name: e.target.value })}
        className="field w-full px-3 py-3 t-body font-medium"
      />

      <label className="t-small">
        סוג
        <select
          value={item.squishy_type}
          aria-label="סוג הסקווישי"
          onChange={(e) => patch({ squishy_type: e.target.value as SquishyType })}
          className="field w-full px-3 py-3 mt-1 t-small bg-white"
        >
          {SQUISH_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </label>
      {item.squishy_type === "other" && (
        <input
          value={item.custom_type ?? ""}
          maxLength={30}
          aria-label="איזה סוג"
          placeholder="איזה סוג?"
          onChange={(e) => patch({ custom_type: e.target.value })}
          className="field w-full px-3 py-3 t-small"
        />
      )}

      <Row label="גודל" options={SQUISH_SIZES} value={item.size}
        onChange={(v: SquishSize) => patch({ size: v })} />
      <Row label="מצב" options={SQUISH_CONDITIONS} value={item.condition}
        onChange={(v: SquishCondition) => patch({ condition: v })} />
      {item.condition === "flawed" && (
        <input
          value={item.condition_note ?? ""}
          maxLength={80}
          aria-label="מה חשוב לדעת"
          placeholder="ספרי מה חשוב לדעת"
          onChange={(e) => patch({ condition_note: e.target.value })}
          className="field w-full px-3 py-3 t-small"
        />
      )}

      <label className="t-small">
        מה תרצי לקבל בתמורה?
        <input
          value={item.wanted_description ?? ""}
          maxLength={120}
          aria-label="מה מחפשים בתמורה"
          placeholder="למשל: סקווישים בצבעי פסטל, או פתוחה להצעות"
          onChange={(e) => patch({ wanted_description: e.target.value })}
          className="field w-full px-3 py-3 mt-1 t-small"
        />
      </label>

      <div>
        <div className="t-small mb-1.5">מצב הטרייד</div>
        <div className="flex flex-col gap-1.5">
          {SQUISH_TRADE_CHOICES.map((c) => (
            <button
              key={c.key}
              onClick={() => setStatus(c.key)}
              aria-pressed={item.trade_status === c.key}
              className={`flex items-center gap-2.5 border-[1.5px] px-3 py-2.5 text-start ${
                item.trade_status === c.key ? "border-[var(--ink)] bg-white" : "border-[var(--line)]"
              }`}
            >
              <span
                className={`w-4 h-4 shrink-0 flex items-center justify-center text-[10px] ${
                  item.trade_status === c.key ? "bg-[var(--ink)] text-white" : "border border-[#D3D5DC]"
                }`}
              >
                {item.trade_status === c.key ? "✓" : ""}
              </span>
              <span className="text-[13px] font-medium flex-1">{c.label}</span>
              <span className="text-[12px] text-[var(--muted)]">{c.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {dirty && (
        <button onClick={save} className="btn btn-primary">
          שמירת שינויים
        </button>
      )}

      <button onClick={remove} className="t-small text-[var(--danger)] underline py-2">
        להוריד את הסקווישי מהאוסף
      </button>
    </main>
  );
}

function Row<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="t-small mb-1">{label}</div>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={value === o.key}
            aria-label={`${label}: ${o.label}`}
            className={`px-3 py-2 text-[13px] border-[1.5px] ${
              value === o.key ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
