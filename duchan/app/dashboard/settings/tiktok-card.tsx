"use client";

import { useState } from "react";
import type { Store } from "@/lib/types";

/**
 * 🎵 לשתף בטיקטוק — "רוב הקהל בטיקטוק".
 *
 * בטיקטוק לינק בכיתוב של סרטון לא לחיץ. מה שעובד:
 *   1. לינק בביו (שדה "אתר" בעריכת הפרופיל) — העתקה + איפה מדביקים.
 *   2. תמונה מוכנה לסרטון/פוסט תמונות (1080×1920): שם הדוכן, האייקון והלינק
 *      בגדול, ו"הלינק בביו". נוצרת בקנבס בטלפון — שום דבר לא עולה לשרת,
 *      ואין עליה שום פרט חוץ ממה שכבר פומבי בדוכן (שם ולינק).
 *   3. כיתוב מוכן עם האשטגים.
 *
 * בטלפון "לשתף את התמונה" פותח את חלון השיתוף של המכשיר, ושם טיקטוק.
 * בלי זה (מחשב) — התמונה פשוט נשמרת.
 */
export default function TikTokCard({ store, onToast }: { store: Store; onToast: (m: string) => void }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);

  const host = typeof window !== "undefined" ? window.location.host : "duchan.app";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/s/${store.slug}`;
  const shortLink = `${host}/s/${store.slug}`;
  const caption = `הדוכן שלי פתוח! 🛍️ ${store.display_name}\nהלינק בביו ✨\n#דוכן #הדוכןשלי #עבודתיד`;

  const copy = (t: string, msg: string) =>
    navigator.clipboard?.writeText(t).then(() => onToast(msg), () => onToast("לא הצלחנו להעתיק"));

  async function makeImage() {
    setBusy(true);
    try {
      const blob = await drawStoryImage({ name: store.display_name, emoji: store.emoji || "🛍️", shortLink });
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(blob), blob });
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    if (!img) return;
    const file = new File([img.blob], `duchan-${store.slug}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption });
        return;
      } catch {
        return; // סגרו את חלון השיתוף — זה בסדר
      }
    }
    const a = document.createElement("a");
    a.href = img.url;
    a.download = file.name;
    a.click();
    onToast("התמונה נשמרה 📸");
  }

  return (
    <div className="bg-white border border-[var(--line)] p-3.5" data-testid="tiktok-card">
      <div className="text-[13.5px] font-bold">🎵 לשתף בטיקטוק</div>
      <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
        בטיקטוק לינק בסרטון לא לחיץ. לכן שמים אותו בביו, ובסרטון כותבים &quot;הלינק בביו&quot;.
      </p>

      {/* 1. לינק בביו */}
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="text-[12.5px] font-bold">1. הלינק בביו</div>
        <ol className="text-[12px] text-[var(--muted)] leading-relaxed mt-1 list-decimal ps-4" data-testid="tiktok-bio-steps">
          <li>מעתיקים את הלינק</li>
          <li>בטיקטוק: פרופיל ← עריכת פרופיל ← &quot;אתר&quot;</li>
          <li>מדביקים ושומרים</li>
        </ol>
        <p className="text-[11.5px] text-[var(--faint)] leading-relaxed mt-1">
          אין שדה &quot;אתר&quot;? אפשר לשלוח את הלינק בהודעה פרטית, או לכתוב אותו על הסרטון.
        </p>
        <button
          onClick={() => copy(link, "הלינק הועתק — עכשיו לביו 🎵")}
          data-testid="tiktok-copy-link"
          className="fx-press mt-2 w-full bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold"
        >
          📋 העתקת הלינק לביו
        </button>
      </div>

      {/* 2. תמונה לסרטון */}
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="text-[12.5px] font-bold">2. תמונה מוכנה לסרטון</div>
        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
          שם הדוכן והלינק בגדול, בגודל של טיקטוק. מעלים כפוסט תמונות או שמים בסוף סרטון.
        </p>
        {img ? (
          <div className="mt-2 flex gap-3 items-end">
            <img
              src={img.url}
              alt={`תמונה לטיקטוק: ${store.display_name} והלינק לדוכן`}
              data-testid="tiktok-image"
              className="w-[96px] h-auto border border-[var(--line)]"
            />
            <div className="flex-1 flex flex-col gap-2">
              <button
                onClick={shareImage}
                data-testid="tiktok-share-image"
                className="fx-press bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold"
              >
                📲 לשתף / לשמור את התמונה
              </button>
              <button onClick={makeImage} className="border border-[var(--line)] py-2 text-[12px] text-[var(--muted)]">
                ליצור מחדש
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={makeImage}
            disabled={busy}
            data-testid="tiktok-make-image"
            className="fx-press mt-2 w-full border border-[var(--ink)] py-2.5 text-[12.5px] font-bold disabled:opacity-60"
          >
            {busy ? "יוצרים…" : "🖼️ ליצור תמונה לטיקטוק"}
          </button>
        )}
      </div>

      {/* 3. כיתוב מוכן */}
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="text-[12.5px] font-bold">3. כיתוב מוכן לסרטון</div>
        <div className="mt-1.5 bg-[var(--canvas)] border border-[var(--line)] px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-line" data-testid="tiktok-caption">
          {caption}
        </div>
        <button
          onClick={() => copy(caption, "הכיתוב הועתק ✨")}
          data-testid="tiktok-copy-caption"
          className="fx-press mt-2 w-full border border-[var(--line)] py-2.5 text-[12.5px] font-semibold"
        >
          העתקת הכיתוב
        </button>
      </div>

      <p className="text-[11px] text-[var(--faint)] leading-relaxed mt-3">
        טיקטוק מותר מגיל 13. מי שצעיר יותר יכול לשתף דרך חשבון של מבוגר במשפחה.
      </p>
    </div>
  );
}

/** התמונה לטיקטוק: 1080×1920, הסוכך של הדוכן למעלה, האייקון, השם והלינק. */
async function drawStoryImage({ name, emoji, shortLink }: { name: string; emoji: string; shortLink: string }): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const v = (k: string, fb: string) => css.getPropertyValue(k).trim() || fb;
  const wood = v("--wood", "#9b6d3e");
  const lavender = v("--lavender", "#b89ac8");
  const cream = v("--cream", "#f6f0e8");
  const ink = v("--ink", "#262626");
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  try {
    await document.fonts?.ready;
  } catch {}
  (g as CanvasRenderingContext2D & { direction?: string }).direction = "rtl";

  // רקע
  g.fillStyle = cream;
  g.fillRect(0, 0, W, H);

  // הסוכך
  g.fillStyle = wood;
  g.fillRect(0, 0, W, 70);
  const n = 9;
  const sw = W / n;
  g.lineWidth = 5;
  g.strokeStyle = wood;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.moveTo(i * sw, 70);
    g.lineTo((i + 1) * sw, 70);
    g.lineTo((i + 1) * sw, 150);
    g.ellipse(i * sw + sw / 2, 150, sw / 2, 52, 0, 0, Math.PI, false);
    g.closePath();
    g.fillStyle = i % 2 ? cream : lavender;
    g.fill();
    g.stroke();
  }

  // הכרטיס
  const cx = W / 2;
  g.fillStyle = "#ffffff";
  g.fillRect(110, 430, W - 220, 1000);
  g.lineWidth = 8;
  g.strokeStyle = wood;
  g.strokeRect(110, 430, W - 220, 1000);

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `220px ${font}`;
  g.fillText(emoji, cx, 650);

  // השם — מוקטן עד שנכנס
  g.fillStyle = ink;
  let size = 92;
  do {
    g.font = `800 ${size}px ${font}`;
    size -= 4;
  } while (g.measureText(name).width > W - 320 && size > 40);
  g.fillText(name, cx, 880);

  g.font = `500 54px ${font}`;
  g.fillStyle = v("--muted", "#5b564e");
  g.fillText("הדוכן שלי פתוח! 🛍️", cx, 985);

  // הלינק
  g.fillStyle = ink;
  g.fillRect(170, 1110, W - 340, 170);
  g.fillStyle = "#ffffff";
  (g as CanvasRenderingContext2D & { direction?: string }).direction = "ltr";
  size = 60;
  do {
    g.font = `700 ${size}px ${font}`;
    size -= 2;
  } while (g.measureText(shortLink).width > W - 400 && size > 30);
  g.fillText(shortLink, cx, 1195);
  (g as CanvasRenderingContext2D & { direction?: string }).direction = "rtl";

  // למטה
  g.fillStyle = ink;
  g.font = `800 76px ${font}`;
  g.fillText("הלינק בביו ✨", cx, 1600);
  g.fillStyle = wood;
  g.font = `500 44px ${font}`;
  g.fillText("נכנסים, בוחרים ומזמינים", cx, 1700);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}
