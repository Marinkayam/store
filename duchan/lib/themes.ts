// 6 ערכות. מקור אמת יחיד.
// אסור למחוק מפתח ערכה לעולם. רק להוציא משימוש ולמפות לחדשה.
//
// ── שפת העיצוב ──
//
// הערכות יושבות על אותה משפחה חמה של הדיזיין סיסטם: שמנת, זית, לבנדר ועץ.
// פינות רכות של 12px, קו דק, וצל עדין — האופי מגיע מהצבע ומהטיפוגרפיה ולא
// מקישוט. כל ערכה היא גוון של אותה שפה, כדי ששתי חנויות זו לצד זו ייראו
// כמו שתי חנויות באותה עיר ולא כמו שתי אפליקציות שונות.

export type ThemeKey = "cloud" | "berry" | "night" | "pastel" | "candy" | "minimal";

export interface Theme {
  label: string;
  bg: string;
  surface: string;
  ink: string;
  primary: string;
  onPrimary: string;
  radius: string;
  font: string;
  thumb: string;
  border: string;
  /** צל עדין. אין צללים קשיחים — הרכות היא חלק מהשפה. */
  shadow: string;
}

const R = "12px";
const SOFT = "0 2px 12px rgba(0,0,0,0.05)";

export const THEMES: Record<ThemeKey, Theme> = {
  cloud:   { label: "שמנת",   bg: "#FBF8F3", surface: "#FFFFFF", ink: "#262626", primary: "#A8A46D", onPrimary: "#FFFFFF", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#F6F0E8", border: "1px solid #D6CFC4", shadow: SOFT },
  berry:   { label: "לבנדר",  bg: "#F7F3F9", surface: "#FFFFFF", ink: "#31243A", primary: "#B89AC8", onPrimary: "#FFFFFF", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#F3EDF7", border: "1px solid #DCD0E4", shadow: SOFT },
  night:   { label: "לילה",   bg: "#232028", surface: "#2E2A35", ink: "#F4F1EC", primary: "#C9B7DA", onPrimary: "#232028", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#38333F", border: "1px solid #443E4D", shadow: "0 2px 12px rgba(0,0,0,0.25)" },
  pastel:  { label: "זית",    bg: "#F4F5EC", surface: "#FFFFFF", ink: "#2C3020", primary: "#8CA78C", onPrimary: "#FFFFFF", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#EEF1E4", border: "1px solid #D3D6C2", shadow: SOFT },
  candy:   { label: "אפרסק",  bg: "#FDF2EC", surface: "#FFFFFF", ink: "#3A241A", primary: "#D9967A", onPrimary: "#FFFFFF", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#FBEBE1", border: "1px solid #E8D3C6", shadow: SOFT },
  minimal: { label: "עץ",     bg: "#FAF6F1", surface: "#FFFFFF", ink: "#2B2118", primary: "#B9824A", onPrimary: "#FFFFFF", radius: R, font: "'Inter','Heebo',sans-serif",     thumb: "#F5EDE3", border: "1px solid #E0D3C4", shadow: SOFT },
};

export function themeOrDefault(key: string | null | undefined): Theme {
  return THEMES[(key as ThemeKey) ?? "cloud"] ?? THEMES.cloud;
}

/** משתני ה-CSS שמיושמים על שורש דף החנות. הדשבורד לא מושפע לעולם. */
export function themeCssVars(t: Theme): Record<string, string> {
  return {
    "--s-bg": t.bg,
    "--s-surface": t.surface,
    "--s-ink": t.ink,
    "--s-primary": t.primary,
    "--s-onprimary": t.onPrimary,
    "--s-radius": t.radius,
    "--s-font": t.font,
    "--s-thumb": t.thumb,
    "--s-border": t.border,
    "--s-shadow": t.shadow,
  };
}
