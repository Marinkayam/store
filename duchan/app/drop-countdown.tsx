"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/drop";

/**
 * ספירה לאחור לדרופ. מתקתקת בעצמה — ככה רק המספר מתרנדר כל שנייה, ולא
 * כל הדף (רשת עם סרטונים בטלפון ישן).
 * offset = שעון השרת פחות שעון הטלפון (נמדד פעם אחת ב-/api/time).
 */
export default function DropCountdown({ at, offset = 0 }: { at: number; offset?: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return (
    <span dir="ltr" className="tabular-nums" data-testid="drop-countdown">
      {countdown(at - now)}
    </span>
  );
}
