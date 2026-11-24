"use client";

import { useState } from "react";
import { COMMUNITIES, type LabStore } from "./data";
import { EmptyPlot, WorldStall } from "./stalls";

/**
 * "הדוכן שלכם נכנס לעיר": המסכים שבהם אומרים איפה לומדים ואיפה גרים. לא
 * בוחרים *איפה* הדוכן ייראה: הוא מופיע בכל המקומות יחד, בקניון של הכיתה,
 * בשוק של השכונה ועל מפת העיר. העיר היא העיר של המשחק, אחת לכולם: לא
 * שואלים באיזו עיר גרים.
 *
 * מה שההדמיה מראה:
 *   • בית הספר הוא שדה אחד: מתחילים להקליד, ורשימה נפתחת מתחתיו. ליד כל
 *     שם כתוב היישוב, כי יש בתי ספר עם אותו שם.
 *   • בוחרים מהרשימה, כך שאי אפשר לכתוב כתובת.
 *   • השכונות הן של היישוב של בית הספר. לא שואלים רחוב ולא בית.
 *   • ההורה רואה בדיוק איפה הדוכן יופיע ומי יראה אותו, לפני שמשהו מופיע.
 *   • הסוף הוא כפתור אחד: להזמין חברים למקום הפנוי שליד.
 *
 * שמות בתי הספר והשכונות מומצאים. באפליקציה הם יגיעו מרשימה רשמית.
 */
export type PlaceResult =
  | { kind: "placed"; school: string; unit: string; grade: string; hood?: string; see: "class" | "hood"; invite: boolean }
  | { kind: "link" };

const SCHOOLS: { name: string; town: string }[] = [
  ["הדקל", "יבנה"], ["הגפן", "יבנה"], ["הרימון", "יבנה"], ["התמר", "יבנה"], ["האלון", "יבנה"],
  ["התמר", "רחובות"], ["השקד", "רחובות"], ["הדקל", "אשדוד"], ["הגפן", "חיפה"], ["הרימון", "נתניה"],
  ["הזית", "ראשון לציון"], ["האורן", "מודיעין"], ["הנרקיס", "כפר סבא"], ["הרקפת", "ירושלים"],
].map(([n, town]) => ({ name: `בית ספר ${n}`, town }));
const HOODS = ["הדקלים", "הגפן", "נווה אילן", "הפרחים", "רמת הים"].map((x) => `שכונת ${x}`);
const GRADES = ["ד", "ה", "ו", "ז", "ח"];
const OTHER = "other";

type Step = "school" | "class" | "hood" | "parent" | "done" | "declined";

export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5V20h14v-7.5" />
    </svg>
  );
}

