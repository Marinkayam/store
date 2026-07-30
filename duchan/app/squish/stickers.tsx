"use client";

import { useEffect, useState } from "react";
import {
  MAX_SHOWN,
  STICKERS,
  stickersFor,
  type PersonalKey,
  type Sticker,
} from "@/lib/squish-stickers";
import type { SquishItem } from "@/lib/squish";

/**
 * שורת המדבקות שהילדה בוחרת, ומדבקות הפינה שרואים בגלריה.
 *
 * שתיהן נגזרות מאותה רשימה ב-lib/squish-stickers.ts, כדי שסמל שמופיע
 * בבחירה יהיה בדיוק אותו סמל שיופיע אחר כך על התמונה. זה מה שגורם
 * לילדה ללמוד את השפה כבר בהוספה הראשונה.
 */

export function StickerPicker({
  personal,
  openForTrade,
  loved,
  onPersonal,
  onTrade,
  onLoved,
  hideTrade = false,
}: {
  personal: string[];
  openForTrade: boolean;
  loved: boolean;
  onPersonal: (k: PersonalKey, on: boolean) => void;
  onTrade: (on: boolean) => void;
  onLoved: (on: boolean) => void;
  /* בזרימה השיחתית לטרייד יש שאלה משלו — המדבקה כאן תכפיל אותה */
  hideTrade?: boolean;
}) {
  const shown = hideTrade ? STICKERS.filter((s) => s.key !== "trade") : STICKERS;
  const isOn = (s: Sticker) =>
    s.key === "trade" ? openForTrade : s.key === "loved" ? loved : personal.includes(s.key);

  const toggle = (s: Sticker) => {
    if (s.key === "trade") return onTrade(!openForTrade);
    if (s.key === "loved") return onLoved(!loved);
    onPersonal(s.key as PersonalKey, !personal.includes(s.key));
  };

  // ההערה מוצגת רק כשהמדבקה דלוקה — אחרת שתי שורות הסבר יושבות שם תמיד.
  // מ-shown ולא מ-STICKERS: מדבקה מוסתרת לא משאירה אחריה הסבר.
  const activeHint = shown.find((s) => isOn(s) && s.hint)?.hint;

  return (
    <div>
      <div className="t-small font-medium">תוסיפי לו מדבקה</div>
      <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
        מדבקות עוזרות לספר מה מיוחד בסקווישי שלך.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {shown.map((s) => {
          const on = isOn(s);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s)}
              aria-pressed={on}
              aria-label={s.label}
              className={`flex items-center gap-2 rounded-full px-3 py-2.5 text-start transition-transform active:translate-y-px ${
                on ? "font-medium" : "bg-[var(--cream)]"
              }`}
              style={on ? { background: `color-mix(in srgb, ${s.bg} 30%, white)` } : undefined}
            >
              <span
                className="w-6 h-6 shrink-0 flex items-center justify-center text-[13px]"
                style={
                  on
                    ? { background: s.bg, color: s.fg, borderRadius: "999px" }
                    : { background: "white", color: "var(--faint)", borderRadius: "999px" }
                }
                aria-hidden
              >
                {s.glyph}
              </span>
              <span className="text-[12.5px] leading-tight">{s.label}</span>
            </button>
          );
        })}
      </div>
      {activeHint && (
        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-1.5">{activeHint}</p>
      )}
    </div>
  );
}

/** מדבקות קטנות בפינת התמונה. לא טקסט על התמונה — סימנים. */
export function StickerCorner({
  item,
  isFavorite = false,
  size = 22,
}: {
  item: Pick<SquishItem, "trade_status"> & { stickers?: string[] | null };
  isFavorite?: boolean;
  size?: number;
}) {
  const shown = stickersFor(item, isFavorite);
  if (!shown.length) return null;
  return (
    <span className="absolute top-1.5 start-1.5 flex gap-1 z-10" aria-hidden>
      {shown.slice(0, MAX_SHOWN).map((s) => (
        <span
          key={s.key}
          title={s.label}
          className="flex items-center justify-center font-bold"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.58,
            background: s.bg,
            color: s.fg,
            borderRadius: "999px",
            boxShadow: "0 0 0 1.5px rgba(255,255,255,.85)",
          }}
        >
          {s.glyph}
        </span>
      ))}
    </span>
  );
}

/** גרסה נגישה לקוראי מסך, לצד הפינה הוויזואלית. */
export function StickerNames({
  item,
  isFavorite = false,
}: {
  item: Pick<SquishItem, "trade_status"> & { stickers?: string[] | null };
  isFavorite?: boolean;
}) {
  const shown = stickersFor(item, isFavorite);
  if (!shown.length) return null;
  return <span className="sr-only">{shown.map((s) => s.label).join(", ")}</span>;
}

/**
 * רגע קטן אחרי הסקווישי הראשון.
 *
 * לא באונבורדינג ולא הסבר ארוך — משפט אחד וכפתור אחד, פעם בחיים, אחרי
 * שכבר יש לה סקווישי אמיתי להסתכל עליו. לפני זה אין למה לחבר את זה.
 */
export function StickerIntro({ items }: { items: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (items < 1) return;
    if (localStorage.getItem("squish-stickers-intro")) return;
    setShow(true);
  }, [items]);

  if (!show) return null;

  return (
    <div className="border-[1.5px] border-[var(--lavender)] bg-white p-3.5 flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {STICKERS.map((s) => (
          <span
            key={s.key}
            className="w-6 h-6 flex items-center justify-center text-[13px] font-bold"
            style={{ background: s.bg, color: s.fg, borderRadius: "999px" }}
          >
            {s.glyph}
          </span>
        ))}
      </div>
      <div className="t-small font-medium">תני לסקווישים שלך אופי</div>
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
        סמני מי אהוב עלייך, מי מיוחד ומי פתוח לטרייד.
      </p>
      <button
        onClick={() => {
          localStorage.setItem("squish-stickers-intro", "1");
          setShow(false);
        }}
        className="btn btn-secondary t-small self-start"
      >
        הבנתי
      </button>
    </div>
  );
}
