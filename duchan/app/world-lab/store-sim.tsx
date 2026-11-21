"use client";

import { useState } from "react";
import { themeCssVars, themeOrDefault } from "@/lib/themes";
import Art from "@/app/home/art";
import Icon from "@/app/icons";
import type { LabStore } from "./data";

/**
 * הדמיה של דף החנות הרגיל. *לא* הדף האמיתי (app/s/[slug]) ולא נוגעת בו:
 * רק מספיק ממנו כדי להרגיש את המעבר מהחנות אל העולם ובחזרה.
 * הצבעים מגיעים מאותן ערכות נושא של החנויות האמיתיות (lib/themes.ts).
 */
export default function StoreSim({ store, onExit, fromWorld }: { store: LabStore; onExit: () => void; fromWorld: boolean }) {
  const theme = themeOrDefault(store.theme);
  const [cart, setCart] = useState(0);
  const [note, setNote] = useState(false);
  return (
    <div className="wl-store-page" style={themeCssVars(theme) as React.CSSProperties} data-testid="wl-store">
      <div className="wl-store-exit">
        <button type="button" className="wl-exit-btn" onClick={onExit} data-testid="wl-exit">
          <Icon name="stall" size={22} tone="var(--lavender)" />
          <span>{fromWorld && !store.mine ? "חזרה לרחוב" : "לצאת אל הרחוב"}</span>
        </button>
        <span className="wl-sim-tag">הדמיה של דף החנות</span>
      </div>

      <header className="wl-store-head">
        <div className="wl-store-avatar" aria-hidden>
          <span>{store.short.slice(0, 1)}</span>
        </div>
        <h1>{store.name}</h1>
        <p>{store.tagline}</p>
        <p className="wl-store-meta">{store.products.length} מוצרים</p>
      </header>

      <ul className="wl-store-grid">
        {store.products.map((p, i) => (
          <li key={i}>
            <div className="wl-store-thumb">
              <Art name={p.art} className="wl-store-art" />
            </div>
            <div className="wl-store-row">
              <span className="wl-store-name">{p.name}</span>
              <span className="wl-store-price">₪{p.price}</span>
            </div>
            <button
              type="button"
              className="wl-store-add"
              onClick={() => {
                setCart((c) => c + 1);
                setNote(true);
              }}
            >
              הוספה לסל
            </button>
          </li>
        ))}
      </ul>

      {cart > 0 && (
        <div className="wl-store-cart" role="status">
          <Icon name="bag" size={20} />
          <span>{cart} בסל</span>
          {note && <span className="wl-store-cartnote">בהדמיה אין הזמנות אמיתיות</span>}
        </div>
      )}
    </div>
  );
}
