"use client";

/**
 * החלקים של מסך האוסף: סיכום, מה יש בפנים, מבוקשים, תגים, והאהוב.
 *
 * הופרדו מהמסך עצמו כדי שגם הגלריה שחברה רואה תוכל להציג את אותם
 * חלקים בדיוק — האוסף צריך להיראות אותו דבר משני הצדדים.
 */

import { typeLabel, type SquishyType, type Wish } from "@/lib/squish";
import type { Badge } from "@/lib/squish-badges";
import { SwapGlyph } from "./components";

/** ארבעה מספרים אמיתיים. לא אנליטיקס — התקדמות של אוסף. */
export function CollectionSummary({
  s,
}: {
  s: { total: number; open: number; types: number; thisMonth: number; withVideo: number };
}) {
  const tokens = [
    { n: s.total, label: "סקווישים" },
    { n: s.open, label: "פתוחים לטרייד" },
    { n: s.types, label: "סוגים" },
    { n: s.thisMonth, label: "נוספו החודש" },
  ];
  /* בלי קופסאות: ארבע קופסאות ממוסגרות תפסו רצועה שלמה בראש המסך
     בשביל ארבעה מספרים. המספר עצמו הוא הבולט — גדול ושמן — והתווית
     קטנה מתחתיו. קו מפריד דק במקום מסגרות. */
  return (
    <div className="grid grid-cols-4 divide-x divide-x-reverse divide-[var(--line)]">
      {tokens.map((t) => (
        <div key={t.label} className="text-center px-1">
          <div className="text-[20px] font-bold leading-none tracking-tight">{t.n}</div>
          <div className="text-[10.5px] text-[var(--muted)] leading-tight mt-1">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

/** "מה יש באוסף שלי" — צ'יפים לפי סוג, ולחיצה מסננת את המדף. */
export function Breakdown({
  types,
  active,
  onPick,
}: {
  types: { key: SquishyType; label: string; n: number }[];
  active?: SquishyType | null;
  onPick?: (t: SquishyType | null) => void;
}) {
  if (!types.length) return null;
  return (
    <section>
      <div className="t-label mb-1.5">מה יש באוסף שלי</div>
      <div className="flex gap-2 flex-wrap">
        {types.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onPick?.(on ? null : t.key)}
              aria-pressed={on}
              className={`flex items-center gap-2 px-2.5 py-2 border-[1.5px] rounded-full ${
                on ? "border-[var(--ink)] bg-white" : "border-[var(--line)] bg-white/70"
              }`}
            >
              <span className="text-[15px] font-bold">{t.n}</span>
              <span className="text-[12.5px]">{t.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-[var(--muted)] mt-1.5">
        לחיצה על סוג מסננת את המדף.
      </p>
    </section>
  );
}

/** סדרות שהילדה הגדירה. בלי "מתוך" — אין קטלוג אמיתי. */
export function SeriesRow({ series }: { series: { name: string; n: number }[] }) {
  if (!series.length) return null;
  return (
    <section>
      <div className="t-label mb-1.5">סדרות</div>
      <div className="flex gap-2 flex-wrap">
        {series.map((s) => (
          <span key={s.name} className="bg-white border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] rounded-full">
            {s.name} · <b>{s.n}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

/** "אני מחפשת" — כל שורה נראית כמו אסימון אוסף, לא כמו תבליט. */
export function WishlistRow({ wishes }: { wishes: Wish[] }) {
  if (!wishes.length) return null;
  return (
    <section>
      <div className="t-label mb-1.5">אני מחפשת</div>
      <div className="flex gap-2 flex-wrap">
        {wishes.map((w) => (
          <span
            key={w.id}
            className="flex items-center gap-1.5 bg-[var(--cream)] border-[1.5px] border-[var(--lavender)] px-2.5 py-1.5 text-[12.5px] rounded-full"
          >
            <SwapGlyph size={12} />
            {/* התיאור שלה מוביל, והסוג והצבע אחריו — אותו סדר שבו היא
                הקלידה אותם. "צפרדע גדולה · ורוד · נידו" נקרא כמו בקשה;
                "נידו · ורוד · צפרדע גדולה" נקרא כמו שדות בטופס. */}
            {[w.description, w.color, w.squishy_type ? typeLabel(w.squishy_type) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ))}
      </div>
    </section>
  );
}

/** "התגים שלי" — מה שהושג, ואחד שאפשר להשיג עכשיו. */
export function Badges({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned);
  const next = badges.filter((b) => !b.earned && !b.locked).sort((a, b) => b.have / b.need - a.have / a.need)[0];
  if (!earned.length && !next) return null;
  return (
    <section>
      <div className="t-label mb-1.5">התגים שלי</div>
      <div className="flex gap-2 flex-wrap">
        {earned.map((b) => (
          <span
            key={b.key}
            title={b.hint}
            className="flex items-center gap-1.5 bg-[var(--ok-bg)] border border-[var(--ok-line)] text-[var(--ok-ink)] px-2.5 py-1.5 text-[12.5px] font-medium rounded-full"
          >
            ✓ {b.label}
          </span>
        ))}
      </div>
      {next && (
        <div className="mt-2 bg-white p-2.5 rounded-[var(--r)]">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-[var(--muted)]">התג הבא: <b className="text-[var(--ink)]">{next.label}</b></span>
            <span className="text-[var(--muted)]">{next.have}/{next.need}</span>
          </div>
          <div className="h-1.5 bg-[var(--sand)] mt-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--lavender)]" style={{ width: `${(next.have / next.need) * 100}%` }} />
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1">{next.hint}</div>
        </div>
      )}
    </section>
  );
}
