"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/squish-analytics";
import { StickerPicker } from "../stickers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { squareImage, MediaError, validateGalleryVideo, posterFrom } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import PhoneVerify from "@/app/phone-verify";
import {
  MIN_ITEMS,
  PARENT_AWARENESS_COPY,
  PARENT_AWARENESS_VERSION,
  SQUISH_CONDITIONS,
  SQUISH_SIZES,
  SQUISH_TYPES,
  type SquishCondition,
  type SquishSize,
  type SquishyType,
} from "@/lib/squish";
import { SavingDumplings, SquishOutline, SquishPlaceholder, SwapGlyph } from "../components";
import { TypeDot, TypeIcon } from "../type-icons";

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
  /** null = עוד לא נבחר. "אחר" הוא בחירה, לא ברירת מחדל שקטה. */
  squishy_type: SquishyType | null;
  custom_type: string;
  size: SquishSize;
  condition: SquishCondition;
  condition_note: string;
  wanted_description: string;
  series: string;
  /** תיאור — נכתב ביד או מוצע על ידי ה-AI ונערך */
  description: string;
  open_for_trade: boolean;
  /** מדבקות אישיות — rare / new */
  stickers: string[];
  /** האהוב על האוסף. אחד בלבד, ולכן נאכף על כל הרשימה בבחירה. */
  loved: boolean;
  imageData: string | null;
  /** מפתח לסרטון שיושב ב-draftVideos */
  videoId: string | null;
}

type Step = 1 | 2 | 3 | 4;

interface Draft {
  step: Step;
  items: DraftItem[];
  collectionTitle: string;
  nickname: string;
  city: string;
  parentAware: boolean;
}

const KEY = "squish-draft";

/* סדר השיחה. כל שלב הוא שאלה אחת. */
const STAGES = ["media", "name", "type", "size", "condition", "trade", "extras"] as const;
type Stage = (typeof STAGES)[number];

/**
 * סרטוני הטיוטה חיים בזיכרון ולא ב-sessionStorage — שם נכנס רק טקסט
 * ותמונות קטנות, וסרטון של חמש שניות מפוצץ אותו מיד. המשמעות: רענון
 * דף לפני השמירה מאבד את הסרטון, וזה כתוב במסך.
 */
const draftVideos = new Map<string, Blob>();
let videoSeq = 0;
const blank = (): DraftItem => ({
  name: "",
  squishy_type: null,
  custom_type: "",
  size: "medium",
  condition: "good",
  condition_note: "",
  wanted_description: "",
  series: "",
  description: "",
  open_for_trade: true,
  stickers: [],
  loved: false,
  imageData: null,
  videoId: null,
});

