// עיבוד מדיה בצד לקוח. כל תמונה חייבת לעבור בקנבס:
// גודל (6MB→~120KB), עקביות (ריבוע), ומחיקת EXIF — תמונה מהטלפון מכילה GPS של הבית.

export const MAX_VIDEO_SECONDS = 10; // גלריה: דחייה מפורשת מעל 10 שניות
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const RECORD_SECONDS = 5; // הקלטה: עצירה קשיחה ב-5 שניות

/**
 * המרת קנבס ל-Blob עם נפילה ל-JPEG: ספארי ישן לא מקודד WebP ומחזיר PNG
 * בשקט — והשרת דוחה PNG. JPEG נתמך בכל דפדפן.
 */
async function canvasToImageBlob(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  const toBlob = (type: string, quality: number) =>
    "convertToBlob" in c
      ? c.convertToBlob({ type, quality })
      : new Promise<Blob>((res, rej) =>
          (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, quality)
        );
  const webp = await toBlob("image/webp", 0.82);
  if (webp.type === "image/webp") return webp;
  return toBlob("image/jpeg", 0.85);
}

function makeCanvas(size: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  // iOS ישן — אין OffscreenCanvas
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** שגיאה שאפשר להראות לילדה כמו שהיא, בלי לתרגם קודי דפדפן. */
export class MediaError extends Error {}

/**
 * פענוח התמונה, עם נפילה מ-createImageBitmap ל-<img>.
 *
 * זו לא הגנה תיאורטית: אייפון מצלם ב-HEIC כברירת מחדל, ו-createImageBitmap
 * לא מפענח HEIC ברוב הדפדפנים — הוא פשוט זורק. <img> כן מצליח, כי הוא עובר
 * דרך מפענח התמונות של מערכת ההפעלה. בלי הנפילה הזו, ילדה עם אייפון בוחרת
 * תמונה מהגלריה ולא קורה כלום.
 */
async function decodeImage(file: File | Blob) {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp as CanvasImageSource, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new MediaError("לא הצלחנו לקרוא את התמונה. נסי לצלם מחדש."));
        img.src = url;
      });
      if (!img.naturalWidth) {
        throw new MediaError("לא הצלחנו לקרוא את התמונה. נסי לצלם מחדש.");
      }
      // ה-URL משוחרר רק אחרי הציור — שחרור מוקדם עלול לרוקן את התמונה
      return { src: img as CanvasImageSource, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e instanceof MediaError ? e : new MediaError("לא הצלחנו לקרוא את התמונה. נסי לצלם מחדש.");
    }
  }
}

/**
 * ריבוע קבוע + דחיסה + מחיקת EXIF. אל תדלג על השלב הזה.
 *
 * שני מצבים: "cover" חותך למרכז (טוב לתמונת פרופיל וקאבר — הן ממילא
 * מוצגות דרך object-cover, אז חיתוך קשיח בעיבוד לא מוסיף שום דבר).
 * "contain" לא חותך כלום — ממזערים את התמונה כולה לתוך הריבוע ומשלימים
 * את השוליים ברקע אחיד. זה מה שמוצרים צריכים: קונה לא אמורה לגלות
 * שחצי מהמוצר נחתך כי הוא לא היה מרובע כשצילמו אותו.
 */
export async function squareImage(
  file: File | Blob,
  size = 900,
  fit: "cover" | "contain" = "cover"
): Promise<Blob> {
  const { src, w, h, done } = await decodeImage(file);
  try {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) throw new MediaError("הדפדפן לא הצליח לעבד את התמונה. לרענן את הדף ולנסות שוב.");
    if (fit === "contain") {
      ctx.fillStyle = "#F6F0E8"; // --cream — אותו רקע שהתמונה יושבת עליו בכל מקום באתר
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min(size / w, size / h);
      const dw = w * scale;
      const dh = h * scale;
      ctx.drawImage(src, 0, 0, w, h, (size - dw) / 2, (size - dh) / 2, dw, dh);
    } else {
      const side = Math.min(w, h);
      ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    }
    return await canvasToImageBlob(c);
  } finally {
    done();
  }
}

