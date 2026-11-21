"use client";

import { useState } from "react";
import { AWNINGS, CLASS_NAME, SCHOOL_NAME } from "./data";
import { EmptyPlot } from "./stalls";

/**
 * הדמיה של הצד השני של ההזמנה: מה רואה מי שקיבל את הקישור.
 *
 * העיקרון שההדמיה מראה: הקישור לא פותח את הקניון. הוא מראה רק מי הזמין
 * ולאן, ומוביל להצטרפות. את החנויות של הכיתה רואים רק אחרי שהורה אישר.
 * אפשר להצטרף כדי לפתוח דוכן, או רק כדי לבקר (משפחה בלי חנות).
 */
export type InviteResult =
  | { kind: "store"; owner: string; name: string; awning: string }
  | { kind: "visit"; owner: string }
  | { kind: "declined" };

export default function InviteSim({ inviter, onDone, onClose }: { inviter: string; onDone: (r: InviteResult) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<"store" | "visit">("store");
  const [owner, setOwner] = useState("גלי");
  const [name, setName] = useState("");
  const [awning, setAwning] = useState(AWNINGS[4].color);
  const who = owner.trim() || "גלי";
  const storeName = name.trim() || `הדוכן של ${who}`;
  const steps = path === "store" ? 4 : 3;

  return (
    <div className="wl-invite" role="dialog" aria-modal="true" aria-label="הצד של מי שקיבל את ההזמנה" data-testid="wl-invite-sim" data-step={step}>
      <div className="wl-invite-bar">
        <span className="wl-sim-tag">הדמיה: מה רואה מי שקיבל את הקישור</span>
        <button type="button" className="wl-sheet-x wl-invite-x" onClick={onClose} aria-label="לסגור את ההדמיה">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="wl-invite-body">
        <div className="wl-invite-steps" aria-hidden>
          {Array.from({ length: steps }, (_, i) => <span key={i} data-on={i <= Math.min(step, steps - 1) ? "1" : undefined} />)}
        </div>

        {step === 0 && (
          <>
            <div className="wl-invite-art"><EmptyPlot lod="mid" invited /></div>
            <h2>{inviter} מזמינה אותך לקניון של {CLASS_NAME}</h2>
            <p>יש מקום פנוי ממש ליד הדוכן שלה.</p>
            <p className="wl-sheet-note">עוד לא רואים כאן את החנויות של הכיתה. קודם מצטרפים, באישור הורה.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => { setPath("store"); setStep(1); }} data-testid="wl-join-store">רוצה לפתוח דוכן</button>
              <button type="button" className="wl-btn" onClick={() => { setPath("visit"); setStep(1); }} data-testid="wl-join-visit">רק לבקר</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>איך קוראים לך?</h2>
            <label className="wl-field" htmlFor="wl-invitee-name">
              <span className="wl-field-label">שם פרטי בלבד</span>
              <input id="wl-invitee-name" className="wl-input" value={owner} maxLength={14} onChange={(e) => setOwner(e.target.value)} autoComplete="off" />
            </label>
            <p className="wl-sheet-note">השם הפרטי מוצג רק לחברי הכיתה, בתוך הקניון. הוא לא מופיע בדף החנות ולא בקישורים.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep(2)} data-testid="wl-join-next">המשך</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>צריך אישור של הורה</h2>
            <p>שלחנו להורה קישור. ככה הוא נראה אצלו:</p>
            <div className="wl-msg" data-testid="wl-parent-view">
              <b>{who}</b> {path === "store" ? "רוצה לפתוח דוכן" : "רוצה לבקר"} בקניון של {CLASS_NAME}, {SCHOOL_NAME}. הזמינה: {inviter}.
              <br />
              מה יראו חברי הכיתה: השם הפרטי{path === "store" ? ", שם הדוכן והמוצרים" : ""}. בלי שם משפחה, בלי טלפון ובלי כתובת.
              <br />
              מי יראה: רק ילדים והורים מהכיתה שאושרו.
            </div>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep(path === "store" ? 3 : 4)} data-testid="wl-parent-yes">ההורה מאשר (הדמיה)</button>
              <button type="button" className="wl-btn" onClick={() => onDone({ kind: "declined" })} data-testid="wl-parent-no">ההורה לא מאשר</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>הדוכן שלך</h2>
            <label className="wl-field" htmlFor="wl-invitee-store">
              <span className="wl-field-label">שם הדוכן</span>
              <input id="wl-invitee-store" className="wl-input" value={name} placeholder={`הדוכן של ${who}`} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </label>
            <div className="wl-field">
              <span className="wl-field-label">צבע הסוכך</span>
              <div className="wl-swatches" role="radiogroup" aria-label="צבע הסוכך">
                {AWNINGS.map((a) => (
                  <button key={a.key} type="button" role="radio" aria-checked={awning === a.color} aria-label={a.label} className="wl-swatch" style={{ background: a.color }} onClick={() => setAwning(a.color)} />
                ))}
              </div>
            </div>
            <p className="wl-sheet-note">באפליקציה, כאן נפתח הדוכן הרגיל: מוסיפים מוצר ראשון, וההורה מפעיל את הדוכן.</p>
            <div className="wl-invite-actions">
              <button type="button" className="wl-btn wl-primary" onClick={() => setStep(4)} data-testid="wl-join-open">לפתוח את הדוכן</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>{path === "store" ? `${storeName} נפתח ליד ${inviter}` : `${who}, ברוכים הבאים לקניון של ${CLASS_NAME}`}</h2>
            <p>
              {path === "store"
                ? `כשנכנסים, המצלמה נוחתת ישר על המקום החדש, והדוכן של ${inviter} מסומן "הזמינה אותך".`
                : `כשנכנסים, המצלמה נוחתת ישר על הדוכן של ${inviter}, והוא מסומן "הזמינה אותך". המקום הפנוי נשאר פנוי.`}
            </p>
            <div className="wl-invite-actions">
              <button
                type="button" className="wl-btn wl-primary" data-testid="wl-join-done"
                onClick={() => onDone(path === "store" ? { kind: "store", owner: who, name: storeName, awning } : { kind: "visit", owner: who })}
              >
                לראות את הקניון
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
