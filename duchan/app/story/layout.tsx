import type { Metadata } from "next";

/* אתר השיווק של דוכן — בניגוד לדוכנים עצמם, כאן כן רוצים שימצאו אותנו */
export const metadata: Metadata = {
  title: "דוכן · העסק הראשון מתחיל בדוכן",
  description: "ילדים פותחים חנות אונליין קטנה מהטלפון, מוכרים לחברים ולומדים כסף אמיתי. בטוח, פשוט, ובלי כתובת אף פעם.",
  openGraph: {
    title: "דוכן · העסק הראשון מתחיל בדוכן",
    description: "לכל אחד יש טונות של צעצועים. מה עושים עם זה? עסק!",
    locale: "he_IL",
    type: "website",
  },
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
