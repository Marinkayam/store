import { contactWhatsappUrl, CONTACT_EMAIL } from "@/lib/site";

/**
 * רכיבים משותפים לשלושת המסמכים המשפטיים: תנאי שימוש, מדיניות פרטיות
 * והצהרת נגישות. מבנה אחד — כותרת, גרסה ותאריך תחילה, תקציר בשפה פשוטה,
 * סעיפים ממוספרים ותתי-סעיפים — כדי שהשלושה ייראו ויתנהגו אותו דבר.
 *
 * מרינה, 11.2026: "שיהיה כאילו נכתב על ידי עורך דין". הנוסח פורמלי, אבל
 * התקציר למעלה נשאר בשפה שילד/ה מבינים, כי הם הקוראים העיקריים.
 */

export function LegalDoc({
  title,
  version,
  effective,
  summary,
  children,
  related,
}: {
  title: string;
  version: string;
  effective: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
  related: { href: string; label: string }[];
}) {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-gutter py-10 text-[15px] leading-7 text-[var(--ink)]">
        <a href="/" className="text-xs text-[var(--muted)] underline">→ לדף הבית</a>
        <h1 className="text-2xl font-bold mt-4 mb-1">{title}</h1>
        <p className="text-xs text-[var(--muted)] mb-6">
          גרסה {version} · בתוקף מיום {effective}
        </p>

        {summary && (
          <aside className="border border-[var(--line)] bg-[var(--canvas)] px-4 py-3 mb-8" aria-labelledby="legal-summary">
            <h2 id="legal-summary" className="font-bold text-[14px] mb-1">בקצרה, בשפה פשוטה</h2>
            <div className="text-[13.5px] leading-6 text-[var(--ink)]">{summary}</div>
            <p className="text-[11.5px] text-[var(--muted)] mt-2">
              התקציר נועד להקל על הקריאה בלבד. במקרה של סתירה, הנוסח המלא שלהלן הוא הקובע.
            </p>
          </aside>
        )}

        <ol className="list-none p-0 m-0">{children}</ol>

        <p className="text-xs text-[var(--muted)] mt-8">
          ראו גם:{" "}
          {related.map((r, i) => (
            <span key={r.href}>
              {i > 0 && " · "}
              <a href={r.href} className="underline">{r.label}</a>
            </span>
          ))}
        </p>
      </div>
    </main>
  );
}

/** סעיף ראשי ממוספר. הילדים הם תתי-סעיפים (Sub) או פסקה רגילה. */
export function Clause({ n, title, id, children }: { n: number; title: string; id?: string; children: React.ReactNode }) {
  return (
    <li className="mb-7 scroll-mt-6" id={id}>
      <h2 className="font-bold mb-2">
        {n}. {title}
      </h2>
      <ol className="list-none p-0 m-0 flex flex-col gap-2 text-[14px] leading-6 text-[var(--muted)]">{children}</ol>
    </li>
  );
}

/** תת-סעיף: "3.2 ..." */
export function Sub({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 tabular-nums text-[var(--ink)]" dir="ltr">{n}</span>
      <div className="flex-1">{children}</div>
    </li>
  );
}

/** הגדרה: מונח מודגש ואחריו פירושו */
export function Term({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <>
      <b className="text-[var(--ink)]">&quot;{t}&quot;</b> – {children}
    </>
  );
}

/** פרטי הקשר — מקום אחד לשלושת המסמכים */
export function ContactLines({ topic }: { topic: string }) {
  return (
    <>
      בוואטסאפ:{" "}
      <a href={contactWhatsappUrl(`היי! יש לי פנייה בנושא ${topic} בדוכן.`)} target="_blank" rel="noreferrer" className="underline">
        שליחת הודעה
      </a>{" "}
      · בדוא&quot;ל:{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
        <bdi>{CONTACT_EMAIL}</bdi>
      </a>
    </>
  );
}
