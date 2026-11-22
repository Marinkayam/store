"use client";

import { useState } from "react";
import { COMMUNITIES, type LabStore } from "./data";
import { EmptyPlot, WorldStall } from "./stalls";

/**
 * "הדוכן שלכם נכנס לעיר": המסכים שבהם אומרים איפה גרים ולומדים. לא בוחרים
 * *איפה* הדוכן ייראה: הוא מופיע בכל המקומות יחד, בקניון של הכיתה, בשוק של
 * השכונה ועל מפת העיר. שואלים רק את מה שצריך כדי לשים אותו שם:
 * עיר, בית ספר וכיתה, ושכונה.
 *
 * מה שההדמיה מראה:
 *   • העיר היא שדה אחד: מתחילים להקליד, ורשימה נפתחת מתחתיו.
 *   • בית ספר ושכונה נבחרים מרשימה, כך שאי אפשר לכתוב כתובת.
 *   • לא שואלים רחוב ולא בית: את הכיכר בשוק נותנת המערכת.
 *   • ההורה רואה בדיוק איפה הדוכן יופיע ומי יראה אותו, לפני שמשהו מופיע.
 *   • הסוף הוא כפתור אחד: להזמין חברים למקום הפנוי שליד.
 *
 * הערים כאן אמיתיות; שמות בתי הספר והשכונות מומצאים. באפליקציה הם יגיעו
 * מרשימה רשמית, לא מהקלדה.
 */
export type PlaceResult =
  | { kind: "placed"; city: string; school?: string; unit?: string; grade?: string; num?: number; hood?: string; see: "class" | "hood"; invite: boolean }
  | { kind: "link" };

const CITIES = [
  "יבנה", "רחובות", "אשדוד", "ראשון לציון", "נס ציונה", "תל אביב-יפו", "ירושלים", "חיפה", "באר שבע", "נתניה", "מודיעין", "כפר סבא",
  "רעננה", "הרצליה", "חולון", "בת ים", "רמת גן", "גבעתיים", "פתח תקווה", "אשקלון", "קריית גת", "גדרה", "רמלה", "לוד", "יהוד", "אילת",
];
const SCHOOLS = ["הדקל", "הגפן", "הרימון", "התמר", "האלון"].map((x) => `בית ספר ${x}`);
const HOODS = ["הדקלים", "הגפן", "נווה אילן", "הפרחים", "רמת הים"].map((x) => `שכונת ${x}`);
const GRADES = ["ד", "ה", "ו", "ז", "ח"];
const NUMS = [1, 2, 3, 4, 5, 6];
const OTHER = "other";

type Step = "city" | "school" | "class" | "hood" | "parent" | "done" | "declined";

export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5V20h14v-7.5" />
    </svg>
  );
}

