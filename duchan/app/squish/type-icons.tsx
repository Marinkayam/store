"use client";

import type { SquishyType } from "@/lib/squish";

/**
 * אייקון לכל סוג סקווישי.
 *
 * וקטור ולא אימוג'י, כמו כל שאר הסימנים במועדון: אימוג'י נראה אחרת
 * בכל טלפון, והסוגים כאן הם שפה פנימית ולא ביטוי רגש.
 *
 * הציורים מכוונים לזיהוי בגודל 22 פיקסל ולא לדיוק אנטומי — בגודל הזה
 * צורה כללית נקראת, ופרטים נמרחים. לכן טאבה היא טבעת, ספוג הוא מלבן
 * עם חורים, ונידו הוא כדור עם נקודות.
 */
export function TypeIcon({ type, size = 22 }: { type: SquishyType; size?: number }) {
  const p = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "needoh": // כדור רך עם גרגרים
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="11" cy="15" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "water": // טיפה
      return (
        <svg {...p}>
          <path d="M12 3.5 C12 3.5 5.5 11 5.5 14.8 A6.5 6.5 0 0 0 18.5 14.8 C18.5 11 12 3.5 12 3.5 z" />
        </svg>
      );
    case "sand": // ערימת חול עם גרגרים
      return (
        <svg {...p}>
          <path d="M3 18.5 C7 18.5 8.5 10 12 10 s5 8.5 9 8.5" />
          <circle cx="10" cy="6" r=".9" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="7.5" r=".9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "ice": // קובייה
      return (
        <svg {...p}>
          <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 z" />
          <path d="M4 7.5 L12 12 L20 7.5 M12 12 V21" />
        </svg>
      );
    case "bubble_blowing": // בועה שיוצאת
      return (
        <svg {...p}>
          <circle cx="10" cy="14.5" r="6" />
          <circle cx="18.5" cy="6.5" r="2.6" />
        </svg>
      );
    case "eye_popping": // עין
      return (
        <svg {...p}>
          <path d="M2.5 12 C5 7.5 8.5 5.5 12 5.5 s7 2 9.5 6.5 C19 16.5 15.5 18.5 12 18.5 s-7 -2 -9.5 -6.5 z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      );
    case "taba": // טבעת
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "clay": // גוש רך
      return (
        <svg {...p}>
          <path d="M5 14.5 C4 9.5 8 5.5 12.5 6 c4 .5 6.5 3.5 6 7 -.5 3.5 -4 5.5 -7.5 5.5 -3 0 -5.5 -1 -6 -4 z" />
        </svg>
      );
    case "foam": // ספוג עם חורים
      return (
        <svg {...p}>
          <rect x="3.5" y="6.5" width="17" height="11" rx="1.5" />
          <circle cx="8" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="13" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    default: // אחר
      return (
        <svg {...p}>
          <circle cx="6.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
