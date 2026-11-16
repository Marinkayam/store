"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * כפתורי פעולה שתמיד על המסך (מוצר חדש, שמירת שינויים).
 *
 * פעם הם היו fixed עם מרחק מנוחש מהתחתית, ומוצרים הציצו ברווח שבינם
 * לבין הניווט. עכשיו הם חלק מהמעטפת (layout.tsx, #dash-dock): יושבים
 * בדיוק מעל הניווט, והרשימה נגללת מעליהם ולא מתחתם.
 */
export default function Dock({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("dash-dock")), []);
  return el ? createPortal(children, el) : null;
}