export default function PlaceSim({ store, neighbor, onDone, onClose }: { store: LabStore; neighbor: LabStore; onDone: (r: PlaceResult) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("city");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [num, setNum] = useState(0);
  const [hood, setHood] = useState("");

  const cls = COMMUNITIES.class;
  const hd = COMMUNITIES.hood;
  const who = store.owner ?? "נועה";
  const noSchool = school === OTHER;
  const noHood = hood === OTHER;
  const typed = q.trim();
  const matches = typed && typed !== city ? CITIES.filter((c) => c.startsWith(typed)).concat(CITIES.filter((c) => !c.startsWith(typed) && c.includes(typed))).slice(0, 6) : [];
  const unit = `${grade}׳${num}`;
  const mall = cls.mallOf(unit);
  const market = hd.mallOf(hd.lots.h2);
  const order: Step[] = noSchool ? ["city", "school", "hood", "parent", "done"] : ["city", "school", "class", "hood", "parent", "done"];
  const at = order.indexOf(step);
  const back = at > 0 && step !== "done" ? order[at - 1] : null;
  const pending = noSchool && noHood;
  const result = (see: "class" | "hood", invite: boolean): PlaceResult => ({
    kind: "placed", city, see, invite,
    ...(noSchool ? {} : { school, unit, grade, num }),
    ...(noHood ? {} : { hood }),
  });

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

        {step === "city" && (
          <>
            <h2>באיזו עיר אתם גרים?</h2>
            <div className="wl-field">
              <label className="wl-field-label" htmlFor="wl-place-q">עיר</label>
              <input
                id="wl-place-q" className="wl-input" value={q} maxLength={20} autoComplete="off" enterKeyHint="search"
                role="combobox" aria-expanded={matches.length > 0} aria-controls="wl-city-list" aria-autocomplete="list"
                onChange={(e) => { setQ(e.target.value); if (e.target.value.trim() !== city) setCity(""); }}
                data-testid="wl-place-q" data-picked={city ? "1" : undefined}
              />
              {matches.length > 0 && (
                <div className="wl-combo-list" role="listbox" id="wl-city-list" aria-label="ערים" data-testid="wl-city-list">
                  {matches.map((c) => (
                    <button key={c} type="button" role="option" aria-selected={false} className="wl-combo-opt" onClick={() => { setCity(c); setQ(c); }} data-testid={`wl-city-${CITIES.indexOf(c)}`}>{c}</button>
                  ))}
                </div>
              )}
            </div>
            {!typed && <p className="wl-sheet-note">מתחילים להקליד, ובוחרים מהרשימה.</p>}
            {typed && !city && matches.length === 0 && <p className="wl-sheet-note" data-testid="wl-city-none">לא מצאנו עיר כזו. אפשר לנסות שם אחר.</p>}
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!city} onClick={() => setStep("school")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "school" && (
          <>
            <h2>באיזה בית ספר?</h2>
            <div className="wl-place-list" role="radiogroup" aria-label={`בתי ספר ב${city}`}>
              {SCHOOLS.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={school === p} className="wl-btn wl-toggle wl-place-row" onClick={() => setSchool(p)} data-testid={`wl-school-${i}`}>
                  <span>{p}</span><span className="wl-place-city">{city}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={noSchool} className="wl-btn wl-toggle wl-place-row" onClick={() => setSchool(OTHER)} data-testid="wl-school-other">בית הספר שלנו לא ברשימה</button>
            </div>
            {noSchool && <p className="wl-sheet-note" data-testid="wl-school-other-note">ההורה יכתוב לנו את השם. אחרי שנבדוק אותו, הדוכן ייכנס גם לקניון של הכיתה.</p>}
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!school} onClick={() => setStep(noSchool ? "hood" : "class")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "class" && (
          <>
            <h2>באיזו כיתה?</h2>
            <div className="wl-field">
              <span className="wl-field-label">שכבה</span>
              <div className="wl-toggles" role="radiogroup" aria-label="שכבה">
                {GRADES.map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={grade === g} className="wl-btn wl-toggle wl-sq" onClick={() => setGrade(g)} data-testid={`wl-grade-${g}`}>{g}׳</button>
                ))}
              </div>
            </div>
            <div className="wl-field">
              <span className="wl-field-label">מספר הכיתה</span>
              <div className="wl-toggles" role="radiogroup" aria-label="מספר הכיתה">
                {NUMS.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={num === n} className="wl-btn wl-toggle wl-sq" onClick={() => setNum(n)} data-testid={`wl-num-${n}`}>{n}</button>
                ))}
              </div>
            </div>
            {grade && num ? <p data-testid="wl-place-unit">הכיתה שלכם: <b>{unit}</b>, {school}.</p> : null}
            <p className="wl-sheet-note">בתחילת כל שנת לימודים נשאל שוב, כי הכיתה מתחלפת.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!grade || !num} onClick={() => setStep("hood")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "hood" && (
          <>
            <h2>באיזו שכונה?</h2>
            <div className="wl-place-list" role="radiogroup" aria-label={`שכונות ב${city}`}>
              {HOODS.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={hood === p} className="wl-btn wl-toggle wl-place-row" onClick={() => setHood(p)} data-testid={`wl-hood-${i}`}>
                  <span>{p}</span><span className="wl-place-city">{city}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={noHood} className="wl-btn wl-toggle wl-place-row" onClick={() => setHood(OTHER)} data-testid="wl-hood-other">השכונה שלנו לא ברשימה</button>
            </div>
            {noHood && <p className="wl-sheet-note" data-testid="wl-hood-other-note">ההורה יכתוב לנו את השם. אחרי שנבדוק אותו, הדוכן ייכנס גם לשוק של השכונה.</p>}
            <p className="wl-sheet-note">לא שואלים רחוב או בית. את הכיכר בשוק מקבלים מאיתנו.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!hood} onClick={() => setStep("parent")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "parent" && (
          <>
            <h2>צריך אישור של הורה</h2>
            <p>שלחנו להורה קישור. ככה הוא נראה אצלו:</p>
            <div className="wl-msg" data-testid="wl-place-parent">
              <b>{who}</b> רוצה שהדוכן ״{store.name}״ ייכנס לעיר של דוכן, ב{city}. הוא יופיע:
              <ul className="wl-place-where">
                <li>{noSchool ? "בקניון של הכיתה, אחרי שתכתבו לנו את שם בית הספר ונבדוק אותו" : `ב${mall.slice(1)}, ${school}`}</li>
                <li>{noHood ? "בשוק של השכונה, אחרי שתכתבו לנו את שם השכונה ונבדוק אותו" : `ב${market.slice(1)}, ${hood}`}</li>
                <li>על מפת העיר {city}</li>
              </ul>
              את הדוכן והמוצרים יראו {cls.seenBy} ו{hd.seenBy}. את השם הפרטי רואים רק הכיתה והכיכר. בלי שם משפחה, בלי טלפון ובלי כתובת.
              <br />
              מי שלא אושר לבית הספר או לשכונה לא רואה כלום. אפשר להוציא את הדוכן מהעיר בכל רגע.
            </div>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep("done")} data-testid="wl-place-yes">ההורה מאשר (הדמיה)</button>
              <button type="button" className="wl-btn" onClick={() => setStep("declined")} data-testid="wl-place-no">ההורה לא מאשר</button>
            </div>
          </>
        )}

        {step === "done" && pending && (
          <>
            <h2>בודקים את בית הספר ואת השכונה</h2>
            <p>כשנסיים נודיע לכם ולהורה. בינתיים הדוכן עובד כרגיל, עם הלינק.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => onDone({ kind: "link" })} data-testid="wl-place-ok">הבנתי</button>
            </div>
          </>
        )}

        {step === "done" && !pending && (
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
              <li>{noSchool ? "הקניון של הכיתה: בודקים את בית הספר" : <><b>{mall}</b>{school}</>}</li>
              <li>{noHood ? "השוק של השכונה: בודקים את השכונה" : <><b>{market}</b>{hood}</>}</li>
              <li><b>מפת העיר</b>{city}</li>
            </ul>
            <button type="button" className="wl-btn wl-primary wl-wide wl-share" onClick={() => onDone(result(noSchool ? "hood" : "class", true))} data-testid="wl-place-share">
              <ShareIcon />
              להזמין חברים
            </button>
            <p className="wl-sheet-note">לידכם יש מקום פנוי. על כל דוכן שנפתח בהזמנתכם מקבלים 60 נקודות, והדוכן שלכם גדל.</p>
            <div className="wl-invite-actions">
              {!noSchool && <button type="button" className="wl-btn wl-place-see" onClick={() => onDone(result("class", false))} data-testid="wl-place-see-class">לראות את הקניון</button>}
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
