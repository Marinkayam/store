"use client";

import Chevron from "@/app/chevron";
import CloseX from "@/app/close-x";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Choice from "@/app/choice";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore, confettiBurst } from "../use-store";
import {
  squareImage,
  posterFrom,
  validateGalleryVideo,
  startRecording,
  openCamera,
  mediaUrl,
  MediaError,
  RECORD_SECONDS,
  type RecorderHandle,
} from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import type { Product } from "@/lib/types";
import { PICKABLE } from "@/lib/badges";
import Icon from "@/app/icons";
import { formatPrice, parsePrice, typedPrice } from "@/lib/money";
import CategoryDesigner from "./category-designer";
import { defaultDropInput, dropProblem, dropShort, dropWhen, isUpcoming, israelInputToIso, toLocalInput } from "@/lib/drop";
import { kupaCheck } from "../kupa/use-kupa";

// מוצרים: CRUD + מדיה. מחיקה היא תמיד soft delete (שחזור 30 יום).
// טיוטת עריכה נשמרת ב-localStorage לפי מזהה מוצר — טופס לא מתנקה עד שהשרת אישר.

interface EditState {
  id: string | null; // null = חדש
  name: string;
  description: string;
  price: string;
  trackStock: boolean;
  stock: number;
  isVisible: boolean;
  // צבע ומידה הם שני מתגים נפרדים ונבדלים, לא שדה טקסט חופשי לשם הקטגוריה —
  // וזו הסיבה שילדה לא יכולה יותר לרשום "צהוב" בתור שם השדה בטעות: אין שדה
  // כזה. המוצר תומך בציר בחירה אחד, ולכן הם מוציאים זה את זה.
  optionKind: "none" | "color" | "size";
  optionList: string[]; // ["ורוד", "כחול"], שדה נפרד לכל ערך, לא פסיקים
  categories: string[]; // מוצר יכול לשבת בכמה קטגוריות (0046)
  badge: "rare" | "sale" | null;
  /** ⭐ מומלץ — בחלק המומלצים בראש הדוכן (0053) */
  featured: boolean;
  /** 🎁 שקית הפתעה (0056) */
  isMystery: boolean;
  /** 🔥 דרופ (0056): נפתח בזמן קבוע. dropInput בפורמט של datetime-local */
  dropOn: boolean;
  dropInput: string;
  imageKey: string | null;
  videoKey: string | null;
  posterKey: string | null;
  pendingImage: Blob | null;
  pendingVideo: Blob | null;
  pendingPoster: Blob | null;
  previewUrl: string | null;
  previewIsVideo: boolean;
  // הקובץ הגולמי שנבחר עכשיו, לפני עיבוד לריבוע — כדי שאפשר יהיה למקם
  // מחדש בלי לבקש ממנה לצלם שוב. null לתמונה שכבר שמורה (אין לנו את
  // הקובץ המקורי שלה יותר).
  pendingImageRaw: File | Blob | null;
  imagePos: { x: number; y: number };
}

const EMPTY_EDIT: EditState = {
  id: null,
  name: "",
  description: "",
  price: "",
  trackStock: true,
  stock: 1,
  isVisible: true,
  optionKind: "none",
  optionList: [""],
  categories: [],
  badge: null,
  featured: false,
  isMystery: false,
  dropOn: false,
  dropInput: "",
  imageKey: null,
  videoKey: null,
  posterKey: null,
  pendingImage: null,
  pendingVideo: null,
  pendingPoster: null,
  previewUrl: null,
  previewIsVideo: false,
  pendingImageRaw: null,
  imagePos: { x: 50, y: 50 },
};

/** הקטגוריות של מוצר — המערך החדש, או הקטגוריה הישנה היחידה (0045) */
const productCats = (p: Product) => (p.categories?.length ? p.categories : p.category ? [p.category] : []);

/** תגית בשורת מוצר. לכולן אותו גובה ואותה מסגרת (שקופה כשאין קו), כדי
 *  שהמקווקווה לא תצא גבוהה מהשאר; והטקסט נשבר לשורה במקום להיחתך. */
const CHIP =
  "inline-flex items-center gap-1 min-h-[26px] max-w-full px-2 py-0.5 border border-transparent text-[12px] leading-snug text-right break-words";

