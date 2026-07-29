/**
 * מקור אחד לאימות טלפון בבדיקות. המימוש יושב ב-e2e/helpers/sms.mjs,
 * וכאן רק מפנים אליו — שני עותקים של אותו קוד הם שתי הזדמנויות להתפצל.
 */
export { verifyPhone, closeHelper } from "../../../e2e/helpers/sms.mjs";
