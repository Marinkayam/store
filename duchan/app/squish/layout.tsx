import type { Metadata } from "next";
import SquishNav from "./nav";

/**
 * סקוויש קלאב — מועדון הטרייד.
 *
 * אותה אפליקציה ואותו חשבון כמו דוכן, זהות ויזואלית משלו. הניווט התחתון
 * מחזיק ארבעה אזורים בלבד: האוסף · לגלות · טריידים · שלי. "שלי" הוא
 * אזור רחב (גלריה, חברות, קבוצות, קישורים, הגדרות) ולא עוד טאב, כדי
 * שלא יהיו שישה טאבים ראשיים.
 */
export const metadata: Metadata = {
  title: "סקוויש קלאב",
  description: "מועדון הסקווישים. אוסף אישי, וטריידים עם חברות.",
  // אוספים הם פרטיים. אין אינדוקס ואין מפת אתר.
  robots: { index: false, follow: false },
  manifest: "/squish-manifest.json",
  appleWebApp: { capable: true, title: "סקוויש קלאב", statusBarStyle: "default" },
  icons: { icon: "/squish-icon.svg", apple: "/squish-touch-icon.png" },
};

export default function SquishLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col max-w-md mx-auto">
      <div className="flex-1 pb-20">{children}</div>
      <SquishNav />
    </div>
  );
}
