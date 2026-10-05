import type { Metadata } from "next";

/* אתר השיווק של דוכן — בניגוד לדוכנים עצמם, כאן כן רוצים שימצאו אותנו */
export const metadata: Metadata = {
  title: "דוכן · העסק הראשון מתחיל בדוכן",
  description: "הסיפור של נועה: ממגירה מלאה בסקווישים לעסק הראשון. ילדים פותחים דוכן אונליין מהטלפון, מוכרים לחברים ולומדים כסף אמיתי — בטוח, ובלי כתובת אף פעם.",
  openGraph: {
    title: "דוכן · העסק הראשון מתחיל בדוכן",
    description: "לנועה יש מגירה מלאה בסקווישים. מה עושים עם זה? עסק!",
    locale: "he_IL",
    type: "website",
  },
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