export default function PlaceSim({ store, neighbor, onDone, onClose }: { store: LabStore; neighbor: LabStore; onDone: (r: PlaceResult) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("school");
  const [q, setQ] = useState("");
  /** מספר בית הספר ברשימה; -1 עוד לא נבחר, -2 "לא ברשימה" */
  const [pick, setPick] = useState(-1);
  const [grade, setGrade] = useState("");
  const [hood, setHood] = useState("");

  const cls = COMMUNITIES.class;
  const hd = COMMUNITIES.hood;
  const who = store.owner ?? "נועה";
  const noSchool = pick === -2;
  const noHood = hood === OTHER;
  const chosen = pick >= 0 ? SCHOOLS[pick] : null;
  const school = chosen?.name ?? "";
  const town = chosen?.town ?? "";
  const typed = q.trim();
  const open = typed.length > 0 && pick === -1;
  const matches = open ? SCHOOLS.map((x, i) => ({ ...x, i })).filter((x) => `${x.name} ${x.town}`.includes(typed)).slice(0, 5) : [];
  const unit = `שכבת ${grade}׳`;
  const mall = cls.mallOf(unit);
  const order: Step[] = noSchool ? ["school", "parent", "done"] : ["school", "class", "hood", "parent", "done"];
  const at = order.indexOf(step);
  const back = at > 0 && step !== "done" ? order[at - 1] : null;
  const result = (see: "class" | "hood", invite: boolean): PlaceResult => ({ kind: "placed", school, unit, grade, see, invite, ...(noHood ? {} : { hood }) });

  return (
    <div className="wl-invite wl-where" role="dialog" aria-modal="true" aria-label="הדוכן שלכם נכנס לעיר" data-testid="wl-where" data-step={step}>
      <div className="wl-invite-bar">
        {back ? (
          <button type="button" className="wl-btn wl-chip" onClick={() => setStep(back)} data-testid="wl-place-back">חזרה</button>
        ) : <span className="wl-sim-tag">הדמיה: שמות בתי הספר והשכונות מומצאים</span>}
        <button type="button" className="wl-sheet-x wl-invite-x" onClick={onClose} aria-label="לסגור" data-testid="wl-place-x">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="wl-invite-body">
        {at >= 0 && (
          <div className="wl-invite-steps" aria-hidden>
            {order.map((s, i) => <span key={s} data-on={i <= at ? "1" : undefined} />)}
          </div>
        )}

        {step === "school" && (
          <>
            <h2>באיזה בית ספר אתם לומדים?</h2>
            <p>הדוכן יעמוד בקניון של השכבה, ליד החברים.</p>
            <div className="wl-field">
              <label className="wl-field-label" htmlFor="wl-place-q">בית ספר</label>
              <input
                id="wl-place-q" className="wl-input" value={q} maxLength={30} autoComplete="off" enterKeyHint="search"
                role="combobox" aria-expanded={open} aria-controls="wl-school-list" aria-autocomplete="list"
                onChange={(e) => { setQ(e.target.value); setPick(-1); }}
                data-testid="wl-place-q" data-picked={pick !== -1 ? "1" : undefined}
              />
              {open && (
                <div className="wl-combo-list" role="listbox" id="wl-school-list" aria-label="בתי ספר" data-testid="wl-school-list">
                  {matches.map((x) => (
                    <button key={x.i} type="button" role="option" aria-selected={false} className="wl-combo-opt" onClick={() => { setPick(x.i); setQ(`${x.name}, ${x.town}`); }} data-testid={`wl-school-${x.i}`}>
                      <span>{x.name}</span><span className="wl-combo-town">{x.town}</span>
                    </button>
                  ))}
                  <button type="button" role="option" aria-selected={false} className="wl-combo-opt" onClick={() => setPick(-2)} data-testid="wl-school-other">בית הספר שלנו לא ברשימה</button>
                </div>
              )}
            </div>
            {!typed && <p className="wl-sheet-note">מתחילים להקליד, ובוחרים מהרשימה.</p>}
            {noSchool && <p className="wl-sheet-note" data-testid="wl-school-other-note">ההורה יכתוב לנו את השם. אחרי שנבדוק אותו, הדוכן ייכנס לעיר.</p>}
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={pick === -1} onClick={() => setStep(noSchool ? "parent" : "class")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "class" && (
          <>
            <h2>באיזו שכבה?</h2>
            <div className="wl-field">
              <div className="wl-toggles" role="radiogroup" aria-label="שכבה">
                {GRADES.map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={grade === g} className="wl-btn wl-toggle wl-sq" onClick={() => setGrade(g)} data-testid={`wl-grade-${g}`}>{g}׳</button>
                ))}
              </div>
            </div>
            <p className="wl-sheet-note">בתחילת כל שנת לימודים נשאל שוב, כי עולים שכבה.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!grade} onClick={() => setStep("hood")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "hood" && (
          <>
            <h2>באיזו שכונה ב{town}?</h2>
            <p>הדוכן יעמוד גם בשוק של השכונה, ליד השכנים.</p>
            <div className="wl-place-list" role="radiogroup" aria-label={`שכונות ב${town}`}>
              {HOODS.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={hood === p} className="wl-btn wl-toggle wl-place-row" onClick={() => setHood(p)} data-testid={`wl-hood-${i}`}>
                  {p}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={noHood} className="wl-btn wl-toggle wl-place-row" onClick={() => setHood(OTHER)} data-testid="wl-hood-other">השכונה שלנו לא ברשימה</button>
            </div>
            {noHood && <p className="wl-sheet-note" data-testid="wl-hood-other-note">ההורה יכתוב לנו את השם. אחרי שנבדוק אותו, הדוכן ייכנס גם לשוק של השכונה.</p>}
            <p className="wl-sheet-note">לא שואלים רחוב או בית.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!hood} onClick={() => setStep("parent")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "parent" && (
          <>
            <h2>צריך אישור של הורה</h2>
            <p>שלחנו להורה קישור. כשההורה יאשר, הדוכן ייכנס לעיר. ככה הקישור נראה:</p>
            <div className="wl-msg" data-testid="wl-place-parent">
              {noSchool ? (
                <>
                  <b>{who}</b> רוצה שהדוכן ״{store.name}״ ייכנס לעיר של דוכן, ליד החברים מהשכבה ומהשכונה.
                  <br />
                  בית הספר עוד לא ברשימה שלנו. כתבו לנו את שמו ואת היישוב, ונבדוק אותו לפני שמשהו מופיע.
                </>
              ) : (
                <>
                  <b>{who}</b> רוצה שהדוכן ״{store.name}״ ייכנס לעיר של דוכן. זו עיר מצוירת בתוך האפליקציה, לא מקום אמיתי. הדוכן יופיע בה:
                  <ul className="wl-place-where">
                    <li>ב{mall.slice(1)}, {school} ({town})</li>
                    <li>{noHood ? "בשוק של השכונה, אחרי שתכתבו לנו את שם השכונה ונבדוק אותו" : `בשוק של ${hood}`}</li>
                    <li>על מפת העיר, מרחוק ובלי שם</li>
                  </ul>
                  את הדוכן והמוצרים יראו {cls.seenBy} ו{hd.seenBy}. את השם הפרטי רואים רק ילדי השכבה והשכנים שלידו בשוק. בלי שם משפחה, בלי טלפון ובלי כתובת.
                  <br />
                  מי שלא אושר לבית הספר או לשכונה לא רואה כלום. ההזמנות עובדות כמו היום. אפשר להזמין חברים בקישור אישי, וגם הם מצטרפים רק באישור הורה.
                  <br />
                  אפשר להוציא את הדוכן מהעיר בכל רגע, מההגדרות של הדוכן.
                </>
              )}
            </div>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep("done")} data-testid="wl-place-yes">ההורה מאשר (הדמיה)</button>
              <button type="button" className="wl-btn" onClick={() => setStep("declined")} data-testid="wl-place-no">ההורה לא מאשר</button>
            </div>
          </>
        )}

        {step === "done" && noSchool && (
          <>
            <h2>בודקים את בית הספר</h2>
            <p>כשנסיים נודיע לכם ולהורה. בינתיים הדוכן עובד כרגיל, עם הלינק.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => onDone({ kind: "link" })} data-testid="wl-place-ok">הבנתי</button>
            </div>
          </>
        )}

        {step === "done" && !noSchool && (
          <>
            <div className="wl-new-row wl-place-row-art" data-testid="wl-place-art">
              <div className="wl-new-stall wl-new-side" style={{ "--aw": neighbor.awning, "--lavender": neighbor.awning } as React.CSSProperties}>
                <WorldStall store={neighbor} lod="mid" />
              </div>
              <div className="wl-new-stall" style={{ "--aw": store.awning, "--lavender": store.awning } as React.CSSProperties}>
                <WorldStall store={store} lod="near" />
              </div>
              <div className="wl-new-stall wl-new-side"><EmptyPlot lod="mid" invited={false} /></div>
            </div>
            <h2 data-testid="wl-place-title">הדוכן שלכם בעיר</h2>
            <ul className="wl-place-where wl-place-in" data-testid="wl-place-in">
              <li><b>{mall}</b>{school}</li>
              <li>{noHood ? "השוק של השכונה: בודקים את השכונה" : <><b>השוק של השכונה</b>{hood}</>}</li>
              <li><b>מפת העיר</b></li>
            </ul>
            <button type="button" className="wl-btn wl-primary wl-wide wl-share" onClick={() => onDone(result("class", true))} data-testid="wl-place-share">
              <ShareIcon />
              להזמין חברים
            </button>
            <p className="wl-sheet-note">לידכם יש מקום פנוי. על כל דוכן שנפתח בהזמנתכם מקבלים 60 נקודות, והדוכן שלכם גדל.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-place-see" onClick={() => onDone(result("class", false))} data-testid="wl-place-see-class">לראות את הקניון</button>
              {!noHood && <button type="button" className="wl-btn wl-place-see" onClick={() => onDone(result("hood", false))} data-testid="wl-place-see-hood">לראות את השוק</button>}
            </div>
          </>
        )}

        {step === "declined" && (
          <>
            <h2>הדוכן נשאר רק עם הלינק</h2>
            <p>הכול ממשיך לעבוד כמו קודם, ושום דבר לא מופיע בעיר. אפשר לבקש שוב מתי שרוצים.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => onDone({ kind: "link" })} data-testid="wl-place-ok">הבנתי</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
