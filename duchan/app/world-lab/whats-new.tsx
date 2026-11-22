"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TIERS, type LabStore, type Tier } from "./data";
import { EmptyPlot, WorldStall } from "./stalls";

/**
 * "פתחנו לכם משחק": מה שרואה מי שכבר יש לה דוכן, בפעם הראשונה שהיא נכנסת
 * אחרי שהעולם עולה. המשחק הוא לבנות עיר, והדוכן שלה עומד בתוכה. שלושה
 * צעדים קצרים, כל אחד עם הדוכן *שלה* (אותו איור, אותו שלט, אותם מוצרים),
 * סרטון של חצי דקה, וכפתור אחד: להכניס את הדוכן לעיר (עיר, בית ספר, שכונה).
 *
 * מה שאפשר לגעת בו: בצעד השני גוררים מחוון, והדוכן גדל מול העיניים.
 *
 * הסרטון: אותו קובץ שמשתפים ברשתות (כתוביות צרובות, כך שאפשר לצפות גם בלי
 * קול). הוא לא נטען עד שלוחצים עליו.
 */
const STEPS = [
  { title: "פתחנו לכם משחק", body: "בונים יחד עיר של דוכנים, והדוכן שלכם עומד בה. יותר אנשים רואים אותו, ואפשר למכור יותר." },
  { title: "מזמינים חברים, והעיר גדלה", body: "כל דוכן חדש מוסיף לעיר עוד רחוב, והדוכן שלכם גדל איתה. גררו, ותראו לאן אפשר להגיע." },
  { title: "יום שוק, וטיול בעיר", body: "כולם פותחים יחד, עם בלונים. ואפשר לראות מה מוכרים בכיתות אחרות." },
];

/** מאיפה הסרטון. בקובץ העצמאי (הקישור המבודד) הוא ארוז בפנים. */
const videoSrc = () => (typeof window !== "undefined" && (window as unknown as { __WL_VIDEO?: string }).__WL_VIDEO) || "/video/whats-new-world.mp4";

function Stall({ store, tier, fest, grew }: { store: LabStore; tier: Tier; fest?: boolean; grew?: boolean }) {
  return (
    <div className="wl-new-stall" style={{ "--aw": store.awning, "--lavender": store.awning } as React.CSSProperties}>
      <WorldStall store={{ ...store, tier }} lod="near" fest={fest} grew={grew} />
    </div>
  );
}

export default function WhatsNew({ store, neighbor, onGo, onClose }: { store: LabStore; neighbor: LabStore; onGo: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [tier, setTier] = useState<Tier>(1);
  const [grew, setGrew] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const last = step === STEPS.length - 1;

  function play() {
    // flushSync: הסרטון חייב להיות על המסך ולהתחיל לנגן בתוך אותה לחיצה,
    // אחרת ספארי באייפון חוסם ניגון עם קול (כמו ב-explainer-video.tsx).
    flushSync(() => setPlaying(true));
    video.current?.play().catch(() => {});
  }
  function stop() {
    video.current?.pause();
    setPlaying(false);
  }

  return (
    <div className="wl-new" role="dialog" aria-modal="true" aria-label="פתחנו לכם משחק" data-testid="wl-new" data-step={step}>
      <div className="wl-new-card">
        <button type="button" className="wl-x wl-new-x" onClick={onClose} aria-label="לסגור" data-testid="wl-new-x">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>

        <div className="wl-new-stage" data-testid="wl-new-stage">
          {playing ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- הכתוביות צרובות בסרטון
            <video ref={video} className="wl-new-video" src={videoSrc()} controls playsInline preload="none" onEnded={stop} data-testid="wl-new-video" />
          ) : step === 0 ? (
            <div className="wl-new-row">
              <div className="wl-new-stall wl-new-side" style={{ "--aw": neighbor.awning, "--lavender": neighbor.awning } as React.CSSProperties}>
                <WorldStall store={neighbor} lod="mid" />
              </div>
              <Stall store={store} tier={1} />
              <div className="wl-new-stall wl-new-side"><EmptyPlot lod="mid" invited={false} /></div>
            </div>
          ) : step === 1 ? (
            <Stall store={store} tier={tier} grew={grew} key={tier} />
          ) : (
            <Stall store={store} tier={3} fest />
          )}
        </div>

        {!playing && step === 1 && (
          <label className="wl-new-grow">
            <input
              type="range" min={1} max={4} step={1} value={tier} aria-label="כמה נקודות" data-testid="wl-new-range"
              onChange={(e) => { const t = Number(e.target.value) as Tier; setGrew(t > tier); setTier(t); }}
            />
            <span data-testid="wl-new-tier"><b>{TIERS[tier - 1].name}</b>{TIERS[tier - 1].at ? ` · ${TIERS[tier - 1].at} נקודות` : ""}</span>
          </label>
        )}

        {!playing && (
          <>
            <h2>{STEPS[step].title}</h2>
            <p>{STEPS[step].body}</p>
            <div className="wl-new-dots" role="tablist" aria-label="צעדים">
              {STEPS.map((s, i) => (
                <button key={s.title} type="button" role="tab" aria-selected={step === i} aria-label={`צעד ${i + 1}: ${s.title}`} onClick={() => setStep(i)} data-testid={`wl-new-dot-${i}`} />
              ))}
            </div>
          </>
        )}

        <div className="wl-new-actions">
          {playing ? (
            <button type="button" className="wl-btn" onClick={stop} data-testid="wl-new-stop">חזרה</button>
          ) : (
            <button type="button" className="wl-btn" onClick={play} data-testid="wl-new-play">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
              סרטון של חצי דקה
            </button>
          )}
          {last || playing ? (
            <button type="button" className="wl-btn wl-primary" onClick={onGo} data-testid="wl-new-go">להכניס את הדוכן לעיר</button>
          ) : (
            <button type="button" className="wl-btn wl-primary" onClick={() => setStep(step + 1)} data-testid="wl-new-next">הבא</button>
          )}
        </div>
      </div>
    </div>
  );
}
