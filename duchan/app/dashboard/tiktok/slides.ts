/**
 * תמונות לטיקטוק ולאינסטגרם: תמונת פתיחה של הדוכן, ותמונה לכל מוצר.
 *
 * מרינה, 11.2026: "צריך למצוא איזשהי דרך לממשק בין דוכן לטיקטוק". בטיקטוק
 * מעלים כמה תמונות כמצגת (מצב תמונות), בלי לצלם פנים ובלי לערוך סרטון.
 * על כל תמונה כתוב הלינק הקצר, כי בטיקטוק לינק לחיץ בביו מותר רק מגיל 18.
 * תמונת מוצר מקבלת את הלינק של המוצר עצמו (duchan.app/abcde/12).
 *
 * 1080×1920, אותו גודל כמו סטטוס בוואטסאפ וסטורי באינסטגרם. נבנה בדפדפן,
 * והתמונות נטענות דרך /api/media (אותו דומיין), אחרת הקנבס לא מייצא.
 */

import { formatPrice } from "@/lib/money";

export const W = 1080;
export const H = 1920;
const BG = "#F6F1E8";
const INK = "#2B2622";
const MUTED = "#7A6F66";
const LINE = "#E2D8CB";
const WOOD = "#A0703F";

export type SlideProduct = { id: string; no: number; name: string; price: number; image_key: string };

export function mediaSrc(key: string): string {
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

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  return [c, ctx];
}

/** פס הלינק בתחתית: "להזמנה:" ומתחת הלינק, גדול */
function linkBar(ctx: CanvasRenderingContext2D, label: string, link: string, y: number) {
  ctx.fillStyle = INK;
  ctx.font = "500 42px Heebo, sans-serif";
  ctx.fillText(label, W / 2, y);
  ctx.fillStyle = WOOD;
  ctx.fillRect(90, y + 32, W - 180, 128);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${link.length > 22 ? 54 : 62}px Heebo, sans-serif`;
  ctx.direction = "ltr";
  ctx.fillText(link, W / 2, y + 118);
  ctx.direction = "rtl";
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob((b) => r(b), "image/png"));

export async function fontsReady() {
  try {
    await Promise.all([document.fonts.load("800 80px Heebo"), document.fonts.load("500 40px Heebo")]);
  } catch {}
}

/** תמונת הפתיחה: שם הדוכן, עד שלושה מוצרים קטנים, והלינק לדוכן */
export async function coverSlide(name: string, tagline: string | null, products: SlideProduct[], storeLink: string): Promise<Blob | null> {
  const [c, ctx] = canvas();
  ctx.fillStyle = MUTED;
  ctx.font = "500 44px Heebo, sans-serif";
  ctx.fillText("הדוכן שלי", W / 2, 300);
  ctx.fillStyle = INK;
  ctx.font = "800 104px Heebo, sans-serif";
  ctx.fillText(fit(ctx, name, W - 120), W / 2, 430);
  if (tagline) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 40px Heebo, sans-serif";
    ctx.fillText(fit(ctx, tagline, W - 160), W / 2, 505);
  }
  const few = products.slice(0, 3);
  const imgs = await Promise.all(few.map((p) => loadImage(mediaSrc(p.image_key))));
  const size = few.length >= 3 ? 290 : 380;
  const gap = 30;
  const total = few.length * size + (few.length - 1) * gap;
  few.forEach((_, i) => {
    // מימין לשמאל
    const x = W - (W - total) / 2 - (i + 1) * size - i * gap;
    const y = 640;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, size, size);
    const img = imgs[i];
    if (img) {
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, size, size);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, size, size);
  });
  ctx.fillStyle = INK;
  ctx.font = "500 46px Heebo, sans-serif";
  ctx.fillText("החליקו לראות מה יש", W / 2, 1180);
  linkBar(ctx, "להזמנות:", storeLink, 1520);
  return toBlob(c);
}

/** תמונה למוצר אחד: התמונה גדולה, שם, מחיר, והלינק של המוצר */
export async function productSlide(p: SlideProduct, link: string): Promise<Blob | null> {
  const [c, ctx] = canvas();
  const img = await loadImage(mediaSrc(p.image_key));
  const size = 900;
  const x = (W - size) / 2;
  const y = 170;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x, y, size, size);
  if (img) {
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, size, size);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, size, size);
  ctx.fillStyle = INK;
  ctx.font = "800 76px Heebo, sans-serif";
  ctx.fillText(fit(ctx, p.name, W - 140), W / 2, 1210);
  ctx.fillStyle = WOOD;
  ctx.font = "800 96px Heebo, sans-serif";
  ctx.direction = "ltr";
  ctx.fillText(`₪${formatPrice(p.price)}`, W / 2, 1340);
  ctx.direction = "rtl";
  linkBar(ctx, "להזמנה:", link, 1520);
  return toBlob(c);
}
