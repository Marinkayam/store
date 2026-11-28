/**
 * רעיונות למה למכור, לפי העונה.
 *
 * מרינה, 11.2026: "תתחיל הכל" (הצעות לשיפור, סעיפים 4 ו-10). בנתונים:
 * 31 דוכנים בלי אף מוצר. מסך ריק עם "להוסיף מוצר" לא עוזר למי שלא יודע
 * מה למכור. אז בצעד "מוצר ראשון" יש רעיונות, והעונתיים קודם: לפני חג
 * מוכרים דברים לחג.
 *
 * הכול ברבים, בלי אימוג'י. מילים קצרות, שנכנסות בצ'יפ אחד.
 */

export type SellIdeas = { season: string | null; seasonal: string[]; always: string[] };

const ALWAYS = [
  "סקווישים",
  "צמידים",
  "ציורים ויצירות",
  "ספרים שכבר קראתם",
  "צעצועים שכבר לא משחקים בהם",
  "מחזיקי מפתחות",
  "סלים",
  "עוגיות",
];

/** הנר הראשון של חנוכה. אותה רשימה כמו ב-app/hanukkah.tsx */
const HANUKKAH = ["2026-12-04", "2027-12-24", "2028-12-12", "2029-12-01", "2030-12-20"];

type Season = { name: string; ideas: string[]; from: string; to: string };

/** חודש-יום, בלי שנה. תאריכים עבריים זזים, אז החלונות רחבים. */
const SEASONS: Season[] = [
  { name: "לט״ו בשבט", ideas: ["שתילים קטנים", "שקיות פירות יבשים", "עציצים מקושטים"], from: "01-10", to: "02-15" },
  { name: "לפורים", ideas: ["מסכות", "משלוחי מנות", "אביזרים לתחפושת", "כתרים"], from: "02-15", to: "03-25" },
  { name: "לפני פסח", ideas: ["מה שמצאתם בניקיון של הארון", "משחקים שכבר לא משחקים בהם", "בגדים שקטנים עליכם"], from: "03-20", to: "04-20" },
  { name: "לסוף השנה", ideas: ["מתנות למורים", "צמידי חברות", "כרטיסי ברכה"], from: "05-25", to: "06-30" },
  { name: "לקיץ", ideas: ["משחקים לחופש", "צמידי חברות", "ספרים לחופש"], from: "07-01", to: "08-15" },
  { name: "לחזרה לבית הספר", ideas: ["קלמרים מעוצבים", "מחקים ריחניים", "מדבקות למחברות"], from: "08-15", to: "09-05" },
  { name: "לראש השנה", ideas: ["כרטיסי ברכה", "צנצנות דבש מקושטות", "קישוטים לשולחן"], from: "09-05", to: "10-05" },
];

const HANUKKAH_IDEAS = ["סביבונים מצוירים", "כרטיסי ברכה לחנוכה", "קישוטים בכחול-לבן", "עוגיות חנוכה"];

const israelDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

export function sellIdeas(now: Date = new Date()): SellIdeas {
  const day = israelDay(now);
  const t = Date.parse(day + "T00:00:00Z");
  // חנוכה: שבועיים לפני הנר הראשון ועד הלילה השמיני
  for (const f of HANUKKAH) {
    const d = (t - Date.parse(f + "T00:00:00Z")) / 864e5;
    if (d >= -14 && d <= 7) return { season: "לחנוכה", seasonal: HANUKKAH_IDEAS, always: ALWAYS };
  }
  const md = day.slice(5);
  const s = SEASONS.find((x) => md >= x.from && md < x.to);
  return s ? { season: s.name, seasonal: s.ideas, always: ALWAYS } : { season: null, seasonal: [], always: ALWAYS };
}

/** רעיונות לחג מסוים, לספלאש של החג (app/holiday-splash.tsx) */
export function holidayIdeas(key: "hanukkah" | "tubishvat" | "purim" | "pesach" | "atzmaut" | "roshhashana"): string[] {
  const by: Record<string, string[]> = {
    hanukkah: HANUKKAH_IDEAS,
    tubishvat: SEASONS[0].ideas,
    purim: SEASONS[1].ideas,
    pesach: SEASONS[2].ideas,
    atzmaut: ["דגלים מקושטים", "צמידים בכחול-לבן", "קישוטים לחג"],
    roshhashana: SEASONS[6].ideas,
  };
  return by[key] ?? [];
}
