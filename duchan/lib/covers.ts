/**
 * קאברים מוכנים.
 *
 * גרדיאנטים בקוד ולא קבצי תמונה: אפס בייטים באחסון, אפס תעבורה, וחדים בכל
 * מסך. הם קיימים כדי שילדה שעוד לא צילמה כלום תקבל חנות שנראית גמורה —
 * לבקש ממנה תמונת קאבר לפני שיש לה חנות זה לבקש החלטה על משהו שהיא לא רואה.
 *
 * הגוונים מהפלטה: שמנת, זית, לבנדר, עץ, אפרסק.
 * אסור למחוק מפתח — חנות ששמרה אותו תישבר. רק להוציא משימוש.
 */
export interface Cover {
  key: string;
  label: string;
  css: string;
}

export const COVERS: Cover[] = [
  { key: "cream",    label: "שמנת",   css: "linear-gradient(135deg,#F6F0E8,#ECE6DE)" },
  { key: "olive",    label: "זית",    css: "linear-gradient(135deg,#E7EAD8,#A8A46D)" },
  { key: "lavender", label: "לבנדר",  css: "linear-gradient(135deg,#EFE7F4,#B89AC8)" },
  { key: "peach",    label: "אפרסק",  css: "linear-gradient(135deg,#FBE6DA,#D9967A)" },
  { key: "wood",     label: "עץ",     css: "linear-gradient(135deg,#F0E2D2,#B9824A)" },
  { key: "dusk",     label: "ערב",    css: "linear-gradient(135deg,#B89AC8,#8CA78C)" },
  { key: "sun",      label: "שמש",    css: "linear-gradient(135deg,#F8EBC8,#E3C26F)" },
  { key: "stone",    label: "אבן",    css: "linear-gradient(135deg,#FFFFFF,#D6CFC4)" },
];

export const DEFAULT_COVER = COVERS[0];

export function coverCss(preset: string | null | undefined): string {
  return (COVERS.find((c) => c.key === preset) ?? DEFAULT_COVER).css;
}
