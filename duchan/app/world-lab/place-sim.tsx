"use client";

import { useState } from "react";
import { COMMUNITIES, type CommunityKind, type LabStore } from "./data";
import { EmptyPlot, WorldStall } from "./stalls";

/**
 * "איפה הדוכן שלכם יעמוד?": המסכים שבהם בוחרים עיר, ואז בית ספר וכיתה
 * (הקניון של הכיתה) או שכונה (השוק של השכונה). אפשר גם להישאר רק עם הלינק,
 * כמו היום: הדוכן נכנס לעיר רק אם בוחרים בזה, ורק אחרי שהורה אישר.
 *
 * מה שההדמיה מראה:
 *   • אין שדה טקסט חופשי למקום. בוחרים מרשימה, כך שאי אפשר לכתוב כתובת.
 *   • בשכונה שואלים רק שכונה. לא רחוב ולא בית: את הכיכר נותנת המערכת.
 *   • ההורה רואה בדיוק מי יראה את הדוכן ואת השם, לפני שמשהו מופיע.
 *   • הסוף הוא כפתור אחד: להזמין חברים למקום הפנוי שליד.
 *
 * הערים כאן אמיתיות; שמות בתי הספר והשכונות מומצאים. באפליקציה הם יגיעו
 * מרשימה רשמית, לא מהקלדה.
 */
export type PlaceResult =
  | { kind: CommunityKind; city: string; place: string; unit: string; grade?: string; num?: number; invite: boolean }
  | { kind: "link" };

const CITIES = ["יבנה", "רחובות", "אשדוד", "ראשון לציון", "נס ציונה", "תל אביב-יפו", "ירושלים", "חיפה", "באר שבע", "נתניה", "מודיעין", "כפר סבא"];
const SCHOOLS = ["הדקל", "הגפן", "הרימון", "התמר", "האלון"].map((x) => `בית ספר ${x}`);
const HOODS = ["הדקלים", "הגפן", "נווה אילן", "הפרחים", "רמת הים"].map((x) => `שכונת ${x}`);
const GRADES = ["ד", "ה", "ו", "ז", "ח"];
const NUMS = [1, 2, 3, 4, 5, 6];
const OTHER = "other";

type Step = "where" | "city" | "place" | "class" | "parent" | "done" | "declined" | "link";

function SchoolArt() {
  return (
    <svg viewBox="0 0 64 48" width="64" height="48" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 44V20h48v24M4 44h56M24 20l8-9 8 9M32 11V4h8v4h-8" />
      <path d="M27 44V32h10v12M14 27h6v6h-6zM44 27h6v6h-6z" />
    </svg>
  );
}
function HoodArt() {
  return (
    <svg viewBox="0 0 64 48" width="64" height="48" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 44h56M8 44V26l10-9 10 9v18M36 44V22l10-10 10 10v22" />
      <path d="M15 44v-9h6v9M43 44V33h6v11M42 24h8" />
    </svg>
  );
}
export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5V20h14v-7.5" />
    </svg>
  );
}

