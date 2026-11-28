import type { Metadata } from "next";
import MarketInvite from "./market-invite";

export const metadata: Metadata = {
  title: "דוכן — השוק של העיר",
  description: "מזמינים אתכם לפתוח דוכן בשוק של העיר",
  robots: { index: false, follow: false },
};

/**
 * /market?c=…&from=… — הזמנה של חבר לשוק של העיר (0077).
 *
 * הדף ציבורי, ולכן לא מראה אילו דוכנים יש בשוק ולא מי הזמין. מי שמחזיק את
 * הלינק רק מקבל הזמנה לפתוח דוכן. ההזמנה נשמרת במכשיר, ובמסך השוק (אחרי
 * כניסה) העיר נבחרת מראש. גם אז ההורים מאשרים.
 */
export default function MarketInvitePage() {
  return <MarketInvite />;
}
