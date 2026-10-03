import type { Metadata } from "next";
import { CONTACT_EMAIL, contactWhatsappUrl } from "@/lib/site";

export const metadata: Metadata = { title: "הצהרת נגישות · דוכן" };

// עמוד סטטי. עדכון אחרון מופיע למטה — לעדכן בכל שינוי מהותי בנגישות האתר.

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 py-10 text-[15px] leading-7 text-[var(--ink)]">
        <a href="/" className="text-xs text-[var(--muted)] underline">← חזרה לדוכן</a>
        <h1 className="text-2xl font-bold mt-4 mb-1">הצהרת נגישות</h1>
        <p className="text-xs text-[var(--muted)] mb-8">גרסה 1.1 · עודכן באוקטובר 2026</p>

        <Section title="המחויבות שלנו">
          אנחנו רואים חשיבות בהנגשת דוכן לכל המשתמשות והמשתמשים, כולל אנשים
          עם מוגבלות, ופועלים לעמידה בתקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), תשע"ג-2013, ובתקן הישראלי 5568 (המבוסס על
          הנחיות WCAG 2.0 ברמה AA).
        </Section>

        <Section title="♿ תפריט נגישות">
          בכל עמוד באתר יש כפתור ♿ בצד המסך. אפשר לבחור בו: אותיות גדולות
          (גדול / ענק), צבעים חזקים (שחור-לבן ברור), בלי תנועה (עוצר
          אנימציות), סימון קישורים, ואותיות פשוטות. הבחירה נשמרת בטלפון, וחלה
          בכל האתר — גם בדוכנים עצמם.
        </Section>

        <Section title="מה נעשה כדי להנגיש את האתר">
          ניווט מלא במקלדת עם מסגרת מיקוד בולטת · קישור &quot;דילוג לתוכן&quot; בתחילת כל
          עמוד · תמיכה בקוראי מסך: תוויות לכל שדה וכפתור, חלונות וגיליונות
          מזוהים, וכפתור ✕ לסגירה בכל אחד · תיאורי טקסט לתמונות ולסמלים בעלי
          משמעות · ניגודיות צבעים לפי AA · אזורי לחיצה של 44 פיקסלים לפחות ·
          כיבוד הגדרת &quot;פחות תנועה&quot; של הטלפון · האתר מותאם לעברית ולכיווניות
          RTL, ולמסכי טלפון כולל אייפון עם פס בית. כל עדכון נבדק אוטומטית
          (axe, WCAG 2.1 AA) בכל העמודים המרכזיים.
        </Section>

        <Section title="מגבלות ידועות">
          חלק מהתכנים בשירות מועלים על ידי המשתמשות עצמן (תמונות מוצרים,
          סרטונים קצרים) ואינם עוברים בדיקת נגישות מרכזית. לדוגמה, וידאו
          שמעלים בעלי דוכן אינו כולל כתוביות. שינוי מיקום תמונה בעורך המוצר
          נעשה כרגע בגרירה בלבד, ללא חלופה מקלדתית. אנחנו עובדים על צמצום
          המגבלות האלה בהדרגה.
        </Section>

        <Section title="רכזת הנגישות">
          מרינה, מנהלת דוכן · <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
        </Section>

        <Section title="נתקלתם בבעיית נגישות?">
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
