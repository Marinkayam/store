"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, confettiBurst } from "../use-store";
import { useKupa, useNight, readSolved, addSolved, writeSolved, postSolve, type KupaData } from "./use-kupa";
import { KupaStall, Coin, Medal } from "@/app/kupa-art";
import Icon from "@/app/icons";
import CloseX from "@/app/close-x";
import { nextBadge, SALE_COINS, SALES_PER_DAY, type BadgeState } from "@/lib/kupa";
import { lessonFor, type Lesson } from "@/lib/kupa-lessons";
import { allRiddles, nextRiddle, rankOf, type Riddle } from "@/lib/riddles";

/**
 * קופת הדוכן — המסך המלא.
 *
 * מלמעלה למטה: הדוכן המצויר ברמה הנוכחית → כמה חסר לרמה הבאה → הצעד הבא
 * (אחד, עם כפתור שלוקח לשם) → אלבום האותות → איך מרוויחים → הערה להורים.
 * לחיצה על אות פותחת אותו: מה צריך לעשות, מה למדנו, וחידה של חשבון או
 * צרכנות שאפשר לפתור כמה פעמים שרוצים.
 *
 * חידות: מאגר גדול (lib/riddles.ts) מעבר לחידות של האותות. כל חידה
 * שנפתרת = כוכב, והכוכבים נותנים תארים ("מחשבון כיס", "קופה רושמת"…).
 * מרינה: "על כל תשובה לתת כוכב, וצריך מאגר גדול של חידות".
 */
