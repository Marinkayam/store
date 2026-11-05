// 12 ערכות. מקור אמת יחיד.
// אסור למחוק מפתח ערכה לעולם. רק להוציא משימוש ולמפות לחדשה.
//
// ── שפת העיצוב ──
//
// הערכות יושבות על אותה משפחה חמה של הדיזיין סיסטם: שמנת, זית, לבנדר ועץ.
// פינות רכות של 12px, קו דק, וצל עדין — האופי מגיע מהצבע ומהטיפוגרפיה ולא
// מקישוט. כל ערכה היא גוון של אותה שפה, כדי ששתי חנויות זו לצד זו ייראו
// כמו שתי חנויות באותה עיר ולא כמו שתי אפליקציות שונות.

export type ThemeKey =
  | "cloud" | "berry" | "night" | "pastel" | "candy" | "minimal"
  // 11.2026 (מרינה: "עוד צבעים יפים ושמות מגניבים וכיפיים")
  | "bubble" | "mint" | "slush" | "lemon" | "melon" | "galaxy";

export interface Theme {
  label: string;
  bg: string;
  surface: string;
  ink: string;
  primary: string;
  onPrimary: string;
  /** הצבע הראשי כשהוא טקסט (מחיר, כותרת) — כהה מספיק ל-4.5:1 (AA).
   *
   *  בערכות הבהירות primary = הגוון העמוק של הצבע, עם טקסט לבן עליו.
   *  קודם הכפתורים היו בגוון הרך עם טקסט שחור — מרינה: "טקסט שחור על כפתור
   *  חום זה לא נראה טוב". לבן על הגוון העמוק עומד גם ב-4.5:1. */
  primaryText: string;
  radius: string;
  font: string;
  thumb: string;
  border: string;
  /** צל עדין. אין צללים קשיחים — הרכות היא חלק מהשפה. */
  shadow: string;
}

// פינה ישרה בכל הערכות. העיצוב נשען על קו וריווח, לא על עיגול.
const R = "0px";
const SOFT = "none";

export const THEMES: Record<ThemeKey, Theme> = {
  cloud:   { label: "וניל",   bg: "#FBF8F3", surface: "#FFFFFF", ink: "#262626", primary: "#716E43", onPrimary: "#FFFFFF", primaryText: "#716E43", radius: R, font: "'Heebo',sans-serif",     thumb: "#F6F0E8", border: "1px solid #D6CFC4", shadow: SOFT },
  berry:   { label: "לבנדר",  bg: "#F7F3F9", surface: "#FFFFFF", ink: "#31243A", primary: "#8858A2", onPrimary: "#FFFFFF", primaryText: "#8858A2", radius: R, font: "'Heebo',sans-serif",     thumb: "#F3EDF7", border: "1px solid #DCD0E4", shadow: SOFT },
  night:   { label: "חצות",   bg: "#232028", surface: "#2E2A35", ink: "#F4F1EC", primary: "#C9B7DA", onPrimary: "#232028", primaryText: "#C9B7DA", radius: R, font: "'Heebo',sans-serif",     thumb: "#38333F", border: "1px solid #443E4D", shadow: "none" },
  pastel:  { label: "מאצ'ה",  bg: "#F4F5EC", surface: "#FFFFFF", ink: "#2C3020", primary: "#577157", onPrimary: "#FFFFFF", primaryText: "#577157", radius: R, font: "'Heebo',sans-serif",     thumb: "#EEF1E4", border: "1px solid #D3D6C2", shadow: SOFT },
  candy:   { label: "קינמון", bg: "#FDF2EC", surface: "#FFFFFF", ink: "#3A241A", primary: "#A65330", onPrimary: "#FFFFFF", primaryText: "#A65330", radius: R, font: "'Heebo',sans-serif",     thumb: "#FBEBE1", border: "1px solid #E8D3C6", shadow: SOFT },
  minimal: { label: "עוגייה", bg: "#FAF6F1", surface: "#FFFFFF", ink: "#2B2118", primary: "#8D6236", onPrimary: "#FFFFFF", primaryText: "#8D6236", radius: R, font: "'Heebo',sans-serif",     thumb: "#F5EDE3", border: "1px solid #E0D3C4", shadow: SOFT },
  // ── 11.2026: שש ערכות חדשות. אותה שפה (פינה ישרה, בלי צל), צבעים עזים יותר.
  //    כל primary עומד ב-4.5:1 מול הטקסט שעליו, וכל primaryText מול הרקע.
  bubble:  { label: "מסטיק",  bg: "#FFF2F6", surface: "#FFFFFF", ink: "#3A1A27", primary: "#C23B6E", onPrimary: "#FFFFFF", primaryText: "#B0325F", radius: R, font: "'Heebo',sans-serif",     thumb: "#FCE6EE", border: "1px solid #F0CFDC", shadow: SOFT },
  mint:    { label: "מנטה",   bg: "#EDF8F3", surface: "#FFFFFF", ink: "#16302A", primary: "#23785A", onPrimary: "#FFFFFF", primaryText: "#23785A", radius: R, font: "'Heebo',sans-serif",     thumb: "#E0F2EA", border: "1px solid #C6E2D5", shadow: SOFT },
  slush:   { label: "ברד כחול", bg: "#EEF5FC", surface: "#FFFFFF", ink: "#14263D", primary: "#2563A8", onPrimary: "#FFFFFF", primaryText: "#2563A8", radius: R, font: "'Heebo',sans-serif",   thumb: "#E1EDF9", border: "1px solid #C9DBEE", shadow: SOFT },
  lemon:   { label: "לימונדה", bg: "#FFFAE5", surface: "#FFFFFF", ink: "#332A08", primary: "#F3CD4B", onPrimary: "#3A2E00", primaryText: "#7C5E00", radius: R, font: "'Heebo',sans-serif",    thumb: "#FCF1C6", border: "1px solid #EEDFA6", shadow: SOFT },
  melon:   { label: "אבטיח",  bg: "#FFF3F0", surface: "#FFFFFF", ink: "#3A1B18", primary: "#C9403A", onPrimary: "#FFFFFF", primaryText: "#B8352F", radius: R, font: "'Heebo',sans-serif",     thumb: "#E4F1DE", border: "1px solid #F1D2CC", shadow: SOFT },
  galaxy:  { label: "גלקסיה", bg: "#1D1F3D", surface: "#282B52", ink: "#F3F0FA", primary: "#F4B8DA", onPrimary: "#1D1F3D", primaryText: "#F4B8DA", radius: R, font: "'Heebo',sans-serif",     thumb: "#33376A", border: "1px solid #3E4278", shadow: "none" },
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
    "--s-primary-text": t.primaryText,
    "--s-radius": t.radius,
    "--s-font": t.font,
    "--s-thumb": t.thumb,
    "--s-border": t.border,
    "--s-shadow": t.shadow,
  };
}
