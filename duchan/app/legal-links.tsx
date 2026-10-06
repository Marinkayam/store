/**
 * קישורי החובה — תנאי שימוש, פרטיות, נגישות. מרינה, 10.2026: "תנאי שימוש
 * והכל תמיד מודבק למטה". במסך שהוא עמודה גבוהה כמסך (min-h-screen flex flex-col)
 * mt-auto דוחף אותם לתחתית גם כשהתוכן קצר, ובמסך ארוך הם פשוט אחרי התוכן.
 * מקום אחד, כדי שהם לא יזוזו ממסך למסך ולא יקבלו ניסוחים שונים.
 */
export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`mt-auto pt-6 pb-5 text-center text-[12px] text-[var(--muted)] ${className}`} data-testid="legal-links">
      <a href="/terms" className="underline">תנאי שימוש</a>
      {" · "}
      <a href="/privacy" className="underline">מדיניות פרטיות</a>
      {" · "}
      <a href="/accessibility" className="underline">נגישות</a>
    </p>
  );
}
