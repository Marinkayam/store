/**
 * סגנון ורקע לדוכן (מיגרציה 0050).
 *
 * הערכה (themes.ts) קובעת את הצבעים. הסגנון קובע את הצורה — פינות, קו,
 * צל וגופן — והרקע קובע מה יושב מאחורי המוצרים. שלושתם עצמאיים, כך
 * שכל ילדה יכולה לשלב "לבנדר + עגלגל + לבבות" ולקבל דוכן משלה.
 *
 * null בכל אחד מהם = הבסיס, בדיוק כמו שהדוכן נראה עד היום. מפתח לא מוכר
 * נופל לבסיס. אסור למחוק מפתח — חנות ששמרה אותו תחזור לבסיס בשקט.
 */
import type { Theme } from "./themes";

export type LookKey = "soft" | "round" | "pop" | "elegant";

export interface Look {
  label: string;
  /** שורה קצרה מתחת לשם באריח הבחירה */
  hint: string;
  radius: string;
  font: string;
  /** גופן שצריך לטעון מ-Google Fonts. null = Heebo שכבר טעון באתר. */
  fontFamily: string | null;
  border: (t: Theme) => string;
  shadow: (t: Theme) => string;
}

const BASE: Look = {
  label: "בסיס",
  hint: "נקי וישר",
  radius: "0px",
  font: "'Heebo',sans-serif",
  fontFamily: null,
  border: (t) => t.border,
  shadow: (t) => t.shadow,
};

export const LOOKS: Record<LookKey, Look> = {
  soft: {
    label: "רך",
    hint: "פינות עגולות וצל עדין",
    radius: "14px",
    font: "'Heebo',sans-serif",
    fontFamily: null,
    border: () => "1px solid transparent",
    shadow: () => "0 2px 12px rgba(0,0,0,0.07)",
  },
  round: {
    label: "עגלגל",
    hint: "בועות וגופן עגול",
    radius: "22px",
    font: "'Varela Round','Heebo',sans-serif",
    fontFamily: "Varela+Round",
    border: (t) => `2px solid ${t.primary}`,
    shadow: () => "none",
  },
  pop: {
    label: "פופ",
    hint: "קו עבה וצל חד",
    radius: "10px",
    font: "'Rubik','Heebo',sans-serif",
    fontFamily: "Rubik:wght@400;500;700",
    border: (t) => `2px solid ${t.ink}`,
    shadow: (t) => `3px 3px 0 ${t.ink}`,
  },
  elegant: {
    label: "אלגנט",
    hint: "גופן קלאסי וקו דק",
    radius: "0px",
    font: "'Frank Ruhl Libre','Heebo',serif",
    fontFamily: "Frank+Ruhl+Libre:wght@400;500;700",
    border: (t) => `1px solid ${t.ink}33`,
    shadow: () => "none",
  },
};

export const LOOK_KEYS = Object.keys(LOOKS) as LookKey[];

export function lookOrBase(key: string | null | undefined): Look {
  return (key && LOOKS[key as LookKey]) || BASE;
}

export function isLookKey(key: unknown): key is LookKey {
  return typeof key === "string" && key in LOOKS;
}

/** הגופנים של כל הסגנונות, לתצוגה המקדימה בהגדרות. */
export const ALL_LOOK_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  LOOK_KEYS.map((k) => LOOKS[k].fontFamily).filter(Boolean).map((f) => `family=${f}`).join("&") +
  "&display=swap";

/** הגופן של סגנון אחד, לדף החנות. null = אין מה לטעון. */
export function lookFontHref(key: string | null | undefined): string | null {
  const f = lookOrBase(key).fontFamily;
  return f ? `https://fonts.googleapis.com/css2?family=${f}&display=swap` : null;
}

/** משתני ה-CSS שהסגנון דורס מעל הערכה. */
export function lookCssVars(t: Theme, key: string | null | undefined): Record<string, string> {
  const l = lookOrBase(key);
  return {
    "--s-radius": l.radius,
    "--s-font": l.font,
    "--s-border": l.border(t),
    "--s-shadow": l.shadow(t),
  };
}

// ── רקעים ──
//
// דוגמאות ב-SVG מוטמע, בצבע הראשי של הערכה על הרקע שלה — כך שהחלפת ערכה
// צובעת גם את הרקע, ואין קבצים לטעון. השקיפות נמוכה בכוונה: הרקע הוא
// אווירה, והמוצרים הם מה שצריך לבלוט.

export type PatternKey = "dots" | "hearts" | "stars" | "stripes" | "checks" | "flowers" | "waves" | "confetti";

export interface Pattern {
  label: string;
  /** ה-SVG, עם COLOR במקום הצבע */
  svg: string;
  size: number;
}

const enc = (s: string) =>
  s.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23").replace(/"/g, "'");

