"use client";

import { useEffect, useState } from "react";
import { useStore } from "../use-store";
import { useKupa, readSolved, addSolved, type KupaData } from "./use-kupa";
import { KupaStall, Coin, Medal } from "@/app/kupa-art";
import Icon from "@/app/icons";
import CloseX from "@/app/close-x";
import { nextBadge, SALE_COINS, SALES_PER_DAY, type BadgeState } from "@/lib/kupa";
import { lessonFor } from "@/lib/kupa-lessons";

/**
 * קופת הדוכן — המסך המלא.
 *
 * מלמעלה למטה: הדוכן המצויר ברמה הנוכחית → כמה חסר לרמה הבאה → הצעד הבא
 * (אחד, עם כפתור שלוקח לשם) → אלבום האותות → איך מרוויחים → הערה להורים.
 * לחיצה על אות פותחת אותו: מה צריך לעשות, מה למדנו, וחידה של חשבון או
 * צרכנות שאפשר לפתור כמה פעמים שרוצים.
 */
export default function KupaPage() {
  const { store, loading } = useStore();
  const { kupa } = useKupa(store?.id);
  const [open, setOpen] = useState<BadgeState | null>(null);
  const [solved, setSolved] = useState<string[]>([]);

  useEffect(() => {
    if (store) setSolved(readSolved(store.id));
  }, [store]);

  // ?badge=first_sale — מגיעים מהחגיגה ישר לחידה של האות
  useEffect(() => {
    if (!kupa) return;
    const key = new URLSearchParams(window.location.search).get("badge");
    const b = key ? kupa.badges.find((x) => x.key === key) : null;
    if (b) setOpen(b);
  }, [kupa]);

  if (loading || !store || !kupa) {
    return (
      <div className="px-4 pt-4" aria-busy="true">
        <div className="h-7 w-40 bg-[var(--sand)]" />
        <div className="mt-4 aspect-[240/176] bg-white border border-[var(--line)]" />
      </div>
    );
  }

  const nb = nextBadge(kupa);
  const reachedCount = kupa.badges.filter((b) => b.reached).length;

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-5" data-testid="kupa-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-[var(--ink)] leading-tight">קופת הדוכן</h1>
          <p className="text-[13px] text-[var(--muted)] mt-0.5">כל צעד בדוכן שווה מטבעות, והמטבעות בונים את הדוכן.</p>
        </div>
        <span className="flex items-center gap-1.5 bg-white border border-[var(--line)] px-3 py-1.5 text-[20px] font-black tabular-nums" data-testid="kupa-coins">
          {kupa.coins}
          <Coin size={24} />
          <span className="sr-only">מטבעות דוכן</span>
        </span>
      </header>

      {/* הדוכן */}
      <section className="bg-white border border-[var(--line)]" aria-labelledby="kupa-level">
        <KupaStall level={kupa.level} name={kupa.name} className="w-full block" />
        <div className="px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="kupa-level" className="text-[17px] font-black" data-testid="kupa-level">{kupa.levelName}</h2>
            <span className="text-[12px] text-[var(--muted)]">רמה {kupa.level + 1} מתוך 6</span>
          </div>
          {kupa.next ? (
            <>
              <div
                className="h-3 bg-[var(--sand)] relative overflow-hidden"
                role="progressbar"
                aria-label={`התקדמות ל${kupa.next.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(kupa.next.progress * 100)}
              >
                <Grow pct={kupa.next.progress * 100} />
              </div>
              <span className="text-[13px] text-[var(--muted)]" data-testid="kupa-missing">
                עוד <b className="text-[var(--ink)] tabular-nums">{kupa.next.missing}</b> מטבעות ל{kupa.next.name}
              </span>
            </>
          ) : (
            <span className="text-[13px] font-bold text-[var(--ok-ink)]">הגעתם לרמה הכי גבוהה. כוכב השוק!</span>
          )}
        </div>
      </section>

      {/* הצעד הבא — אחד בלבד, כדי שתמיד יהיה ברור מה עושים עכשיו */}
      {nb && (
        <section className="border-[1.5px] border-[var(--ink)] bg-white p-4 flex flex-col gap-3" data-testid="kupa-next">
          <div className="flex items-center gap-3">
            <Medal icon={nb.icon} reached={false} size={48} />
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] font-bold text-[var(--wood)] tracking-wide">הצעד הבא</div>
              <div className="text-[16px] font-black leading-tight">{nb.title}</div>
              <div className="text-[12.5px] text-[var(--muted)] mt-0.5">{nb.how}</div>
            </div>
            <span className="flex items-center gap-1 text-[16px] font-black tabular-nums shrink-0">
              +{nb.coins}
              <Coin size={18} />
            </span>
          </div>
          {nb.need > 1 && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted)] tabular-nums">
              <div className="flex-1 h-2 bg-[var(--sand)] relative overflow-hidden" aria-hidden>
                <i className="absolute inset-y-0 right-0 bg-[var(--lavender-deep)]" style={{ width: `${(nb.have / nb.need) * 100}%` }} />
              </div>
              {nb.key === "hundred" ? `₪${nb.have} מתוך ₪${nb.need}` : `${nb.have} מתוך ${nb.need}`}
            </div>
          )}
          {nb.href && (
            <a href={nb.href} className="bg-[var(--ink)] text-white text-center py-3 text-[14px] font-bold" data-testid="kupa-next-go">
              בואו נעשה את זה
            </a>
          )}
        </section>
      )}

      {/* אלבום האותות */}
      <section aria-labelledby="kupa-album">
        <div className="flex items-baseline justify-between mb-2 px-0.5">
          <h2 id="kupa-album" className="text-[15px] font-black">האותות שלי</h2>
          <span className="text-[12px] text-[var(--muted)] tabular-nums">
            {reachedCount} מתוך {kupa.badges.length} · <Icon name="star" size={12} tone="var(--warning)" className="inline -mt-0.5" /> {solved.length} חידות
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {kupa.badges.map((b) => (
            <button
              key={b.key}
              onClick={() => setOpen(b)}
              data-testid="kupa-badge"
              data-key={b.key}
              data-reached={b.reached}
              aria-label={`${b.title}${b.reached ? ", הושג" : ", עוד לא"}${solved.includes(b.key) ? ", החידה נפתרה" : ""}`}
              className="fx-press relative bg-white border border-[var(--line)] px-1.5 pt-3 pb-2.5 flex flex-col items-center gap-1.5 min-h-[118px]"
            >
              <Medal icon={b.icon} reached={b.reached} size={50} />
              <span className={`text-[12px] font-bold leading-tight text-center ${b.reached ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{b.title}</span>
              <span className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums text-[var(--muted)]">
                {b.reached ? "✓ " : "+"}
                {b.coins}
                <Coin size={12} />
              </span>
              {solved.includes(b.key) && (
                <span className="absolute top-1.5 left-1.5" aria-hidden>
                  <Icon name="star" size={15} tone="var(--warning)" className="text-[#6f4b28]" />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* איך מרוויחים */}
      <details className="bg-white border border-[var(--line)]">
        <summary className="px-4 py-3 text-[14px] font-bold cursor-pointer min-h-11 flex items-center">איך מרוויחים מטבעות?</summary>
        <ul className="px-4 pb-4 flex flex-col gap-1.5 text-[13px]">
          {kupa.badges.map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-3">
              <span>{b.how}</span>
              <span className="flex items-center gap-1 font-bold tabular-nums shrink-0">{b.coins}<Coin size={13} /></span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 border-t border-[var(--sand)] pt-1.5 mt-1">
            <span>כל הזמנה ששולמה (עד {SALES_PER_DAY} ביום)</span>
            <span className="flex items-center gap-1 font-bold tabular-nums shrink-0">{SALE_COINS}<Coin size={13} /></span>
          </li>
        </ul>
      </details>

      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        מטבעות דוכן הם משחק בתוך האתר. הם לא כסף, אי אפשר לקנות אותם ואי אפשר להפסיד אותם.
        בקרוב יהיה אפשר לקנות בהם קישוטים לדוכן. בינתיים הם בונים לך את הדוכן.
      </p>

      {open && (
        <BadgeSheet
          badge={open}
          kupa={kupa}
          solved={solved.includes(open.key)}
          onSolved={() => setSolved(addSolved(store.id, open.key))}
          onClose={() => {
            setOpen(null);
            if (window.location.search) history.replaceState(null, "", "/dashboard/kupa");
          }}
        />
      )}
    </div>
  );
}

/** הפס מתמלא בכניסה למסך, לא קופץ ישר למקום */
function Grow({ pct }: { pct: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return <i className="kp-fill absolute inset-y-0 right-0 bg-[var(--wood)]" style={{ width: `${w}%` }} />;
}

function BadgeSheet({
  badge,
  kupa,
  solved,
  onSolved,
  onClose,
}: {
  badge: BadgeState;
  kupa: KupaData;
  solved: boolean;
  onSolved: () => void;
  onClose: () => void;
}) {
  const lesson = lessonFor(badge.key, kupa.sample);
  const [picked, setPicked] = useState<string | null>(solved ? lesson.answer : null);
  const [shake, setShake] = useState(0);
  const right = picked === lesson.answer;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pick(o: string) {
    if (right) return;
    setPicked(o);
    if (o === lesson.answer) onSolved();
    else setShake((n) => n + 1);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-title"
        data-testid="kupa-badge-sheet"
        className="kp-sheet-up fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto flex flex-col gap-3"
      >
        <div className="flex justify-end">
          <CloseX onClick={onClose} testid="badge-close" />
        </div>
        <div className="flex items-center gap-3 -mt-2">
          <Medal icon={badge.icon} reached={badge.reached} size={64} className={badge.reached ? "kp-flip" : ""} />
          <div className="flex-1 min-w-0">
            <h2 id="badge-title" className="text-[19px] font-black leading-tight">{badge.title}</h2>
            <div className="text-[12.5px] mt-0.5 flex items-center gap-1 tabular-nums">
              {badge.reached ? (
                <span className="text-[var(--ok-ink)] font-bold">✓ הושג · {badge.coins}</span>
              ) : (
                <span className="text-[var(--muted)]">עוד לא · +{badge.coins}</span>
              )}
              <Coin size={13} />
            </div>
          </div>
        </div>

        {badge.reached ? (
          <p className="text-[13.5px] leading-relaxed bg-[var(--canvas)] px-3.5 py-3">
            <b>מה למדנו: </b>
            {badge.lesson}
          </p>
        ) : (
          <div className="bg-[var(--canvas)] px-3.5 py-3 flex flex-col gap-2">
            <p className="text-[13.5px] leading-relaxed">
              <b>איך משיגים: </b>
              {badge.how}
            </p>
            {badge.href && (
              <a href={badge.href} className="self-start text-[13px] font-bold underline">
                לעשות את זה עכשיו ←
              </a>
            )}
          </div>
        )}

        {/* החידה */}
        <section className="border-[1.5px] border-[var(--ink)] p-3.5 flex flex-col gap-2.5" aria-labelledby="riddle-q" data-testid="kupa-riddle">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-bold px-2 py-0.5 bg-[var(--warn-bg)] text-[var(--warn-ink)]">חידת {lesson.topic}</span>
            {(solved || right) && (
              <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--ok-ink)]">
                <Icon name="star" size={14} tone="var(--warning)" className="text-[#6f4b28]" /> פתרת!
              </span>
            )}
          </div>
          <p id="riddle-q" className="text-[15px] font-bold leading-snug">{lesson.q}</p>
          <div key={shake} className={`flex flex-col gap-2 ${shake && !right ? "kp-shake" : ""}`} role="radiogroup" aria-labelledby="riddle-q">
            {lesson.options.map((o) => {
              const isPicked = picked === o;
              const good = isPicked && o === lesson.answer;
              const bad = isPicked && o !== lesson.answer;
              return (
                <button
                  key={o}
                  role="radio"
                  aria-checked={isPicked}
                  onClick={() => pick(o)}
                  data-testid="riddle-option"
                  data-right={o === lesson.answer ? "1" : undefined}
                  className={`min-h-12 px-3.5 py-2.5 text-right text-[14px] font-bold border-[1.5px] ${
                    good
                      ? "bg-[var(--ok-bg)] border-[var(--ok-ink)] text-[var(--ok-ink)]"
                      : bad
                        ? "bg-[var(--danger-bg)] border-[var(--danger)] text-[var(--danger)]"
                        : "bg-white border-[var(--line)] text-[var(--ink)]"
                  }`}
                >
                  {good ? "✓ " : bad ? "✗ " : ""}
                  {o}
                </button>
              );
            })}
          </div>
          <div aria-live="polite">
            {right ? (
              <p className="text-[13px] leading-relaxed text-[var(--ink)]" data-testid="riddle-why">
                <b>נכון! </b>
                {lesson.why}
              </p>
            ) : picked ? (
              <p className="text-[13px] text-[var(--danger)] font-bold" data-testid="riddle-retry">לא בדיוק. נסו שוב, אין מה להפסיד 🙂</p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
