"use client";

import { useCallback, useEffect, useState } from "react";
import CouponManager from "@/app/coupon-manager";
import type { Coupon, CouponDraft } from "@/lib/coupons";

/** הקופונים של חנות אחת בתיק החנות בחמ"ל. דרך /api/admin/coupons. */
export default function AdminCoupons({ storeId }: { storeId: string }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/coupons?storeId=${storeId}`);
    const data = await res.json().catch(() => ({}));
    setCoupons((data.coupons ?? []) as Coupon[]);
  }, [storeId]);

  useEffect(() => {
    setCoupons(null);
    load();
  }, [load]);

  const call = async (method: "POST" | "PATCH", body: unknown) => {
    try {
      const res = await fetch("/api/admin/coupons", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error ?? "הפעולה לא הצליחה";
      await load();
      return null;
    } catch {
      return "אין חיבור, לנסות שוב";
    }
  };

  if (coupons === null) return <p className="text-xs text-[var(--muted)]">רגע…</p>;

  return (
    <CouponManager
      coupons={coupons}
      adminView
      // השרת בודק שוב את אותם כללים; כאן שולחים את הטיוטה כמו שהיא
      onCreate={(row) =>
        call("POST", {
          storeId,
          draft: {
            code: String(row.code),
            kind: row.kind,
            value: String(row.value),
            minTotal: row.min_total == null ? "" : String(row.min_total),
            maxUses: row.max_uses == null ? "" : String(row.max_uses),
            expires: row.expires_at ? String(row.expires_at).slice(0, 10) : "",
          } as CouponDraft,
        })
      }
      onToggle={(c, active) => call("PATCH", { id: c.id, active })}
      onDelete={(c) => call("PATCH", { id: c.id, remove: true })}
    />
  );
}
