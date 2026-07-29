"use client";

/**
 * הרכיבים המשותפים של סקוויש קלאב.
 *
 * השפה הוויזואלית היא של דוכן — שמנת, לבנדר, זית ועץ, קו דק אחד, פינה
 * ישרה — אבל המטאפורה כאן היא מדף אוסף ולא לוח ניהול: הכרטיס גדול,
 * התמונה נושאת אותו, והתגית היא סימן היכר ולא סטטוס טכני.
 */

import { mediaUrl } from "@/lib/media";
import {
  conditionLabel,
  sizeLabel,
  typeLabel,
  type SquishItem,
} from "@/lib/squish";
import { StickerCorner, StickerNames } from "./stickers";

/** תגית "פתוח לטרייד" — אייקון וקטורי משלנו, לא אימוג'י. */
export function TradeBadge({ status }: { status: SquishItem["trade_status"] }) {
  /* תגית קטנה בפינה, לא רצועה סגולה על חצי מהתמונה: התמונה היא מה
     שצריך לתפוס את העין, והתגית היא סימן היכר לצידה. */
  if (status === "open_for_trade") {
    return (
      <span
        className="w-6 h-6 flex items-center justify-center bg-[var(--lavender)] text-white shadow-sm"
        style={{ borderRadius: "999px" }}
        title="פתוח לטרייד"
        aria-label="פתוח לטרייד"
      >
        <SwapGlyph size={13} />
      </span>
    );
  }
  if (status === "maybe_trade") {
    return (
      <span
        className="w-6 h-6 flex items-center justify-center bg-white/90 text-[var(--muted)] border border-[var(--line)]"
        style={{ borderRadius: "999px" }}
        title="אולי לטרייד"
        aria-label="אולי לטרייד"
      >
        <SwapGlyph size={13} />
      </span>
    );
  }
  if (status === "reserved") {
    return (
      <span className="bg-[var(--warn-bg)] border border-[var(--warn-line)] text-[var(--warn-ink)] text-[11px] px-1.5 py-0.5">
        שמור בטרייד
      </span>
    );
  }
  if (status === "traded") {
    return (
      <span className="bg-[var(--ok-bg)] border border-[var(--ok-line)] text-[var(--ok-ink)] text-[11px] px-1.5 py-0.5">
        הוחלף
      </span>
    );
  }
  if (status === "moved_to_duchan") {
    return (
      <span className="bg-[var(--sand)] text-[var(--muted)] text-[11px] px-1.5 py-0.5">
        עבר לדוכן
      </span>
    );
  }
  return null;
}

/** שני חצים מנוגדים — סימן הטרייד של המועדון. */
export function SwapGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 5.5 h9 l-2.5 -2.5" />
      <path d="M14 10.5 h-9 l2.5 2.5" />
    </svg>
  );
}

/** כרטיס פריט. גדול, ויזואלי, והמדיה נושאת אותו. */
export function SquishyCard({
  item,
  onClick,
  showBadge = true,
  isFavorite = false,
}: {
  item: SquishItem;
  onClick?: () => void;
  showBadge?: boolean;
  isFavorite?: boolean;
}) {
  const poster = mediaUrl(item.poster_key) ?? mediaUrl(item.image_key);
  const video = mediaUrl(item.video_key);
  const dim = item.trade_status === "traded" || item.trade_status === "moved_to_duchan";

  return (
    <button
      onClick={onClick}
      className={`squish-card text-start flex flex-col ${dim ? "opacity-55" : ""}`}
    >
      <div className="relative aspect-square bg-[var(--cream)] flex items-center justify-center overflow-hidden">
        {video ? (
          <video
            src={video}
            poster={poster ?? undefined}
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : poster ? (
          <img src={poster} alt="" className="w-full h-full object-cover" />
        ) : (
          <SquishOutline />
        )}
        {/* מדבקות במקום שבב טקסט: סימנים קטנים בפינה, עד שלושה, ובסדר
            קבוע — טרייד ראשון כי הוא היחיד שמזמין פעולה מחברה. */}
        {showBadge && (
          <>
            <StickerCorner item={item} isFavorite={isFavorite} />
            <StickerNames item={item} isFavorite={isFavorite} />
          </>
        )}
        {video && (
          <span
            className="absolute bottom-1.5 end-1.5 w-5 h-5 bg-black/50 text-white flex items-center justify-center"
            style={{ borderRadius: "999px" }}
            aria-label="יש סרטון"
          >
            <svg viewBox="0 0 12 12" width="7" height="7" fill="currentColor" aria-hidden>
              <path d="M3 2 L10 6 L3 10 z" />
            </svg>
          </span>
        )}
      </div>
      <div className="pt-1.5 px-0.5">
        <div className="text-[13px] font-medium truncate">{item.name}</div>
        <div className="text-[11.5px] text-[var(--muted)] truncate">
          {[typeLabel(item.squishy_type) === "אחר" ? item.custom_type || "אחר" : typeLabel(item.squishy_type),
            sizeLabel(item.size),
            conditionLabel(item.condition)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </button>
  );
}

/** קווי מתאר של סקווישי, לכרטיס בלי תמונה */
export function SquishOutline({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <path
        d="M24 8 c9 0 16 6.5 16 15 c0 9 -7 17 -16 17 s-16 -8 -16 -17 c0 -8.5 7 -15 16 -15 z"
        fill="var(--sand)"
        stroke="var(--wood)"
        strokeWidth="1.6"
      />
      <circle cx="19" cy="24" r="1.6" fill="var(--wood)" />
      <circle cx="29" cy="24" r="1.6" fill="var(--wood)" />
      <path d="M20 29 a4.5 4.5 0 0 0 8 0" fill="none" stroke="var(--wood)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CollectionGrid({
  items,
  onOpen,
}: {
  items: SquishItem[];
  onOpen?: (item: SquishItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((it) => (
        <SquishyCard key={it.id} item={it} onClick={onOpen ? () => onOpen(it) : undefined} />
      ))}
    </div>
  );
}

/** למה החיבור הזה קיים. בלי מספרי טלפון ובלי פרטים אישיים. */
export function ConnectionContext({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--muted)]">
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="5.5" cy="5.5" r="2.5" />
        <circle cx="11" cy="9" r="2" />
        <path d="M2 13.5 c0 -2.2 1.6 -3.5 3.5 -3.5 s3.5 1.3 3.5 3.5" />
      </svg>
      {text}
    </span>
  );
}

export function EmptyCollection({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="text-center py-12 px-6 flex flex-col items-center gap-3">
      <ShelfArt />
      <div className="t-heading">{title}</div>
      <p className="t-sub max-w-[17rem] leading-relaxed">{body}</p>
      {cta && href && (
        <a href={href} className="btn btn-primary w-full max-w-[15rem] mt-1">
          {cta}
        </a>
      )}
    </div>
  );
}

/** מדף ריק — האיור של המצבים הריקים */
function ShelfArt() {
  return (
    <svg viewBox="0 0 120 80" className="w-28 h-auto" aria-hidden>
      <g stroke="var(--wood)" strokeWidth="2.2" strokeLinejoin="round" fill="none">
        <rect x="10" y="52" width="100" height="7" fill="var(--sand)" />
        <path d="M18 59 v10 M102 59 v10" />
        <rect x="10" y="20" width="100" height="6" fill="var(--sand)" />
        <path d="M18 26 v26 M102 26 v26" />
      </g>
    </svg>
  );
}
