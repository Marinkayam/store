"use client";

import type { ReactNode } from "react";
import { KupaStall } from "../kupa-art";
import Icon from "../icons";
import Art from "./art";
import type { ArtName } from "./items";
import { ease, lerp, seg, useSceneProgress } from "./use-scene";

/**
 * הסצנות הנעוצות של דף הבית — הסיפור של "מה זה דוכן", בגלילה.
 *
 * כל סצנה גבוהה מהמסך, ובתוכה שכבה דביקה בגובה מסך אחד שמשתנה לפי כמה
 * גללו (p, 0..1). בלי ספריות: מצב React אחד לסצנה, מתעדכן ב-requestAnimationFrame.
 *
 * השפה הגרפית היא של האפליקציה: שמנת, דיו, לבנדר, זית ועץ; קו עץ דק
 * באיורים; כתב Heebo דק וגדול; בלי פינות מעוגלות בממשק (המכשירים
 * המצוירים — טלפון, התראה — הם איור, ושם יש פינות).
 */

const NIGHT = "#2E3150";

export function Scene({
  height,
  label,
  className = "",
  style,
  children,
  testid,
}: {
  height: number;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: (p: number) => ReactNode;
  testid?: string;
}) {
  const { ref, p } = useSceneProgress<HTMLElement>();
  return (
    <section ref={ref} aria-label={label} data-testid={testid} className={`relative ${className}`} style={{ height: `${height * 100}svh`, ...style }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">{children(p)}</div>
    </section>
  );
}

/* ───────────────────────── 1. פתיחה ───────────────────────── */

const ITEMS: { art: ArtName; x: number; y: number; w: number; r: number }[] = [
  { art: "teddy", x: 16, y: 17, w: 23, r: -10 },
  { art: "bracelets", x: 80, y: 15, w: 24, r: 8 },
  { art: "squishy", x: 14, y: 64, w: 27, r: -6 },
  { art: "painting", x: 84, y: 62, w: 25, r: 7 },
  { art: "car", x: 40, y: 85, w: 26, r: -4 },
  { art: "ball", x: 82, y: 86, w: 18, r: 0 },
  { art: "slime", x: 10, y: 88, w: 15, r: 6 },
  { art: "mug", x: 58, y: 66, w: 17, r: -8 },
];
const WORDS = ["צעצועים.", "יצירות.", "סקווישים."];

export function HeroScene() {
  return (
    <Scene height={2.4} label="לכל אחד יש טונות של צעצועים. מה עושים עם זה? עסק!" testid="scene-hero">
      {(p) => {
        const word = WORDS[Math.min(2, Math.floor(p / 0.12))];
        const a = 1 - seg(p, 0.32, 0.37);
        const b = seg(p, 0.38, 0.43) * (1 - seg(p, 0.55, 0.59));
        const c = seg(p, 0.6, 0.67);
        const conv = ease(seg(p, 0.4, 0.82));
        const cart = seg(p, 0.66, 0.78);
        return (
          <div className="relative h-full bg-[var(--canvas)]">
            {ITEMS.map((it, i) => {
              const x = lerp(it.x, 50, conv);
              const y = lerp(it.y, 76, conv);
              const s = lerp(1, 0.22, conv);
              return (
                <div
                  key={it.art}
                  className="absolute"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `min(${it.w}vw, ${it.w * 6}px)`,
                    transform: `translate(-50%, -50%) rotate(${it.r * (1 - conv)}deg) scale(${s})`,
                    opacity: 1 - seg(p, 0.8, 0.9),
                  }}
                >
                  <div className="home-float" style={{ animationDelay: `${i * 0.35}s` }}>
                    <Art name={it.art} />
                  </div>
                </div>
              );
            })}

            <div className="absolute inset-x-0 top-[27%] text-center px-5 pointer-events-none">
              <p className="sr-only">לכל אחד יש טונות של צעצועים, יצירות וסקווישים. מה עושים עם זה? עסק!</p>
              <div aria-hidden style={{ opacity: a, transform: `translateY(${(1 - a) * -30}px)` }}>
                <div className="home-display">לכל אחד יש</div>
                <div className="home-display">טונות של</div>
                <div className="home-display text-[var(--lavender-deep)]" key={word}>
                  <span className="home-word">{word}</span>
                </div>
              </div>
              <div aria-hidden className="absolute inset-x-0 top-0" style={{ opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
                <div className="home-display">מה עושים</div>
                <div className="home-display">עם זה?</div>
              </div>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0"
                style={{ opacity: c, transform: `scale(${0.6 + 0.4 * ease(c)}) rotate(${(1 - c) * -6}deg)` }}
              >
                <div className="home-display home-huge text-[var(--wood)]">עסק!!!</div>
              </div>
            </div>

            <div
              className="absolute left-1/2 bottom-[9%] w-[min(62vw,320px)]"
              style={{ opacity: cart, transform: `translate(-50%, ${(1 - cart) * 40}px)` }}
              aria-hidden
            >
              <KupaStall level={0} bare className="w-full block" />
            </div>

            <div
              className="absolute inset-x-0 bottom-[3%] text-center text-[13px] text-[var(--muted)]"
              style={{ opacity: 1 - seg(p, 0, 0.06) }}
              aria-hidden
            >
              <span className="home-bob inline-block">גוללים למטה ↓</span>
            </div>
          </div>
        );
      }}
    </Scene>
  );
}

/* ───────────────────────── 2. מעגלה לדוכן ───────────────────────── */

const LEVELS: { name: string; line: string }[] = [
  { name: "עגלה קטנה", line: "פותחים דוכן בשתי דקות, מהטלפון. בלי מייל ובלי סיסמה." },
  { name: "דוכן", line: "מוסיפים מוצרים: מצלמים, כותבים שם ומחיר." },
  { name: "דוכן עם סוכך", line: "בוחרים צבעים, רקע וסגנון. הדוכן נראה כמו שלך." },
  { name: "דוכן עם שלט", line: "שולחים את הלינק לחברים, והם נכנסים לראות." },
  { name: "דוכן מואר", line: "מגיעות הזמנות. הטלפון מצלצל על כל אחת." },
  { name: "כוכב השוק", line: "העסק גדל, והקופה מתמלאת במטבעות." },
];

export function BuildScene() {
  return (
    <Scene height={3.4} label="העסק הראשון מתחיל בדוכן: מעגלה קטנה עד כוכב השוק" testid="scene-build">
      {(p) => {
        const level = Math.min(5, Math.floor(p * 6.2));
        const night = level >= 4;
        const L = LEVELS[level];
        return (
          <div
            className="h-full flex flex-col items-center justify-center px-5 pt-16 pb-8 transition-colors duration-700"
            style={{ background: night ? NIGHT : "var(--canvas)", color: night ? "#FBF8F3" : "var(--ink)" }}
            data-level={level}
          >
            <h2 className="text-center">
              <span className="home-display block">העסק הראשון</span>
              <span className="home-display block" style={{ color: night ? "#FFF3C4" : "var(--lavender-deep)" }}>
                מתחיל בדוכן.
              </span>
            </h2>
            <div className="w-full max-w-[460px] mt-4">
              <KupaStall
                level={level}
                build={level}
                bare
                night={night}
                name="הדוכן שלך"
                deco={{ awning: "lavender", flowers: level >= 3, openSign: level >= 3, cat: level >= 5 }}
                className="w-full block"
              />
            </div>
            <div className="text-center mt-3 min-h-[76px] max-w-[22rem]" aria-live="polite">
              <div className="text-[19px] font-bold" key={level}>
                <span className="home-word">{L.name}</span>
              </div>
              <p className="text-[14.5px] leading-relaxed mt-1" style={{ opacity: 0.85 }}>
                {L.line}
              </p>
            </div>
            <div className="flex gap-1.5 mt-4" aria-hidden>
              {LEVELS.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 transition-all duration-300"
                  style={{ width: i === level ? 22 : 8, background: i <= level ? (night ? "#FFF3C4" : "var(--ink)") : night ? "#ffffff44" : "var(--stone)" }}
                />
              ))}
            </div>
          </div>
        );
      }}
    </Scene>
  );
}

