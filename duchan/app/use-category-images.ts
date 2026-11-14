"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { categoryProductImages, type CategoryImageSource } from "@/lib/category-images";

/**
 * התמונות האוטומטיות של הקטגוריות (lib/category-images.ts), למסכים של בעלי
 * הדוכן: מעצב הקטגוריות והתצוגה בהגדרות. כך מה שרואים שם הוא מה שהקונים
 * יקבלו. רק מוצרים שהקונים רואים — מוצר מוסתר לא נותן תמונה לקטגוריה.
 */
export function useCategoryImages(storeId: string | null | undefined): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    supabaseBrowser()
      .from("products")
      .select("categories, category, image_key, poster_key, is_visible")
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!alive) return;
        const shown = ((data as (CategoryImageSource & { is_visible: boolean | null })[] | null) ?? []).filter((p) => p.is_visible !== false);
        setImages(categoryProductImages(shown));
      });
    return () => {
      alive = false;
    };
  }, [storeId]);
  return images;
}
