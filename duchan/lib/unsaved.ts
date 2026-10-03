/**
 * "יש שינויים שלא נשמרו" — דגל אחד שמסך "החנות שלי" מדליק, ושורת הניווט
 * בתחתית בודקת לפני שהיא עוברת לשונית. בלי זה, ילדה ששינתה את השם ולחצה
 * "מוצרים" איבדה את השינוי בלי לדעת.
 */
let unsaved = false;
export const setUnsaved = (v: boolean) => {
  unsaved = v;
};
export const hasUnsaved = () => unsaved;
export const UNSAVED_PROMPT = "יש שינויים שלא נשמרו. לצאת בלי לשמור?";
