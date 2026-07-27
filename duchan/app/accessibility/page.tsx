import type { Metadata } from "next";
import { contactWhatsappUrl } from "@/lib/site";

export const metadata: Metadata = { title: "הצהרת נגישות · דוכן" };

// עמוד סטטי. עדכון אחרון מופיע למטה — לעדכן בכל שינוי מהותי בנגישות האתר.

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 py-10 text-[15px] leading-7 text-[var(--ink)]">
        <a href="/" className="text-xs text-[var(--muted)] underline">← חזרה לדוכן</a>
        <h1 className="text-2xl font-bold mt-4 mb-1">הצהרת נגישות</h1>
        <p className="text-xs text-[var(--muted)] mb-8">גרסה 1.0</p>

        <Section title="המחויבות שלנו">
          אנחנו רואים חשיבות בהנגשת דוכן לכל המשתמשות והמשתמשים, כולל אנשים
          עם מוגבלות, ופועלים לעמידה בתקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), תשע"ג-2013, ובתקן הישראלי 5568 (המבוסס על
          הנחיות WCAG 2.0 ברמה AA).
        </Section>

        <Section title="מה נעשה כדי להנגיש את האתר">
          תמיכה בקריאת מסך וניווט מקלדת בטפסים ובכפתורים המרכזיים · תיאורי
          טקסט חלופיים לתמונות מוצרים ולסמלים בעלי משמעות · ניגודיות צבעים
          נבדקת לטקסט מרכזי · מבנה עמודים סמנטי עם כותרות מדורגות ואזורי
          תוכן מזוהים · תמיכה בהגדלת טקסט של הדפדפן בלי שבירת עיצוב · האתר
          מותאם לעברית ולכיווניות RTL באופן מלא.
        </Section>

        <Section title="מגבלות ידועות">
          חלק מהתכנים בשירות מועלים על ידי המשתמשות עצמן (תמונות מוצרים,
          סרטונים קצרים) ואינם עוברים בדיקת נגישות מרכזית — לדוגמה, וידאו
          שמעלה בעלת חנות אינו כולל כתוביות. שינוי מיקום תמונה בעורך המוצר
          נעשה כרגע בגרירה בלבד, ללא חלופה מקלדתית. אנחנו עובדים על צמצום
          המגבלות האלה בהדרגה.
        </Section>

        <Section title="נתקלת בבעיית נגישות?">
          נשמח לדעת ולתקן. אפשר לפנות אלינו ב
          <a
            href={contactWhatsappUrl("היי! נתקלתי בבעיית נגישות באתר של דוכן.")}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            וואטסאפ
          </a>{" "}
          ולפרט את הבעיה ואת העמוד שבו נתקלת. נחזור בהקדם האפשרי.
        </Section>

        <Section title="עדכון ההצהרה">
          הצהרה זו נבדקת ומעודכנת מעת לעת, בהתאם לשינויים באתר.
        </Section>

        <p className="text-xs text-[var(--muted)] mt-8">
          ראו גם: <a href="/terms" className="underline">תנאי השימוש</a>
          {" · "}
          <a href="/privacy" className="underline">מדיניות הפרטיות</a>
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-bold mb-1.5">{title}</h2>
      <p className="text-[14px] text-[var(--muted)]">{children}</p>
    </section>
  );
}