/** פוסטר מפריים 0.1 שניות. בלעדיו הרשת מציגה ריבועים שחורים עד שהווידאו נטען. */
export function posterFrom(videoUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.src = videoUrl;
    v.muted = true;
    v.playsInline = true;
    const timeout = setTimeout(() => resolve(null), 4000);
    v.onloadeddata = () => { v.currentTime = 0.1; };
    v.onseeked = () => {
      clearTimeout(timeout);
      const side = Math.min(v.videoWidth, v.videoHeight) || 300;
      const c = makeCanvas(600);
      try {
        (c.getContext("2d") as CanvasRenderingContext2D).drawImage(
          v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 600, 600
        );
        canvasToImageBlob(c).then(resolve, () => resolve(null));
      } catch {
        resolve(null);
      }
    };
    v.onerror = () => { clearTimeout(timeout); resolve(null); };
  });
}

/** בדיקת וידאו מהגלריה: עד 10 שניות ועד 25MB, אחרת דחייה מפורשת. */
export function validateGalleryVideo(file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.resolve({ ok: false, reason: "הסרטון כבד מדי — עד 25MB" });
  }
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.src = url;
    const done = (r: { ok: true } | { ok: false; reason: string }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    v.onloadedmetadata = () => {
      if (v.duration > MAX_VIDEO_SECONDS) done({ ok: false, reason: "הסרטון ארוך מדי — עד 10 שניות" });
      else done({ ok: true });
    };
    v.onerror = () => done({ ok: false, reason: "לא הצלחנו לקרוא את הסרטון" });
    setTimeout(() => done({ ok: true }), 3000);
  });
}

export interface RecorderHandle {
  stop: () => void;
  cancel: () => void;
  stream: MediaStream;
  result: Promise<Blob | null>;
}

/**
 * הקלטת וידאו: 720×720, בלי אודיו (החלטת פרטיות — 5 שניות בחדר של ילדה
 * קולטות אחים והורים), עצירה קשיחה ב-5 שניות. מקליטים, לא דוחסים.
 */
export async function startRecording(stream: MediaStream): Promise<RecorderHandle> {
  const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
  const chunks: BlobPart[] = [];
  let cancelled = false;

  const result = new Promise<Blob | null>((resolve) => {
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => resolve(cancelled ? null : new Blob(chunks, { type: mimeType }));
    rec.onerror = () => resolve(null);
  });

  rec.start();
  const hardStop = setTimeout(() => rec.state !== "inactive" && rec.stop(), RECORD_SECONDS * 1000);

  return {
    stream,
    result,
    stop: () => {
      clearTimeout(hardStop);
      if (rec.state !== "inactive") rec.stop();
    },
    cancel: () => {
      cancelled = true;
      clearTimeout(hardStop);
      if (rec.state !== "inactive") rec.stop();
    },
  };
}

export async function openCamera(): Promise<MediaStream> {
  // בדפדפן שבתוך וואטסאפ או אינסטגרם mediaDevices פשוט לא קיים, וזה בדיוק
  // המסלול שבו ילדה מגיעה — היא לוחצת על לינק בשיחה. בלי הבדיקה הזו נזרקת
  // שגיאת TypeError סתמית במקום הסבר מה לעשות.
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError("הדפדפן הזה לא נותן גישה למצלמה. פתחי את הלינק ב-Safari או ב-Chrome.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 720, height: 720 },
      audio: false, // מכוון. פרטיות, לא אופטימיזציה.
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    throw new MediaError(
      name === "NotAllowedError"
        ? "המצלמה חסומה. באייפון: הגדרות → Safari → מצלמה → אפשר."
        : name === "NotFoundError"
          ? "לא מצאנו מצלמה במכשיר הזה."
          : "לא הצלחנו לפתוח את המצלמה. לנסות שוב."
    );
  }
}

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return `${base.replace(/\/$/, "")}/${key}`;
}
