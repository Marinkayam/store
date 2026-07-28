"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import PhoneVerify from "@/app/phone-verify";
import {
  MIN_ITEMS,
  PARENT_AWARENESS_COPY,
  PARENT_AWARENESS_VERSION,
  SQUISH_CONDITIONS,
  SQUISH_SIZES,
  SQUISH_TYPES,
  squishCode,
  type SquishCondition,
  type SquishSize,
  type SquishyType,
} from "@/lib/squish";
import { SquishOutline } from "../components";

/**
 * בניית האוסף — בונים לפני שנרשמים.
 *
 * הטיוטה חיה ב-sessionStorage עד שיש חשבון, בדיוק כמו בהקמת דוכן. התמונות
 * נשמרות בטיוטה כ-data URL ב-600 פיקסל: sessionStorage מוגבל, ושלוש תמונות
 * בגודל מלא מפוצצות אותו. סרטון לא נכנס לטיוטה בכלל — הוא נוסף אחרי שיש
 * אוסף, מתוך מסך האוסף, שם אפשר להעלות אותו ישר לאחסון.
 *
 * המספר נשאל רק בשלב האחרון, ורק כי בלעדיו אין למי לשמור את האוסף.
 */

interface DraftItem {
  name: string;
  squishy_type: SquishyType;
  custom_type: string;
  size: SquishSize;
  condition: SquishCondition;
  condition_note: string;
  wanted_description: string;
  open_for_trade: boolean;
  imageData: string | null;
}

type Step = 1 | 2 | 3 | 4;

interface Draft {
  step: Step;
  items: DraftItem[];
  nickname: string;
  city: string;
  parentAware: boolean;
}

const KEY = "squish-draft";
const blank = (): DraftItem => ({
  name: "",
  squishy_type: "other",
  custom_type: "",
  size: "medium",
  condition: "good",
  condition_note: "",
  wanted_description: "",
  open_for_trade: true,
  imageData: null,
});