export default function KupaPage() {
  const { store, loading } = useStore();
  const { kupa } = useKupa(store?.id);
  const [open, setOpen] = useState<BadgeState | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [riddleOpen, setRiddleOpen] = useState(false);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [starBump, setStarBump] = useState(0);
  const [night, setNight] = useNight();

  /** כוכב על כל חידה שנפתרת — גם של אות וגם מהמאגר. נשמר במסד (השרת
   *  בודק את התשובה); המסך מתעדכן מיד ולא מחכה לשרת. */
  function solve(id: string, answer: string) {
    if (!store || solved.includes(id)) return;
    const before = rankOf(solved.length).index;
    const next = [...new Set([...solved, id])];
    addSolved(store.id, id);
    setSolved(next);
    const storeId = store.id;
    postSolve(storeId, { riddleId: id, answer }).then((server) => {
      if (!server) return; // בלי רשת: נשאר בטלפון, ויעלה בפעם הבאה
      setSolved((cur) => {
        const merged = [...new Set([...server, ...cur])];
        writeSolved(storeId, merged);
        return merged;
      });
    });
    setStarBump((n) => n + 1);
    const after = rankOf(next.length);
    if (after.index > before) {
      setRankUp(after.name);
      confettiBurst(window.innerWidth / 2, window.innerHeight * 0.35);
    }
  }

  useEffect(() => {
    if (!store || !kupa) return;
    const local = readSolved(store.id);
    if (kupa.solved === null) {
      setSolved(local); // הטבלה עוד לא במסד
      return;
    }
    // כוכבים שנפתרו בטלפון לפני שהיה מסד — עולים פעם אחת, כשבמסד עוד אין כלום
    const server = kupa.solved;
    const missing = local.filter((id) => !server.includes(id));
    setSolved([...new Set([...server, ...local])]);
    if (missing.length && server.length === 0) {
      const storeId = store.id;
      postSolve(storeId, { import: local }).then((after) => {
        if (after) {
          writeSolved(storeId, after);
          setSolved(after);
        }
      });
    } else if (!missing.length) {
      writeSolved(store.id, server);
    }
  }, [store, kupa]);

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
  const stars = solved.length;
  const rank = rankOf(stars);

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-5" data-testid="kupa-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-[var(--ink)] leading-tight">קופת הדוכן</h1>
          <p className="text-[13px] text-[var(--muted)] mt-0.5">כל צעד בדוכן שווה מטבעות, והמטבעות בונים את הדוכן.</p>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 shrink-0">
          <span className="flex items-center justify-between gap-1.5 bg-white border border-[var(--line)] px-3 py-1.5 text-[20px] font-black tabular-nums" data-testid="kupa-coins">
            {kupa.coins}
            <Coin size={24} />
            <span className="sr-only">מטבעות דוכן</span>
          </span>
          <span
            key={starBump}
            className={`flex items-center justify-between gap-1.5 bg-white border border-[var(--line)] px-3 py-1 text-[16px] font-black tabular-nums ${starBump ? "kp-bump" : ""}`}
            data-testid="kupa-stars-top"
          >
            {stars}
            <Icon name="star" size={20} tone="var(--warning)" className="text-[#6f4b28]" />
            <span className="sr-only">כוכבים</span>
          </span>
        </div>
      </header>

      {/* הדוכן */}
      <section className="bg-white border border-[var(--line)]" aria-labelledby="kupa-level">
        <div className="relative">
          <KupaStall level={kupa.level} name={kupa.name} night={night} className="w-full block" />
          {/* יום / לילה */}
          <button
            onClick={() => setNight(!night)}
            aria-pressed={night}
            aria-label={night ? "להחזיר יום בדוכן" : "לילה בדוכן"}
            data-testid="kupa-night"
            className="absolute top-2 left-2 w-11 h-11 flex items-center justify-center border border-[var(--line)] bg-white/90 text-[#6f4b28]"
          >
            <span key={night ? "moon" : "sun"} className="kp-flip inline-flex">
              <Icon name={night ? "sun" : "moon"} size={22} tone={night ? "var(--warning)" : "var(--lavender)"} />
            </span>
          </button>
        </div>
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

      {/* חידות — כוכב על כל חידה שנפתרת */}
      <RiddlesCard
        stars={stars}
        rank={rank}
        remaining={remaining(kupa, solved)}
        onOpen={() => setRiddleOpen(true)}
      />

      {/* אלבום האותות */}
      <section aria-labelledby="kupa-album">
        <div className="flex items-baseline justify-between mb-2 px-0.5">
          <h2 id="kupa-album" className="text-[15px] font-black">האותות שלי</h2>
          <span className="text-[12px] text-[var(--muted)] tabular-nums">
            {reachedCount} מתוך {kupa.badges.length}
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
          onSolved={(answer) => solve(open.key, answer)}
          onClose={() => {
            setOpen(null);
            if (window.location.search) history.replaceState(null, "", "/dashboard/kupa");
          }}
        />
      )}
      {riddleOpen && (
        <RiddleSheet
          kupa={kupa}
          solved={solved}
          stars={stars}
          rankUp={rankUp}
          onSolved={solve}
          onClose={() => {
            setRiddleOpen(false);
            setRankUp(null);
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
  onSolved: (answer: string) => void;
  onClose: () => void;
}) {
  const lesson = lessonFor(badge.key, kupa.sample);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

        <RiddleBox key={badge.key} lesson={lesson} solved={solved} onSolved={onSolved} />
      </div>
    </>
  );
}

/** כמה חידות מהמאגר עוד לא נפתרו */
function remaining(kupa: KupaData, solved: string[]): number {
  const done = new Set(solved);
  return allRiddles(kupa.sample).filter((r) => !done.has(r.id)).length;
}

/** חידה אחת: שאלה, שלוש תשובות, הסבר. טעות = "נסו שוב", בלי עונש.
 *  `key` מבחוץ מאפס אותה כשעוברים לחידה אחרת. */
function RiddleBox({ lesson, solved, onSolved }: { lesson: Lesson; solved: boolean; onSolved: (answer: string) => void }) {
  const [picked, setPicked] = useState<string | null>(solved ? lesson.answer : null);
  const [shake, setShake] = useState(0);
  /** הכוכב נוחת רק כשפותרים עכשיו — לא כשפותחים חידה שכבר נפתרה */
  const [earned, setEarned] = useState(false);
  const right = picked === lesson.answer;

  function pick(o: string) {
    if (right) return;
    setPicked(o);
    if (o === lesson.answer) {
      if (!solved) {
        setEarned(true);
        onSolved(o);
      }
    } else setShake((n) => n + 1);
  }

  return (
    <section className="border-[1.5px] border-[var(--ink)] p-3.5 flex flex-col gap-2.5" aria-labelledby="riddle-q" data-testid="kupa-riddle">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-bold px-2 py-0.5 bg-[var(--warn-bg)] text-[var(--warn-ink)]">חידת {lesson.topic}</span>
        {(solved || right) && (
          <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--ok-ink)]">
            <Icon name="star" size={14} tone="var(--warning)" className="text-[#6f4b28]" /> פתרת!
          </span>
        )}
      </div>
      <p id="riddle-q" className="text-[15px] font-bold leading-snug"><Mathy text={lesson.q} /></p>
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
              <Mathy text={o} />
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="relative">
        {right && earned && (
          <span className="kp-star-pop absolute -top-10 left-2 flex items-center gap-1 text-[14px] font-black text-[#6f4b28]" data-testid="riddle-star" aria-hidden>
            +1 <Icon name="star" size={26} tone="var(--warning)" />
          </span>
        )}
        {right ? (
          <p className="text-[13px] leading-relaxed text-[var(--ink)]" data-testid="riddle-why">
            <b>נכון!{earned && " קיבלת כוכב."} </b>
            <Mathy text={lesson.why} />
          </p>
        ) : picked ? (
          <p className="text-[13px] text-[var(--danger)] font-bold" data-testid="riddle-retry">לא בדיוק. נסו שוב, אין מה להפסיד 🙂</p>
        ) : null}
      </div>
    </section>
  );
}

