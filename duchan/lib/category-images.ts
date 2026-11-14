import { mediaUrl } from "@/lib/media";

/**
 * תמונה אוטומטית לקטגוריה: המוצר הראשון שבה (לפי סדר הדוכן) שיש לו תמונה.
 *
 * קטגוריה בלי תמונה ובלי אמוג'י הייתה מקבלת רק את האות הראשונה של השם.
 * בשורה קטנה זה בסדר; בריבועים גדולים בראש הדוכן זה נראה ריק, ובעלת דוכן
 * עם 16 קטגוריות לא תעלה 16 תמונות לפני שזה ייראה טוב. תמונה או אמוג'י
 * שהיא בחרה תמיד גוברים — זה רק מה שמופיע כשלא בחרה כלום.
 */
export interface CategoryImageSource {
  categories?: string[] | null;
  category?: string | null;
  poster_key?: string | null;
  image_key?: string | null;
}

export function categoryProductImages(products: CategoryImageSource[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of products) {
    const url = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
    if (!url) continue;
    const cats = p.categories?.length ? p.categories : p.category ? [p.category] : [];
    for (const c of cats) if (!(c in out)) out[c] = url;
  }
  return out;
}