export default function NewCollection() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    const d: Draft = raw
      ? JSON.parse(raw)
      : { step: 1, items: [], nickname: "", city: "", parentAware: false };
    setDraft(d);
  }, []);

  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });

  async function pickPhoto(file: File) {
    setPhotoErr("");
    try {
      const blob = await squareImage(file, 600);
      const reader = new FileReader();
      reader.onload = () =>
        setEditing((e) => (e ? { ...e, imageData: reader.result as string } : e));
      reader.readAsDataURL(blob);
    } catch (e) {
      setPhotoErr(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
    }
  }

  function saveItem() {
    if (!editing || !draft) return;
    if (!editing.imageData) {
      setPhotoErr("צריך תמונה אחת לפחות");
      return;
    }
    const items = [...draft.items];
    if (editIndex === null) items.push(editing);
    else items[editIndex] = editing;
    set({ items, step: items.length >= MIN_ITEMS ? 3 : 2 });
    setEditing(null);
    setEditIndex(null);
  }

  /** יוצר את הפרופיל ואת הפריטים אחרי שיש חשבון. */
  async function create() {
    if (!draft) return;
    setBusy(true);
    setErr("");
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) {
      setErr("צריך להיכנס כדי לשמור את האוסף");
      setBusy(false);
      return;
    }

    // קוד אקראי, עם ניסיון חוזר אם במקרה נתפס
    let profileId: string | null = null;
    for (let i = 0; i < 5 && !profileId; i++) {
      const { data, error } = await supa
        .from("squish_profiles")
        .insert({
          user_id: auth.user.id,
          nickname: draft.nickname.trim().slice(0, 24) || "אספנית",
          general_city: draft.city.trim() || null,
          collection_code: squishCode(),
          parent_awareness_at: draft.parentAware ? new Date().toISOString() : null,
          parent_awareness_version: draft.parentAware ? PARENT_AWARENESS_VERSION : null,
        })
        .select("id")
        .single();
      if (!error && data) profileId = data.id;
      else if (error && !/duplicate|unique/i.test(error.message)) {
        // כבר יש פרופיל לחשבון הזה? ממשיכים איתו במקום להיכשל
        const { data: mine } = await supa.from("squish_profiles").select("id").maybeSingle();
        if (mine) profileId = mine.id;
        else {
          console.error("[squish] profile insert failed:", error.message);
          setErr("לא הצלחנו לפתוח את האוסף, לנסות שוב");
          setBusy(false);
          return;
        }
      }
    }
    if (!profileId) {
      setErr("לא הצלחנו לפתוח את האוסף, לנסות שוב");
      setBusy(false);
      return;
    }

    // עכשיו יש פרופיל, אז אפשר להעלות מדיה ולכתוב את הפריטים
    for (const [i, it] of draft.items.entries()) {
      try {
        let imageKey: string | null = null;
        if (it.imageData) {
          const blob = await (await fetch(it.imageData)).blob();
          const up = await uploadBlob("squish", blob);
          if (!("error" in up)) imageKey = up.key;
        }
        await supa.from("squish_items").insert({
          owner_user_id: auth.user.id,
          profile_id: profileId,
          name: it.name.trim().slice(0, 40) || "סקווישי",
          squishy_type: it.squishy_type,
          custom_type: it.squishy_type === "other" ? it.custom_type.trim() || null : null,
          size: it.size,
          condition: it.condition,
          condition_note: it.condition === "flawed" ? it.condition_note.trim() || null : null,
          trade_status: it.open_for_trade ? "open_for_trade" : "keep",
          wanted_description: it.wanted_description.trim() || null,
          image_key: imageKey,
          sort_order: i,
        });
      } catch (e) {
        console.error("[squish] item failed:", e);
      }
    }

    sessionStorage.removeItem(KEY);
    router.push("/squish/collection");
  }

  if (!draft) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  /* ── עורך פריט ── */
  if (editing) {
    const isOther = editing.squishy_type === "other";
    return (
      <main className="px-4 py-5 flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
        />
        <h1 className="t-title">{editIndex === null ? "סקווישי חדש" : "עריכה"}</h1>

        <button
          onClick={() => fileRef.current?.click()}
          className="h-44 border-[1.5px] border-dashed border-[var(--line)] bg-white flex items-center justify-center overflow-hidden"
        >
          {editing.imageData ? (
            <img src={editing.imageData} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-[var(--muted)]">
              <SquishOutline />
              <span className="t-small">לצלם או לבחור תמונה</span>
            </span>
          )}
        </button>
        {photoErr && <p className="t-small text-[var(--danger)]">{photoErr}</p>}

        <label className="t-small">
          איך קוראים לסקווישי?
          <input
            value={editing.name}
            maxLength={40}
            aria-label="שם הסקווישי"
            placeholder="למשל: צפרדע ירוקה"
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="field w-full px-3 py-3 mt-1 t-small"
          />
        </label>

        <label className="t-small">
          איזה סוג סקווישי זה?
          <select
            value={editing.squishy_type}
            aria-label="סוג הסקווישי"
            onChange={(e) => setEditing({ ...editing, squishy_type: e.target.value as SquishyType })}
            className="field w-full px-3 py-3 mt-1 t-small bg-white"
          >
            {SQUISH_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>
        {isOther && (
          <input
            value={editing.custom_type}
            maxLength={30}
            aria-label="איזה סוג"
            placeholder="איזה סוג?"
            onChange={(e) => setEditing({ ...editing, custom_type: e.target.value })}
            className="field w-full px-3 py-3 t-small"
          />
        )}

        <Chips
          label="גודל"
          options={SQUISH_SIZES}
          value={editing.size}
          onChange={(v) => setEditing({ ...editing, size: v })}
        />
        <Chips
          label="מצב"
          options={SQUISH_CONDITIONS}
          value={editing.condition}
          onChange={(v) => setEditing({ ...editing, condition: v })}
        />
        {editing.condition === "flawed" && (
          <input
            value={editing.condition_note}
            maxLength={80}
            aria-label="מה חשוב לדעת"
            placeholder="ספרי מה חשוב לדעת"
            onChange={(e) => setEditing({ ...editing, condition_note: e.target.value })}
            className="field w-full px-3 py-3 t-small"
          />
        )}

        <label className="t-small">
          מה תרצי לקבל בתמורה?
          <input
            value={editing.wanted_description}
            maxLength={120}
            aria-label="מה מחפשים בתמורה"
            placeholder="למשל: סקווישים בצבעי פסטל, או פתוחה להצעות"
            onChange={(e) => setEditing({ ...editing, wanted_description: e.target.value })}
            className="field w-full px-3 py-3 mt-1 t-small"
          />
        </label>

        <button
          onClick={() => setEditing({ ...editing, open_for_trade: !editing.open_for_trade })}
          aria-pressed={editing.open_for_trade}
          aria-label="פתוח לטרייד"
          className={`flex items-center gap-2.5 border-[1.5px] px-3 py-3 text-start ${
            editing.open_for_trade ? "border-[var(--ink)] bg-white" : "border-[var(--line)]"
          }`}
        >
          <span
            className={`w-4 h-4 flex items-center justify-center text-[10px] ${
              editing.open_for_trade ? "bg-[var(--ink)] text-white" : "border border-[#D3D5DC]"
            }`}
          >
            {editing.open_for_trade ? "✓" : ""}
          </span>
          <span className="t-small flex-1">פתוח לטרייד</span>
          <span className="text-[12px] text-[var(--muted)]">אפשר לשנות אחר כך</span>
        </button>

        <div className="flex gap-2 mt-1">
          <button onClick={saveItem} className="btn btn-primary flex-1">
            שמירה
          </button>
          <button
            onClick={() => { setEditing(null); setEditIndex(null); }}
            className="btn btn-secondary px-5"
          >
            ביטול
          </button>
        </div>
      </main>
    );
  }

  const count = draft.items.length;

  /* ── 1: המסך הראשון ── */
  if (draft.step === 1 && count === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-5 text-center">
        <SquishOutline size={72} />
        <h1 className="t-title">איזה סקווישים יש לך?</h1>
        <p className="t-sub max-w-[18rem]">
          מצלמים אחד אחד, ובונים גלריה שאפשר להראות לחברות.
        </p>
        <button
          onClick={() => { setEditing(blank()); setEditIndex(null); }}
          className="btn btn-primary w-full max-w-sm"
        >
          להוסיף את הראשון ←
        </button>
      </main>
    );
  }

  /* ── 4: פרטים אחרונים והרשמה ── */
  if (draft.step === 4) {
    return (
      <main className="px-4 py-5 flex flex-col gap-4">
        <Progress step={3} />
        <h1 className="t-title">עוד שני פרטים</h1>
        <label className="t-small">
          איך לקרוא לך במועדון?
          <input
            value={draft.nickname}
            maxLength={24}
            aria-label="כינוי"
            placeholder="כינוי, לא שם מלא"
            onChange={(e) => set({ nickname: e.target.value })}
            className="field w-full px-3 py-3 mt-1 t-small"
          />
        </label>
        <label className="t-small">
          עיר בארץ (לא חובה)
          <input
            value={draft.city}
            maxLength={30}
            aria-label="עיר"
            placeholder="למשל: רמת גן"
            onChange={(e) => set({ city: e.target.value })}
            className="field w-full px-3 py-3 mt-1 t-small"
          />
          <span className="block text-[12px] text-[var(--muted)] mt-1">
            עיר בלבד. אף פעם לא כתובת, בית ספר או כיתה.
          </span>
        </label>

        <label className="flex items-start gap-2.5 bg-white border border-[var(--line)] p-3">
          <input
            type="checkbox"
            checked={draft.parentAware}
            aria-label="ההורים שלי יודעים"
            onChange={(e) => set({ parentAware: e.target.checked })}
            className="mt-0.5 w-4 h-4 shrink-0"
          />
          <span className="text-[12.5px] leading-relaxed">
            כדי להשתמש בטריידים, צריך שהורה יידע ויאשר את הפעילות.
            <br />
            <b>{PARENT_AWARENESS_COPY}</b>
          </span>
        </label>

        {!draft.parentAware ? (
          <p className="t-small text-[var(--muted)] text-center">
            קודם מסמנים שההורה יודע ↑
          </p>
        ) : (
          <SaveStep busy={busy} err={err} onVerified={create} />
        )}
        <button onClick={() => set({ step: 3 })} className="btn btn-tertiary t-small">
          ← חזרה
        </button>
      </main>
    );
  }

  /* ── 2/3: הגלריה נבנית ── */
  const ready = count >= MIN_ITEMS;
  return (
    <main className="px-4 py-5 flex flex-col gap-4">
      <Progress step={ready ? 2 : 1} />
      <div className="text-center">
        <h1 className="t-title">{ready ? "האוסף שלך מוכן" : "התחלה מעולה"}</h1>
        <p className="t-sub mt-1.5">
          {ready
            ? "אילו מהם פתוחים לטרייד? אפשר לשנות בכל רגע."
            : count === 1
              ? "נוסיף עוד שניים כדי לפתוח את הגלריה שלך."
              : `עוד ${MIN_ITEMS - count} והגלריה שלך מוכנה.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {draft.items.map((it, i) => (
          <div key={i} className="bg-white border border-[var(--line)] overflow-hidden">
            <button
              onClick={() => { setEditing(it); setEditIndex(i); }}
              className="block w-full aspect-square bg-[var(--cream)] overflow-hidden"
            >
              {it.imageData ? (
                <img src={it.imageData} alt="" className="w-full h-full object-cover" />
              ) : (
                <SquishOutline />
              )}
            </button>
            <div className="p-2">
              <div className="text-[13px] font-medium truncate">{it.name || "סקווישי"}</div>
              <button
                onClick={() => {
                  const items = [...draft.items];
                  items[i] = { ...it, open_for_trade: !it.open_for_trade };
                  set({ items });
                }}
                aria-pressed={it.open_for_trade}
                aria-label={`פתוח לטרייד: ${it.name || "סקווישי"}`}
                className={`mt-1 w-full text-[11.5px] py-1 border ${
                  it.open_for_trade
                    ? "bg-[var(--lavender)] border-[var(--lavender)] text-white"
                    : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {it.open_for_trade ? "פתוח לטרייד" : "נשאר אצלי"}
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => { setEditing(blank()); setEditIndex(null); }}
          className="border border-dashed border-[var(--line)] aspect-square flex flex-col items-center justify-center gap-1.5 text-[var(--muted)]"
        >
          <span className="text-2xl leading-none">+</span>
          <span className="text-[12.5px]">להוסיף סקווישי</span>
        </button>
      </div>

      <button
        onClick={() => set({ step: 4 })}
        disabled={!ready}
        className="btn btn-primary disabled:opacity-40"
      >
        {ready ? "לשמור את האוסף ←" : `צריך ${MIN_ITEMS} סקווישים`}
      </button>
      <p className="text-[12.5px] text-[var(--muted)] text-center leading-relaxed">
        אפשר לצאת ולחזור, מה שהוספת נשמר כאן במכשיר עד שנשמור את האוסף.
      </p>
    </main>
  );
}

/** אימות המספר, ואז יצירת האוסף */
function SaveStep({
  busy,
  err,
  onVerified,
}: {
  busy: boolean;
  err: string;
  onVerified: () => void | Promise<void>;
}) {
  if (busy) return <p className="t-small text-center py-8">שומרים את האוסף…</p>;
  return (
    <div className="flex flex-col gap-2">
      <PhoneVerify
        title="המספר שלך"
        subtitle="ככה נשמור את האוסף, וככה נכנסים בחזרה. אותו חשבון כמו בדוכן."
        cta="שלחו לי קוד"
        onVerified={onVerified}
      />
      {err && <p className="t-small text-[var(--danger)] text-center">{err}</p>}
    </div>
  );
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="t-label shrink-0">שלב {step} מתוך 3</span>
      <span className="flex-1 flex gap-1">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="flex-1 h-[3px]"
            style={{ background: i <= step ? "var(--ink)" : "var(--sand)" }}
          />
        ))}
      </span>
    </div>
  );
}

function Chips<T extends string>({
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