export const PATTERNS: Record<PatternKey, Pattern> = {
  dots: {
    label: "נקודות",
    size: 24,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="6" cy="6" r="2.6" fill="COLOR"/><circle cx="18" cy="18" r="2.6" fill="COLOR"/></svg>`,
  },
  hearts: {
    label: "לבבות",
    size: 44,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><path d="M11 17c-3-2.4-6-4.6-6-7.6C5 7.5 6.5 6 8.3 6c1.2 0 2.1.6 2.7 1.5C11.6 6.6 12.5 6 13.7 6 15.5 6 17 7.5 17 9.4c0 3-3 5.2-6 7.6z" fill="COLOR"/><path d="M33 39c-2.4-1.9-4.8-3.7-4.8-6.1 0-1.5 1.2-2.7 2.6-2.7 1 0 1.7.5 2.2 1.2.5-.7 1.2-1.2 2.2-1.2 1.4 0 2.6 1.2 2.6 2.7 0 2.4-2.4 4.2-4.8 6.1z" fill="COLOR"/></svg>`,
  },
  stars: {
    label: "כוכבים",
    size: 48,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path d="M12 4l2.3 5.2 5.7.5-4.3 3.8 1.3 5.5L12 16.1 7 19l1.3-5.5L4 9.7l5.7-.5z" fill="COLOR"/><path d="M36 28l1.5 3.4 3.7.3-2.8 2.5.8 3.6L36 36l-3.2 1.8.8-3.6-2.8-2.5 3.7-.3z" fill="COLOR"/><circle cx="38" cy="10" r="1.6" fill="COLOR"/><circle cx="10" cy="38" r="1.6" fill="COLOR"/></svg>`,
  },
  stripes: {
    label: "פסים",
    size: 28,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M-7 7l14-14M0 28L28 0M21 35l14-14" stroke="COLOR" stroke-width="6"/></svg>`,
  },
  checks: {
    label: "משבצות",
    size: 32,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="16" height="32" fill="COLOR"/><rect width="32" height="16" fill="COLOR"/></svg>`,
  },
  flowers: {
    label: "פרחים",
    size: 52,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><g fill="COLOR"><circle cx="13" cy="8" r="3.4"/><circle cx="18" cy="13" r="3.4"/><circle cx="13" cy="18" r="3.4"/><circle cx="8" cy="13" r="3.4"/></g><circle cx="13" cy="13" r="2.2" fill="BG"/><g fill="COLOR"><circle cx="39" cy="35" r="2.6"/><circle cx="43" cy="39" r="2.6"/><circle cx="39" cy="43" r="2.6"/><circle cx="35" cy="39" r="2.6"/></g><circle cx="39" cy="39" r="1.6" fill="BG"/></svg>`,
  },
  waves: {
    label: "גלים",
    size: 40,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><path d="M0 10c5 0 5-6 10-6s5 6 10 6 5-6 10-6 5 6 10 6" fill="none" stroke="COLOR" stroke-width="2.4"/></svg>`,
  },
  confetti: {
    label: "קונפטי",
    size: 56,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><g fill="COLOR"><rect x="6" y="8" width="8" height="3" rx="1.5" transform="rotate(30 10 9.5)"/><rect x="36" y="6" width="8" height="3" rx="1.5" transform="rotate(-25 40 7.5)"/><circle cx="26" cy="24" r="2.2"/><rect x="10" y="40" width="8" height="3" rx="1.5" transform="rotate(-40 14 41.5)"/><rect x="40" y="38" width="8" height="3" rx="1.5" transform="rotate(50 44 39.5)"/><circle cx="48" cy="24" r="1.8"/><circle cx="4" cy="28" r="1.8"/></g></svg>`,
  },
};

export const PATTERN_KEYS = Object.keys(PATTERNS) as PatternKey[];

export function isPatternKey(key: unknown): key is PatternKey {
  return typeof key === "string" && key in PATTERNS;
}

/** hex (#RRGGBB) + שקיפות → rgba. צבע שאינו hex חוזר כמו שהוא. */
function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** צבע הדוגמה: הראשי של הערכה, שקוף — אווירה ולא רעש. */
function patternColor(t: Theme): string {
  return withAlpha(t.primary, 0.22);
}

export function patternCss(key: PatternKey, t: Theme): string {
  const p = PATTERNS[key];
  const svg = enc(p.svg.replace(/COLOR/g, patternColor(t)).replace(/BG/g, t.bg));
  const h = key === "waves" ? p.size / 2 : p.size;
  return `url("data:image/svg+xml,${svg}") 0 0/${p.size}px ${h}px, ${t.bg}`;
}

/**
 * הרקע של כל הדף.
 * photo עם תמונה → התמונה מתחת לשכבת צבע של הערכה, כדי שהשם והתיאור
 * שיושבים ישירות על הרקע יישארו קריאים גם על תמונה צבעונית.
 */
export function storeBackground(
  t: Theme,
  pattern: string | null | undefined,
  photoUrl: string | null | undefined
): string {
  if (pattern === "photo" && photoUrl) {
    const veil = withAlpha(t.bg, 0.72);
    return `linear-gradient(${veil}, ${veil}), url("${photoUrl}") center/cover fixed, ${t.bg}`;
  }
  if (isPatternKey(pattern)) return patternCss(pattern, t);
  return t.bg;
}
