"use client";

/**
 * החלקים של מסך האוסף: סיכום, מה יש בפנים, מבוקשים, תגים, והאהוב.
 *
 * הופרדו מהמסך עצמו כדי שגם הגלריה שחברה רואה תוכל להציג את אותם
 * חלקים בדיוק — האוסף צריך להיראות אותו דבר משני הצדדים.
 */

import { mediaUrl } from "@/lib/media";
import { typeLabel, type SquishItem, type SquishyType, type Wish } from "@/lib/squish";
import type { Badge } from "@/lib/squish-badges";
import { SquishOutline, SwapGlyph, TradeBadge } from "./components";

/** ארבעה מספרים אמיתיים. לא אנליטיקס — התקדמות של אוסף. */
export function CollectionSummary({
  s,
}: {
  s: { total: number; open: number; types: number; thisMonth: number; withVideo: number };
}) {
  const tokens = [
    { n: s.total, label: "סקווישים", icon: <SquishOutline size={18} /> },
    { n: s.open, label: "פתוחים לטרייד", icon: <SwapGlyph size={15} /> },
    { n: s.types, label: "סוגים באוסף", icon: <span className="text-[13px]">🗂️</span> },
    { n: s.thisMonth, label: "נוספו החודש", icon: <span className="text-[13px]">✨</span> },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {tokens.map((t) => (
        <div key={t.label} className="bg-white border border-[var(--line)] py-2.5 px-1 text-center">
          <div className="flex justify-center h-5 items-center">{t.icon}</div>
          <div className="text-[17px] font-bold leading-none mt-1">{t.n}</div>
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
              className={`flex items-center gap-2 px-2.5 py-2 border-[1.5px] ${
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
          <span key={s.name} className="bg-white border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]">
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
            className="flex items-center gap-1.5 bg-[var(--cream)] border-[1.5px] border-[var(--lavender)] px-2.5 py-1.5 text-[12.5px]"
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

/** הסקווישי האהוב, ככרטיס גדול בראש המדף. */
export function FavoriteCard({
  item,
  onOpen,
}: {
  item: SquishItem;
  onOpen?: () => void;
}) {
  const poster = mediaUrl(item.poster_key) ?? mediaUrl(item.image_key);
  const video = mediaUrl(item.video_key);
  return (
    <section>
      <div className="t-label mb-1.5">הסקווישי האהוב עליי</div>
      <button onClick={onOpen} className="squish-card block w-full text-start">
        <div className="relative aspect-[4/3] bg-[var(--cream)] flex items-center justify-center overflow-hidden">
          {video ? (
            <video src={video} poster={poster ?? undefined} muted loop playsInline className="w-full h-full object-cover" />
          ) : poster ? (
            <img src={poster} alt="" className="w-full h-full object-cover" />
          ) : (
            <SquishOutline size={72} />
          )}
          <span className="absolute top-2 start-2 flex items-center gap-1.5">
            <span
              className="w-7 h-7 bg-white text-[15px] flex items-center justify-center shadow-sm"
              style={{ borderRadius: "999px" }}
              aria-label="הסקווישי האהוב"
            >
              ⭐
            </span>
            <TradeBadge status={item.trade_status} />
          </span>
        </div>
        <div className="pt-2 px-0.5">
          <div className="t-heading">{item.name}</div>
          {item.wanted_description && (
            <div className="t-small text-[var(--muted)] mt-0.5">
              מחפשת בתמורה: {item.wanted_description}
            </div>
          )}
        </div>
      </button>
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
            className="flex items-center gap-1.5 bg-[var(--ok-bg)] border border-[var(--ok-line)] text-[var(--ok-ink)] px-2.5 py-1.5 text-[12.5px] font-medium"
          >
            ✓ {b.label}
          </span>
        ))}
      </div>
      {next && (
        <div className="mt-2 bg-white border border-[var(--line)] p-2.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-[var(--muted)]">התג הבא: <b className="text-[var(--ink)]">{next.label}</b></span>
            <span className="text-[var(--muted)]">{next.have}/{next.need}</span>
          </div>
          <div className="h-1.5 bg-[var(--sand)] mt-1.5">
            <div className="h-full bg-[var(--lavender)]" style={{ width: `${(next.have / next.need) * 100}%` }} />
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1">{next.hint}</div>
        </div>
      )}
    </section>
  );
}
