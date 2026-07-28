/**
 * הודעות שגיאה בעברית, במקום אחד.
 *
 * כל הכללים של סקוויש קלאב נאכפים בפונקציות בדאטהבייס, ולכן מה שחוזר
 * ללקוח הוא הטקסט של `raise exception` — באנגלית, ולפעמים עם קידומת של
 * Postgres. ילדה בת עשר לא אמורה לראות "duplicate proposal".
 *
 * ברירת המחדל מכוונת: הודעה שלא מוכרת לנו לא מוצגת כמו שהיא, כי היא
 * עלולה לחשוף מבנה פנימי.
 */

const MESSAGES: [RegExp, string][] = [
  [/blocked/, "אי אפשר לפעול מול האספנית הזו."],
  [/account suspended/, "החשבון מושהה כרגע. אפשר לכתוב למרינה."],
  [/too many proposals/, "שלחת הרבה הצעות בזמן קצר. אפשר לנסות שוב בעוד שעה."],
  [/too many invites/, "יצרת הרבה קישורי הזמנה. אפשר ליצור עוד בעוד שעה."],
  [/duplicate proposal/, "כבר שלחת הצעה על הסקווישי הזה, והיא עדיין פתוחה."],
  [/recently declined/, "ההצעה על הסקווישי הזה נדחתה. אפשר לנסות שוב מחר."],
  [/item unavailable/, "אחד הסקווישים כבר לא זמין לטרייד. אפשר לעדכן את ההצעה."],
  [/offered item unavailable/, "אחד הסקווישים שבחרת כבר לא זמין."],
  [/version changed/, "ההצעה השתנתה בינתיים, כדאי להסתכל שוב"],
  [/can only narrow the existing offer/, "אפשר רק להוריד פריטים מההצעה, לא להוסיף."],
  [/item not open for trade/, "הסקווישי הזה כבר לא פתוח לטרייד."],
  [/not in circle/, "האוסף הזה כבר לא במעגל שלך."],
  [/cannot trade with yourself/, "זה סקווישי שלך :)"],
  [/need three items/, "צריך שלושה סקווישים באוסף כדי להציע טרייד."],
  [/proposal is closed/, "הטרייד הזה כבר סגור."],
  [/not your proposal/, "הטרייד הזה לא שלך."],
  [/both sides must approve/, "צריך ששתיכן תאשרו לפני שהטרייד נשמר."],
  [/not signed in/, "צריך להתחבר קודם."],
];

export function squishError(raw: string | null | undefined): string {
  if (!raw) return "לא הצלחנו, לנסות שוב";
  for (const [re, msg] of MESSAGES) if (re.test(raw)) return msg;
  return "לא הצלחנו, לנסות שוב";
}
