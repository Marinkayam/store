"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";
import { formatPrice } from "@/lib/money";
import { storePath } from "@/lib/short-link";

/**
 * "תמונה לסטטוס": תמונה אחת של הדוכן, בגודל של סטטוס בוואטסאפ.
 *
 * מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיף 5). בנתונים: 13 דוכנים
 * פתוחים שעוד לא קיבלו הזמנה. סטטוס מגיע לכל אנשי הקשר בבת אחת, ותמונה
 * עם מוצרים אמיתיים עובדת יותר מלינק לבד.
 *
 * נבנית בדפדפן, על קנבס: שם הדוכן, עד ארבעה מוצרים עם מחיר, והלינק הקצר.
 * התמונות נטענות דרך /api/media (אותו דומיין), אחרת הקנבס לא מייצא.
 * בטלפון שתומך בשיתוף קבצים, נפתח מסך השיתוף; אחרת מורידים את התמונה.
 */

const W = 1080;
const H = 1920;
const BG = "#F6F1E8";
const INK = "#2B2622";
const MUTED = "#7A6F66";
const LINE = "#E2D8CB";
const WOOD = "#A0703F";

type P = { name: string; price: number; image_key: string | null; poster_key: string | null };

function srcFor(key: string): string {
  return key.startsWith("/") ? key : `/api/media?k=${encodeURIComponent(key)}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** חותך טקסט לרוחב, עם שלוש נקודות */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export async function buildStatusImage(store: Store, origin: string): Promise<Blob | null> {
  const { data } = await supabaseBrowser()
    .from("products")
    .select("name, price, image_key, poster_key")
    .eq("store_id", store.id)
    .is("deleted_at", null)
    .not("image_key", "is", null)
    .neq("image_key", "")
    .or("is_visible.is.null,is_visible.eq.true")
    .order("sort_order")
    .limit(4);
  const products = ((data as P[]) ?? []).filter((p) => p.image_key || p.poster_key);

  try {
    await Promise.all([document.fonts.load("800 80px Heebo"), document.fonts.load("500 40px Heebo")]);
  } catch {}

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // כותרת
  ctx.fillStyle = MUTED;
  ctx.font = "500 40px Heebo, sans-serif";
  ctx.fillText("הדוכן שלי פתוח!", W / 2, 230);
  ctx.fillStyle = INK;
  ctx.font = "800 88px Heebo, sans-serif";
  ctx.fillText(fit(ctx, store.display_name, W - 140), W / 2, 340);
  if (store.tagline) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 36px Heebo, sans-serif";
    ctx.fillText(fit(ctx, store.tagline, W - 160), W / 2, 405);
  }

  // מוצרים: אחד גדול, או רשת של 2×2
  const imgs = await Promise.all(products.map((p) => loadImage(srcFor((p.image_key ?? p.poster_key)!))));
  const n = products.length;
  // שתי שורות צריכות להשאיר מקום ללינק למטה
  const tile = n <= 1 ? 640 : n <= 2 ? 440 : 410;
  const gap = 40;
  const cols = n <= 1 ? 1 : 2;
  const rows = Math.ceil(Math.max(1, n) / cols);
  const gridW = cols * tile + (cols - 1) * gap;
  const top = 480;
  const cellH = tile + 110;
  products.forEach((p, i) => {
    // מימין לשמאל, כמו שקוראים
    const col = cols === 1 ? 0 : 1 - (i % 2);
    const row = Math.floor(i / cols);
    const x = (W - gridW) / 2 + col * (tile + gap);
    const y = top + row * (cellH + 20);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, tile, cellH);
    const img = imgs[i];
    if (img) {
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, tile, tile);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, tile, cellH);
    ctx.fillStyle = INK;
    ctx.textAlign = "right";
    ctx.font = "500 34px Heebo, sans-serif";
    ctx.fillText(fit(ctx, p.name, tile - 200), x + tile - 24, y + tile + 68);
    ctx.textAlign = "left";
    ctx.font = "800 44px Heebo, sans-serif";
    ctx.fillText(`₪${formatPrice(p.price)}`, x + 24, y + tile + 70);
    ctx.textAlign = "center";
  });

  // הלינק
  const linkY = top + rows * (cellH + 20) + 110;
  const by = Math.min(Math.max(linkY, 1500), H - 230);
  ctx.fillStyle = INK;
  ctx.font = "500 40px Heebo, sans-serif";
  ctx.fillText("להזמנות:", W / 2, by);
  ctx.fillStyle = WOOD;
  ctx.fillRect(110, by + 30, W - 220, 120);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 58px Heebo, sans-serif";
  ctx.direction = "ltr";
  ctx.fillText(`${origin.replace(/^https?:\/\//, "")}${storePath(store.slug)}`, W / 2, by + 110);
  ctx.direction = "rtl";

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

export default function StatusImage({ store }: { store: Store }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function make() {
    setBusy(true);
    setErr("");
    try {
      const blob = await buildStatusImage(store, window.location.origin);
      if (!blob) throw new Error("no blob");
      const file = new File([blob], "duchan-status.png", { type: "image/png" });
      // בטלפון: מסך השיתוף, ומשם וואטסאפ. אם אין, מציגים ומורידים.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      setUrl(URL.createObjectURL(blob));
    } catch {
      setErr("לא הצלחנו להכין את התמונה. אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="status-image">
      <button
        onClick={make}
        disabled={busy}
        className="w-full border border-[var(--line)] bg-white py-3 min-h-11 text-[13.5px] font-medium disabled:opacity-50"
        data-testid="status-image-make"
      >
        {busy ? "מכינים…" : "תמונה של הדוכן לסטטוס בוואטסאפ"}
      </button>
      {err && <p className="text-[12.5px] text-[var(--danger)] mt-1.5">{err}</p>}
      {url && (
        <div className="mt-3 flex flex-col items-center gap-2.5" data-testid="status-image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="התמונה לסטטוס" className="w-40 border border-[var(--line)]" />
          <a href={url} download="duchan-status.png" className="w-full text-center bg-[var(--ink)] text-white py-3 text-[13.5px] font-bold" data-testid="status-image-download">
            לשמור את התמונה
          </a>
          <p className="text-[12px] text-[var(--muted)] text-center leading-relaxed">שומרים, ומעלים לסטטוס בוואטסאפ.</p>
        </div>
      )}
    </div>
  );
}
