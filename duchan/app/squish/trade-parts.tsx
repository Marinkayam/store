"use client";

/**
 * חלקים משותפים למסכי הטרייד.
 *
 * יושבים בקובץ נפרד ולא בתוך עמוד: Next לא מרשה לעמוד לייצא רכיבים
 * נוספים מלבד הדף עצמו, וייבוא בין עמודים גם היה יוצר תלות מוזרה.
 */

import { mediaUrl } from "@/lib/media";
import type { SquishItem } from "@/lib/squish";
import { SquishOutline, SwapGlyph } from "./components";

export function Media({ item }: { item: Pick<SquishItem, "image_key" | "video_key" | "poster_key"> }) {
  const poster = mediaUrl(item.poster_key) ?? mediaUrl(item.image_key);
  const video = mediaUrl(item.video_key);
  if (video)
    return <video src={video} poster={poster ?? undefined} muted loop playsInline className="w-full h-full object-cover" />;
  if (poster) return <img src={poster} alt="" className="w-full h-full object-cover" />;
  return <SquishOutline size={40} />;
}

/** שני צדדים, וסימן ההחלפה באמצע. */
export function TwoSides({
  leftLabel,
  left,
  rightLabel,
  right,
}: {
  leftLabel: string;
  left: Pick<SquishItem, "id" | "name" | "image_key" | "video_key" | "poster_key">[];
  rightLabel: string;
  right: Pick<SquishItem, "id" | "name" | "image_key" | "video_key" | "poster_key">[];
}) {
  return (
    <div className="bg-white border border-[var(--line)] p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <Side label={leftLabel} items={left} />
        <span className="w-8 h-8 bg-[var(--lavender)] text-white flex items-center justify-center shrink-0"
          style={{ borderRadius: "999px" }} aria-hidden>
          <SwapGlyph size={16} />
        </span>
        <Side label={rightLabel} items={right} />
      </div>
    </div>
  );
}

function Side({
  label,
  items,
}: {
  label: string;
  items: Pick<SquishItem, "id" | "name" | "image_key" | "video_key" | "poster_key">[];
}) {
  return (
    <div>
      <div className="t-label mb-1.5 text-center">{label}</div>
      <div className="flex flex-col gap-1.5">
        {items.map((i) => (
          <div key={i.id}>
            <div className="aspect-square bg-[var(--cream)] overflow-hidden flex items-center justify-center">
              <Media item={i} />
            </div>
            <div className="text-[11.5px] truncate text-center mt-0.5">{i.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
