// 6 ערכות. מקור אמת יחיד — הערכים הועתקו מ-duchan-mockup.html.
// אסור למחוק מפתח ערכה לעולם. רק להוציא משימוש ולמפות לחדשה.

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
}

export const THEMES: Record<ThemeKey, Theme> = {
  cloud:   { label: "ענן",    bg: "#EFF6FF", surface: "#FFFFFF", ink: "#123252", primary: "#3B82C4", onPrimary: "#FFFFFF", radius: "20px", font: "'Varela Round',sans-serif", thumb: "#F4F9FF", border: "none" },
  berry:   { label: "תות",    bg: "#FFF0F3", surface: "#FFFFFF", ink: "#4A1220", primary: "#E23E5C", onPrimary: "#FFFFFF", radius: "18px", font: "'Varela Round',sans-serif", thumb: "#FFF6F8", border: "none" },
  night:   { label: "לילה",   bg: "#131120", surface: "#1F1C30", ink: "#EFEDF8", primary: "#6FF0BC", onPrimary: "#0E1A15", radius: "13px", font: "'Rubik',sans-serif",        thumb: "#282440", border: "none" },
  pastel:  { label: "פסטל",   bg: "#FAF6EC", surface: "#FFFFFF", ink: "#2C3F37", primary: "#4FAE8E", onPrimary: "#FFFFFF", radius: "18px", font: "'Assistant',sans-serif",    thumb: "#F3F9F6", border: "none" },
  candy:   { label: "ממתק",   bg: "#FFF4D9", surface: "#FFFFFF", ink: "#4B2A3A", primary: "#FF6FA5", onPrimary: "#FFFFFF", radius: "24px", font: "'Secular One',sans-serif",  thumb: "#FFF0F6", border: "none" },
  minimal: { label: "מינימל", bg: "#FFFFFF", surface: "#FFFFFF", ink: "#111111", primary: "#111111", onPrimary: "#FFFFFF", radius: "2px",  font: "'Heebo',sans-serif",        thumb: "#F7F7F7", border: "1px solid #EAEAEA" },
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
  };
}