export default function NewCollection() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  /* ── שיחה, לא טופס ──
     מרינה ישבה עם ים (8): מסך עם עשרה שדות גרם לה ללחוץ על דברים
     לא לפי הסדר. עכשיו שאלה אחת פתוחה בכל רגע, כמו צ'אט — עונים,
     והשאלה הבאה מופיעה. מה שנענה מצטבר למעלה ואפשר לחזור אליו
     בלחיצה. */
  const [stage, setStage] = useState<Stage>("media");
  const [reachedIdx, setReachedIdx] = useState(0);
  const go = (t: Stage) => {
    const i = STAGES.indexOf(t);
    setStage(t);
    setReachedIdx((r) => Math.max(r, i));
  };
  const startNew = () => {
    setEditing(blank());
    setEditIndex(null);
    setStage("media");
    setReachedIdx(0);
    setPhotoErr("");
  };
  const startEdit = (it: DraftItem, i: number) => {
    setEditing(it);
    setEditIndex(i);
    setStage("extras");
    setReachedIdx(STAGES.length - 1);
    setPhotoErr("");
  };
  const closeEditor = () => {
    setEditing(null);
    setEditIndex(null);
    setStage("media");
    setReachedIdx(0);
  };
  const [hasAccount, setHasAccount] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [stage]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /**
   * מה כבר נשמר בפועל, לפי מיקום הפריט בטיוטה.
   *
   * זה מה שמונע כפילויות בניסיון חוזר: פריט שכבר קיבל מזהה מהשרת לא
   * נכתב שוב. המפתחות של המדיה נשמרים גם הם, כדי שניסיון חוזר לא
   * יעלה את אותה תמונה פעמיים.
   */
  const savedRef = useRef<Map<number, string>>(new Map());
  const mediaRef = useRef<Map<number, { image_key: string | null; video_key: string | null; poster_key: string | null }>>(new Map());
  const profileRef = useRef<string | null>(null);
  /** כישלון שמירה: איזה פריט, ומה להציג. null = אין כישלון. */
  const [failure, setFailure] = useState<{ index: number; name: string; reason: string; cid: string } | null>(null);
  const [droppedNote, setDroppedNote] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setHasAccount(!!data.user));
    const raw = sessionStorage.getItem(KEY);
    const d: Draft = raw
      ? JSON.parse(raw)
      : { step: 1, items: [], collectionTitle: "", nickname: "", city: "", parentAware: false };
    setDraft(d);
  }, []);

  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });

  async function pickVideo(file: File) {
    setPhotoErr("");
    const ok = await validateGalleryVideo(file);
    if (!ok.ok) {
      setPhotoErr(ok.reason);
      return;
    }
    const id = `v${++videoSeq}`;
    draftVideos.set(id, file);
    // פוסטר מיידי, כדי שהכרטיס לא יהיה ריבוע שחור בזמן הבנייה
    const poster = await posterFrom(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onload = () => {
      setEditing((e) => (e ? { ...e, videoId: id, imageData: reader.result as string } : e));
      go("name");
    };
    if (poster) reader.readAsDataURL(poster);
    else {
      setEditing((e) => (e ? { ...e, videoId: id } : e));
      go("name");
    }
  }

  async function pickPhoto(file: File) {
    setPhotoErr("");
    try {
      /* contain ולא cover: תמונה מהטלפון היא מלבנית, וחיתוך למרכז היה
         גוזר לסקווישי את הראש. הריבוע מושלם בשוליים בצבע הרקע. */
      const blob = await squareImage(file, 600, "contain");
      const reader = new FileReader();
      reader.onload = () => {
        setEditing((e) => (e ? { ...e, imageData: reader.result as string, videoId: null } : e));
        go("name");
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      setPhotoErr(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה");
    }
  }

  function saveItem() {
    if (!editing || !draft) return;
    if (!editing.imageData && !editing.videoId) {
      setPhotoErr("צריך סרטון או תמונה");
      return;
    }
    if (!editing.squishy_type) {
      setPhotoErr("איזה סוג הסקווישי? בחרי מהרשימה");
      return;
    }
    let items = [...draft.items];
    if (editIndex === null) items.push(editing);
    else items[editIndex] = editing;
    /* אהוב עליי הוא אחד לאוסף. סימון על פריט חדש מוריד אותו מהקודם,
       כדי שלא ייווצרו שניים ואז אחד מהם ייעלם בשקט בשמירה. */
    if (editing.loved) {
      const keep = editIndex === null ? items.length - 1 : editIndex;
      items = items.map((it, i) => (i === keep ? it : { ...it, loved: false }));
    }
    set({ items, step: items.length >= MIN_ITEMS ? 3 : 2 });
    setEditing(null);
    setEditIndex(null);
  }

  /**
   * יוצר את הפרופיל ואת הפריטים אחרי שיש חשבון.
   *
   * **הכלל: מסך הצלחה רק אחרי שכל פריט חזר עם מזהה מהשרת.** קודם
   * ה-insert ישב ב-try/catch שכתב לקונסולה וממשיך, ולכן עמודה חסרה
   * בפרודקשן הפילה את כל הפריטים בשקט — והילדה ראתה "האוסף נוצר"
   * ונחתה על גלריה ריקה.
   *
   * ניסיון חוזר בטוח: מה שכבר נשמר יושב ב-savedRef ולא נכתב שוב,
   * והמדיה שכבר הועלתה יושבת ב-mediaRef ולא מועלית שוב.
   */
  async function create() {
    if (!draft) return;
    setBusy(true);
    setErr("");
    setFailure(null);
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) {
      setErr("צריך להיכנס כדי לשמור את האוסף");
      setBusy(false);
      return;
    }

    /* ── הפרופיל ──
       נוצר בשרת, כדי שסימון הפיילוט ייכתב באותה טרנזקציה. קודם הוא
       נוצר כאן מהדפדפן והסימון הגיע אחר כך — ובין לבין היה פרופיל
       חי בלי שער. */
    let profileId = profileRef.current;
    if (!profileId) {
      const res = await fetch("/api/squish/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: draft.nickname,
          city: draft.city,
          title: draft.collectionTitle,
          parentAware: draft.parentAware,
          awarenessVersion: PARENT_AWARENESS_VERSION,
        }),
      }).catch(() => null);
      const b = res ? await res.json().catch(() => null) : null;
      profileId = b?.id ?? null;
    }
    if (!profileId) {
      setErr("לא הצלחנו לפתוח את האוסף, לנסות שוב");
      setBusy(false);
      return;
    }
    profileRef.current = profileId;

    /* ── הפריטים, אחד-אחד, ועוצרים על הראשון שנכשל ── */
    const dropped = new Set<string>();
    for (const [i, it] of draft.items.entries()) {
      if (savedRef.current.has(i)) continue; // כבר נשמר בניסיון קודם

      /* מדיה: מעלים פעם אחת בלבד. ניסיון חוזר משתמש במה שכבר עלה. */
      let media = mediaRef.current.get(i);
      if (!media) {
        let image_key: string | null = null;
        let video_key: string | null = null;
        let poster_key: string | null = null;
        try {
          if (it.imageData) {
            const blob = await (await fetch(it.imageData)).blob();
            const up = await uploadBlob(it.videoId ? "squish-poster" : "squish", blob);
            if ("error" in up) throw new Error("upload");
            if (it.videoId) poster_key = up.key;
            else image_key = up.key;
          }
          if (it.videoId) {
            const vid = draftVideos.get(it.videoId);
            if (vid) {
              const up = await uploadBlob("squish-video", vid);
              if (!("error" in up)) video_key = up.key;
            }
          }
        } catch {
          setFailure({ index: i, name: it.name.trim() || `סקווישי ${i + 1}`, reason: "media", cid: "" });
          setBusy(false);
          return;
        }
        media = { image_key, video_key, poster_key };
        mediaRef.current.set(i, media);
      }

      const res = await fetch("/api/squish/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          item: {
            name: it.name,
            squishy_type: it.squishy_type,
            description: it.description?.trim() || null,
            custom_type: it.custom_type.trim() || null,
            size: it.size,
            condition: it.condition,
            condition_note: it.condition_note.trim() || null,
            trade_status: it.open_for_trade ? "open_for_trade" : "keep",
            wanted_description: it.wanted_description.trim() || null,
            series: it.series.trim() || null,
            stickers: it.stickers,
            ...media,
            sort_order: i,
          },
        }),
      }).catch(() => null);

      const body = res ? await res.json().catch(() => null) : null;
      /* הצלחה נמדדת במזהה שחזר, לא בהיעדר חריגה ולא בניווט. */
      if (!res?.ok || !body?.id) {
        setFailure({
          index: i,
          name: it.name.trim() || `סקווישי ${i + 1}`,
          reason: body?.reason ?? "write_failed",
          cid: body?.cid ?? "",
        });
        setBusy(false);
        return;
      }
      savedRef.current.set(i, body.id);
      for (const d of body.dropped ?? []) dropped.add(d);
    }

    /* ── האהוב, אחרי שלכולם יש מזהה ── */
    const lovedIndex = draft.items.findIndex((it) => it.loved);
    const lovedId = lovedIndex >= 0 ? savedRef.current.get(lovedIndex) : null;
    if (lovedId) {
      await supa.from("squish_profiles").update({ favorite_item_id: lovedId }).eq("id", profileId);
    }

    sessionStorage.removeItem(KEY);
    track("squish_collection_created");

    /* שדה אופציונלי שהדאטהבייס לא הכיר — הפריט נשמר בלעדיו, וזה נאמר
       לפני המעבר. "נשמר חלקית" בלי לספר הוא בדיוק סוג ההשתקה שהבאג
       הזה נולד ממנה. */
    if (dropped.size) {
      setDroppedNote(
        dropped.has("stickers")
          ? "הסקווישים נשמרו, אבל המדבקות שבחרת לא נשמרו איתם."
          : "הסקווישים נשמרו, אבל חלק מהפרטים לא נשמרו איתם."
      );
      setBusy(false);
      return;
    }
    router.push("/squish/collection");
  }

  if (!draft) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  /* ── עורך פריט: שיחה ──
     שאלה אחת פתוחה בכל רגע. מה שנענה הופך לשורה מקופלת שאפשר ללחוץ
     עליה ולתקן. התמונה נעוצה למעלה, והמדבקות מופיעות עליה ברגע
     שבוחרים — רואים את הכרטיס נבנה מול העיניים. */
  if (editing) {
    const typeMeta = editing.squishy_type
      ? SQUISH_TYPES.find((t) => t.key === editing.squishy_type)
      : null;
    const sizeMeta = SQUISH_SIZES.find((o) => o.key === editing.size);
    const condMeta = SQUISH_CONDITIONS.find((o) => o.key === editing.condition);
    const show = (t: Stage) => STAGES.indexOf(t) <= reachedIdx;
    const Done = ({ t, q, children }: { t: Stage; q: string; children: React.ReactNode }) => (
      <button
        onClick={() => setStage(t)}
        className="w-full flex items-center gap-2.5 bg-white rounded-[var(--r)] px-3.5 py-2.5 text-start"
        aria-label={`לשנות: ${q}`}
      >
        <span className="text-[12px] text-[var(--muted)] shrink-0">{q}</span>
        <span className="flex-1 flex items-center justify-end gap-1.5 text-[13.5px] font-medium">{children}</span>
      </button>
    );
    const Ask = ({ q, children }: { q: string; children: React.ReactNode }) => (
      <div className="bg-white rounded-[calc(var(--r)+4px)] p-4 flex flex-col gap-2.5">
        <div className="t-body font-medium">{q}</div>
        {children}
      </div>
    );
    const overlays: { key: string; glyph: React.ReactNode; bg: string }[] = [];
    if (editing.open_for_trade && show("extras")) overlays.push({ key: "trade", glyph: <SwapGlyph size={12} />, bg: "#8B7BC8" });
    if (editing.loved) overlays.push({ key: "loved", glyph: "♥", bg: "#E79AAE" });
    if (editing.stickers.includes("rare")) overlays.push({ key: "rare", glyph: "★", bg: "#E8B44A" });
    if (editing.stickers.includes("new")) overlays.push({ key: "new", glyph: "✦", bg: "#8FBF9F" });

    async function suggestDescription() {
      if (!editing?.imageData) return;
      setAiErr("");
      setAiBusy(true);
      try {
        const [head, data] = editing.imageData.split(",");
        const mediaType = head.match(/data:(image\/[a-z]+);/)?.[1] ?? "image/webp";
        const res = await fetch("/api/squish/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: data,
            mediaType,
            name: editing.name,
            typeLabel: typeMeta?.label,
          }),
        });
        const out = await res.json();
        if (!res.ok) {
          setAiErr(out.error ?? "הכתיבה נכשלה, לנסות שוב");
          return;
        }
        setEditing((e) => (e ? { ...e, description: out.description } : e));
      } catch {
        setAiErr("אין חיבור, לנסות שוב");
      } finally {
        setAiBusy(false);
      }
    }

    return (
      <main className="px-4 py-5 flex flex-col gap-2.5 max-w-md mx-auto">
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden
          onChange={(e) => e.target.files?.[0] && pickVideo(e.target.files[0])} />
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />

        <div className="flex items-center justify-between">
          <h1 className="t-title">{editIndex === null ? "סקווישי חדש" : "עריכה"}</h1>
          <button onClick={closeEditor} className="t-small text-[var(--muted)] underline">
            ביטול
          </button>
        </div>

        {/* הריבוע נעוץ למעלה מהרגע הראשון — הכרטיס שנבנה. לפני שיש
            תמונה יושב בו הקמע כפלייסהולדר, שיהיה ברור מה הולך למלא
            את המקום הזה. */}
        <div className="flex flex-col items-center gap-1 pb-1">
          <div className="relative w-[210px] aspect-square rounded-[14px] overflow-hidden bg-[var(--cream)]">
            {editing.imageData ? (
              <img src={editing.imageData} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-50" aria-hidden>
                <SquishPlaceholder size={120} />
              </div>
            )}
            {editing.videoId && (
              <span className="absolute bottom-1.5 end-1.5 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                סרטון ✓
              </span>
            )}
            <span className="absolute top-1.5 start-1.5 flex gap-1" aria-hidden>
              {overlays.map((o) => (
                <span
                  key={o.key}
                  data-overlay={o.key}
                  className="w-6 h-6 flex items-center justify-center text-white text-[13px]"
                  style={{ background: o.bg, borderRadius: "999px", boxShadow: "0 0 0 1.5px rgba(255,255,255,.85)" }}
                >
                  {o.glyph}
                </span>
              ))}
            </span>
          </div>
          {editing.imageData ? (
            <button onClick={() => setStage("media")} className="text-[12px] text-[var(--muted)] underline">
              להחליף תמונה
            </button>
          ) : (
            <p className="text-[12px] text-[var(--muted)]">כאן תופיע התמונה שלו</p>
          )}
        </div>

        {/* ── השיחה ── */}
        {stage === "media" && (
          <Ask q={editing.imageData ? "רוצה תמונה אחרת?" : "מוסיפים סקווישי לאוסף שלך"}>
            {!editing.imageData && (
              <p className="text-[13px] text-[var(--muted)] leading-relaxed -mt-1">
                כדי שהוא ייכנס לאוסף צריך לצלם אותו — סרטון או תמונה.
              </p>
            )}
            <button onClick={() => videoRef.current?.click()} className="btn btn-primary">
              🎥 לצלם סרטון
            </button>
            <p className="text-[12px] text-[var(--muted)] text-center -mt-1">
              סרטון קצר הכי טוב כדי לראות איך הוא נמעך
            </p>
            <div className="flex gap-2">
              <button onClick={() => photoRef.current?.click()} className="btn btn-secondary flex-1 t-small">
                לצלם תמונה
              </button>
              <button onClick={() => fileRef.current?.click()} className="btn btn-secondary flex-1 t-small">
                לבחור מהגלריה
              </button>
            </div>
            {photoErr && <p className="t-small text-[var(--danger)]">{photoErr}</p>}
          </Ask>
        )}

        {show("name") && (stage === "name" ? (
          <Ask q="איך קוראים לו?">
            <input
              value={editing.name}
              maxLength={40}
              autoFocus
              aria-label="שם הסקווישי"
              placeholder="למשל: צפרדע ירוקה"
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && editing.name.trim() && go("type")}
              className="field w-full px-3 py-3 t-small"
            />
            <button
              onClick={() => go("type")}
              disabled={!editing.name.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              הלאה ←
            </button>
          </Ask>
        ) : (
          <Done t="name" q="קוראים לו">{editing.name || "—"}</Done>
        ))}

        {show("type") && (stage === "type" ? (
          <Ask q="איזה סוג הוא?">
            <div role="radiogroup" aria-label="סוג הסקווישי" className="grid grid-cols-3 gap-1.5">
              {SQUISH_TYPES.map((t) => {
                const on = editing.squishy_type === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={t.label}
                    onClick={() => {
                      setPhotoErr("");
                      setEditing({ ...editing, squishy_type: t.key });
                      /* לחיצה היא התשובה — חוץ מ"אחר", ששואל מה כן */
                      if (t.key !== "other") go("size");
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-[var(--r)] border-[1.5px] text-[11.5px] leading-tight text-center ${
                      on ? "border-[var(--ink)] bg-white font-medium" : "border-transparent bg-white text-[var(--muted)]"
                    }`}
                  >
                    <TypeDot type={t.key} size={34} />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {editing.squishy_type === "other" && (
              <>
                <input
                  value={editing.custom_type}
                  maxLength={30}
                  aria-label="איזה סוג"
                  placeholder="איזה סוג?"
                  onChange={(e) => setEditing({ ...editing, custom_type: e.target.value })}
                  className="field w-full px-3 py-3 t-small"
                />
                <button onClick={() => go("size")} className="btn btn-primary">הלאה ←</button>
              </>
            )}
          </Ask>
        ) : (
          <Done t="type" q="הסוג">
            {typeMeta && <TypeDot type={typeMeta.key} size={22} />}
            {typeMeta?.key === "other" ? editing.custom_type || "אחר" : typeMeta?.label ?? "—"}
          </Done>
        ))}

        {show("size") && (stage === "size" ? (
          <Ask q="באיזה גודל הוא?">
            <div className="flex gap-1.5 flex-wrap">
              {SQUISH_SIZES.map((o) => (
                <button
                  key={o.key}
                  onClick={() => { setEditing({ ...editing, size: o.key }); go("condition"); }}
                  aria-pressed={editing.size === o.key}
                  className={`px-3.5 py-2.5 text-[13px] rounded-full border-[1.5px] ${
                    editing.size === o.key ? "border-[var(--ink)] bg-white font-medium" : "border-transparent bg-white text-[var(--muted)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Ask>
        ) : (
          <Done t="size" q="גודל">{sizeMeta?.label ?? "—"}</Done>
        ))}

        {show("condition") && (stage === "condition" ? (
          <Ask q="באיזה מצב הוא?">
            <div className="flex gap-1.5 flex-wrap">
              {SQUISH_CONDITIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    setEditing({ ...editing, condition: o.key });
                    if (o.key !== "flawed") go("trade");
                  }}
                  aria-pressed={editing.condition === o.key}
                  className={`px-3.5 py-2.5 text-[13px] rounded-full border-[1.5px] ${
                    editing.condition === o.key ? "border-[var(--ink)] bg-white font-medium" : "border-transparent bg-white text-[var(--muted)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {editing.condition === "flawed" && (
              <>
                <input
                  value={editing.condition_note}
                  maxLength={80}
                  aria-label="מה חשוב לדעת"
                  placeholder="ספרי מה חשוב לדעת"
                  onChange={(e) => setEditing({ ...editing, condition_note: e.target.value })}
                  className="field w-full px-3 py-3 t-small"
                />
                <button onClick={() => go("trade")} className="btn btn-primary">הלאה ←</button>
              </>
            )}
          </Ask>
        ) : (
          <Done t="condition" q="מצב">{condMeta?.label ?? "—"}</Done>
        ))}

        {show("trade") && (stage === "trade" ? (
          <Ask q="לפתוח אותו לטרייד?">
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed -mt-1">
              חברות מהמעגל שלך יוכלו להציע עליו החלפה. אפשר לשנות מתי
              שרוצים, וכלום לא קורה בלי שתאשרי.
            </p>
            <button
              onClick={() => { setEditing({ ...editing, open_for_trade: true }); go("extras"); }}
              className="btn btn-primary"
            >
              כן, פתוח לטרייד ⇄
            </button>
            <button
              onClick={() => { setEditing({ ...editing, open_for_trade: false }); go("extras"); }}
              className="btn btn-secondary"
            >
              לא, הוא נשאר רק אצלי
            </button>
          </Ask>
        ) : (
          <Done t="trade" q="טרייד">
            {editing.open_for_trade ? "פתוח לטרייד ⇄" : "נשאר אצלי"}
          </Done>
        ))}

        {show("extras") && stage === "extras" && (
          <Ask q="עוד רגע סיימנו — רוצה להוסיף עליו משהו?">
            {/* ה-AI זמין רק אחרי שיש חשבון: כתיבה אוטומטית לאורחת היא
                דלת פתוחה לניצול המפתח. באונבורדינג הראשון פשוט אין את
                הכפתור, ומהאוסף — יש. */}
            {hasAccount && editing.imageData && (
              <div className="bg-[var(--canvas)] rounded-[var(--r)] p-3 flex flex-col gap-2">
                <div className="t-small font-medium">✨ שנכתוב עליו משהו?</div>
                {editing.description ? (
                  <>
                    <textarea
                      value={editing.description}
                      maxLength={120}
                      rows={2}
                      aria-label="תיאור הסקווישי"
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      className="field w-full px-3 py-2.5 t-small resize-none"
                    />
                    <button onClick={suggestDescription} disabled={aiBusy}
                      className="t-small text-[var(--muted)] underline text-start disabled:opacity-40">
                      {aiBusy ? "כותבים…" : "עוד ניסיון"}
                    </button>
                  </>
                ) : (
                  <button onClick={suggestDescription} disabled={aiBusy}
                    className="btn btn-secondary t-small">
                    {aiBusy ? "כותבים…" : "כן, תציעו תיאור"}
                  </button>
                )}
                {aiErr && <p className="text-[12px] text-[var(--danger)]">{aiErr}</p>}
              </div>
            )}

            <StickerPicker
              hideTrade
              personal={editing.stickers}
              openForTrade={editing.open_for_trade}
              loved={editing.loved}
              onPersonal={(k, on) =>
                setEditing({
                  ...editing,
                  stickers: on ? [...editing.stickers, k] : editing.stickers.filter((x) => x !== k),
                })
              }
              onTrade={(on) => setEditing({ ...editing, open_for_trade: on })}
              onLoved={(on) => setEditing({ ...editing, loved: on })}
            />

            <label className="t-small text-[var(--muted)]">
              סדרה (לא חובה)
              <input
                value={editing.series}
                maxLength={30}
                aria-label="סדרה"
                placeholder='למשל: "סדרת הממתקים"'
                onChange={(e) => setEditing({ ...editing, series: e.target.value })}
                className="field w-full px-3 py-2.5 mt-1 t-small"
              />
            </label>

            {photoErr && <p className="t-small text-[var(--danger)]">{photoErr}</p>}

            <button onClick={saveItem} className="btn btn-primary mt-1">
              {editIndex === null ? "להוסיף לאוסף ←" : "לשמור שינויים"}
            </button>
            {editIndex !== null && (
              /* מילים, לא אייקון: ילדה בת 8 לא יודעת שפח זה למחוק */
              <button
                onClick={() => {
                  if (!window.confirm(`למחוק את ${editing.name || "הסקווישי"} מהאוסף?`)) return;
                  const items = draft.items.filter((_, i) => i !== editIndex);
                  set({ items, step: items.length ? draft.step : 2 });
                  closeEditor();
                }}
                className="t-small text-[var(--danger)] underline text-center py-1"
              >
                למחוק את הסקווישי הזה
              </button>
            )}
          </Ask>
        )}

        <div ref={chatEndRef} />
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

        {droppedNote ? (
          <div
            data-testid="save-partial"
            className="bg-white border-[1.5px] border-[var(--warn-line)] p-4 flex flex-col gap-2"
          >
            <div className="text-[15px] font-bold">האוסף נשמר, אבל לא הכל</div>
            <p className="t-small text-[var(--muted)] leading-relaxed">{droppedNote}</p>
            <p className="t-small">אפשר להוסיף אותן שוב מתוך האוסף.</p>
            <button
              onClick={() => router.push("/squish/collection")}
              className="btn btn-primary t-small mt-1"
            >
              לאוסף שלי
            </button>
          </div>
        ) : failure ? (
          <SaveFailed
            failure={failure}
            total={draft.items.length}
            saved={savedRef.current.size}
            busy={busy}
            onRetry={create}
            onBack={() => { setFailure(null); set({ step: 3 }); }}
          />
        ) : !draft.parentAware ? (
          <p className="t-small text-[var(--muted)] text-center">
            קודם מסמנים שההורה יודע ↑
          </p>
        ) : (
          <SaveStep busy={busy} err={err} onVerified={create} />
        )}
        {!failure && !droppedNote && (
          <button onClick={() => set({ step: 3 })} className="btn btn-tertiary t-small">
            ← חזרה
          </button>
        )}
      </main>
    );
  }

  /* ── 2/3: הגלריה נבנית ── */
  const ready = count >= MIN_ITEMS;
  return (
    <main className="px-4 py-5 flex flex-col gap-4">
      <Progress step={ready ? 2 : 1} />
      <div className="text-center">
        {ready && <div className="text-4xl squish-breathe mb-1">🎉</div>}
        <h1 className="t-title">{ready ? "יש לך גלריה משלך!" : "התחלה מעולה"}</h1>
        <p className="t-sub mt-1.5">
          {ready
            ? "עכשיו בחרי אילו סקווישים חברות יכולות להציע עליהם טרייד."
            : count === 1
              ? "נוסיף עוד שניים כדי לפתוח את הגלריה שלך."
              : `עוד ${MIN_ITEMS - count} והגלריה שלך מוכנה.`}
        </p>
      </div>

      {/* שם לאוסף לא נשאל כאן יותר — ים (8) נתקעה עליו ("שם של מה?").
          בלי שם האוסף נקרא "האוסף של {כינוי}", ואפשר לתת לו שם מתוך
          מסך האוסף כשמתחשק. */}

      <div className="grid grid-cols-2 gap-2.5">
        {draft.items.map((it, i) => (
          <div key={i} className="bg-white border border-[var(--line)] overflow-hidden">
            <button
              onClick={() => { setEditing(it); setEditIndex(i); }}
              className="block w-full aspect-square bg-[var(--cream)] overflow-hidden flex items-center justify-center"
            >
              {it.imageData ? (
                <img src={it.imageData} alt="" className="w-full h-full object-cover" />
              ) : (
                <SquishPlaceholder />
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
                className={`mt-1 w-full text-[11.5px] py-1 border flex items-center justify-center gap-1.5 ${
                  it.open_for_trade
                    ? "bg-[var(--lavender)] border-[var(--lavender)] text-white"
                    : "border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {/* המדבקה עצמה, ולא רק צבע רקע: זו בדיוק המדבקה שתופיע
                    על הכרטיס בגלריה, וככה רואים מה נבחר במקום לנחש אם
                    הכיתוב מתאר מצב או פעולה. */}
                <span
                  className="w-4 h-4 shrink-0 flex items-center justify-center"
                  style={{
                    borderRadius: "999px",
                    background: it.open_for_trade ? "#FFFFFF" : "transparent",
                    color: it.open_for_trade ? "var(--lavender)" : "var(--faint)",
                    border: it.open_for_trade ? "none" : "1.2px solid var(--line)",
                  }}
                  aria-hidden
                >
                  {it.open_for_trade && <SwapGlyph size={9} />}
                </span>
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
  if (busy) return <SavingDumplings />;
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

/**
 * מסך כישלון שמירה.
 *
 * שלושה דברים שהוא עושה, ושלושתם היו חסרים: הוא **לא** מציג הצלחה,
 * הוא אומר איזה סקווישי נתקע, והוא משאיר את כל מה שהיא הקלידה במסך
 * מאחוריו — הטיוטה לא נמחקת, והמדיה שכבר עלתה לא תעלה שוב.
 */
function SaveFailed({
  failure, total, saved, busy, onRetry, onBack,
}: {
  failure: { index: number; name: string; reason: string; cid: string };
  total: number;
  saved: number;
  busy: boolean;
  onRetry: () => void | Promise<void>;
  onBack: () => void;
}) {
  if (busy) return <SavingDumplings />;
  return (
    <div
      data-testid="save-failed"
      className="bg-white border-[1.5px] border-[var(--danger-line)] p-4 flex flex-col gap-2"
    >
      <div className="text-[15px] font-bold">לא הצלחנו לשמור את הסקווישי</div>
      <p className="t-small text-[var(--muted)] leading-relaxed">
        הפרטים שלך נשמרו במסך. אפשר לנסות שוב.
      </p>
      {/* אומרים איזה מהם, אחרת היא לא יודעת מה לבדוק */}
      <p className="t-small">
        נתקענו על <b>{failure.name}</b>
        {total > 1 && ` (${failure.index + 1} מתוך ${total})`}
        {saved > 0 && ` · ${saved} כבר נשמרו, והם לא יישמרו פעמיים`}
      </p>
      {failure.reason === "media" && (
        <p className="t-small text-[var(--muted)]">התמונה או הסרטון לא עלו.</p>
      )}
      <button onClick={onRetry} data-testid="save-retry" className="btn btn-primary t-small mt-1">
        לנסות שוב
      </button>
      <button onClick={onBack} className="btn btn-tertiary t-small">
        לחזור ולבדוק את הפרטים
      </button>
      {failure.cid && (
        <p className="text-[11px] text-[var(--faint)] text-center" dir="ltr">{failure.cid}</p>
      )}
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
