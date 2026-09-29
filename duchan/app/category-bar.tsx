"use client";

import { mediaUrl } from "@/lib/media";
import {
  ALL_ICON,
  CATEGORY_DIMENSIONS,
  type CategoryLayout,
  type CategoryMeta,
  type CategorySize,
} from "@/lib/category-style";

/**
 * שורת הקטגוריות של הדוכן. אותו רכיב בדף החנות ובתצוגה המקדימה בעורך,
 * כך שמה שהמוכרת רואה כשהיא מעצבת הוא בדיוק מה שהקונות יקבלו.
 *
 * הכל נצבע ממשתני --s-* של הערכה והסגנון (פינות, קו, צל, גופן), ולכן
 * צריך לשבת בתוך עטיפה שמגדירה אותם. כל פריט אטום (--s-surface), כך
 * שהוא קריא גם על רקע של דוגמה או תמונה.
 *
 * הבחירה מסומנת גם בצבע וגם בצורה (טבעת / מסגרת עבה / טקסט מודגש) —
 * לא רק בצבע.
 */
export default function CategoryBar({
  categories,
  active,
  onSelect,
  layout,
  size,
  meta,
  imageUrl = mediaUrl,
}: {
  categories: string[];
  active: string | null;
  onSelect: (c: string | null) => void;
  layout: CategoryLayout;
  size: CategorySize;
  meta: CategoryMeta;
  /** בעורך: תמונה שרק עכשיו נבחרה עדיין לא ב-R2, אז מגיעה כ-blob */
  imageUrl?: (key: string | null | undefined) => string | null;
}) {
  const items: (string | null)[] = [null, ...categories];
  const vertical = layout === "circle" || layout === "square";

  return (
    <div
      data-testid="category-chips"
      data-layout={layout}
      data-size={size}
      className={`px-3 pb-3 flex overflow-x-auto ${vertical ? "gap-3 pt-1" : layout === "card" ? "gap-2" : "gap-1.5"}`}
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((c) => {
        const on = active === c;
        const m = c ? meta[c] : undefined;
        const img = c && m?.image ? imageUrl(m.image) : null;
        const label = c ?? "הכל";
        const glyph = c ? m?.emoji || null : ALL_ICON;
        const k = c ?? "__all";
        const common = {
          onClick: () => onSelect(c),
          "aria-pressed": on,
          "aria-label": label,
        };

        /* ── רק טקסט ── */
        if (layout === "text") {
          const d = CATEGORY_DIMENSIONS.text[size];
          return (
            <button
              key={k}
              {...common}
              className="shrink-0 font-semibold border-[1.5px] min-h-11"
              style={{
                fontSize: d.font,
                padding: `${d.padY}px ${d.padX}px`,
                ...(on
                  ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                  : { background: "var(--s-surface)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }),
              }}
            >
              {label}
            </button>
          );
        }

        /* ── אייקון וטקסט ── */
        if (layout === "icon") {
          const d = CATEGORY_DIMENSIONS.icon[size];
          return (
            <button
              key={k}
              {...common}
              className="shrink-0 inline-flex items-center gap-1.5 font-semibold border-[1.5px] min-h-11"
              style={{
                fontSize: d.font,
                padding: `${d.padY}px ${d.padX}px ${d.padY}px ${Math.max(6, d.padX - 6)}px`,
                ...(on
                  ? { background: "var(--s-primary)", color: "var(--s-onprimary)", borderColor: "var(--s-primary)" }
                  : { background: "var(--s-surface)", borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }),
              }}
            >
              <Glyph img={img} glyph={glyph} name={c} px={d.icon} round />
              {label}
            </button>
          );
        }

        /* ── עיגולים / ריבועים: תמונה למעלה, שם מתחת ── */
        if (layout === "circle" || layout === "square") {
          const d = CATEGORY_DIMENSIONS[layout][size];
          const round = layout === "circle";
          return (
            <button key={k} {...common} className="shrink-0 flex flex-col items-center gap-1.5" style={{ width: d.box + 10 }}>
              <span
                className={round ? "" : "s-r"}
                style={{
                  width: d.box,
                  height: d.box,
                  display: "block",
                  padding: 3,
                  borderRadius: round ? "999px" : undefined,
                  // טבעת בצבע הראשי כשנבחר, קו עדין כשלא — הבחירה נראית בצורה, לא רק בצבע
                  border: on ? "2.5px solid var(--s-primary)" : "1.5px solid color-mix(in srgb, currentColor 22%, transparent)",
                  background: "var(--s-surface)",
                }}
              >
                <Glyph img={img} glyph={glyph} name={c} px={d.box - 12} round={round} fill />
              </span>
              <span
                className="max-w-full truncate leading-tight px-1.5 py-0.5 s-r"
                style={{
                  fontSize: d.font,
                  fontWeight: on ? 800 : 600,
                  background: on ? "var(--s-primary)" : "var(--s-surface)",
                  color: on ? "var(--s-onprimary)" : undefined,
                }}
              >
                {label}
              </span>
            </button>
          );
        }

        /* ── כרטיסים: תמונה גדולה, השם על פס בתחתית ── */
        const d = CATEGORY_DIMENSIONS.card[size];
        return (
          <button
            key={k}
            {...common}
            className="s-r shrink-0 relative overflow-hidden text-right"
            style={{
              width: d.w,
              height: d.h,
              background: "var(--s-thumb)",
              border: on ? "2.5px solid var(--s-primary)" : "var(--s-border)",
              boxShadow: "var(--s-shadow)",
            }}
          >
            {img ? (
              <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center pb-5" style={{ fontSize: d.h * 0.36 }}>
                {glyph ?? <Initial name={c} px={d.h * 0.5} />}
              </span>
            )}
            <span
              className="absolute inset-x-0 bottom-0 px-2 py-1 truncate"
              style={{
                fontSize: d.font,
                fontWeight: on ? 800 : 700,
                background: on ? "var(--s-primary)" : "color-mix(in srgb, var(--s-surface) 92%, transparent)",
                color: on ? "var(--s-onprimary)" : "var(--s-ink)",
              }}
            >
              {on ? "✓ " : ""}
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** התמונה, האמוג'י, או האות הראשונה — בסדר הזה. */
function Glyph({
  img,
  glyph,
  name,
  px,
  round,
  fill = false,
}: {
  img: string | null;
  glyph: string | null;
  name: string | null;
  px: number;
  round: boolean;
  fill?: boolean;
}) {
  const shape = round ? { borderRadius: "999px" } : undefined;
  if (img)
    return (
      <img
        src={img}
        alt=""
        className={`object-cover ${round ? "" : "s-r"}`}
        style={{ width: fill ? "100%" : px, height: fill ? "100%" : px, display: "block", ...shape }}
      />
    );
  return (
    <span
      className={`flex items-center justify-center ${round ? "" : "s-r"}`}
      style={{
        width: fill ? "100%" : px,
        height: fill ? "100%" : px,
        background: "var(--s-thumb)",
        fontSize: px * 0.55,
        lineHeight: 1,
        ...shape,
      }}
    >
      {glyph ?? <Initial name={name} px={px} />}
    </span>
  );
}

function Initial({ name, px }: { name: string | null; px: number }) {
  return (
    <span aria-hidden style={{ fontSize: px * 0.45, fontWeight: 800, color: "var(--s-primary)" }}>
      {(name ?? "").trim().charAt(0)}
    </span>
  );
}