/* ───────────────────────── 3. איך זה עובד ───────────────────────── */

const STEPS = [
  { n: "1", title: "מצלמים", line: "תמונה של המוצר, ישר מהטלפון. התמונה מנוקה מהמיקום של הבית." },
  { n: "2", title: "שם ומחיר", line: "כותבים מה זה וכמה זה עולה. אפשר גם צבעים, מלאי ודרופ." },
  { n: "3", title: "שולחים לינק", line: "הלינק לדוכן הולך לחברים בוואטסאפ, ומי שנכנס יכול להזמין." },
];

function Phone({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      data-art
      className="relative w-[min(56vw,250px,26svh)] md:w-[min(300px,36svh)] aspect-[9/18.5] border-[8px] border-[var(--ink)] rounded-[38px] overflow-hidden"
      style={{ background: dark ? NIGHT : "#FBF8F3" }}
    >
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[34%] h-[18px] bg-[var(--ink)] rounded-full z-10" />
      {children}
    </div>
  );
}

export function HowScene() {
  return (
    <Scene height={3} label="איך זה עובד: מצלמים, כותבים שם ומחיר, שולחים לינק" testid="scene-how">
      {(p) => {
        const step = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
        const flash = Math.max(0, 1 - Math.abs(p - 0.26) * 22);
        const price = "15".slice(0, Math.round(seg(p, 0.42, 0.56) * 2));
        const bubble = seg(p, 0.72, 0.8);
        const sent = p > 0.86;
        const S = STEPS[step];
        return (
          <div className="h-full bg-[var(--sand)] flex flex-col md:flex-row items-center justify-center gap-5 md:gap-16 px-5 pt-16 pb-6">
            <div className="text-center md:text-right max-w-[22rem]" aria-live="polite">
              <div className="text-[13px] font-bold tracking-wide text-[var(--muted)]">איך זה עובד</div>
              <div key={step} className="home-word">
                <div className="home-display mt-1">
                  <span className="text-[var(--lavender-deep)]">{S.n}.</span> {S.title}
                </div>
                <p className="text-[15px] leading-relaxed mt-2">{S.line}</p>
              </div>
              <div className="flex gap-1.5 mt-4 justify-center md:justify-start" aria-hidden>
                {STEPS.map((_, i) => (
                  <span key={i} className="h-1.5 transition-all duration-300" style={{ width: i === step ? 22 : 8, background: i <= step ? "var(--ink)" : "var(--stone)" }} />
                ))}
              </div>
            </div>

            <Phone>
              {/* 1: מצלמה */}
              <div className="absolute inset-0 bg-[#2E2A26] transition-opacity duration-300" style={{ opacity: step === 0 ? 1 : 0 }} aria-hidden>
                <div className="absolute left-[18%] right-[18%] top-[28%]">
                  <Art name="squishy" />
                </div>
                {["top-[20%] right-[10%] border-t-4 border-r-4", "top-[20%] left-[10%] border-t-4 border-l-4", "bottom-[30%] right-[10%] border-b-4 border-r-4", "bottom-[30%] left-[10%] border-b-4 border-l-4"].map((c) => (
                  <span key={c} className={`absolute w-7 h-7 border-white ${c}`} />
                ))}
                <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-4 border-white p-1">
                  <span className="block w-full h-full rounded-full bg-white" />
                </span>
                <span className="absolute inset-0 bg-white" style={{ opacity: flash }} />
              </div>
              {/* 2: שם ומחיר */}
              <div className="absolute inset-0 pt-10 px-4 transition-opacity duration-300" style={{ opacity: step === 1 ? 1 : 0 }} aria-hidden>
                <div className="text-[17px] font-bold">מוצר חדש</div>
                <div className="mt-3 bg-[var(--cream)] border-2 border-[var(--sand)] px-8 py-3">
                  <Art name="squishy" />
                </div>
                <div className="text-[11px] mt-3">שם המוצר</div>
                <div className="text-[13px] border-2 border-[var(--stone)] bg-white px-2 py-1.5 mt-1">סקוויש חד-קרן</div>
                <div className="text-[11px] mt-2.5">מחיר</div>
                <div className="text-[16px] font-bold border-2 border-[var(--ink)] bg-white px-2 py-1 mt-1 h-[34px] flex items-center gap-0.5">
                  <bdi>₪{price}</bdi>
                  <span className="home-caret w-[2px] h-[18px] bg-[var(--ink)]" />
                </div>
                <div className="mt-3 bg-[var(--ink)] text-white text-center text-[14px] font-bold py-2.5">שמירה</div>
              </div>
              {/* 3: שולחים */}
              <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: step === 2 ? 1 : 0 }} aria-hidden>
                <div className="bg-[var(--lavender)] h-[24%] pt-9 px-4 text-[15px] font-bold">הדוכן של נועה</div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {(["squishy", "bracelets", "painting", "mug"] as ArtName[]).map((a) => (
                    <div key={a} className="bg-white border border-[var(--sand)]">
                      <div className="bg-[var(--cream)] px-4 py-2">
                        <Art name={a} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-white border-t-2 border-[var(--ink)] p-3" style={{ transform: `translateY(${(1 - bubble) * 100}%)` }}>
                  <div className="text-[11px] text-[var(--muted)]">שליחה בוואטסאפ</div>
                  <div className="mt-1.5 bg-[#DCF8C6] border border-[var(--whatsapp)] p-2 text-[12.5px] leading-snug">
                    פתחתי דוכן! בואו לראות:
                    <br />
                    <b dir="ltr" className="text-[var(--whatsapp)]">duchan.app/noa12</b>
                  </div>
                  <div className="text-[11px] text-[var(--whatsapp)] text-left mt-1" style={{ opacity: sent ? 1 : 0 }}>
                    נשלח ✓✓
                  </div>
                </div>
              </div>
            </Phone>
          </div>
        );
      }}
    </Scene>
  );
}

/* ───────────────────────── 4. דינג! ───────────────────────── */

export function DingScene() {
  return (
    <Scene height={2.4} label="דינג! הזמנה ראשונה מגיעה לטלפון" testid="scene-ding">
      {(p) => {
        const note = seg(p, 0.14, 0.24);
        const buzz = p > 0.14 && p < 0.3 ? Math.sin(p * 400) * 5 * (1 - seg(p, 0.14, 0.3)) : 0;
        const orders = p >= 0.5;
        const paid = p >= 0.74;
        return (
          <div className="h-full flex flex-col md:flex-row items-center justify-center gap-5 md:gap-16 px-5 pt-16 pb-6" style={{ background: NIGHT, color: "#FBF8F3" }}>
            <div className="text-center md:text-right min-h-[96px] md:min-w-[22rem]" aria-live="polite">
              {!orders ? (
                <div key="ding" className="home-word">
                  <div className="home-display text-[#E3C26F]">דינג!</div>
                  <p className="text-[15px] mt-1 opacity-90">מישהו הזמין מהדוכן</p>
                </div>
              ) : (
                <div key="first" className="home-word">
                  <div className="home-display">הזמנה ראשונה.</div>
                  <p className="text-[17px] mt-1 text-[#FFF3C4]">איזו התרגשות!!!</p>
                </div>
              )}
            </div>
            <div style={{ transform: `translateX(${buzz}px)` }}>
              <Phone dark={!orders}>
                {!orders ? (
                  <div aria-hidden>
                    <div className="text-center text-white/80 text-[11px] mt-10">יום שלישי, 6 באוקטובר</div>
                    <div className="text-center text-white text-[56px] font-light leading-none mt-1" dir="ltr">
                      16:42
                    </div>
                    <div
                      className="absolute left-2 right-2 top-[30%] bg-[#FBF8F3]/95 rounded-[16px] p-2.5 flex gap-2 text-[var(--ink)]"
                      style={{ opacity: note, transform: `translateY(${(1 - ease(note)) * -60}px)` }}
                    >
                      <span className="w-9 h-9 shrink-0 bg-[#E3C26F] rounded-[9px] flex items-center justify-center text-[var(--ink)]">
                        <Icon name="stall" size={24} tone="#FBF8F3" />
                      </span>
                      <span className="flex-1 min-w-0 text-right">
                        <span className="flex justify-between text-[10px] text-[var(--muted)]">
                          <span>דוכן</span>
                          <span>עכשיו</span>
                        </span>
                        <span className="block text-[12.5px] font-bold">הזמנה חדשה בדוכן! #1</span>
                        <span className="block text-[11px] leading-snug">
                          מוצר אחד · <bdi>₪15</bdi>. נכנסים לראות מי הזמין.
                        </span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="pt-9 px-3 text-[var(--ink)]" aria-hidden>
                    <div className="text-[17px] font-bold">הזמנות</div>
                    <div
                      className="mt-3 border-2 p-3 transition-colors duration-500"
                      style={{ background: paid ? "var(--ok-bg)" : "#fff", borderColor: paid ? "var(--ok-line)" : "var(--stone)" }}
                    >
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[var(--muted)]">
                          #1 · <b className="text-[var(--ink)] text-[12.5px]">יעל</b>
                        </span>
                        <span
                          className="px-1.5 py-0.5 font-bold transition-colors duration-500"
                          style={paid ? { background: "#E4F3E9", color: "var(--ok-ink)" } : { background: "var(--warn-bg)", color: "var(--warn-ink)" }}
                        >
                          {paid ? "שולם" : "חדש"}
                        </span>
                      </div>
                      <div className="text-[12.5px] mt-2">
                        • סקוויש חד-קרן × 1 · <bdi>₪15</bdi>
                      </div>
                      <div className="text-[11px] text-[var(--muted)] mt-1.5">מסירה אישית · ביט</div>
                      <div className="flex justify-between text-[13px] font-bold border-t border-[var(--sand)] mt-2 pt-1.5">
                        <span>סה&quot;כ</span>
                        <bdi>₪15</bdi>
                      </div>
                      <div className="mt-2.5 bg-[var(--ink)] text-white text-center text-[12.5px] font-bold py-2">{paid ? "נמסר" : "שולם"}</div>
                    </div>
                    {paid && (
                      <div className="absolute inset-0 pointer-events-none">
                        {Array.from({ length: 10 }, (_, i) => (
                          <span
                            key={i}
                            className="home-burst absolute left-1/2 top-[45%] w-5 text-[#E3C26F]"
                            style={{ ["--a" as string]: `${i * 36}deg`, animationDelay: `${(i % 3) * 0.05}s` }}
                          >
                            <Art name="FSTAR" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Phone>
            </div>
          </div>
        );
      }}
    </Scene>
  );
}