function RiddlesCard({
  stars,
  rank,
  remaining,
  onOpen,
}: {
  stars: number;
  rank: ReturnType<typeof rankOf>;
  remaining: number;
  onOpen: () => void;
}) {
  return (
    <section className="bg-white border border-[var(--line)] p-4 flex flex-col gap-3" data-testid="kupa-riddles" aria-labelledby="riddles-title">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 shrink-0 bg-[var(--warn-bg)] flex items-center justify-center" aria-hidden>
          <Icon name="star" size={30} tone="var(--warning)" className="text-[#6f4b28] star-bob" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-bold text-[var(--wood)] tracking-wide">חידות של סוחרים</div>
          <h2 id="riddles-title" className="text-[16px] font-black leading-tight" data-testid="riddle-rank">{rank.name}</h2>
          <div className="text-[12.5px] text-[var(--muted)] mt-0.5">
            {rank.next ? `עוד ${rank.next.missing} כוכבים לתואר "${rank.next.name}"` : "הגעת לתואר הכי גבוה!"}
          </div>
        </div>
        <span className="flex items-center gap-1 text-[18px] font-black tabular-nums shrink-0" data-testid="kupa-stars">
          {stars}
          <Icon name="star" size={20} tone="var(--warning)" className="text-[#6f4b28]" />
        </span>
      </div>
      <button
        onClick={onOpen}
        disabled={!remaining}
        data-testid="riddle-new"
        className="bg-[var(--ink)] text-white py-3 text-[14.5px] font-bold disabled:opacity-40"
      >
        {remaining ? "חידה חדשה" : "פתרת את כל החידות!"}
      </button>
      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        כל חידה שפותרים = כוכב. במאגר מחכות עוד <b className="tabular-nums" data-testid="riddle-remaining">{remaining}</b> חידות: חשבון, צרכנות, עסק וחיסכון.
      </p>
    </section>
  );
}

function RiddleSheet({
  kupa,
  solved,
  stars,
  rankUp,
  onSolved,
  onClose,
}: {
  kupa: KupaData;
  solved: string[];
  stars: number;
  rankUp: string | null;
  onSolved: (id: string, answer: string) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<Riddle | null>(() => nextRiddle(solved, kupa.sample));
  const done = !!current && solved.includes(current.id);
  const total = useMemo(() => allRiddles(kupa.sample).length, [kupa.sample]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חידה"
        data-testid="riddle-sheet"
        className="kp-sheet-up fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[15px] font-black tabular-nums" data-testid="riddle-sheet-stars">
            <Icon name="star" size={20} tone="var(--warning)" className="text-[#6f4b28]" />
            {stars} כוכבים
            <span className="text-[12px] font-normal text-[var(--muted)]">· {solved.filter((id) => id.startsWith("c-") || id.startsWith("t-")).length} מתוך {total}</span>
          </span>
          <CloseX onClick={onClose} testid="riddle-close" />
        </div>

        {rankUp && (
          <div className="kp-flip bg-[var(--warn-bg)] border-[1.5px] border-[var(--warning)] px-3.5 py-2.5 text-center" data-testid="riddle-rankup" role="status">
            <div className="text-[11.5px] font-bold text-[var(--warn-ink)]">תואר חדש!</div>
            <div className="text-[17px] font-black">{rankUp}</div>
          </div>
        )}

        {current ? (
          <RiddleBox key={current.id} lesson={current} solved={false} onSolved={(answer) => onSolved(current.id, answer)} />
        ) : (
          <p className="text-center text-[15px] font-bold py-6">פתרת את כל החידות במאגר! 🎉</p>
        )}

        {done && (
          <button
            onClick={() => setCurrent(nextRiddle(solved, kupa.sample))}
            data-testid="riddle-next"
            className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold"
          >
            עוד חידה
          </button>
        )}
      </div>
    </>
  );
}

/**
 * תרגיל בתוך משפט בעברית ("₪50 − ₪35 = ₪15") מתהפך בכיוון ימין-לשמאל:
 * ה-₪ והאופרטורים הם תווים "חלשים", והדפדפן מסדר אותם לפי העברית סביבם.
 * כל רצף שיש בו פעולה (= × ÷ + −) נעטף ב-span משמאל לימין, בשורה אחת — כמו
 * בספר חשבון. (bdi עם dir=ltr לא בודד את זה בכרום, span כן.)
 */
const EQUATION = /\(?₪?\d(?:[\d.,]*\d)?%?\)?(?:\s*[×÷+−=/]\s*\(?₪?\d(?:[\d.,]*\d)?%?\)?)+/g;
function Mathy({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EQUATION)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <span key={i} dir="ltr" className="inline-block whitespace-nowrap" style={{ unicodeBidi: "isolate" }}>
        {m[0]}
      </span>
    );
    last = i + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
