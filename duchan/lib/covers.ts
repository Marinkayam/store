/**
 * קאברים מוכנים.
 *
 * דוגמאות ב-CSS (SVG מוטמע), לא קבצי תמונה וגם לא גרדיאנטים: אפס בייטים
 * באחסון, אפס תעבורה, וחדים בכל מסך — בלי המעבר ה"מרוח" של גרדיאנט, שלא
 * מתאים לעיצוב השטוח (בלי הצללות, בלי פינות עגולות) של שאר האתר.
 * הם קיימים כדי שילדה שעוד לא צילמה כלום תקבל חנות שנראית גמורה —
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

/** נקודות קטנות — כמו בד עם הדפס. */
function dots(bg: string, dot: string, size = 22, r = 2.4, opacity = 0.4): string {
  const fill = dot.replace("#", "%23");
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E` +
    `%3Ccircle cx='${size / 4}' cy='${size / 4}' r='${r}' fill='${fill}' fill-opacity='${opacity}'/%3E` +
    `%3C/svg%3E`;
  return `${bg} url("data:image/svg+xml,${svg}") 0 0/${size}px ${size}px`;
}

/** כוכבונים קטנים — וריאציה שנייה לדוגמה, לא רק נקודות בכל מקום. */
function sparkles(bg: string, mark: string, size = 26, opacity = 0.45): string {
  const fill = mark.replace("#", "%23");
  const s = size / 26;
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E` +
    `%3Cpath d='M${6 * s} ${3 * s}l${1.6 * s} ${3.4 * s}l${3.4 * s} ${1.6 * s}l-${3.4 * s} ${1.6 * s}l-${1.6 * s} ${3.4 * s}l-${1.6 * s}-${3.4 * s}l-${3.4 * s}-${1.6 * s}l${3.4 * s}-${1.6 * s}z' fill='${fill}' fill-opacity='${opacity}'/%3E` +
    `%3Ccircle cx='${19 * s}' cy='${18 * s}' r='${1.8 * s}' fill='${fill}' fill-opacity='${opacity}'/%3E` +
    `%3C/svg%3E`;
  return `${bg} url("data:image/svg+xml,${svg}") 0 0/${size}px ${size}px`;
}

export const COVERS: Cover[] = [
  { key: "cream",    label: "שמנת",   css: dots("#F6F0E8", "#D9CDBB") },
  { key: "olive",    label: "זית",    css: dots("#E7EAD8", "#8C8A57") },
  { key: "lavender", label: "לבנדר",  css: sparkles("#EFE7F4", "#B89AC8") },
  { key: "peach",    label: "אפרסק",  css: dots("#FBE6DA", "#D9967A") },
  { key: "wood",     label: "עץ",     css: dots("#F0E2D2", "#9B6D3E") },
  { key: "dusk",     label: "ערב",    css: sparkles("#E4EDE4", "#7C9B7C") },
  { key: "sun",      label: "שמש",    css: sparkles("#F8EBC8", "#C89B3E") },
  { key: "stone",    label: "אבן",    css: dots("#FAF8F5", "#B8AFA1") },
];

export const DEFAULT_COVER = COVERS[0];

export function coverCss(preset: string | null | undefined): string {
  return (COVERS.find((c) => c.key === preset) ?? DEFAULT_COVER).css;
}
