import { BADGES, type BadgeKey } from "./kupa";
import { FALLBACK, lessonFor, type Sample } from "./kupa-lessons";
import { allRiddles } from "./riddles";

/**
 * בדיקת חידה בשרת: האם המזהה קיים, ואם נשלחה תשובה — האם היא נכונה.
 *
 * חידות "שלי" משתמשות במוצר של הדוכן. אם המחיר השתנה בין הרגע שהחידה
 * נפתחה לרגע שנפתרה, התשובה הנכונה זזה — לכן מקבלים תשובה שנכונה לפי
 * המוצר הנוכחי או לפי מוצר ברירת המחדל.
 */
export function riddleIds(sample: Sample): Set<string> {
  return new Set([...BADGES.map((b) => b.key as string), ...allRiddles(sample).map((r) => r.id)]);
}

export function answerOf(id: string, sample: Sample): string | null {
  if (BADGES.some((b) => b.key === id)) return lessonFor(id as BadgeKey, sample).answer;
  return allRiddles(sample).find((r) => r.id === id)?.answer ?? null;
}

export function isRight(id: string, answer: string, sample: Sample): boolean {
  return [sample, FALLBACK].some((s) => answerOf(id, s) === answer);
}