export default function PlaceSim({ store, neighbor, onDone, onClose }: { store: LabStore; neighbor: LabStore; onDone: (r: PlaceResult) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("where");
  const [kind, setKind] = useState<CommunityKind>("class");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [place, setPlace] = useState("");
  const [grade, setGrade] = useState("");
  const [num, setNum] = useState(0);

  const com = COMMUNITIES[kind];
  const who = store.owner ?? "נועה";
  const isClass = kind === "class";
  const missing = place === OTHER;
  const cities = CITIES.filter((c) => c.includes(q.trim()));
  const places = isClass ? SCHOOLS : HOODS;
  const unit = isClass ? `${grade}׳${num}` : com.lots.h2;
  const mall = com.mallOf(unit);
  const order: Step[] = isClass ? ["where", "city", "place", "class", "parent", "done"] : ["where", "city", "place", "parent", "done"];
  const at = order.indexOf(step);
  const back: Step | null = step === "parent" && missing ? "place" : at > 0 && step !== "done" ? order[at - 1] : null;
  const result = (invite: boolean): PlaceResult =>
    isClass ? { kind, city, place, unit, grade, num, invite } : { kind, city, place, unit, invite };

  return (
    <div className="wl-invite wl-where" role="dialog" aria-modal="true" aria-label="איפה הדוכן שלכם יעמוד" data-testid="wl-where" data-step={step}>
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

        {step === "where" && (
          <>
            <h2>איפה הדוכן שלכם יעמוד?</h2>
            <div className="wl-place-opts">
              <button type="button" className="wl-place-opt" onClick={() => { setKind("class"); setPlace(""); setStep("city"); }} data-testid="wl-place-class">
                <SchoolArt />
                <span><b>בקניון של הכיתה</b>ליד החברים מהכיתה</span>
              </button>
              <button type="button" className="wl-place-opt" onClick={() => { setKind("hood"); setPlace(""); setStep("city"); }} data-testid="wl-place-hood">
                <HoodArt />
                <span><b>בשוק של השכונה</b>ליד השכנים</span>
              </button>
            </div>
            <button type="button" className="wl-btn wl-wide" onClick={() => setStep("link")} data-testid="wl-place-link">להישאר רק עם הלינק</button>
            <p className="wl-sheet-note">הדוכן נכנס לעיר רק אחרי שהורה אישר. בלי זה הוא נשאר כמו היום.</p>
          </>
        )}

        {step === "city" && (
          <>
            <h2>באיזו עיר?</h2>
            <label className="wl-field" htmlFor="wl-place-q">
              <span className="wl-field-label">מחפשים עיר</span>
              <input id="wl-place-q" className="wl-input" value={q} maxLength={20} onChange={(e) => setQ(e.target.value)} autoComplete="off" inputMode="search" data-testid="wl-place-q" />
            </label>
            {cities.length ? (
              <div className="wl-toggles" role="radiogroup" aria-label="עיר">
                {cities.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={city === c} className="wl-btn wl-toggle" onClick={() => setCity(c)} data-testid={`wl-city-${CITIES.indexOf(c)}`}>{c}</button>
                ))}
              </div>
            ) : <p className="wl-sheet-note" data-testid="wl-city-none">לא מצאנו עיר כזו. אפשר לנסות שם אחר.</p>}
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!city} onClick={() => setStep("place")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "place" && (
          <>
            <h2>{isClass ? "באיזה בית ספר?" : "באיזו שכונה?"}</h2>
            <div className="wl-place-list" role="radiogroup" aria-label={isClass ? `בתי ספר ב${city}` : `שכונות ב${city}`}>
              {places.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={place === p} className="wl-btn wl-toggle wl-place-row" onClick={() => setPlace(p)} data-testid={`wl-spot-${i}`}>
                  <span>{p}</span><span className="wl-place-city">{city}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={missing} className="wl-btn wl-toggle wl-place-row" onClick={() => setPlace(OTHER)} data-testid="wl-spot-other">
                {isClass ? "בית הספר שלנו לא ברשימה" : "השכונה שלנו לא ברשימה"}
              </button>
            </div>
            {missing && <p className="wl-sheet-note" data-testid="wl-spot-other-note">ההורה יכתוב לנו את השם. אחרי שנבדוק אותו, הדוכן ייכנס לעיר.</p>}
            {!isClass && <p className="wl-sheet-note">לא שואלים רחוב או בית. את הכיכר בשוק מקבלים מאיתנו.</p>}
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!place} onClick={() => setStep(isClass && !missing ? "class" : "parent")} data-testid="wl-place-next">המשך</button>
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
            {grade && num ? <p data-testid="wl-place-unit">הכיתה שלכם: <b>{unit}</b>, {place}.</p> : null}
            <p className="wl-sheet-note">בתחילת כל שנת לימודים נשאל שוב, כי הכיתה מתחלפת.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" disabled={!grade || !num} onClick={() => setStep("parent")} data-testid="wl-place-next">המשך</button>
            </div>
          </>
        )}

        {step === "parent" && (
          <>
            <h2>צריך אישור של הורה</h2>
            <p>שלחנו להורה קישור. ככה הוא נראה אצלו:</p>
            <div className="wl-msg" data-testid="wl-place-parent">
              {missing ? (
                <>
                  <b>{who}</b> רוצה שהדוכן ״{store.name}״ יעמוד ב{isClass ? "קניון של הכיתה" : "שוק של השכונה"}, ב{city}.
                  <br />
                  {isClass ? "בית הספר עוד לא ברשימה שלנו. כתבו לנו את שמו, ונבדוק אותו לפני שהדוכן נכנס לעיר." : "השכונה עוד לא ברשימה שלנו. כתבו לנו את שמה, ונבדוק אותה לפני שהדוכן נכנס לעיר."}
                </>
              ) : (
                <>
                  <b>{who}</b> רוצה שהדוכן ״{store.name}״ יעמוד ב{mall.slice(1)}, {place}, {city}.
                  <br />
                  את הדוכן והמוצרים יראו {com.seenBy}. את השם הפרטי רואה {com.namesBy}. בלי שם משפחה, בלי טלפון ובלי כתובת.
                  <br />
                  {com.outsiders} אפשר להוציא את הדוכן מהעיר בכל רגע.
                </>
              )}
            </div>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep("done")} data-testid="wl-place-yes">ההורה מאשר (הדמיה)</button>
              <button type="button" className="wl-btn" onClick={() => setStep("declined")} data-testid="wl-place-no">ההורה לא מאשר</button>
            </div>
          </>
        )}

        {step === "done" && missing && (
          <>
            <h2>{isClass ? "בודקים את בית הספר" : "בודקים את השכונה"}</h2>
            <p>כשנסיים נודיע לכם ולהורה. בינתיים הדוכן עובד כרגיל, עם הלינק.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => onDone({ kind: "link" })} data-testid="wl-place-ok">הבנתי</button>
            </div>
          </>
        )}

        {step === "done" && !missing && (
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
            <h2 data-testid="wl-place-title">הדוכן שלכם ב{mall.slice(1)}</h2>
            <p>{place}, {city}. לידכם יש מקום פנוי.</p>
            <button type="button" className="wl-btn wl-primary wl-wide wl-share" onClick={() => onDone(result(true))} data-testid="wl-place-share">
              <ShareIcon />
              {isClass ? "להזמין חברים מהכיתה" : "להזמין שכנים"}
            </button>
            <p className="wl-sheet-note">על כל דוכן שנפתח בהזמנתכם מקבלים 60 נקודות, והדוכן שלכם גדל.</p>
            <button type="button" className="wl-btn wl-wide" onClick={() => onDone(result(false))} data-testid="wl-place-see">לראות את ה{com.mall}</button>
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

        {step === "link" && (
          <>
            <h2>הדוכן נשאר רק עם הלינק</h2>
            <p>רואה אותו רק מי שקיבל מכם את הלינק, כמו היום. אפשר להיכנס לעיר מתי שרוצים, מההגדרות של הדוכן.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => onDone({ kind: "link" })} data-testid="wl-place-ok">הבנתי</button>
              <button type="button" className="wl-btn" onClick={() => setStep("where")} data-testid="wl-place-again">לבחור מקום</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
