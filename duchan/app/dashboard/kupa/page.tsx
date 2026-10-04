"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, confettiBurst } from "../use-store";
import { useKupa, useNight, readSolved, addSolved, writeSolved, postSolve, type KupaData } from "./use-kupa";
import { KupaStall, Coin, Medal } from "@/app/kupa-art";
import Icon from "@/app/icons";
import CloseX from "@/app/close-x";
import { nextBadge, weekIndex, weekQuest, SALE_COINS, SALES_PER_DAY, QUEST_COINS, CARD_COINS, PUNCHES_PER_CARD, type BadgeState } from "@/lib/kupa";
import { SHOP, type ShopItem, type Deco } from "@/lib/kupa-shop";
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
type Tab = "stall" | "tasks" | "riddles" | "shop";
const TABS: { key: Tab; label: string; icon: "shop" | "check" | "star" | "gift" }[] = [
  { key: "stall", label: "הדוכן", icon: "shop" },
  { key: "tasks", label: "משימות", icon: "check" },
  { key: "riddles", label: "חידות", icon: "star" },
  { key: "shop", label: "חנות", icon: "gift" },
];

export default function KupaPage() {
  const { store, loading } = useStore();
  const { kupa } = useKupa(store?.id);
  const [open, setOpen] = useState<BadgeState | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [riddleOpen, setRiddleOpen] = useState(false);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [starBump, setStarBump] = useState(0);
  const [night, setNight] = useNight();
  const [tab, setTab] = useState<Tab>("stall");
  const [balance, setBalance] = useState<number | null>(null);
  const [deco, setDeco] = useState<Deco | null>(null);
  const [owned, setOwned] = useState<string[]>([]);

  useEffect(() => {
    if (!kupa) return;
    setBalance(kupa.balance);
    setDeco(kupa.deco);
    setOwned(kupa.owned ?? []);
  }, [kupa]);
  // ?tab=shop — קישור ישר לטאב
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab);
  }, []);

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
          <p className="text-[13px] text-[var(--muted)] mt-0.5">כל צעד בדוכן שווה מטבעות, והמטבעות בונות ומשדרגות את הדוכן.</p>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 shrink-0">
          <span
            key={`c${balance ?? kupa.balance}`}
            className="kp-bump flex items-center justify-between gap-1.5 bg-white border border-[var(--line)] px-3 py-1.5 text-[20px] font-black tabular-nums"
            data-testid="kupa-coins"
          >
            {balance ?? kupa.balance}
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

      {/* טאבים פנימיים: הדוכן · משימות · חידות · חנות */}
      <div role="tablist" aria-label="קופת הדוכן" className="grid grid-cols-4 border border-[var(--line)] bg-white -mb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            data-testid={`kupa-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`min-h-12 flex flex-col items-center justify-center gap-0.5 text-[12.5px] font-bold border-b-[3px] ${
              tab === t.key ? "border-[var(--wood)] text-[var(--ink)] bg-[var(--canvas)]" : "border-transparent text-[var(--muted)]"
            }`}
          >
            <Icon name={t.icon} size={18} tone={tab === t.key ? "var(--lavender)" : "var(--sand)"} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stall" && (
      <>
      {/* הדוכן */}
      <section className="bg-white border border-[var(--line)]" aria-labelledby="kupa-level">
        <div className="relative">
          <KupaStall level={kupa.level} name={kupa.name} night={night} deco={deco ?? kupa.deco} className="w-full block" />
          {/* יום / לילה */}
          <button
            onClick={() => setNight(!night)}
            aria-pressed={night}
            aria-label={night ? "לעבור ליום" : "לעבור ללילה"}
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

      <QuickActions kupa={kupa} />
      </>
      )}

      {tab === "riddles" && (
        /* חידות — כוכב על כל חידה שנפתרת */
        <RiddlesCard
          stars={stars}
          rank={rank}
          remaining={remaining(kupa, solved)}
          onOpen={() => setRiddleOpen(true)}
        />
      )}

      {tab === "shop" && (
        <Shop
          kupa={kupa}
          storeId={store.id}
          night={night}
          balance={balance ?? kupa.balance}
          deco={deco ?? kupa.deco}
          owned={owned}
          onChange={(r) => {
            setBalance(r.balance);
            setDeco(r.deco);
            setOwned(r.owned);
          }}
        />
      )}

      {tab === "tasks" && (
      <>
      <WeekQuest kupa={kupa} storeId={store.id} />
      <PunchCard kupa={kupa} />

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
          <li className="flex items-center justify-between gap-3">
            <span>כל משימה שמבצעים</span>
            <span className="flex items-center gap-1 font-bold tabular-nums shrink-0">{QUEST_COINS}<Coin size={13} /></span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>כרטיסיית ניקובים מלאה ({PUNCHES_PER_CARD} שבועות פעילים)</span>
            <span className="flex items-center gap-1 font-bold tabular-nums shrink-0">{CARD_COINS}<Coin size={13} /></span>
          </li>
        </ul>
      </details>
      </>
      )}

      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        מטבעות דוכן הן משחק בתוך האתר. הן לא כסף, ואי אפשר לקנות אותן בכסף.
        בחנות אפשר לקנות בהן קישוטים לדוכן. הרמה נקבעת לפי כל מה שהרווחתם, אז קנייה לא מורידה רמה.
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

/* ── הדוכן: מה נותן מטבעות עכשיו ── */
function QuickActions({ kupa }: { kupa: KupaData }) {
  const b = (k: string) => kupa.badges.find((x) => x.key === k)!;
  const pending = (keys: string[]) => keys.map(b).find((x) => !x.reached) ?? null;
  const tile = (key: string, title: string, href: string, icon: "bag" | "share" | "coins" | "receipt", sub: React.ReactNode, done = false) => (
    <a
      key={key}
      href={href}
      data-testid={`kupa-action-${key}`}
      className="fx-press bg-white border border-[var(--line)] p-3 flex flex-col gap-1.5 min-h-[92px]"
    >
      <span className="flex items-center justify-between">
        <span className="w-9 h-9 bg-[var(--canvas)] flex items-center justify-center text-[#6f4b28]">
          <Icon name={icon} size={20} tone="var(--lavender)" />
        </span>
        {done && <span className="text-[11.5px] font-bold text-[var(--ok-ink)]">✓ בוצע</span>}
      </span>
      <span className="text-[13.5px] font-bold leading-tight">{title}</span>
      <span className="text-[11.5px] text-[var(--muted)] leading-snug flex items-center gap-1 flex-wrap">{sub}</span>
    </a>
  );
  const prod = pending(["first_product", "photo", "five_products"]);
  const views = pending(["views10", "views50"]);
  const pay = b("pay_ready");
  const coin = (n: number) => (
    <span className="inline-flex items-center gap-0.5 font-bold text-[var(--wood)]">+{n}<Coin size={11} /></span>
  );
  return (
    <section aria-labelledby="kupa-actions">
      <h2 id="kupa-actions" className="text-[15px] font-black mb-2 px-0.5">מה נותן מטבעות עכשיו</h2>
      <div className="grid grid-cols-2 gap-2">
        {tile("product", "להוסיף מוצר", "/dashboard/products?new=1", "bag", prod ? <>{prod.title} {coin(prod.coins)}</> : <>השגת את כל אותות המוצרים</>, !prod)}
        {tile("share", "לשתף את הדוכן", "/dashboard/settings#share", "share", views ? <>{views.title} {coin(views.coins)}</> : <>השגת את כל אותות הכניסות</>, !views)}
        {tile("pay", "איך משלמים לי", "/dashboard/settings#payment", "coins", pay.reached ? <>מסודר</> : <>ביט, פייבוקס או מזומן {coin(pay.coins)}</>, pay.reached)}
        {tile("orders", "לסמן הזמנה ששולמה", "/dashboard", "receipt", <>כל הזמנה ששולמה {coin(SALE_COINS)}</>)}
      </div>
    </section>
  );
}

/* ── משימות: משימת השבוע ── */
function WeekQuest({ kupa, storeId }: { kupa: KupaData; storeId: string }) {
  const week = weekIndex(new Date());
  const key = `kupa-skip:${storeId}:${week}`;
  const [skipped, setSkipped] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSkipped(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);
  const q = weekQuest(kupa, week, skipped);
  const doneCount = kupa.quests.filter((x) => x.done).length;

  function skip() {
    if (!q) return;
    const next = [...skipped, q.key];
    setSkipped(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="week-quest">
      {q ? (
        <div className="border-[1.5px] border-[var(--ink)] bg-white p-4 flex flex-col gap-2.5" data-testid="week-quest" data-key={q.key}>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 shrink-0 bg-[var(--warn-bg)] flex items-center justify-center text-[#6f4b28]">
              <Icon name={q.icon} size={24} tone="var(--warning)" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] font-bold text-[var(--wood)] tracking-wide">משימת השבוע · {q.minutes} דקות</div>
              <h2 id="week-quest" className="text-[16px] font-black leading-tight">{q.title}</h2>
            </div>
            <span className="flex items-center gap-1 text-[16px] font-black tabular-nums shrink-0">+{QUEST_COINS}<Coin size={18} /></span>
          </div>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">{q.how}</p>
          <div className="flex gap-2">
            <a href={q.href} className="flex-1 bg-[var(--ink)] text-white text-center py-3 text-[14px] font-bold" data-testid="week-quest-go">
              בואו נעשה את זה
            </a>
            <button onClick={skip} className="px-4 border-[1.5px] border-[var(--line)] text-[13px] font-bold" data-testid="week-quest-skip">
              לדלג השבוע
            </button>
          </div>
          <span className="text-[11.5px] text-[var(--muted)]">המטבעות מגיעות לבד, ברגע שהמשימה מתבצעת בדוכן.</span>
        </div>
      ) : (
        <div className="bg-[var(--ok-bg)] p-4 text-center text-[14px] font-bold text-[var(--ok-ink)]" data-testid="week-quest-all-done">
          כל המשימות בוצעו! 🎉
        </div>
      )}
      <details className="bg-white border border-[var(--line)]" data-testid="quest-list">
        <summary className="px-4 py-3 text-[13.5px] font-bold cursor-pointer min-h-11 flex items-center justify-between gap-2">
          <span>כל המשימות</span>
          <span className="text-[12px] text-[var(--muted)] font-normal tabular-nums">{doneCount} מתוך {kupa.quests.length}</span>
        </summary>
        <ul className="px-4 pb-3 flex flex-col">
          {kupa.quests.map((x) => (
            <li key={x.key} className="flex items-center gap-2.5 py-2 border-t border-[var(--sand)] first:border-t-0" data-testid="quest-row" data-done={x.done}>
              <Icon name={x.icon} size={18} tone={x.done ? "var(--olive)" : "var(--sand)"} className="text-[#6f4b28] shrink-0" />
              <a href={x.href} className={`flex-1 text-[13px] ${x.done ? "text-[var(--muted)]" : "font-bold"}`}>{x.title}</a>
              {x.done ? (
                <span className="text-[12px] font-bold text-[var(--ok-ink)]">✓</span>
              ) : (
                <span className="flex items-center gap-0.5 text-[12px] font-bold tabular-nums">+{QUEST_COINS}<Coin size={12} /></span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/* ── משימות: כרטיסיית ניקובים ── */
function PunchCard({ kupa }: { kupa: KupaData }) {
  return (
    <section className="bg-white border border-[var(--line)] p-4 flex flex-col gap-2.5" aria-labelledby="punch-title" data-testid="punch-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="punch-title" className="text-[15px] font-black">כרטיסיית הדוכן</h2>
        <span className="text-[12px] text-[var(--muted)] tabular-nums" data-testid="punch-count">{kupa.punches} מתוך {PUNCHES_PER_CARD}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5" aria-hidden>
        {Array.from({ length: PUNCHES_PER_CARD }, (_, i) => (
          <span
            key={i}
            className={`aspect-square flex items-center justify-center ${
              i < kupa.punches ? "bg-[var(--cream)] border-[1.5px] border-[var(--wood)]" : "border-[1.5px] border-dashed border-[var(--stone)]"
            }`}
          >
            {i < kupa.punches && <Coin size={22} className="kp-flip" />}
          </span>
        ))}
      </div>
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
        מקבלים ניקוב על כל שבוע שעשיתם בו משהו בדוכן. כרטיסייה מלאה = {CARD_COINS} מטבעות, ומתחילים חדשה. שבוע שמפספסים לא מוחק כלום.
        {kupa.cards > 0 && <b className="text-[var(--ink)]"> כבר מילאתם {kupa.cards === 1 ? "כרטיסייה אחת" : `${kupa.cards} כרטיסיות`}!</b>}
      </p>
    </section>
  );
}

/* ── חנות הקישוטים ── */
function Shop({
  kupa,
  storeId,
  night,
  balance,
  deco,
  owned,
  onChange,
}: {
  kupa: KupaData;
  storeId: string;
  night: boolean;
  balance: number;
  deco: Deco;
  owned: string[];
  onChange: (r: { balance: number; deco: Deco; owned: string[] }) => void;
}) {
  const [picked, setPicked] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // תצוגה מקדימה: איך הדוכן ייראה עם הקישוט שנבחר, עוד לפני שקונים
  const preview: Deco = picked
    ? {
        ...deco,
        ...(picked.awning ? { awning: picked.awning } : {}),
        ...(picked.key === "flowers" ? { flowers: true } : {}),
        ...(picked.key === "open_sign" ? { openSign: true } : {}),
        ...(picked.key === "cat" ? { cat: true } : {}),
      }
    : deco;

  async function call(action: "buy" | "equip", item: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/kupa/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, action, item }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ ok: false, text: j.error ?? "משהו השתבש, לנסות שוב" });
        return;
      }
      onChange(j);
      if (action === "buy") {
        setMsg({ ok: true, text: `${shopTitle(item)} — שלך! 🎉` });
        confettiBurst(window.innerWidth / 2, window.innerHeight * 0.3);
      }
      setPicked(null);
    } catch {
      setMsg({ ok: false, text: "אין חיבור. לנסות שוב" });
    } finally {
      setBusy(false);
    }
  }

  if (kupa.shopReady === false) {
    return <p className="bg-white border border-[var(--line)] p-4 text-[13px]">החנות נפתחת ממש בקרוב.</p>;
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="shop-title" data-testid="kupa-shop">
      <div className="bg-white border border-[var(--line)]">
        <KupaStall level={kupa.level} name={kupa.name} night={night} deco={preview} className="w-full block" />
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h2 id="shop-title" className="text-[15px] font-black">חנות הקישוטים</h2>
          <span className="flex items-center gap-1 text-[15px] font-black tabular-nums" data-testid="shop-balance">
            יש לך {balance}
            <Coin size={18} />
          </span>
        </div>
      </div>
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed -mt-1">
        לוחצים על קישוט כדי לראות איך הוא נראה, ואז קונים. מה שקונים נשאר לתמיד.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* הסוכך הרגיל — תמיד שלך */}
        <button
          onClick={() => !busy && deco.awning !== "lavender" && call("equip", "lavender")}
          data-testid="shop-item"
          data-key="awning_lavender"
          aria-pressed={deco.awning === "lavender"}
          className={`text-right bg-white border p-2.5 flex flex-col gap-1.5 ${deco.awning === "lavender" ? "border-[var(--ok-ink)]" : "border-[var(--line)]"}`}
        >
          <span className="h-10 bg-[var(--canvas)] flex items-center justify-center"><span className="w-3/4 h-3 bg-[var(--lavender)]" /></span>
          <b className="text-[13px]">סוכך סגול</b>
          <span className="text-[11.5px] font-bold text-[var(--ok-ink)]">{deco.awning === "lavender" ? "✓ על הדוכן" : "שלך · לשים על הדוכן"}</span>
        </button>
        {SHOP.map((it) => {
          const have = owned.includes(it.key);
          const on = it.awning ? deco.awning === it.awning : have;
          const poor = !have && balance < it.price;
          return (
            <button
              key={it.key}
              onClick={() => {
                setMsg(null);
                if (have) {
                  if (it.awning && !on) call("equip", it.key);
                  return;
                }
                setPicked(picked?.key === it.key ? null : it);
              }}
              data-testid="shop-item"
              data-key={it.key}
              data-owned={have}
              aria-pressed={picked?.key === it.key || on}
              className={`text-right bg-white border p-2.5 flex flex-col gap-1.5 ${
                picked?.key === it.key ? "border-[var(--ink)] border-[1.5px]" : on ? "border-[var(--ok-ink)]" : "border-[var(--line)]"
              }`}
            >
              <span className="h-10 bg-[var(--canvas)] flex items-center justify-center text-[#6f4b28]">
                {it.awning ? (
                  <span className="w-3/4 h-3" style={{ background: it.awning === "olive" ? "var(--olive)" : it.awning === "blush" ? "#E9B8BF" : "#E3C26F" }} />
                ) : (
                  <Icon name={it.icon} size={24} tone="var(--lavender)" />
                )}
              </span>
              <b className="text-[13px] leading-tight">{it.title}</b>
              <span className="text-[11px] text-[var(--muted)] leading-snug">{it.where}</span>
              {have ? (
                <span className="text-[11.5px] font-bold text-[var(--ok-ink)]">{on ? "✓ על הדוכן" : "שלך · לשים על הדוכן"}</span>
              ) : (
                <span className={`flex items-center gap-1 text-[13px] font-black tabular-nums ${poor ? "text-[var(--muted)]" : ""}`}>
                  {it.price}
                  <Coin size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {msg && (
          <p className={`text-[13px] font-bold px-3 py-2 ${msg.ok ? "bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "bg-[var(--danger-bg)] text-[var(--danger)]"}`} data-testid="shop-msg">
            {msg.text}
          </p>
        )}
      </div>

      {picked && (
        <div className="kp-sheet-up sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] bg-white border-[1.5px] border-[var(--ink)] p-3 flex items-center gap-2" data-testid="shop-confirm">
          <span className="flex-1 text-[13px] leading-snug">
            {balance >= picked.price ? (
              <>לקנות <b>{picked.title}</b> ב-{picked.price} מטבעות?</>
            ) : (
              <>חסרות עוד <b className="tabular-nums">{picked.price - balance}</b> מטבעות ל{picked.title}</>
            )}
          </span>
          {balance >= picked.price && (
            <button disabled={busy} onClick={() => call("buy", picked.key)} className="bg-[var(--ink)] text-white px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50" data-testid="shop-buy">
              לקנות
            </button>
          )}
          <button onClick={() => setPicked(null)} className="px-3 py-2.5 text-[13px] underline" data-testid="shop-cancel">
            {balance >= picked.price ? "ביטול" : "סגירה"}
          </button>
        </div>
      )}
    </section>
  );
}

function shopTitle(key: string) {
  return SHOP.find((i) => i.key === key)?.title ?? "הקישוט";
}
