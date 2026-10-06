"use client";

import { useState } from "react";
import { KupaStall } from "./kupa-art";
import Icon from "./icons";

/**
 * הדוכן הגדול של מסך הפתיחה ודף המחיר — בלי מסגרת, ועם אור שאפשר להדליק.
 *
 * מרינה: "הדוכן הזה לא יפה בתוך המסגרת", "טיפונת קווים יותר דקים ועדינים",
 * ו"בכניסה צריך שאפשר יהיה להדליק את האור או משהו מגניב".
 *
 * הדוכן עומד על הדף עצמו (KupaStall bare). לחיצה על הכפתור — או על הדוכן —
 * מחשיכה את השמיים על כל רוחב המסך: הנורות נדלקות, כוכבים מנצנצים
 * וגחליליות מרחפות. לחיצה נוספת מחזירה ליום. מי שביקש פחות תנועה מקבל
 * את המעבר בלי האנימציות (globals.css).
 *
 * still — רק האיור, בלי האור. מסך הכניסה (מרינה, 10.2026: "תוריד את כל
 * הלהדליק את האור... זה אמור להיות ממש ממש פשוט").
 */
const NIGHT_SKY = "#2E3150";

export default function StallHero({ name = "הדוכן שלך", className = "", still = false }: { name?: string; className?: string; still?: boolean }) {
  const [night, setNight] = useState(false);
  if (still) {
    return (
      <div data-testid="stall-hero" data-night="0" className={`w-full ${className}`}>
        <KupaStall
          level={5}
          name={name}
          bare
          deco={{ awning: "lavender", flowers: true, openSign: true, cat: true }}
          className="w-full max-w-md mx-auto block pt-2"
        />
      </div>
    );
  }
  const toggle = () => setNight((n) => !n);
  return (
    <div
      data-testid="stall-hero"
      data-night={night ? "1" : "0"}
      className={`w-full transition-colors duration-700 ${className}`}
      style={{ background: night ? NIGHT_SKY : "transparent" }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={night ? "לכבות את האורות בדוכן" : "להדליק את האורות בדוכן"}
        className="block w-full max-w-md mx-auto pt-2"
      >
        <KupaStall
          level={5}
          name={name}
          night={night}
          bare
          deco={{ awning: "lavender", flowers: true, openSign: true, cat: true }}
          className="w-full block"
        />
      </button>
      <div className="flex justify-center pb-4 pt-1">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={night}
          data-testid="stall-light"
          className="flex items-center gap-2 px-4 min-h-11 text-[13.5px] font-bold border-[1.5px] transition-colors duration-500"
          style={
            night
              ? { background: "#FFF3C4", color: NIGHT_SKY, borderColor: "#FFF3C4" }
              : { background: "var(--white)", color: "var(--ink)", borderColor: "var(--ink)" }
          }
        >
          <Icon name={night ? "sun" : "moon"} size={18} tone={night ? "#E3C26F" : "#FFF3C4"} />
          {night ? "לכבות את האורות" : "להדליק את האורות"}
        </button>
      </div>
    </div>
  );
}
