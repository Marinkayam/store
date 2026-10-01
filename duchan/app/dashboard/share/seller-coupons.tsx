"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import CouponManager from "@/app/coupon-manager";
import type { Coupon } from "@/lib/coupons";
import type { Store } from "@/lib/types";

/**
 * הקופונים של המוכרת. נשמרים ישירות מהדפדפן — RLS (0054) מגביל אותה לחנות
 * שלה ולעמודות שמותר לה לגעת בהן (לא used_count).
 */
export default function SellerCoupons({ store }: { store: Store }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("coupons")
      .select("*")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[coupons] load failed:", error.message);
      setUnavailable(true);
      setCoupons([]);
      return;
    }
    setCoupons((data ?? []) as Coupon[]);
  }, [store.id]);

  useEffect(() => {
    load();
  }, [load]);

  /** הדוכן מציג "יש לך קוד קופון?" רק כשיש קופון חי — מרעננים אותו מיד */
  const refreshStore = () =>
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug }),
    }).catch(() => {});

  const after = async (error: { message: string; code?: string } | null, dupMsg?: string) => {
    if (error) {
      console.error("[coupons] write failed:", error.message);
      if (error.code === "23505") return dupMsg ?? "כבר יש קופון עם הקוד הזה";
      return "השמירה לא הצליחה. אפשר לנסות שוב";
    }
    await load();
    refreshStore();
    return null;
  };

  if (coupons === null) return <p className="text-[12.5px] text-[var(--muted)]">רגע…</p>;
  if (unavailable)
    return <p className="text-[12.5px] text-[var(--muted)]">הקופונים עוד לא זמינים. נסי שוב מאוחר יותר.</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <CouponManager
      coupons={coupons}
      shareUrl={`${origin}/s/${store.slug}`}
      onCreate={async (row) => {
        const { error } = await supabaseBrowser().from("coupons").insert({ ...row, store_id: store.id });
        return after(error, `כבר יש קופון עם הקוד ${row.code}. אפשר לבחור קוד אחר`);
      }}
      onToggle={async (c, active) => {
        const { error } = await supabaseBrowser().from("coupons").update({ active }).eq("id", c.id);
        return after(error);
      }}
      onDelete={async (c) => {
        const { error } = await supabaseBrowser()
          .from("coupons")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", c.id);
        return after(error);
      }}
    />
  );
}
