"use client";

import { useEffect, useId, useRef, useState } from "react";
import { localityName, matchLocality, searchLocalities, type Locality } from "@/lib/localities";

/**
 * בוחר עיר: מקלידים כמה אותיות ובוחרים מהרשימה הרשמית של היישובים.
 *
 * אין כאן טקסט חופשי שנשמר. מה שלא נבחר מהרשימה לא נשמר ולא מוצג בדוכן,
 * וכך לא נכנסים לשדה הזה כתיבים שונים לאותו מקום, שכונות, מספרי טלפון
 * או קישורים (מיגרציה 0070, lib/localities.ts).
 *
 * הרשימה נפתחת מתחת לשדה, בתוך הדף ולא כחלונית צפה: ככה היא לא נחתכת
 * באזור גלילה ולא מתחבאת מאחורי המקלדת בטלפון.
 */
export default function CityPicker({
  value,
  onChange,
  label = "עיר או יישוב",
  placeholder = "מתחילים להקליד ובוחרים",
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(localityName(value) ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const picking = useRef(false);

  // הערך השתנה מבחוץ (טעינת הדוכן, ביטול שינויים) — הטקסט מתיישר אליו
  useEffect(() => {
    setText(localityName(value) ?? "");
  }, [value]);

  const options: Locality[] = open ? searchLocalities(text, 6) : [];
  const chosen = localityName(value);
  const typedOther = text.trim() !== "" && text !== chosen;

  function pick(l: Locality) {
    setText(l.name);
    setOpen(false);
    onChange(l.id);
  }

  function settle() {
    if (picking.current) return; // לחיצה על שורה ברשימה — pick יטפל
    setOpen(false);
    const t = text.trim();
    if (!t) {
      if (value !== null) onChange(null);
      return;
    }
    // הקלידו שם מלא ומדויק בלי ללחוץ על הרשימה — זה אותו דבר כמו לבחור
    const exact = matchLocality(t);
    if (exact) {
      setText(localityName(exact)!);
      if (exact !== value) onChange(exact);
    } else {
      setText(chosen ?? ""); // מה שלא ברשימה לא נשאר בשדה
    }
  }

  return (
    <div>
      <label htmlFor={`${listId}-in`} className="block text-[12px] text-[var(--muted)] mb-1">
        {label}
      </label>
      <input
        id={`${listId}-in`}
        data-testid="city-input"
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options.length ? `${listId}-o${active}` : undefined}
        autoComplete="off"
        value={text}
        maxLength={40}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); pick(options[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]"
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="border border-t-0 border-[var(--line)] bg-white" data-testid="city-options">
          {options.map((l, i) => (
            <li
              key={l.id}
              id={`${listId}-o${i}`}
              role="option"
              aria-selected={i === active}
              data-testid="city-option"
              // pointerdown ולא click: ה-blur של השדה רץ לפני click וסוגר את הרשימה
              onPointerDown={(e) => { e.preventDefault(); picking.current = true; }}
              onPointerUp={() => { picking.current = false; pick(l); }}
              onPointerCancel={() => { picking.current = false; }}
              className={`min-h-11 px-3 flex items-center text-[13.5px] cursor-pointer border-t border-[var(--line)] first:border-t-0 ${
                i === active ? "bg-[var(--canvas)] font-medium" : ""
              }`}
            >
              {l.name}
            </li>
          ))}
        </ul>
      )}
      {open && typedOther && options.length === 0 && (
        <p className="text-[12px] text-[var(--muted)] mt-1.5" data-testid="city-none" role="status">
          לא מצאנו יישוב כזה.
        </p>
      )}
    </div>
  );
}