export default function ProductsPage() {
  const { store, setStore, loading } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [designOpen, setDesignOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  // "+ קטגוריה" בשורת מוצר: פותחים את העורך וגוללים ישר לבחירת הקטגוריה
  const [focusCats, setFocusCats] = useState(false);
  const [sorting, setSorting] = useState(false);
  useEffect(() => {
    if (!edit || !focusCats) return;
    const t = setTimeout(() => {
      document.getElementById("editor-categories")?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFocusCats(false);
    }, 250);
    return () => clearTimeout(t);
  }, [edit, focusCats]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  // המוצר הראשון נשמר עכשיו — הרגע שבו הדוכן מפסיק להיות ריק
  const [celebrate, setCelebrate] = useState(false);

  // הקלטה
  const [recOpen, setRecOpen] = useState(false);
  const [recLive, setRecLive] = useState(false);
  const [recProgress, setRecProgress] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const handleRef = useRef<RecorderHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef(0);

  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // כתיבה אוטומטית (פרימיום)
  const [aiBusy, setAiBusy] = useState(false);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    if (!celebrate) return;
    const w = window.innerWidth;
    [0.25, 0.5, 0.75].forEach((x, i) =>
      setTimeout(() => confettiBurst(w * x, window.innerHeight * 0.28), i * 140)
    );
  }, [celebrate]);

  /**
   * הבחירות כפי שיישמרו: שדות ריקים וכפולים נופלים. מקור אמת אחד גם
   * לשבבים בעורך וגם לשמירה — אחרת היא רואה שלוש בחירות ובחנות מופיעות שתיים.
   */
  const optionValues = useMemo(
    // התקרה עלתה מ-12 ל-30 (2026-09): יש מוכרות עם עשרות וריאציות אמיתיות
    () => [...new Set((edit?.optionList ?? []).map((o) => o.trim()).filter(Boolean))].slice(0, 30),
    [edit?.optionList]
  );

  /** דף החנות מוגש מקאש של 60 שניות — מרעננים אותו מיד אחרי שינוי מוצרים */
  const refreshStorePage = () => {
    if (!store) return;
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug }),
    }).catch(() => {});
  };

  /** מבקש מה-AI תיאור למוצר על סמך התמונה שבעורך */
  async function writeDescription() {
    if (!edit || !store || aiBusy) return;
    const blob = edit.pendingImage;
    // תמונה חדשה נשלחת מהדפדפן; תמונה שכבר נשמרה נמשכת בשרת לפי המפתח,
    // כדי שגם עריכה של מוצר ותיק תוכל לקבל תיאור בלי לצלם מחדש.
    const savedKey = !blob ? edit.imageKey ?? edit.posterKey : null;
    if (!blob && !savedKey) {
      showToast("קודם מוסיפים תמונה");
      return;
    }
    setAiBusy(true);
    try {
      const base64 = blob
        ? await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string).split(",")[1] ?? "");
            r.onerror = rej;
            r.readAsDataURL(blob);
          })
        : null;
      const resp = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          ...(base64 ? { imageBase64: base64, mediaType: blob!.type } : { imageKey: savedKey }),
          productName: edit.name,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error ?? "לא הצלחנו לכתוב תיאור. אפשר לנסות שוב");
        return;
      }
      setEdit((e) => e && { ...e, description: data.description });
      showToast("כתבנו תיאור, אפשר לשנות אותו");
    } catch {
      showToast("אין חיבור לאינטרנט. אפשר לנסות שוב");
    } finally {
      setAiBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    if (!store) return;
    const supa = supabaseBrowser();
    const { data } = await supa
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setProducts((data as Product[]) ?? []);
  }, [store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * ?new=1 — הגעה ישירה מסוף פתיחת הדוכן. פותח את העורך מיד, כדי שהמשפט
   * "בואי נוסיף את המוצר הראשון שלך" (בכרטיס השיתוף) יימשך לפעולה ולא למסך רשימה ריק.
   */
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || !store) return;
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    setAutoOpened(true);
    setEdit({ ...EMPTY_EDIT });
    window.history.replaceState({}, "", "/dashboard/products");
  }, [store, autoOpened]);

  /* ---------- קטגוריות של החנות ---------- */
  async function saveCategories(next: string[]): Promise<boolean> {
    if (!store) return false;
    const cleaned = [...new Set(next.map((c) => c.trim()).filter(Boolean))].slice(0, 20);
    const supa = supabaseBrowser();
    const { error } = await supa.from("stores").update({ categories: cleaned }).eq("id", store.id);
    if (error) {
      // העמודה עוד לא בדאטהבייס — אומרים את זה במקום להיכשל בשקט
      showToast("לא הצלחנו לשמור את הקטגוריות. אפשר לנסות שוב מאוחר יותר");
      return false;
    }
    setStore({ ...store, categories: cleaned });
    return true;
  }

  /* קטגוריה חדשה מתוך עורך המוצר: נשמרת לדוכן ונבחרת למוצר הזה מיד,
     בלי לצאת מהעורך ולחזור לכרטיס הקטגוריות */
  const [catDraft, setCatDraft] = useState<string | null>(null);
  async function addCategoryFromEditor() {
    const name = (catDraft ?? "").trim();
    if (!name) return setCatDraft(null);
    const exists = (store?.categories ?? []).includes(name);
    if (!exists && !(await saveCategories([...(store?.categories ?? []), name]))) return;
    setEdit((s) => s && { ...s, categories: s.categories.includes(name) ? s.categories : [...s.categories, name] });
    setCatDraft(null);
  }

  function addCategory() {
    const parts = newCategory.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    setNewCategory("");
    saveCategories([...(store?.categories ?? []), ...parts]);
  }

  /* ---------- טיוטות ---------- */
  const draftKey = (id: string | null) => `duchan-product-draft-${id ?? "new"}`;

  function openEditor(p: Product | null) {
    setCatDraft(null);
    let base: EditState;
    if (p) {
      base = {
        ...EMPTY_EDIT,
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        price: String(p.price),
        trackStock: p.track_stock,
        // מוצר ישן עם שם קטגוריה חופשי (למשל מהבאג הקודם) נטען כברירת מחדל
        // כ"צבע" — היא יכולה פשוט לעבור למידה אם זה מה שהתכוונו אליו
        optionKind: !p.options?.length ? "none" : p.option_label === "מידה" ? "size" : "color",
        optionList: p.options?.length ? p.options : [""],
        // המערך החדש גובר; מוצר ישן עם קטגוריה יחידה נטען כרשימה של אחת
        categories: p.categories?.length ? p.categories : p.category ? [p.category] : [],
        badge: p.badge ?? null,
        featured: p.featured === true,
        isMystery: p.is_mystery === true,
        // דרופ שכבר נפתח הוא מוצר רגיל — לא מציגים זמן שעבר
        dropOn: isUpcoming(p.drop_at, Date.now()),
        dropInput: isUpcoming(p.drop_at, Date.now()) ? toLocalInput(p.drop_at) : "",
        stock: p.stock,
        isVisible: p.is_visible !== false,
        imageKey: p.image_key,
        videoKey: p.video_key,
        posterKey: p.poster_key,
        previewUrl: mediaUrl(p.video_key) ?? mediaUrl(p.image_key),
        previewIsVideo: !!p.video_key,
      };
    } else {
      base = { ...EMPTY_EDIT };
    }
    // שחזור טיוטה אם יש
    try {
      const raw = localStorage.getItem(draftKey(p?.id ?? null));
      if (raw) {
        const d = JSON.parse(raw);
        base = {
          ...base,
          name: d.name ?? base.name,
          description: d.description ?? base.description,
          price: d.price ?? base.price,
          optionKind: d.optionKind ?? base.optionKind,
          optionList: d.optionList ?? base.optionList,
        };
      }
    } catch {}
    setEdit(base);
  }

  useEffect(() => {
    if (!edit) return;
    localStorage.setItem(
      draftKey(edit.id),
      JSON.stringify({
        name: edit.name,
        description: edit.description,
        price: edit.price,
        optionKind: edit.optionKind,
        optionList: edit.optionList,
      })
    );
  }, [edit]);

  /* ---------- מדיה ---------- */
  async function onPhoto(file: File) {
    // בלי ה-try הזה, תמונה שהדפדפן לא מפענח (HEIC מאייפון) מפילה את הפונקציה
    // בשקט: הילדה בוחרת תמונה, לא קורה כלום, ואין מה להגיד לה.
    let blob: Blob;
    try {
      blob = await squareImage(file, 900, "cover", { x: 50, y: 50 });
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "לא הצלחנו לקרוא את התמונה. אפשר לנסות תמונה אחרת");
      return;
    }
    setEdit((e) =>
      e && {
        ...e,
        pendingImage: blob,
        pendingImageRaw: file,
        imagePos: { x: 50, y: 50 },
        pendingVideo: null,
        pendingPoster: null,
        videoKey: null,
        posterKey: null,
        // גולמי, לא מעובד: כדי שאפשר יהיה לגרור ולמקם בלי לחתוך שום דבר לצמיתות
        previewUrl: URL.createObjectURL(file),
        previewIsVideo: false,
      }
    );
  }

  /* ---------- מיקום תמונה: גוררים כדי לבחור מה יופיע בריבוע ---------- */
  const posDrag = useRef<{ x: number; y: number; pos: { x: number; y: number } } | null>(null);

  function onPosPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!edit?.pendingImageRaw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    posDrag.current = { x: e.clientX, y: e.clientY, pos: edit.imagePos };
  }

  function onPosPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!posDrag.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - posDrag.current.x;
    const dy = e.clientY - posDrag.current.y;
    // גרירה ימינה חושפת את הצד השמאלי של התמונה — ולכן האחוז זז הפוך לתנועת האצבע
    const clamp = (n: number) => Math.min(100, Math.max(0, n));
    const nx = clamp(posDrag.current.pos.x - (dx / box.width) * 100);
    const ny = clamp(posDrag.current.pos.y - (dy / box.height) * 100);
    setEdit((s) => s && { ...s, imagePos: { x: nx, y: ny } });
  }

  async function onPosPointerUp() {
    if (!posDrag.current) return;
    posDrag.current = null;
    if (!edit?.pendingImageRaw) return;
    try {
      const blob = await squareImage(edit.pendingImageRaw, 900, "cover", edit.imagePos);
      setEdit((s) => s && { ...s, pendingImage: blob });
    } catch {}
  }

  async function onGalleryVideo(file: File) {
    const check = await validateGalleryVideo(file);
    if (!check.ok) {
      showToast(check.reason);
      return;
    }
    const url = URL.createObjectURL(file);
    const poster = await posterFrom(url);
    setEdit((e) =>
      e && {
        ...e,
        pendingVideo: file,
        pendingPoster: poster,
        pendingImage: null,
        imageKey: null,
        previewUrl: url,
        previewIsVideo: true,
      }
    );
  }

  async function openRecorder() {
    setRecOpen(true);
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "אין גישה למצלמה. אפשר לבחור 'וידאו מהגלריה'");
      setRecOpen(false);
    }
  }

  function closeRecorder() {
    handleRef.current?.cancel();
    handleRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setRecLive(false);
    setRecProgress(0);
    setRecOpen(false);
  }

  async function recStart() {
    if (!streamRef.current || recLive) return;
    setRecLive(true);
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / (RECORD_SECONDS * 1000));
      setRecProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    const handle = await startRecording(streamRef.current);
    handleRef.current = handle;
    const blob = await handle.result;
    cancelAnimationFrame(rafRef.current);
    setRecLive(false);
    setRecProgress(0);

    if (blob && blob.size > 0) {
      const url = URL.createObjectURL(blob);
      const poster = await posterFrom(url);
      setEdit((e) =>
        e && {
          ...e,
          pendingVideo: blob,
          pendingPoster: poster,
          pendingImage: null,
          imageKey: null,
          previewUrl: url,
          previewIsVideo: true,
        }
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecOpen(false);
      showToast("הוידאו מוכן. כדי לשמור אותו לוחצים \"שמירה\"");
    }
  }

  function recStop() {
    handleRef.current?.stop();
  }

  /* ---------- שמירה ---------- */
  async function save() {
    if (!edit || !store || busy) return;
    // דרופ: בודקים את הזמן לפני שמעלים מדיה — זמן שעבר היה פותח את המוצר מיד
    if (edit.dropOn) {
      const problem = dropProblem(edit.dropInput);
      if (problem) {
        showToast(problem);
        document.getElementById("editor-drop")?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
    }
    setBusy(true);
    try {
      const supa = supabaseBrowser();

      // מעלים מדיה קודם — אם נכשל, הטופס נשאר מלא
      let { imageKey, videoKey, posterKey } = edit;
      if (edit.pendingImage) {
        const r = await uploadBlob("image", edit.pendingImage, store.id);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        imageKey = r.key;
        videoKey = null;
        posterKey = null;
      }
      if (edit.pendingVideo) {
        const r = await uploadBlob("video", edit.pendingVideo, store.id);
        if ("error" in r) {
          showToast(r.error);
          return;
        }
        videoKey = r.key;
        imageKey = null;
        if (edit.pendingPoster) {
          const pr = await uploadBlob("poster", edit.pendingPoster, store.id);
          if (!("error" in pr)) posterKey = pr.key;
        }
      }

      const row: Record<string, unknown> = {
        name: edit.name.trim() || "מוצר",
        description: edit.description.trim() || null,
        price: parsePrice(edit.price) ?? 0,
        track_stock: edit.trackStock,
        option_label: optionValues.length ? (edit.optionKind === "size" ? "מידה" : "צבע") : null,
        options: optionValues.length ? optionValues : null,
        categories: edit.categories.length ? edit.categories : null,
        // הישנה ממשיכה להתעדכן — קוד שעוד קורא אותה רואה את הראשונה
        category: edit.categories[0] ?? null,
        badge: edit.badge,
        featured: edit.featured,
        is_mystery: edit.isMystery,
        drop_at: edit.dropOn ? israelInputToIso(edit.dropInput) : null,
        stock: Math.max(0, edit.stock),
        is_visible: edit.isVisible,
        image_key: imageKey,
        video_key: videoKey,
        poster_key: posterKey,
      };

      const write = (r: Record<string, unknown>) =>
        edit.id
          ? supa.from("products").update(r).eq("id", edit.id)
          : supa.from("products").insert({ ...r, store_id: store.id });

      let { error } = await write(row);
      if (error) {
        // 0056 עוד לא בדאטהבייס. דרופ אסור לאבד בשקט — מוצר שאמור להיות
        // נעול היה נפתח מיד. אז עוצרים ואומרים.
        if (edit.dropOn) {
          showToast("דרופ לא זמין כרגע. אפשר לבחור \"כבר עכשיו\" ולשמור");
          return;
        }
        const { is_mystery: _m, drop_at: _d, ...noDrops } = row;
        ({ error } = await write(noDrops));
      }
      if (error) {
        // עמודה חדשה שאולי עוד לא בפרודקשן — שומרים בלעדיה במקום להפיל
        // את כל השמירה (אותו דפוס כמו בקריאות הציבוריות)
        const { featured: _f, is_mystery: _m2, drop_at: _d2, ...noFeatured } = row;
        ({ error } = await write(noFeatured));
      }
      if (error) {
        const { categories: _cs, featured: _f2, is_mystery: _m3, drop_at: _d3, ...noCats } = row;
        ({ error } = await write(noCats));
        if (error) {
          const { category: _c, ...noCategory } = noCats;
          ({ error } = await write(noCategory));
        }
      }
      if (error) {
        showToast("השמירה לא הצליחה. אפשר לנסות שוב");
        return;
      }

      localStorage.removeItem(draftKey(edit.id));
      // המוצר הראשון לא מקבל טוסט קטן שנעלם אחרי שתי שניות. זה השלב שבו
      // הדוכן הופך לדבר אמיתי שאפשר לשלוח, ואומרים את זה בגדול ומיד.
      const isFirst = !edit.id && products.length === 0;
      if (isFirst) setCelebrate(true);
      else showToast(edit.trackStock && edit.stock === 0 ? "המוצר סומן כאזל" : edit.id ? "המוצר עודכן" : "המוצר נוסף לדוכן");
      setEdit(null);
      refresh();
      refreshStorePage();
      kupaCheck(); // אולי אות חדש (מוצר ראשון, תמונה, חמישה מוצרים)
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!edit?.id) return;
    const supa = supabaseBrowser();
    await supa.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", edit.id);
    localStorage.removeItem(draftKey(edit.id));
    setEdit(null);
    showToast("המוצר נמחק, אפשר לשחזר תוך 30 יום");
    refresh();
    refreshStorePage();
    loadDeleted();
  }

  /* ---------- שכפול ---------- */
  async function duplicateProduct() {
    if (!edit?.id || !store) return;
    const src = products.find((p) => p.id === edit.id);
    if (!src) return;
    const supa = supabaseBrowser();
    // מפתחות המדיה משותפים — אף פעם לא מוחקים אובייקטים מ-R2, אז שיתוף בטוח
    const { error } = await supa.from("products").insert({
      store_id: store.id,
      name: `${src.name} (עותק)`.slice(0, 40),
      description: src.description,
      price: src.price,
      track_stock: src.track_stock,
      option_label: src.option_label,
      options: src.options,
      ...(src.category != null ? { category: src.category } : {}),
      ...(src.categories?.length ? { categories: src.categories } : {}),
      badge: src.badge,
      ...(src.featured ? { featured: true } : {}),
      ...(src.is_mystery ? { is_mystery: true } : {}),
      // דרופ שעוד לא נפתח עובר לעותק; דרופ שעבר — לא (העותק פשוט פתוח)
      ...(isUpcoming(src.drop_at, Date.now()) ? { drop_at: src.drop_at } : {}),
      stock: src.stock,
      is_visible: src.is_visible,
      image_key: src.image_key,
      video_key: src.video_key,
      poster_key: src.poster_key,
      sort_order: src.sort_order + 1,
    });
    if (error) {
      showToast("השכפול לא הצליח. אפשר לנסות שוב");
      return;
    }
    setEdit(null);
    showToast("נוצר עותק של המוצר");
    refresh();
    refreshStorePage();
  }

  /* ---------- סידור ---------- */
  async function move(p: Product, dir: -1 | 1) {
    const idx = products.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= products.length) return;
    const next = [...products];
    [next[idx], next[target]] = [next[target], next[idx]];
    setProducts(next); // אופטימי
    const supa = supabaseBrowser();
    await Promise.all(
      next.map((prod, i) =>
        prod.sort_order !== i
          ? supa.from("products").update({ sort_order: i }).eq("id", prod.id)
          : null
      )
    );
    refresh();
    refreshStorePage();
  }


  /* ---------- שחזור ---------- */
  const [deleted, setDeleted] = useState<Product[]>([]);
  const [deletedOpen, setDeletedOpen] = useState(false);

  const loadDeleted = useCallback(async () => {
    if (!store) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const supa = supabaseBrowser();
    const { data } = await supa
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .not("deleted_at", "is", null)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false });
    setDeleted((data as Product[]) ?? []);
  }, [store]);

  useEffect(() => {
    loadDeleted();
  }, [loadDeleted]);

  async function restore(p: Product) {
    const supa = supabaseBrowser();
    await supa.from("products").update({ deleted_at: null }).eq("id", p.id);
    showToast("המוצר חזר לדוכן 🎉");
    refresh();
    refreshStorePage();
    loadDeleted();
  }

  // כמה מוצרים (גלויים) יש בכל קטגוריה — כמו בדוכן עצמו, שמציג רק קטגוריה שיש בה מוצר
  const catCount = new Map<string, number>();
  for (const p of products) {
    if (p.is_visible === false) continue;
    for (const c of productCats(p)) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  const emptyCats = (store?.categories ?? []).filter((c) => !catCount.get(c));

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store) return null;

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
        <h1 className="text-lg font-bold">המוצרים שלי</h1>
        <p className="text-xs text-[var(--muted)] font-light">
          {products.length === 1 ? "מוצר אחד" : `${products.length} מוצרים`}
        </p>
      </header>

      <div className="px-4 pt-5 pb-8 flex flex-col gap-4">
        {/* ── קטגוריות של החנות ──
            המוכרת מגדירה כאן רשימה משלה (נידו, מים, קרח...), מתייגת
            מוצרים בעורך, והקונות מקבלות צ'יפים לסינון בדף החנות. */}
        {products.length > 0 && (
          <div className="bg-white border border-[var(--line)] p-5 mb-2" data-testid="categories-box">
            <div className="text-[14px] font-bold mb-1">קטגוריות בדוכן</div>
            <p className="text-[12px] text-[var(--faint)] leading-relaxed mb-4">
              הקונים יוכלו לסנן את הדוכן לפי קטגוריות. אחרי שמוסיפים קטגוריה, בוחרים אותה בעריכה של כל מוצר.
            </p>
            <div className="flex gap-2 flex-wrap">
              {(store?.categories ?? []).map((c) => (
                <span
                  key={c}
                  data-testid="category-chip"
                  className={`inline-flex items-center gap-1 border px-2.5 py-1.5 text-[12.5px] ${
                    (catCount.get(c) ?? 0) > 0 ? "border-[var(--line)] bg-[var(--canvas)]" : "border-dashed border-[var(--line)] bg-white text-[var(--muted)]"
                  }`}
                >
                  {c}
                  <span className="text-[11px] text-[var(--muted)]">· {catCount.get(c) ?? 0}</span>
                  <button
                    onClick={() => saveCategories((store?.categories ?? []).filter((x) => x !== c))}
                    aria-label={`הסרת הקטגוריה ${c}`}
                    className="text-[var(--muted)] text-[14px] leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                onBlur={addCategory}
                placeholder={(store?.categories?.length ?? 0) === 0 ? "למשל: נידו, מים, קרח" : "+ עוד קטגוריה"}
                aria-label="קטגוריה חדשה"
                maxLength={20}
                className="flex-1 min-w-28 border border-dashed border-[#D3D5DC] px-2.5 py-1.5 text-[12.5px]"
              />
            </div>
            {/* קטגוריה מופיעה בדוכן רק כשיש בה מוצר. בלי ההסבר הזה הגדירו
                קטגוריות, לא ראו אותן בדוכן, ולא הבינו למה. */}
            {emptyCats.length > 0 && (
              <div data-testid="categories-hint" className="mt-4 bg-[var(--warn-bg)] text-[var(--warn-ink)] px-3.5 py-3 text-[12.5px] leading-relaxed">
                <div className="font-bold mb-0.5">
                  {emptyCats.length === (store?.categories?.length ?? 0)
                    ? "הקטגוריות עוד לא מופיעות בדוכן"
                    : `${emptyCats.join(", ")} ${emptyCats.length === 1 ? "עוד ריקה, ולכן לא מופיעה" : "עוד ריקות, ולכן לא מופיעות"} בדוכן`}
                </div>
                קטגוריה מופיעה לקונים רק כשיש בה מוצר. כדי לשייך: לוחצים על מוצר ברשימה למטה, בוחרים לו קטגוריה, ושומרים.
              </div>
            )}
            {/* שורה שקטה בתחתית הכרטיס, כמו השורות ב"הדוכן שלי" — לא עוד כפתור עם מסגרת ליד הכותרת */}
            {(store?.categories?.length ?? 0) > 0 && (
              <button
                onClick={() => setDesignOpen(true)}
                data-testid="open-category-designer"
                className="w-full mt-4 pt-3 border-t border-[var(--line)] min-h-11 flex items-center justify-between text-[13px] font-medium text-[var(--ink)]"
              >
                <span>עיצוב הקטגוריות</span>
                <Chevron className="text-[var(--muted)]" />
              </button>
            )}
          </div>
        )}

        {designOpen && store && (
          <CategoryDesigner
            store={store}
            onClose={() => setDesignOpen(false)}
            onSaved={(patch) => {
              setStore({ ...store, ...patch });
              setDesignOpen(false);
              showToast("עיצוב הקטגוריות נשמר ✨");
            }}
          />
        )}

        {/* דוכן ריק זה לא מסך שגיאה — זו הזמנה. הכפתור יושב כאן וגם למעלה,
            כי מסך ריק שמפנה ל-"+" קטן בפינה משאיר אותה לחפש. */}
        {products.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center gap-3">
            <Icon name="stall" size={64} tone="var(--cream)" className="text-[var(--wood)]" />
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              הדוכן שלך ריק בינתיים.
              <br />
              הוספת מוצר לוקחת פחות מדקה: תמונה, שם, מחיר.
            </p>
            <button
              onClick={() => openEditor(null)}
              className="mt-1 bg-[var(--ink)] text-white px-6 py-3 text-[13.5px] font-bold"
            >
              הוספת מוצר ראשון
            </button>
          </div>
        )}
        {/* מעל הרשימה: כותרת קטנה ו"לשנות סדר". החצים ▲▼ מופיעים רק במצב
            סידור — בשאר הזמן השורה נקייה: תמונה, שם, מחיר, ומה שחשוב לדעת. */}
        {products.length > 1 && (
          <div className="flex items-center justify-between -mb-1 px-0.5">
            <span className="text-[13px] font-bold text-[var(--ink)]">המוצרים בדוכן</span>
            <button
              onClick={() => setSorting((v) => !v)}
              data-testid="sort-toggle"
              aria-pressed={sorting}
              className="min-h-11 px-1 text-[13px] font-medium text-[var(--muted)]"
            >
              {sorting ? "✓ סיימתי לסדר" : "↕ לשנות סדר"}
            </button>
          </div>
        )}
        {products.map((p, idx) => {
          const out = p.track_stock && p.stock === 0;
          const hidden = p.is_visible === false;
          const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
          const cats = productCats(p);
          const low = p.track_stock && !out && p.stock <= 2;
          const upcoming = isUpcoming(p.drop_at, Date.now());
          return (
            <div
              key={p.id}
              onClick={() => !sorting && openEditor(p)}
              data-testid="product-row"
              className={`bg-white border border-[var(--line)] p-4 flex gap-4 items-center text-right max-[340px]:p-3 max-[340px]:gap-2.5 ${sorting ? "" : "cursor-pointer"} ${out || hidden ? "opacity-60" : ""}`}
            >
              <div className="w-[72px] h-[72px] max-[340px]:w-12 max-[340px]:h-12 shrink-0 bg-[var(--canvas)] flex items-center justify-center text-3xl overflow-hidden relative">
                {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                {p.video_key && (
                  <span className="absolute bottom-0.5 left-1 text-[9px] bg-black/60 text-white px-1">וידאו</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold leading-snug flex items-center gap-1.5 min-w-0">
                  {p.featured && <span aria-label="מומלץ" title="מומלץ" className="text-[var(--warn-ink)] shrink-0">★</span>}
                  <span className="truncate">{p.name}</span>
                </div>
                <div className="text-[14px] text-[var(--ink)] mt-0.5">₪{formatPrice(p.price)}</div>
                {/* שתי שורות נפרדות, כדי שיהיה ברור מה זה מה (מרינה: "מה מציגים
                    מה רואים"): קודם מצב המוצר בתגיות באותו גודל בדיוק, ואז
                    הקטגוריות כטקסט — לא עוד תגית שנראית כמו מצב. */}
                {(out || hidden || low || upcoming || !!p.is_mystery) && (
                  <div className="flex gap-1.5 items-center mt-2 flex-wrap" data-testid="row-status">
                    {out && <span className={`${CHIP} bg-[var(--danger-bg)] text-[var(--danger)] font-bold`}>אזל</span>}
                    {upcoming && (
                      <span className={`${CHIP} bg-[var(--ink)] text-white font-bold`} data-testid="row-drop">
                        <Icon name="hourglass" size={13} tone="transparent" />
                        {/* טקסט אחד בתוך span: ב-inline-flex כל קטע טקסט הופך לפריט נפרד,
                            והשבירה לשורות מערבבת את הסדר */}
                        <span>
                          נפתח ב-<bdi>{dropShort(p.drop_at!).date}</bdi> · <bdi>{dropShort(p.drop_at!).time}</bdi>
                        </span>
                      </span>
                    )}
                    {p.is_mystery && (
                      <span className={`${CHIP} bg-[var(--canvas)] text-[var(--ink)]`} data-testid="row-mystery">
                        <Icon name="gift" size={13} tone="transparent" />
                        שקית הפתעה
                      </span>
                    )}
                    {low && (
                      <span className={`${CHIP} bg-[var(--warn-bg)] text-[var(--warn-ink)]`}>
                        {p.stock === 1 ? "נשאר אחרון" : `נשארו ${p.stock}`}
                      </span>
                    )}
                    {hidden && <span className={`${CHIP} bg-[var(--sub)] text-[var(--muted)]`}>מוסתר מהקונים</span>}
                  </div>
                )}
                {!!store.categories?.length &&
                  (cats.length ? (
                    <div className="text-[12.5px] text-[var(--muted)] mt-1.5 leading-snug" data-testid="row-cats">
                      קטגוריה: <span className="text-[var(--ink)]">{cats.join(" · ")}</span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusCats(true);
                        openEditor(p);
                      }}
                      data-testid="row-add-category"
                      className={`${CHIP} mt-2 border-dashed text-[var(--warn-ink)] font-medium`}
                      style={{ borderColor: "var(--warn-ink)" }}
                    >
                      + קטגוריה
                    </button>
                  ))}
              </div>
              {sorting ? (
                <div className="flex flex-col gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => move(p, -1)}
                    disabled={idx === 0}
                    className="w-10 h-10 border border-[var(--line)] bg-[var(--canvas)] text-[12px] disabled:opacity-25"
                    aria-label="להזיז למעלה"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(p, 1)}
                    disabled={idx === products.length - 1}
                    className="w-10 h-10 border border-[var(--line)] bg-[var(--canvas)] text-[12px] disabled:opacity-25"
                    aria-label="להזיז למטה"
                  >
                    ▼
                  </button>
                </div>
              ) : (
                /* כמו בשורות של "הדוכן שלי": החץ אומר שלוחצים ונכנסים */
                <Chevron className="text-[var(--faint)]" size={18} />
              )}
            </div>
          );
        })}

        {deleted.length > 0 && (
          <button
            onClick={() => setDeletedOpen(true)}
            className="text-center text-xs text-[var(--muted)] underline py-2"
          >
            מוצרים שנמחקו ({deleted.length}), אפשר לשחזר תוך 30 יום
          </button>
        )}
      </div>

      {/* היה עיגול "+" בלי מילה, וקל היה לפספס אותו לגמרי */}
      <button
        onClick={() => openEditor(null)}
        aria-label="מוצר חדש"
        className="fixed bottom-20 inset-x-0 mx-auto max-w-[calc(28rem-1.5rem)] w-[calc(100%-1.5rem)] h-12 bg-[var(--ink)] text-white text-[15px] font-bold  z-30 flex items-center justify-center gap-2"
      >
        <Icon name="plus" size={18} /> מוצר חדש
      </button>

      {/* editor sheet */}
      {edit && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setEdit(null)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white max-h-[90%] flex flex-col">
          <div className="px-4 pt-3 overflow-y-auto">
            <div className="w-9 h-1 bg-black/15 mx-auto mb-3.5" />
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold">{edit.id ? "עריכת מוצר" : "מוצר חדש"}</h2>
              <CloseX onClick={() => setEdit(null)} testid="editor-close" />
            </div>

            {/* מה מותר למכור — רק במוצר חדש, לפני שמעלים תמונה. בתקנון זה
                קיים, אבל אף אחת לא קוראת תקנון; כאן זה נראה ברגע הנכון. */}
            {!edit.id && (
              <p className="text-[12px] text-[var(--muted)] bg-[var(--canvas)] px-3 py-2 mb-3 leading-relaxed">
                דוכן מיועד למוצרים לא שימושיים ופריטי יד שנייה: צעצועים,
                תכשיטים, פריטי תחביב. בלי אלכוהול, טבק, כלי נשק, תרופות,
                בעלי חיים או מוצרים מזויפים.{" "}
                <a href="/terms" target="_blank" className="underline">עוד בתקנון</a>
              </p>
            )}

            <label className="block text-[12px] font-semibold mb-1.5">1. תמונה או וידאו</label>
            <div
              className="bg-[var(--canvas)] border-[1.5px] border-dashed border-[#D3D5DC] flex flex-col items-center justify-center text-5xl overflow-hidden relative mb-1 touch-none select-none"
              style={{ height: "13rem" }}
              onPointerDown={onPosPointerDown}
              onPointerMove={onPosPointerMove}
              onPointerUp={onPosPointerUp}
              onPointerCancel={onPosPointerUp}
            >
              {edit.previewUrl ? (
                <>
                  <button
                    onClick={() =>
                      setEdit((e) => e && {
                        ...e,
                        previewUrl: null, previewIsVideo: false,
                        pendingImage: null, pendingImageRaw: null, imagePos: { x: 50, y: 50 },
                        pendingVideo: null, pendingPoster: null,
                        imageKey: null, videoKey: null, posterKey: null,
                      })
                    }
                    className="absolute top-1.5 left-1.5 bg-black/55 text-white w-6 h-6 text-sm z-10"
                  >
                    ✕
                  </button>
                  {edit.previewIsVideo ? (
                    <video src={edit.previewUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
                  ) : (
                    <img
                      src={edit.previewUrl}
                      alt=""
                      className="w-full h-full pointer-events-none"
                      style={{ objectFit: "cover", objectPosition: `${edit.imagePos.x}% ${edit.imagePos.y}%` }}
                    />
                  )}
                </>
              ) : (
                <>
                  <span>🛍️</span>
                  <span className="text-[12px] text-[var(--muted)] font-sans mt-1">
                    עוד אין תמונה. בוחרים אחד מהכפתורים למטה
                  </span>
                </>
              )}
            </div>
            {edit.previewUrl && !edit.previewIsVideo && edit.pendingImageRaw && (
              <p className="text-[12px] text-[var(--muted)] text-center mb-2.5">
                גוררים בתמונה כדי לבחור מה יופיע בריבוע
              </p>
            )}

            {/* בלי capture — אחרת הטלפון פותח מצלמה ישירות ואי אפשר לבחור
                תמונה שכבר צולמה. ראה ההערה הזהה במסך האונבורדינג. */}
            <input ref={photoRef} type="file" accept="image/*" hidden
              onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            <input ref={galleryRef} type="file" accept="video/*" hidden
              onChange={(e) => e.target.files?.[0] && onGalleryVideo(e.target.files[0])} />

            <div className="flex gap-2 mt-2 mb-3.5">
              <button onClick={openRecorder} className="flex-1 border border-[var(--line)] py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <Icon name="video" size={19} tone="var(--cream)" />הקלטת וידאו
              </button>
              <button onClick={() => photoRef.current?.click()} className="flex-1 border border-[var(--line)] py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <Icon name="camera" size={19} tone="var(--cream)" />תמונה
              </button>
              <button onClick={() => galleryRef.current?.click()} className="flex-1 border border-[var(--line)] py-2.5 text-xs font-medium flex flex-col items-center gap-0.5">
                <Icon name="gallery" size={19} tone="var(--cream)" />וידאו מהגלריה
              </button>
            </div>

            <label className="block text-[12px] font-semibold mb-1.5">2. שם המוצר</label>
            <input value={edit.name} maxLength={40} aria-label="שם המוצר" placeholder="למשל: סקוויש אבוקדו"
              onChange={(e) => setEdit((s) => s && { ...s, name: e.target.value })}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-sm mb-3" />

            <label className="block text-[12px] font-semibold mb-1.5">3. מחיר (₪)</label>
            <input value={edit.price} type="text" inputMode="decimal" aria-label="מחיר" placeholder="למשל: 15 או 10.90"
              onChange={(e) => setEdit((s) => s && { ...s, price: typedPrice(e.target.value) })}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-sm mb-4" />

            <p className="text-[12px] text-[var(--faint)] mb-2.5">
              מכאן והלאה הכל לא חובה. אפשר לשמור גם בלי למלא.
            </p>

            <div className="flex items-center justify-between mb-1">
              <label className="block text-[12px] text-[var(--muted)]">תיאור קצר (לא חובה)</label>
              {store.ai_enabled && (edit.pendingImage || edit.imageKey || edit.posterKey) && (
                <button data-testid="ai-describe" onClick={writeDescription} disabled={aiBusy}
                  className="text-[12px] text-[var(--ink)] border border-[var(--line)] px-2 py-1 disabled:opacity-50">
                  {aiBusy ? "כותבים…" : "✨ לכתוב לי תיאור"}
                </button>
              )}
            </div>
            <textarea value={edit.description} maxLength={120} rows={2} placeholder={edit.isMystery ? "מה יכול להיות בפנים? למשל: 3 סקווישים מפתיעים" : "למשל: רך במיוחד, חוזר לאט"}
              onChange={(e) => setEdit((s) => s && { ...s, description: e.target.value })}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-sm mb-3 resize-none" />

            {/* צבע ומידה: שני כפתורים נפרדים שמוציאים זה את זה, לא שדה טקסט
                לשם הקטגוריה. זה מה שמנע את הבאג הקודם: אין יותר שדה חופשי
                שאפשר לרשום בו בטעות צבע במקום השם. */}
            <div className="mb-1.5">
              <span className="text-[13px]">יש לזה כמה צבעים או מידות?</span>
            </div>
            <div className="flex gap-2 mb-3">
              {(["color", "size"] as const).map((kind) => {
                const on = edit.optionKind === kind;
                return (
                  <button
                    key={kind}
                    onClick={() =>
                      setEdit((s) => {
                        if (!s) return s;
                        const nextKind = s.optionKind === kind ? "none" : kind;
                        // מעבר בין צבע למידה, או כיבוי, מנקה את הרשימה —
                        // אחרת נשארים "צבעים" שמורים בתור מידות ולהפך
                        return nextKind === s.optionKind
                          ? s
                          : { ...s, optionKind: nextKind, optionList: [""] };
                      })
                    }
                    aria-pressed={on}
                    aria-label={kind === "color" ? "יש לזה כמה צבעים" : "יש לזה כמה מידות"}
                    className={`flex-1 border-[1.5px] py-2.5 text-[13px] font-semibold ${
                      on ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white"
                    }`}
                  >
                    {kind === "color" ? "צבע" : "מידה"}
                  </button>
                );
              })}
            </div>

            {edit.optionKind !== "none" && (
              <>
                <label className="block text-[11.5px] text-[var(--faint)] mb-1">
                  {edit.optionKind === "color" ? "אילו צבעים הקונים יכולים לבחור?" : "אילו מידות הקונים יכולים לבחור?"}
                </label>
                <div className="flex flex-col gap-1.5 mb-2">
                  {edit.optionList.map((v, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input
                        value={v}
                        placeholder={edit.optionKind === "color" ? `למשל: ${["ורוד", "לבן", "כחול"][i % 3]}` : `למשל: ${["S", "M", "L"][i % 3]}`}
                        aria-label={`${edit.optionKind === "color" ? "צבע" : "מידה"} ${i + 1}`}
                        onChange={(e) =>
                          setEdit((s) => {
                            if (!s) return s;
                            const list = [...s.optionList];
                            // הדבקה של רשימה שלמה ("ורוד, כחול, צהוב" או
                            // שורות) מתפצלת לשדות — ככה מזינים 30 וריאציות
                            // בהדבקה אחת במקום שלושים הקלדות.
                            const parts = e.target.value.split(/[,\n]/).map((p) => p.trim().slice(0, 20));
                            if (parts.length > 1) {
                              list.splice(i, 1, ...parts.filter(Boolean).slice(0, 30));
                            } else {
                              list[i] = e.target.value.slice(0, 20);
                            }
                            return { ...s, optionList: list.slice(0, 30) };
                          })
                        }
                        className="flex-1 border border-[var(--line)] px-3 py-2.5 text-sm"
                      />
                      {edit.optionList.length > 1 && (
                        <button
                          onClick={() =>
                            setEdit((s) => s && { ...s, optionList: s.optionList.filter((_, j) => j !== i) })
                          }
                          aria-label={`הסרת ${edit.optionKind === "color" ? "צבע" : "מידה"} ${i + 1}`}
                          className="w-11 border border-[var(--line)] text-[var(--muted)] text-[15px]"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {edit.optionList.length < 30 && (
                  <button
                    onClick={() => setEdit((s) => s && { ...s, optionList: [...s.optionList, ""] })}
                    className="w-full border border-dashed border-[#D3D5DC] py-2.5 text-[12.5px] text-[var(--muted)] mb-3"
                  >
                    + עוד {edit.optionKind === "color" ? "צבע" : "מידה"}
                  </button>
                )}
              </>
            )}

            {/* קטגוריה — מתוך הרשימה שהמוכרת הגדירה למעלה. מוצר בלי
                קטגוריה תקין לגמרי; הצ'יפים בחנות פשוט לא יסננו אותו. */}
            {store && (
              <>
                <label id="editor-categories" className="block text-[12px] text-[var(--muted)] mb-1 scroll-mt-24">
                  {store.categories?.length
                    ? "באיזו קטגוריה המוצר יופיע בדוכן? (אפשר לבחור כמה)"
                    : "קטגוריה (לא חובה) — הקונים יוכלו לסנן לפיה"}
                </label>
                <div className="flex gap-1.5 flex-wrap mb-3" role="group" aria-labelledby="editor-categories">
                  {(store.categories ?? []).map((c) => {
                    const on = edit.categories.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() =>
                          setEdit((s) =>
                            s && {
                              ...s,
                              categories: on
                                ? s.categories.filter((x) => x !== c)
                                : [...s.categories, c],
                            }
                          )
                        }
                        aria-pressed={on}
                        aria-label={`קטגוריה ${c}`}
                        className={`border-[1.5px] px-3 py-2 text-[12.5px] font-semibold ${
                          on ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-white"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                  {catDraft === null ? (
                    <button
                      onClick={() => setCatDraft("")}
                      data-testid="editor-new-category"
                      className="border-[1.5px] border-dashed border-[var(--line)] px-3 py-2 text-[12.5px] font-semibold text-[var(--muted)]"
                    >
                      + קטגוריה חדשה
                    </button>
                  ) : (
                    <span className="flex basis-full gap-1.5">
                      <input
                        autoFocus
                        value={catDraft}
                        onChange={(e) => setCatDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addCategoryFromEditor();
                          if (e.key === "Escape") setCatDraft(null);
                        }}
                        placeholder="למשל: צמידים"
                        aria-label="שם הקטגוריה החדשה"
                        maxLength={20}
                        className="flex-1 min-w-0 border-[1.5px] border-[var(--ink)] px-3 py-2 text-[13px]"
                      />
                      <button
                        onClick={addCategoryFromEditor}
                        data-testid="editor-new-category-add"
                        className="shrink-0 bg-[var(--ink)] text-white px-4 text-[12.5px] font-bold"
                      >
                        הוספה
                      </button>
                    </span>
                  )}
                </div>
              </>
            )}

            {/* תגיות. רק שתיים לבחירה — השאר מחושבות מהמכירות ומהמלאי, וזה
                בכוונה: "הכי נמכר" שאפשר להדביק הוא מדבקה, לא הישג. */}
            <label className="block text-[12px] text-[var(--muted)] mb-1">תגית (לא חובה)</label>
            <div className="flex gap-2 mb-1">
              {PICKABLE.map((b) => (
                <button
                  key={b.key}
                  data-testid={`badge-${b.key}`}
                  aria-pressed={edit.badge === b.key}
                  onClick={() => setEdit((s) => s && { ...s, badge: s.badge === b.key ? null : b.key })}
                  className={`flex-1 border py-2 text-[12.5px] transition ${
                    edit.badge === b.key
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white font-bold"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <Icon name={b.icon} size={14} tone="none" className="inline-block align-[-2px] ms-1" />
                  {b.label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-[var(--faint)] mb-3 leading-relaxed">
              התגיות "הכי נמכר", "חדש" ו"אחרון במלאי" מופיעות לבד, לפי המכירות ולפי מה שנשאר.
            </p>

            {/* ⭐ מומלץ — חלק משלו בראש הדוכן, לא קטגוריה ולא תגית */}
            <button
              type="button"
              onClick={() => setEdit((s) => s && { ...s, featured: !s.featured })}
              aria-pressed={edit.featured}
              aria-label="מומלץ"
              data-testid="featured-toggle"
              className={`w-full flex items-center gap-3 border-2 px-3 py-3 mb-3 text-right ${
                edit.featured ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-[var(--line)] bg-white"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>{edit.featured ? "★" : "☆"}</span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold">מומלץ</span>
                <span className="block text-[11.5px] text-[var(--muted)] leading-snug">יופיע בחלק &quot;המומלצים&quot; בראש הדוכן</span>
              </span>
              <span className={`text-[11px] font-bold px-2 py-1 ${edit.featured ? "bg-[var(--ink)] text-white" : "border border-[var(--line)] text-[var(--muted)]"}`}>
                {edit.featured ? "כן" : "לא"}
              </span>
            </button>

            {/* 🎁 שקית הפתעה — הקונים לא יודעים מה בפנים */}
            <button
              type="button"
              onClick={() => setEdit((s) => s && { ...s, isMystery: !s.isMystery })}
              aria-pressed={edit.isMystery}
              aria-label="שקית הפתעה"
              data-testid="mystery-toggle"
              className={`w-full flex items-center gap-3 border-2 px-3 py-3 mb-3 text-right ${
                edit.isMystery ? "border-[var(--ink)] bg-[var(--canvas)]" : "border-[var(--line)] bg-white"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>🎁</span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold">שקית הפתעה</span>
                <span className="block text-[11.5px] text-[var(--muted)] leading-snug">
                  {edit.isMystery
                    ? "הקונים לא יודעים מה בפנים. בתיאור כותבים מה יכול להיות, למשל: 3 סקווישים מפתיעים"
                    : "הקונים לא יודעים מה בפנים, וזה כל הכיף"}
                </span>
              </span>
              <span className={`text-[11px] font-bold px-2 py-1 ${edit.isMystery ? "bg-[var(--ink)] text-white" : "border border-[var(--line)] text-[var(--muted)]"}`}>
                {edit.isMystery ? "כן" : "לא"}
              </span>
            </button>

            {/* 🔥 דרופ — נפתח להזמנה בזמן קבוע, עם ספירה לאחור בדוכן */}
            <div id="editor-drop" className="border border-[var(--line)] px-3 py-3 mb-3 scroll-mt-24">
              <div className="text-[13px] font-semibold mb-2">🔥 מתי אפשר להזמין?</div>
              <Choice
                value={!edit.dropOn}
                onChange={(v) =>
                  setEdit((s) => s && { ...s, dropOn: !v, dropInput: !v && !s.dropInput ? defaultDropInput() : s.dropInput })
                }
                on="✅ כבר עכשיו"
                off="🔥 דרופ בשעה קבועה"
                label="מתי אפשר להזמין"
                testid="drop-choice"
              />
              {edit.dropOn && (
                <div className="mt-2.5">
                  <label htmlFor="drop-at" className="block text-[12px] text-[var(--muted)] mb-1">מתי נפתח להזמנה? (שעון ישראל)</label>
                  <input
                    id="drop-at"
                    type="datetime-local"
                    value={edit.dropInput}
                    min={toLocalInput(new Date().toISOString())}
                    onChange={(e) => setEdit((s) => s && { ...s, dropInput: e.target.value })}
                    data-testid="drop-at"
                    className="w-full border border-[var(--line)] px-3 py-2.5 text-[14px] bg-white"
                  />
                  {dropProblem(edit.dropInput) ? (
                    <p className="text-[12px] text-[var(--danger)] mt-1.5" data-testid="drop-problem">{dropProblem(edit.dropInput)}</p>
                  ) : (
                    <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed" data-testid="drop-help">
                      עד אז הקונים רואים את המוצר עם ספירה לאחור, ולא יכולים להזמין. נפתח{" "}
                      {dropWhen(israelInputToIso(edit.dropInput)!)}.
                    </p>
                  )}
                </div>
              )}
              {!edit.dropOn && (
                <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed">
                  דרופ = המוצר מופיע עם ספירה לאחור, ונפתח להזמנה בשעה שבוחרים. מושלם לטיקטוק.
                </p>
              )}
            </div>

            {/* רואים אותו? — עם הסבר מה זה "מוסתר", כדי שיהיה ברור שזה לא מחיקה */}
            <div className="border border-[var(--line)] px-3 py-3 mb-3">
              <div className="text-[13px] font-semibold mb-2">הקונים רואים אותו בדוכן?</div>
              <Choice
                value={edit.isVisible}
                onChange={(v) => setEdit((s) => s && { ...s, isVisible: v })}
                on="👀 כן, מוצג"
                off="🙈 מוסתר"
                label="מוצג בדוכן"
                testid="visible-choice"
              />
              <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed" data-testid="visible-help">
                {edit.isVisible
                  ? "הקונים רואים את המוצר ויכולים להזמין אותו."
                  : "המוצר נשאר שמור אצלך, אבל הקונים לא רואים אותו. אפשר להחזיר אותו מתי שרוצים."}
              </p>
            </div>

            {/* כמה יש לי — הכמות קודם (זו השאלה שבאמת שואלים), ומתחתיה
                הבחירה אם בכלל לספור. "בלי הגבלה" מחליף את הכמות. */}
            <div className="border border-[var(--line)] px-3 py-3 mb-3">
              {/* שורה אחת: השאלה מימין, ובצד שמאל מונה קטן — לא מספר ענק באמצע */}
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="text-[13px] font-semibold">כמה יש לי כאלה?</div>
                {edit.trackStock ? (
                  <div className="flex items-center border border-[var(--line)]">
                    <button onClick={() => setEdit((s) => s && { ...s, stock: Math.max(0, s.stock - 1) })}
                      aria-label="הורדה מהמלאי"
                      className="w-9 h-9 text-[15px] text-[var(--ink)]">−</button>
                    <span className="min-w-9 text-center text-[14px] font-bold tabular-nums" data-testid="editor-stock">{edit.stock}</span>
                    <button onClick={() => setEdit((s) => s && { ...s, stock: s.stock + 1 })}
                      aria-label="הוספה למלאי"
                      className="w-9 h-9 text-[15px] text-[var(--ink)]">+</button>
                  </div>
                ) : (
                  <span className="text-[13px] text-[var(--muted)]" data-testid="editor-stock-unlimited">בלי הגבלה</span>
                )}
              </div>
              <Choice
                value={edit.trackStock}
                onChange={(v) => setEdit((s) => s && { ...s, trackStock: v })}
                on="🔢 כמות מוגבלת"
                off="♾️ בלי הגבלה"
                label="כמות מוגבלת או בלי הגבלה"
                testid="track-stock-choice"
              />
              <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed">
                {edit.trackStock
                  ? "הקונים רואים כמה נשארו, ו\"אזל\" כשנגמר. אי אפשר להזמין יותר ממה שיש."
                  : "לא סופרים, והמוצר תמיד זמין להזמנה."}
              </p>
            </div>

          </div>

          {/* קבועה בתחתית ולא בתוך הגלילה — כדי שהצעד הבא לא ייעלם מתחת למסך.
              "לא מובן מה צריך לעשות" התברר להיות שהיא לא הגיעה לכפתור בכלל,
              לא שהיא לא ידעה שצריך ללחוץ עליו. */}
          <div className="px-4 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-[var(--line)] shrink-0 bg-white">
            <button onClick={save} disabled={busy}
              className="w-full bg-[var(--ink)] text-white py-3 text-sm font-bold disabled:opacity-50">
              {busy ? "שומרים…" : "שמירה"}
            </button>
            {edit.id && (
              <>
                <button onClick={duplicateProduct}
                  className="w-full mt-2 border border-[var(--line)] py-2.5 text-sm">
                  שכפול המוצר
                </button>
                <button onClick={softDelete}
                  className="w-full mt-2 border border-[var(--danger-line)] text-[var(--danger)] py-2.5 text-sm">
                  מחיקת המוצר
                </button>
              </>
            )}
          </div>
          </div>
        </>
      )}

      {/* deleted products sheet */}
      {deletedOpen && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setDeletedOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[70%] overflow-y-auto">
            <div className="w-9 h-1 bg-black/15 mx-auto mb-3.5" />
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold">מוצרים שנמחקו</h2>
              <CloseX onClick={() => setDeletedOpen(false)} />
            </div>
            {deleted.length === 0 && (
              <p className="text-sm text-[var(--muted)] py-4 text-center">אין מוצרים לשחזור.</p>
            )}
            {deleted.map((p) => {
              const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
              return (
                <div key={p.id} className="flex gap-3 items-center py-2 border-b border-[var(--line)] last:border-0">
                  <div className="w-10 h-10 bg-[var(--canvas)] flex items-center justify-center text-lg overflow-hidden">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[12px] text-[var(--muted)]">
                      נמחק ב-{new Date(p.deleted_at!).toLocaleDateString("he-IL")} · ₪{formatPrice(p.price)}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(p)}
                    className="bg-[var(--ink)] text-white px-3.5 py-2 text-xs font-medium"
                  >
                    שחזור
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* recorder overlay */}
      {recOpen && (
        <div className="fixed inset-0 bg-[var(--ink)] z-[70] flex flex-col items-center justify-between py-8">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-90" />
          <button onClick={closeRecorder} aria-label="סגירת המצלמה" className="absolute top-5 left-4 bg-black/45 text-white w-8 h-8 z-10">✕</button>
          <div className="relative z-10 text-white text-xs bg-black/45 px-3.5 py-1.5 ">
            לחיצה ארוכה כדי להקליט · עד {RECORD_SECONDS} שניות · בלי קול
          </div>
          <div
            className="relative z-10 w-21 h-21 flex items-center justify-center select-none"
            style={{ width: 84, height: 84, touchAction: "none" }}
            onPointerDown={(e) => { e.preventDefault(); recStart(); }}
            onPointerUp={recStop}
            onPointerLeave={recStop}
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="39" fill="none" strokeWidth="5" stroke="rgba(255,255,255,.28)" />
              <circle cx="42" cy="42" r="39" fill="none" strokeWidth="5" stroke="var(--danger)"
                strokeDasharray="245" strokeDashoffset={245 * (1 - recProgress)} />
            </svg>
            <div className={`bg-[var(--danger)] transition-all ${recLive ? "w-9 h-9 " : "w-15 h-15 "}`}
              style={recLive ? { width: 34, height: 34 } : { width: 60, height: 60 }} />
          </div>
        </div>
      )}

      {/* המוצר הראשון עלה — הדוכן באוויר.
          המסך הזה עושה דבר אחד: מוציא אותה מכאן אל השיתוף. "אחר כך" קיים,
          אבל הוא קטן ואפור, כי הצעד הבא האמיתי הוא לשלוח את הלינק. */}
      {celebrate && store && (
        <div data-testid="first-product-celebration" className="fixed inset-0 z-[95] bg-white flex flex-col items-center justify-center text-center px-8 gap-4">
          <Icon name="party" size={68} tone="var(--lavender)" className="text-[var(--wood)]" />
          <h2 className="text-[22px] font-bold leading-tight">המוצר הראשון בדוכן!</h2>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xs">
            יש בו מוצר, יש לו לינק, והוא נראה בדיוק כמו שבנית אותו.
            <br />
            עכשיו הדבר הכי כיף: לשלוח אותו לחברים.
          </p>
          <a
            href="/dashboard/settings#share"
            className="w-full max-w-xs bg-[var(--ink)] text-white py-4 text-[15px] font-bold"
          >
            שליחה לחברים
          </a>
          {/* להוסיף עוד מוצר זה לא "אחר כך" — זה מה שרוב הבנות יעשו עכשיו,
              ולכן זה כפתור אמיתי ולא שורה אפורה בתחתית */}
          <button
            onClick={() => {
              setCelebrate(false);
              openEditor(null);
            }}
            className="w-full max-w-xs border-[1.5px] border-[var(--line)] py-3.5 text-[14px] font-bold"
          >
            להוסיף עוד מוצר
          </button>
          <a href={`/s/${store.slug}`} className="text-[13px] text-[var(--ink)] underline">
            לראות איך הדוכן נראה
          </a>
          <button onClick={() => setCelebrate(false)} className="text-[12.5px] text-[var(--faint)]">
            סגירה
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
