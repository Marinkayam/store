import type { Metadata } from "next";
import HoodInvite from "./hood-invite";

export const metadata: Metadata = {
  title: "דוכן — השוק של השכונה",
  description: "מזמינים אתכם לפתוח דוכן בשוק של השכונה",
  robots: { index: false, follow: false },
};

/**
 * /hood?h=…&from=… — הזמנה של שכן לשוק של השכונה (0077).
 *
 * הדף ציבורי, ולכן לא מראה כלום על השכונה: לא שם, לא עיר ולא אילו דוכנים
 * יש בה. מי שמחזיק את הלינק רק מקבל הזמנה לפתוח דוכן. ההזמנה נשמרת במכשיר,
 * ובמסך השוק (אחרי כניסה) השכונה נבחרת מראש. גם אז ההורים מאשרים.
 */
export default function HoodInvitePage() {
  return <HoodInvite />;
}
