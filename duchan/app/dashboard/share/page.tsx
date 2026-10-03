"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// "להפיץ" אוחד ל"החנות שלי" ← "לשתף את הדוכן" (ושם גם הקופונים).
// הכתובת נשארת כדי שקישורים ישנים — מהודעות, מהמסך הבית — ימשיכו לעבוד.
export default function ShareRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(window.location.hash === "#coupons" ? "/dashboard/settings#coupons" : "/dashboard/settings#share");
  }, [router]);
  return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
}
