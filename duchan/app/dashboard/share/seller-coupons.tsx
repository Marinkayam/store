"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import CouponManager from "@/app/coupon-manager";
import { draftToRow, type Coupon } from "@/lib/coupons";
import { storePath } from "@/lib/short-link";
import type { Store } from "@/lib/types";

/**
 * הקופונים של המוכרת. נשמרים ישירות מהדפדפן — RLS (0054) מגביל אותה לחנות
 * שלה ולעמודות שמותר לה לגעת בהן (לא used_count).
 */
export default function SellerCoupons({ store }: { store: Store }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  /* הקופון המוכן מוצג אם בטעינה הראשונה לא היה קופון פעיל, ונשאר אחרי שיוצרים
     אותו, כדי שכפתור "לשלוח לחברים" לא ייעלם ברגע שהרשימה מתרעננת */
  const [preset, setPreset] = useState<boolean | null>(null);

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
    setPreset((p) => (p === null ? !((data ?? []) as Coupon[]).some((c) => c.active) : p));
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
    return <p className="text-[12.5px] text-[var(--muted)]">הקופונים עוד לא זמינים. אפשר לנסות שוב מאוחר יותר.</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
    {/* קופון מוכן בלחיצה. מרינה, 11.2026 ("תתחיל הכל", סבב 3 סעיף 4): רק 5
        דוכנים השתמשו בקופונים. כשאין קופון פעיל, מציעים אחד מוכן לחברים. */}
    {preset && <PresetCoupon store={store} origin={origin} onCreate={async (row) => {
      const { error } = await supabaseBrowser().from("coupons").insert({ ...row, store_id: store.id });
      return after(error, "כבר יש קופון עם הקוד הזה. אפשר ליצור אחד למטה");
    }} />}
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
    </>
  );
}

const PRESET = { code: "חברים10", label: "10% הנחה, ל-10 הקונים הראשונים, לשבועיים" };

function PresetCoupon({
  store,
  origin,
  onCreate,
}: {
  store: Store;
  origin: string;
  onCreate: (row: Record<string, unknown>) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const share = `יש לי קופון בשבילכם: ${PRESET.code}. 10% הנחה בדוכן שלי, ל-10 הראשונים!\n${origin}${storePath(store.slug)}`;

  async function create() {
    setBusy(true);
    setErr("");
    const until = new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const r = draftToRow({ code: PRESET.code, kind: "percent", value: "10", minTotal: "", maxUses: "10", expires: until });
    const e = "error" in r ? r.error : await onCreate(r.row);
    setBusy(false);
    if (e) setErr(e);
    else setDone(true);
  }

  return (
    <div className="border border-[var(--line)] bg-white p-3.5 mb-3 flex flex-col gap-2" data-testid="preset-coupon">
      <p className="text-[13.5px] font-bold">קופון מוכן לחברים</p>
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed -mt-1">
        <bdi className="font-bold text-[var(--ink)]">{PRESET.code}</bdi> · {PRESET.label}. קופון עוזר לקונים להחליט.
      </p>
      {done ? (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center bg-[var(--whatsapp)] text-white py-2.5 text-[13px] font-bold"
          data-testid="preset-coupon-share"
        >
          הקופון פעיל! לשלוח לחברים בוואטסאפ
        </a>
      ) : (
        <button
          onClick={create}
          disabled={busy}
          className="bg-[var(--ink)] text-white min-h-11 text-[13px] font-bold disabled:opacity-50"
          data-testid="preset-coupon-create"
        >
          {busy ? "יוצרים…" : "ליצור את הקופון"}
        </button>
      )}
      {err && <p className="text-[12px] text-[var(--danger)]">{err}</p>}
    </div>
  );
}
