"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/app/icons";
import {
  AWNINGS, CAMPUS, CITY_K, CLASSES, COMMUNITIES, GRADE_ROWS, LEVEL_NAMES, LOT_STORES, MALL, MARKET_IN, MY_START_COUNTS, NOTICES, POINT_SOURCES, TIERS,
  STAGES, STALL, STORES, SURPRISES, WORLD, ZONES,
  alleyOpen, cityPt, layout, isNightAt, lotSize, pointsOf, tierOf, type ClassSize, type CommunityKind, type PointKey, type Deco, type LabStore, type Level, type Plot,
  type Community,
} from "./data";
import WhatsNew from "./whats-new";
import InviteSim, { type InviteResult } from "./invite-sim";
import PlaceSim, { ShareIcon, type PlaceResult } from "./place-sim";
import { Foreground, Scenery } from "./scenery";
import { EmptyPlot, GardenPlot, WorldStall, type Lod } from "./stalls";
import StoreSim from "./store-sim";

/**
 * עולם דוכן — אב־טיפוס.
 *
 * עולם אחד, מצלמה אחת. המישור כולו (עיר, בית ספר, קניון, רחובות, דוכנים)
 * מצויר פעם אחת, והמצלמה היא transform על המישור: הזזה והגדלה. "רמה" היא
 * גובה מצלמה, לא מסך נפרד — ולכן כשמתרחקים רואים את אותו דוכן קטן יותר
 * בתוך אותו רחוב, ולא עוברים לדף אחר.
 *
 * חמש רמות: 0 עיר · 1 בית ספר · 2 קניון של כיתה · 3 רחוב · 4 דוכן.
 * רמה רחוקה נפתחת רק כשיש בה מה לראות (STAGES ב-data.ts).
 *
 * מה ששומר על זה קל בטלפון:
 *   - תנועת המצלמה היא transform בלבד (המעבד הגרפי), בלי ציור מחדש בכל פריים.
 *   - לכל דוכן שלוש רמות פירוט; רק הדוכן שבמרכז מקבל את הציור המלא.
 *   - בזמן תעופה כל האנימציות הקטנות עוצרות, ופרטים רחוקים לא מונפשים.
 *
 * הכול כאן מצב בזיכרון של הדפדפן. אין קריאה לשרת ואין נתונים אמיתיים.
 */

const DUR = 720;
const CITY_C = cityPt(1200, 2150);
const SCHOOL_C = { x: CAMPUS.x + CAMPUS.w / 2, y: CAMPUS.y + CAMPUS.h / 2 };
const MALL_C = { x: MALL.x + MALL.w / 2, y: MALL.y + MALL.h / 2 };
/** מרכזי המצלמה ברמת הרחוב: רחוב הסוככים, הכיכר, הסמטה, השטח הפתוח */
const ROWS = [MALL.y + 400, MALL.y + 690, MALL.y + 1130, MALL.y + 1300];

interface Cam { x: number; y: number; s: number; lv: Level }

/**
 * השטח שהממשק משאיר פנוי: סרגל עליון, סולם הרמות בצד ימין, ולמטה כפתורים
 * (ובקרבה לדוכן גם כרטיס). המצלמה ממרכזת את מה שמסתכלים עליו בתוך השטח
 * הזה, לא במרכז המסך, כדי ששום דוכן לא יסתתר מאחורי כפתור.
 * בעיר אין שוליים: העיר היא רקע, ומותר שהממשק יכסה חלק ממנה.
 */
function insets(level: Level, h: number) {
  if (level === 0) return { r: 0, t: 0, b: 0 };
  return { r: 62, t: 62, b: level === 4 ? Math.min(250, h * 0.3) : 104 };
}

function scaleFor(level: Level, w: number, h: number): number {
  const i = insets(level, h);
  const fw = w - i.r;
  const fh = h - i.t - i.b;
  if (level === 0) return Math.min(fw / WORLD.w, fh / (4300 * CITY_K));
  if (level === 1) return Math.min(fw / (CAMPUS.w + 260), fh / (CAMPUS.h + 260));
  if (level === 2) return Math.min(fw / 1150, fh / 1540);
  if (level === 3) return Math.min(fw / 270, fh / 430, 1.9);
  return Math.min(fw / 108, fh / 96, 5.6);
}

function clampCam(level: Level, x: number, y: number) {
  const box =
    level === 0 ? [700 * CITY_K, 1700 * CITY_K, 1300 * CITY_K, 3300 * CITY_K]
    : level === 1 ? [SCHOOL_C.x - 800, SCHOOL_C.x + 800, SCHOOL_C.y - 1500, SCHOOL_C.y + 1500]
    : level === 2 ? [MALL_C.x - 260, MALL_C.x + 260, MALL_C.y - 380, MALL_C.y + 380]
    : [MALL.x + 50, MALL.x + MALL.w - 50, MALL.y + 180, MALL.y + MALL.h - 40];
  return { x: Math.min(box[1], Math.max(box[0], x)), y: Math.min(box[3], Math.max(box[2], y)) };
}

const nearestRow = (y: number) => ROWS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));

const SceneryMemo = memo(Scenery);
const ForegroundMemo = memo(Foreground);

/** המתחם שלי */
const HOME = "h2";

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

type SheetKind = "decorate" | "invite" | "notices" | "lab" | "grow" | null;

/* אייקונים קטנים לסולם הרמות */
function LevelIcon({ level }: { level: Level }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {level === 0 && <path d="M3 20V11l4-3 4 3v9M11 20V6l5-3v17M16 9h5v11M3 20h18M6.500 14h1M6.500 17h1M13.500 9h.5M13.500 13h.5" {...p} />}
      {level === 1 && <path d="M3 20V10l9-5 9 5v10M3 20h18M10 20v-5h4v5M12 5V2.500l3.500 1L12 4.500M6.500 12h2M15.500 12h2M6.500 15.500h2M15.500 15.500h2" {...p} />}
      {level === 2 && <path d="M3 20V12a9 9 0 0 1 18 0v8M3 20h18M9 20v-6h6v6M7 9.500h10" {...p} />}
      {level === 3 && <path d="M2 8h9v3a1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0zM13 8h9v3a1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0zM3.500 12.500V19M9.500 12.500V19M14.500 12.500V19M20.500 12.500V19M1.500 19h21" {...p} />}
      {level === 4 && <path d="M3 6h18v2H3zM3 8h4.500v3a2.250 2 0 0 1-4.500 0zM7.500 8H12v3a2.250 2 0 0 1-4.500 0zM12 8h4.500v3a2.250 2 0 0 1-4.500 0zM16.500 8H21v3a2.250 2 0 0 1-4.500 0zM5 11v8M19 11v8M3 18h18" {...p} />}
    </svg>
  );
}

/**
 * review — חנויות מקובץ מקומי (ראה page.tsx), לסקירה בלבד. אין "הדוכן שלי",
 * מתחילים מהקניון, ובוחרים קבוצה של 11 חנויות בכל פעם.
 */
export default function World({ review }: { review?: LabStore[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  /** "חידוד במנוחה" (ראה applyCam). ref כדי שהמצלמה תקרא את הערך העדכני. */
  const sharpRef = useRef(false);
  const restScale = useRef<number | null>(null);
  const vp = useRef({ w: 390, h: 800 });
  const camRef = useRef<Cam>({ x: 0, y: 0, s: 1, lv: 4 });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef(0);
  const selfHash = useRef(false);
  /** ההזזה של שכבת הקניון (ביקור במתחם אחר). המצלמה נשארת במערכת של המתחם שלי. */
  const offRef = useRef({ x: 0, y: 0 });
  /** כמה להרחיק ולהרים את המצלמה מול מבנה גבוה. מתעדכן בכל ציור (ראה למטה). */
  const frameFor = useRef<(x: number, y: number) => { k: number; up: number }>(() => ({ k: 1, up: 0 }));

  /** שלב הצמיחה: כמה דוכנים יש בכיתה, ועד איזו רמה אפשר להתרחק */
  const [stage, setStage] = useState(STAGES.length - 1);
  const size: ClassSize = review ? 11 : STAGES[stage].size;
  const far: Level = review ? 2 : STAGES[stage].far;
  const [group, setGroup] = useState(0);
  const groups = review ? Math.ceil(review.length / 11) : 0;
  const [night, setNight] = useState(false);
  const nightRef = useRef(false);
  nightRef.current = night;
  const [dusk, setDusk] = useState(false);
  const [calm, setCalm] = useState(false);
  const [sharp, setSharp] = useState(false);
  const [level, setLevel] = useState<Level>(4);
  const [moving, setMoving] = useState(false);
  const [, setTick] = useState(0); // המצלמה עצמה חיה ב-ref; זה רק מבקש ציור מחדש
  const [ready, setReady] = useState(false);
  const [storeOpen, setStoreOpen] = useState<string | null>(review ? null : "noa");
  const [storeShown, setStoreShown] = useState<string>(review ? review[0].id : "noa");
  const [fromWorld, setFromWorld] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [mine, setMine] = useState<{ awning: string; deco: Deco }>(() => {
    const s = STORES.find((x) => x.mine)!;
    return { awning: s.awning, deco: s.deco };
  });
  const [invited, setInvited] = useState<string[]>([]);
  const [invitePlot, setInvitePlot] = useState<string | null>(null);
  /** דוכנים שנפתחו דרך הזמנה, לפי המקום שבו הם עומדים */
  const [joined, setJoined] = useState<Record<string, LabStore>>({});
  /** המקום שעל ההזמנה שלו מסתכלים "מהצד השני" */
  const [inviteView, setInviteView] = useState<string | null>(null);
  /** הנקודות שלי, והדרגה שהדוכן הגיע אליה זה עתה (בשביל אנימציית הבנייה) */
  const [counts, setCounts] = useState<Record<PointKey, number>>(MY_START_COUNTS);
  const points = pointsOf(counts);
  const [grew, setGrew] = useState(0);
  /** מה קרה בלחיצה האחרונה בגיליון הצמיחה (שם הבועה מוסתרת) */
  const [growMsg, setGrowMsg] = useState("");
  /** אור: לפי השעה, או קבוע (רק מתוך "ניסוי") */
  const [timeMode, setTimeMode] = useState<"auto" | "day" | "night">("auto");
  /** הכרטיס שנסגר באיקס: מזהה המקום. נפתח שוב כשעוברים למקום אחר. */
  const [cardOff, setCardOff] = useState<string | null>(null);
  const myTier = tierOf(points);
  /** סוג הקהילה: כיתה בבית ספר, או כיכר בשכונה. אותו עולם, שמות אחרים. */
  const [kind, setKind] = useState<CommunityKind>("class");
  /** המקום שנבחר ב"איפה הדוכן": שם בית הספר או השכונה, והכיתה. מחליף את שמות ברירת המחדל. */
  const [placed, setPlaced] = useState<Exclude<PlaceResult, { kind: "link" }> | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const com = useMemo((): Community => {
    const base = COMMUNITIES[kind];
    if (!placed || placed.kind !== kind) return base;
    if (kind === "hood" || !placed.grade || !placed.num) return { ...base, place: placed.place };
    const grades = ["ד", "ה", "ו", "ז", "ח"];
    const g = placed.grade;
    const o = grades[grades.indexOf(g) + 1] ?? grades[grades.indexOf(g) - 1];
    const near = [1, 2, 3].filter((n) => n !== placed.num);
    return {
      ...base, place: placed.place, sign: placed.place,
      rows: [`שכבת ${g}׳`, `שכבת ${o}׳`],
      lots: { h1: `${g}׳${near[0]}`, h2: placed.unit, h3: `${g}׳${near[1]}`, v1: `${o}׳1`, v2: `${o}׳2`, v3: `${o}׳3` },
    };
  }, [kind, placed]);
  /** המתחם שנמצאים בו עכשיו. "h2" הוא שלי; כל אחר הוא ביקור אצל אחרים. */
  const [here, setHere] = useState(HOME);
  const visiting = here !== HOME;
  const [homeAfter, setHomeAfter] = useState(false);
  /** יום שוק: אין, בקרוב, או היום. והאם הדוכן שלי נרשם. */
  const [market, setMarket] = useState<"off" | "soon" | "on">("soon");
  const [marketIn, setMarketIn] = useState(false);
  /** "מה חדש": הפופאפ שרואה מי שכבר יש לה דוכן, בכניסה הראשונה */
  const [news, setNews] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [bubble, setBubble] = useState<{ text: string; k: number } | null>(null);
  const [fx, setFx] = useState({ splash: 0, hop: 0, cat: 0, watered: 0 });

  const homePlots = useMemo(
    () =>
      layout(size, review ? review.slice(group * 11, group * 11 + 11) : undefined).map((p) =>
        p.kind === "empty" && joined[p.id] ? { ...p, kind: "stall" as const, store: joined[p.id] } : p
      ),
    [group, joined, review, size]
  );
  const homeStores = useMemo(
    () => review ?? [...STORES.map((s) => (s.mine ? { ...s, awning: mine.awning, deco: mine.deco, tier: myTier } : s)), ...Object.values(joined)],
    [joined, mine, myTier, review]
  );
  // בביקור: הדוכנים של המתחם האחר, מסודרים באותה צורה. את הדוכן שלי לא רואים שם.
  const lotList = visiting ? LOT_STORES[here] ?? [] : null;
  const liveSize: ClassSize = lotList ? lotSize(lotList.length) : size;
  const plots = useMemo(() => (lotList ? layout(lotSize(lotList.length), lotList) : homePlots), [homePlots, lotList]);
  const stores = lotList ?? homeStores;
  /** כמה להזיז את שכבת הקניון כדי שתשב על המתחם שמבקרים בו */
  const lot = CLASSES.find((cl) => cl.id === here) ?? CLASSES.find((cl) => cl.mine)!;
  const off = { x: lot.x - MALL.x, y: lot.y - MALL.y };
  const storeOf = useCallback((id: string | undefined) => stores.find((s) => s.id === id), [stores]);
  frameFor.current = (x, y) => {
    let tier = 1;
    let bd = Infinity;
    for (const p of plots) {
      if (p.kind !== "stall") continue;
      const d = Math.abs(p.cx - x) + Math.abs(p.by - 24 - y);
      if (Math.abs(p.cx - x) <= 60 && Math.abs(p.by - 24 - y) <= 60 && d < bd) { bd = d; tier = stores.find((st) => st.id === p.store!.id)?.tier ?? 1; }
    }
    return tier >= 4 ? { k: 0.64, up: 34 } : tier === 3 ? { k: 0.86, up: 15 } : { k: 1, up: 0 };
  };
  const myPlot = useMemo(() => homePlots.find((p) => p.store?.mine) ?? homePlots.find((p) => p.kind === "stall") ?? homePlots[0], [homePlots]);
  const stallCount = plots.filter((p) => p.kind === "stall").length;
  const homeCount = homePlots.filter((p) => p.kind === "stall").length;

  /* ── מצלמה ── */

  /**
   * המצלמה. שתי דרכים לצייר את אותה תמונה:
   *
   * רגילה — transform אחד על המישור (הזזה והגדלה). כך נבדק ב-Chromium, ושם
   *   הדפדפן מצייר מחדש בחדות אחרי כל הגדלה.
   *
   * "חידוד במנוחה" — לדפדפנים של אייפון (WebKit), שעלולים להשאיר שכבה
   *   מוגדלת מטושטשת. ההזזה יושבת על עטיפה (rig), וההגדלה על המישור. בזמן
   *   תעופה ההגדלה היא transform; כשהמצלמה נעצרת היא מוחלפת ב-zoom, שגורם
   *   לדפדפן לפרוס ולצייר את העולם בגודל האמיתי. אותו מיקום בדיוק.
   */
  const applyCam = useCallback((c: Cam, animate: boolean) => {
    const el = planeRef.current;
    const rig = rigRef.current;
    if (!el || !rig) return;
    const { w, h } = vp.current;
    const i = insets(c.lv, h);
    const o = c.lv >= 2 ? offRef.current : { x: 0, y: 0 };
    const tx = (w - i.r) / 2 - (c.x + o.x) * c.s;
    const ty = i.t + (h - i.t - i.b) / 2 - (c.y + o.y) * c.s;
    const tr = animate ? `transform ${DUR}ms cubic-bezier(.33,.02,.18,1)` : "none";
    el.style.setProperty("--s", String(c.s));
    if (!sharpRef.current) {
      rig.style.transition = "none";
      rig.style.transform = "none";
      el.style.setProperty("zoom", "1");
      restScale.current = null;
      el.style.transition = tr;
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${c.s})`;
      return;
    }
    if (restScale.current !== null && (animate || restScale.current !== c.s)) {
      // יוצאים ממנוחה: אותה תמונה, אבל עכשיו כ-transform שאפשר להנפיש
      el.style.transition = "none";
      el.style.setProperty("zoom", "1");
      el.style.transform = `scale(${restScale.current})`;
      restScale.current = null;
      void el.offsetWidth;
    }
    rig.style.transition = tr;
    rig.style.transform = `translate(${tx}px, ${ty}px)`;
    if (restScale.current === null) {
      el.style.transition = tr;
      el.style.transform = `scale(${c.s})`;
    }
  }, []);

  /** המצלמה נעצרה: במצב "חידוד במנוחה" מחליפים את ההגדלה ב-zoom */
  const rest = useCallback(() => {
    const el = planeRef.current;
    if (!el || !sharpRef.current) return;
    const sc = camRef.current.s;
    el.style.transition = "none";
    el.style.transform = "none";
    el.style.setProperty("zoom", String(sc));
    restScale.current = sc;
  }, []);

  const go = useCallback(
    (lv: Level, x?: number, y?: number) => {
      const { w, h } = vp.current;
      // מקרוב, חנות גבוהה צריכה מסגרת רחבה יותר, אחרת הגג נחתך
      const tall = lv === 4 ? frameFor.current(x ?? camRef.current.x, y ?? camRef.current.y) : { k: 1, up: 0 };
      const p = clampCam(lv, x ?? camRef.current.x, (y ?? camRef.current.y) - tall.up);
      camRef.current = { x: p.x, y: p.y, s: scaleFor(lv, w, h) * tall.k, lv };
      setLevel(lv);
      setMoving(true);
      applyCam(camRef.current, !calm);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        rest();
        setMoving(false);
        setTick((t) => t + 1);
      }, calm ? 30 : DUR + 40);
    },
    [applyCam, calm, rest]
  );

  const nearestPlot = useCallback(
    (x: number, y: number, dx = 90, dy = 150): Plot | null => {
      let best: Plot | null = null;
      let bd = Infinity;
      for (const p of plots) {
        if (p.kind === "garden") continue;
        const ax = Math.abs(p.cx - x);
        const ay = Math.abs(p.by - 24 - y);
        if (ax > dx || ay > dy) continue;
        const d = ax + ay;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    [plots]
  );

  const zoomIn = useCallback(
    (atX?: number, atY?: number) => {
      chain.current++;
      const c = camRef.current;
      if (level === 0) return go(1, SCHOOL_C.x, SCHOOL_C.y);
      if (level === 1) return go(2, MALL_C.x, MALL_C.y);
      if (level === 2) return go(3, atX ?? c.x, nearestRow(atY ?? c.y));
      if (level === 3) {
        const p = nearestPlot(atX ?? c.x, atY ?? c.y);
        return p ? go(4, p.cx, p.by - 24) : go(4, atX ?? c.x, atY ?? c.y);
      }
    },
    [go, level, nearestPlot]
  );

  const zoomOut = useCallback(() => {
    if (level <= far) return;
    chain.current++;
    const c = camRef.current;
    if (level === 4) return go(3, c.x, nearestRow(c.y + 60));
    if (level === 3) return go(2, MALL_C.x, MALL_C.y);
    if (level === 2) return go(1, SCHOOL_C.x, SCHOOL_C.y);
    if (level === 1) return go(0, CITY_C.x, CITY_C.y);
  }, [far, go, level]);

  /** תעופה רמה אחרי רמה אל נקודה — ככה גם קפיצה רחוקה מרגישה כמו מסע */
  const flyTo = useCallback(
    async (target: Level, x: number, y: number, then?: () => void) => {
      const id = ++chain.current;
      const wait = () => new Promise((r) => setTimeout(r, calm ? 40 : DUR + 60));
      let lv = level;
      while (lv !== target) {
        lv = (lv < target ? lv + 1 : lv - 1) as Level;
        if (lv === 0) go(0, CITY_C.x, CITY_C.y);
        else if (lv === 1) go(1, SCHOOL_C.x, SCHOOL_C.y);
        else if (lv === 2) go(2, MALL_C.x, MALL_C.y);
        else if (lv === 3) go(3, x, nearestRow(y + 60));
        else go(4, x, y);
        await wait();
        if (chain.current !== id) return;
      }
      if (lv === target && target === 4) go(4, x, y);
      then?.();
    },
    [calm, go, level]
  );

  const say = useCallback((text: string) => setBubble({ text, k: Date.now() }), []);

  const goLevel = useCallback(
    (t: Level) => {
      if (t < far) return say(com.locked[t] ?? "");
      if (t === level) return;
      const c = camRef.current;
      if (t < level) {
        // החוצה: נשארים מעל אותו מקום
        void flyTo(t, c.x, c.y);
      } else {
        const near = level >= 3 ? nearestPlot(c.x, c.y, 200, 300) : null;
        const p = near ?? myPlot;
        void flyTo(t, p.cx, p.by - 24);
      }
    },
    [far, flyTo, level, myPlot, nearestPlot, say]
  );

  /* כשעוברים לשלב צמיחה מוקדם יותר, רמה רחוקה נסגרת: מתקרבים עד הרמה הפתוחה */
  useEffect(() => {
    if (far > 1 && here !== HOME) { offRef.current = { x: 0, y: 0 }; setHere(HOME); }
    if (level < far) {
      if (far === 3) go(3, myPlot.cx, ROWS[0]);
      else if (far === 2) go(2, MALL_C.x, MALL_C.y);
      else go(1, SCHOOL_C.x, SCHOOL_C.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [far]);

  /** יום ולילה: המסך מחשיך לרגע, הצבעים מתחלפים מאחוריו, והוא מתבהר */
  /** מעבר בין יום ללילה, דרך "דמדומים" קצרים */
  const lightTo = useCallback((v: boolean) => {
    if (calm) return setNight(v);
    setDusk(true);
    setTimeout(() => {
      setNight(v);
      requestAnimationFrame(() => requestAnimationFrame(() => setDusk(false)));
    }, 250);
  }, [calm]);

  // האור הולך לפי השעה: בערב חושך, ביום אור. נבדק שוב כל כמה דקות, וגם כשחוזרים לדף.
  useEffect(() => {
    if (!ready) return;
    const want = () => (timeMode === "auto" ? isNightAt(new Date()) : timeMode === "night");
    const sync = () => { if (want() !== nightRef.current) lightTo(want()); };
    sync();
    if (timeMode !== "auto") return;
    const id = setInterval(sync, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", sync); };
  }, [lightTo, ready, timeMode]);

  /* ── חנות ── */

  const openStore = useCallback(
    (id: string) => {
      chain.current++;
      setStoreShown(id);
      setStoreOpen(id);
      setSheet(null);
      const c = camRef.current;
      applyCam({ ...c, s: c.s * 1.8 }, !calm);
    },
    [applyCam, calm]
  );

  const closeStore = useCallback(() => {
    setStoreOpen(null);
    setFromWorld(true);
    applyCam(camRef.current, !calm);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // אם יצאו מהחנות בזמן שהמצלמה עוד נחתה, הטיימר הזה מחליף את של הטיסה,
    // ולכן גם הוא חייב לסמן שהתנועה הסתיימה.
    settleTimer.current = setTimeout(() => {
      rest();
      setMoving(false);
      setTick((t) => t + 1);
    }, calm ? 30 : DUR + 40);
  }, [applyCam, calm, rest]);

  const goHome = useCallback(() => {
    setSheet(null);
    const id = myPlot.store?.id;
    if (!id) return;
    if (here !== HOME) {
      // חוזרים מביקור: קודם מתרחקים, ואז המתחם שלי חוזר להיות החי
      const run = ++chain.current;
      if (storeOpen) closeStore();
      go(1, SCHOOL_C.x, SCHOOL_C.y);
      setTimeout(() => {
        if (chain.current !== run) return;
        offRef.current = { x: 0, y: 0 };
        setHere(HOME);
        setHomeAfter(true);
      }, calm ? 60 : DUR + 80);
      return;
    }
    if (storeOpen) {
      if (storeOpen === id) return;
      closeStore();
    }
    void flyTo(4, myPlot.cx, myPlot.by - 24, () => openStore(id));
  }, [calm, closeStore, flyTo, go, here, myPlot, openStore, storeOpen]);

  // המשך החזרה הביתה, אחרי שהמתחם שלי כבר מצויר
  useEffect(() => {
    if (!homeAfter || here !== HOME) return;
    setHomeAfter(false);
    const id = myPlot.store?.id;
    if (id) void flyTo(4, myPlot.cx, myPlot.by - 24, () => openStore(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeAfter, here]);

  /** נכנסים למתחם: שלי, או ביקור אצל אחרים */
  const enter = (id: string) => {
    chain.current++;
    const l = CLASSES.find((cl) => cl.id === id)!;
    offRef.current = { x: l.x - MALL.x, y: l.y - MALL.y };
    setHere(id);
    go(2, MALL_C.x, MALL_C.y);
  };

  /* ── התחלה, שינוי גודל מסך ── */

  useEffect(() => {
    const measure = () => {
      const r = viewRef.current?.getBoundingClientRect();
      if (r) vp.current = { w: r.width, h: r.height };
    };
    measure();
    const hash = typeof location !== "undefined" ? location.hash.slice(1) : "";
    const named = (LEVEL_NAMES as readonly string[]).indexOf(hash);
    const idx = review && named < 0 ? 2 : named >= 0 ? Math.max(named, far) : -1;
    const start: Level = idx >= 0 ? (idx as Level) : 4;
    const { w, h } = vp.current;
    const at = start === 0 ? CITY_C : start === 1 ? SCHOOL_C : start === 2 ? MALL_C : start === 3 ? { x: myPlot.cx, y: ROWS[0] } : { x: myPlot.cx, y: myPlot.by - 24 };
    camRef.current = { ...at, s: scaleFor(start, w, h), lv: start };
    setLevel(start);
    if (idx >= 0) setStoreOpen(null);
    applyCam(idx >= 0 ? camRef.current : { ...camRef.current, s: camRef.current.s * 1.8 }, false);
    // דפדפני אייפון (כולם WebKit) ו-Safari במק: מפעילים "חידוד במנוחה"
    const ua = navigator.userAgent;
    const webkit = /AppleWebKit/.test(ua) && !/Chrome\/|Chromium|Edg\/|OPR\/|Android/.test(ua);
    sharpRef.current = webkit;
    setSharp(webkit);
    const hour = new Date().getHours();
    void hour;
    setNight(isNightAt(new Date()));
    setCalm(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (webkit) {
      applyCam(idx >= 0 ? camRef.current : { ...camRef.current, s: camRef.current.s * 1.8 }, false);
      if (idx >= 0) rest();
    }
    // "מה חדש" מופיע פעם אחת, כשנכנסים ישר לדוכן (לא לקישור של מקום בעולם)
    let seen = false;
    try { seen = localStorage.getItem("wl-whatsnew-seen") === "1"; } catch {}
    if (!review && !seen && idx < 0) setNews(true);
    setReady(true);

    const onResize = () => {
      measure();
      setLevel((lv) => {
        camRef.current = { ...camRef.current, s: scaleFor(lv, vp.current.w, vp.current.h) };
        applyCam(camRef.current, false);
        rest();
        return lv;
      });
      setTick((t) => t + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── כתובת: לכל רמה שם, כדי שכפתור החזרה של הטלפון יעבוד ── */

  useEffect(() => {
    if (!ready) return;
    const want = storeOpen ? "store" : LEVEL_NAMES[level];
    if (location.hash.slice(1) !== want) {
      selfHash.current = true;
      location.hash = want;
    }
  }, [level, ready, storeOpen]);

  const stateRef = useRef({ level, storeOpen });
  stateRef.current = { level, storeOpen };
  const actions = useRef({ goLevel, closeStore, openStore });
  actions.current = { goLevel, closeStore, openStore };
  useEffect(() => {
    const onHash = () => {
      if (selfHash.current) { selfHash.current = false; return; }
      const name = location.hash.slice(1);
      const st = stateRef.current;
      if (name === "store") {
        if (!st.storeOpen && !review) actions.current.openStore("noa");
        return;
      }
      const idx = (LEVEL_NAMES as readonly string[]).indexOf(name);
      if (idx < 0) return;
      if (st.storeOpen) actions.current.closeStore();
      if (idx !== st.level) actions.current.goLevel(idx as Level);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /* ── מגע: גרירה מזיזה, צביטה מחליפה רמה ── */

  const drag = useRef<{ id: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; done: boolean } | null>(null);
  const swallowClick = useRef(false);
  const lastWheel = useRef(0);

  const worldAt = (sx: number, sy: number) => {
    const c = camRef.current;
    const r = viewRef.current!.getBoundingClientRect();
    const i = insets(c.lv, r.height);
    return { x: c.x + (sx - r.left - (r.width - i.r) / 2) / c.s, y: c.y + (sy - r.top - i.t - (r.height - i.t - i.b) / 2) / c.s };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (storeOpen || sheet) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), done: false };
      drag.current = null;
      return;
    }
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = d / pinch.current.d;
      if (!pinch.current.done && (r > 1.28 || r < 0.78)) {
        pinch.current.done = true;
        swallowClick.current = true;
        if (r > 1) {
          const m = worldAt((a.x + b.x) / 2, (a.y + b.y) / 2);
          zoomIn(m.x, m.y);
        } else zoomOut();
      }
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) {
      d.moved = true;
      chain.current++;
      viewRef.current?.setPointerCapture(e.pointerId);
      rootRef.current?.setAttribute("data-drag", "1");
    }
    const s = camRef.current.s;
    const p = clampCam(level, d.cx - dx / s, d.cy - dy / s);
    camRef.current = { ...camRef.current, x: p.x, y: p.y };
    applyCam(camRef.current, false);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      drag.current = null;
      if (d.moved) {
        swallowClick.current = true;
        rootRef.current?.removeAttribute("data-drag");
        setTick((t) => t + 1);
        setTimeout(() => { swallowClick.current = false; }, 60);
      }
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (storeOpen || sheet) return;
    const now = Date.now();
    if (now - lastWheel.current < 500 || Math.abs(e.deltaY) < 8) return;
    lastWheel.current = now;
    if (e.deltaY < 0) {
      const m = worldAt(e.clientX, e.clientY);
      zoomIn(m.x, m.y);
    } else zoomOut();
  };

  /* ── מקלדת ── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Escape") {
        if (sheet) return setSheet(null);
        if (storeOpen) return closeStore();
        return zoomOut();
      }
      if (storeOpen || sheet) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = 90 / camRef.current.s;
        const c = camRef.current;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const p = clampCam(level, c.x + dx, c.y + dy);
        camRef.current = { ...c, x: p.x, y: p.y };
        applyCam(camRef.current, !calm);
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(rest, calm ? 30 : DUR + 40);
        setTick((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyCam, calm, closeStore, level, rest, sheet, storeOpen, zoomIn, zoomOut]);

  /* ── הפתעות ── */

  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 5200);
    return () => clearTimeout(t);
  }, [bubble]);

  const trigger = (id: string) => {
    const s = surpriseOf(SURPRISES.find((x) => x.id === id)!);
    const isNew = !found.includes(id);
    const next = isNew ? [...found, id] : found;
    if (isNew) setFound(next);
    if (id === "fountain") setFx((f) => ({ ...f, splash: f.splash + 1 }));
    if (id === "hopscotch") setFx((f) => ({ ...f, hop: f.hop + 1 }));
    if (id === "cat") setFx((f) => ({ ...f, cat: f.cat + 1 }));
    if (id === "garden") setFx((f) => ({ ...f, watered: Math.min(5, f.watered + 1) }));
    if (id === "board") setSheet("notices");
    say(isNew && next.length === SURPRISES.length ? `${s.text} מצאתם את כל ההפתעות!` : s.text);
  };

  /* ── מה רואים עכשיו ── */

  const c = camRef.current;
  const focus = level === 4 ? nearestPlot(c.x, c.y, 42, 60) : null;
  const focusStore = focus?.kind === "stall" ? storeOf(focus.store!.id) ?? null : null;

  const lodOf = (p: Plot): Lod => {
    if (level < 3) return "far";
    if (Math.abs(p.cx - c.x) > 560 || Math.abs(p.by - c.y) > 640) return "far";
    return level === 4 && !moving && focus?.id === p.id ? "near" : "mid";
  };

  const place = (() => {
    if (level === 0) return "העיר";
    if (level === 1) return com.place;
    if (level === 2) return com.mallOf(com.lots[here]);
    const ly = c.y - MALL.y;
    const zone = ly < 580 ? ZONES.A.name : ly < 960 ? "כיכר המזרקה" : ly < 1235 ? ZONES.B.name : "שטח לרחוב חדש";
    if (level === 4 && focus) return focus.kind === "stall" ? focusStore?.name ?? zone : "מקום פנוי";
    return zone;
  })();

  const hint =
    level === 0 ? com.hint0
    : level === 1 ? com.hint1
    : level === 2 ? "נוגעים ברחוב כדי להיכנס אליו"
    : level === 3 ? "נוגעים בדוכן כדי להתקרב אליו"
    : focus ? "" : "גוררים כדי להסתכל מסביב";

  const tapPlot = (p: Plot) => {
    if (level === 3 || focus?.id !== p.id) return go(4, p.cx, p.by - 24);
    if (p.kind === "stall") return openStore(p.store!.id);
    if (p.kind === "empty" && !visiting) { setInvitePlot(p.id); setSheet("invite"); }
  };

  const othersOpen = far <= 1;
  const myName = homeStores.find((x) => x.mine)?.owner ?? "נועה";

  /** מה קרה בצד השני של ההזמנה */
  /** מוסיפים נקודות, ואם עברו סף, הדוכן גדל. מחזיר משפט קצר על מה שקרה, והאם הדוכן גדל. */
  const earn = (key: PointKey, times = 1) => {
    const src = POINT_SOURCES.find((x) => x.key === key)!;
    const add = src.max ? Math.min(times, Math.max(0, src.max - counts[key])) : times;
    if (!add) return { msg: `כבר יש ${src.max} מוצרים עם תמונה. מוצרים נוספים לא מוסיפים נקודות.`, up: false };
    const next = { ...counts, [key]: counts[key] + add };
    const before = tierOf(points);
    const after = tierOf(pointsOf(next));
    setCounts(next);
    if (after > before) setGrew(after);
    const n = add * src.points;
    return { msg: after > before ? `קיבלתם ${n} נקודות, והדוכן שלכם גדל: עכשיו הוא ${TIERS[after - 1].name}.` : `קיבלתם ${n} נקודות.`, up: after > before };
  };
  /** לחיצת הדמיה בגיליון הצמיחה. כשהדוכן גדל, הגיליון נסגר כדי שיראו אותו גדל. */
  const simEarn = (what: string, key: PointKey, times = 1) => {
    const r = earn(key, times);
    if (r.up) { setSheet(null); setGrowMsg(""); say(`${what} ${r.msg}`); } else setGrowMsg(`${what} ${r.msg}`);
  };

  /** נרשמים ליום השוק. הנקודות מגיעות ביום עצמו, פעם אחת לכל יום שוק. */
  const joinMarket = () => {
    setMarketIn(true);
    if (market === "on" && !counts.market) say(`נרשמתם ל${com.marketName}, והוא כבר התחיל. ${earn("market").msg}`);
    else say(`הבלונים על הדוכן מסמנים שאתם משתתפים. ביום עצמו תקבלו 30 נקודות.`);
  };
  useEffect(() => {
    if (market === "on" && marketIn && !counts.market) say(`${com.marketName} התחיל, והדוכן שלכם משתתף. ${earn("market").msg}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  const finishInvite = (r: InviteResult) => {
    const id = inviteView;
    setInviteView(null);
    if (!id) return;
    const plot = plots.find((p) => p.id === id);
    setInvited((v) => v.filter((x) => x !== id));
    if (r.kind === "declined") return say("ההורה לא אישר. שום דבר לא נחשף, והמקום נשאר פנוי.");
    if (r.kind === "visit") return say(`המשפחה של ${r.owner} הצטרפה ל${com.mall} כמבקרת. ${earn("join_visit").msg}`);
    setJoined((j) => ({
      ...j,
      [id]: {
        id: `new-${id}`, name: r.name, short: r.owner, sign: r.name.slice(0, 14), owner: r.owner, fresh: true,
        tagline: `דוכן חדש ב${com.mall}`, theme: "mint", awning: r.awning, emblem: "star",
        products: [{ art: "squishy", name: "מוצר ראשון", price: 10 }],
        deco: { flowers: false, openSign: true, cat: false },
      },
    }));
    if (plot) go(4, plot.cx, plot.by - 24);
    say(`ל${r.owner} יש עכשיו דוכן לידכם. ${earn("join_store").msg}`);
  };

  /** מקום פנוי אצלי שעוד לא נשלחה אליו הזמנה */
  const freePlot = () => homePlots.find((p) => p.kind === "empty" && !invited.includes(p.id));
  const openShare = () => {
    const p = freePlot();
    if (!p) return say("כל המקומות ליד הדוכן כבר תפוסים או מוזמנים.");
    setInvitePlot(p.id);
    setSheet("invite");
  };
  const finishPlace = (r: PlaceResult) => {
    setPlaceOpen(false);
    if (r.kind === "link") return say("הדוכן נשאר בינתיים רק עם הלינק. שום דבר לא מופיע בעיר.");
    setKind(r.kind);
    setPlaced(r);
    go(4, myPlot.cx, myPlot.by - 24);
    if (r.invite) openShare();
    else say(`הדוכן שלכם ב${COMMUNITIES[r.kind].mallOf(r.unit).slice(1)}, ${r.place}.`);
  };

  // השם הפרטי מופיע על השלט רק כשהוא לא כבר חלק משם הדוכן ("הדוכן של גלי"),
  // ורק אצלי: מי שמבקר במתחם אחר רואה דוכנים, לא שמות.
  const showOwner = (st: LabStore) => !visiting && !!st.owner && !st.name.includes(st.owner);
  /** מי משתתף ביום השוק. אצלי: מי שנרשם. בביקור: דוכן כן, דוכן לא. */
  const festOf = (st: LabStore) =>
    market !== "off" && (st.mine ? marketIn : visiting ? stores.indexOf(st) % 2 === 0 : MARKET_IN.includes(st.id) || !!st.fresh);
  /** ההפתעות של המתחם מדברות בשפה של הקהילה */
  const surpriseOf = (x: (typeof SURPRISES)[number]) =>
    x.id === "bell" ? { ...x, ...com.bell }
    : x.id === "board" ? { ...x, label: com.board, text: `${com.board}. כאן מספרים מה חדש ב${com.mall}.` }
    : x.id === "garden" ? { ...x, label: com.garden, text: `השקיתם את הגינה. פרח חדש לכל דוכן שנפתח ב${com.unitWord}.` }
    : x.id === "cat" ? { ...x, label: `החתול של ה${com.mall}`, text: `מיאו. החתול של ה${com.mall} אוהב לנמנם ליד המזרקה.` }
    : x;
  // הדוכן שלי גדל בזמן שמסתכלים עליו: המצלמה מתרחקת כדי שהמבנה החדש ייכנס כולו
  useEffect(() => {
    if (grew && camRef.current.lv === 4 && !storeOpen) go(4, myPlot.cx, myPlot.by - 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grew]);

  // כרטיס שנסגר באיקס חוזר כשעוברים למקום אחר, או מתרחקים וחוזרים
  const focusId = focus?.id ?? null;
  useEffect(() => { setCardOff((v) => (v && v !== focusId ? null : v)); }, [focusId]);

  const nextTier = myTier < TIERS.length ? TIERS[myTier] : null;
  const tierProgress = nextTier ? (points - TIERS[myTier - 1].at) / (nextTier.at - TIERS[myTier - 1].at) : 1;
  const closeNews = () => {
    setNews(false);
    try { localStorage.setItem("wl-whatsnew-seen", "1"); } catch {}
  };
  const worldBusy = !!storeOpen || !!sheet || !!inviteView || news || placeOpen;
  const isInvited = (id: string) => invited.includes(id);

  return (
    <div
      ref={rootRef}
      className="wl-root"
      dir="rtl"
      lang="he"
      data-level={level}
      data-night={night ? "1" : "0"}
      data-moving={moving ? "1" : "0"}
      data-dusk={dusk ? "1" : "0"}
      data-calm={calm ? "1" : "0"}
      data-ready={ready ? "1" : "0"}
      data-testid="wl-root"
    >
      <div
        ref={viewRef}
        className="wl-view"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onWheel={onWheel}
        onScroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }}
        inert={worldBusy}
      >
        <div ref={rigRef} className="wl-rig">
        <div ref={planeRef} className="wl-plane" style={{ width: WORLD.w, height: WORLD.h }}>
          <SceneryMemo size={liveSize} flowers={stallCount + fx.watered} alley={alleyOpen(liveSize)} splash={fx.splash} hop={fx.hop} others={othersOpen} second={far === 0}
            live={here} homeCount={homeCount} hood={kind === "hood"} sign={com.sign} gate={com.mallOf(com.lots[here])} market={market === "on"} />

          {/* אזורי נגיעה: בית הספר (מהעיר), הכיתות (מבית הספר), הרחובות (מהקניון) */}
          <button
            type="button" className="wl-hit" data-lv="0" tabIndex={level === 0 ? 0 : -1}
            aria-label={`להתקרב אל ${com.place}`}
            style={{ left: CAMPUS.x, top: CAMPUS.y, width: CAMPUS.w, height: CAMPUS.h }}
            onClick={() => go(1, SCHOOL_C.x, SCHOOL_C.y)}
            data-testid="wl-hit-school"
          />
          {CLASSES.map((cl) => {
            const has = cl.mine || (othersOpen && cl.stalls > 0);
            return (
              <button
                key={cl.id} type="button" className="wl-hit" data-lv="1" tabIndex={level === 1 ? 0 : -1}
                aria-label={cl.mine ? `להיכנס אל ${com.mallOf(com.lots[cl.id])}, ${com.unit} שלי` : has ? `לבקר ב${com.mallOf(com.lots[cl.id]).slice(1)}` : `${com.lots[cl.id]}, עוד אין דוכנים`}
                style={{ left: cl.x, top: cl.y, width: cl.w, height: cl.h }}
                onClick={() =>
                  has ? enter(cl.id)
                  : say(`ב${com.lots[cl.id]} עוד אין דוכנים. כשייפתח שם דוכן ראשון, יקום כאן ${com.mall}.`)
                }
                data-testid={`wl-hit-class-${cl.id}`}
              />
            );
          })}
          <div className="wl-mall-layer" style={{ transform: `translate(${off.x}px, ${off.y}px)` }}>
          {[
            { id: "A", label: ZONES.A.name, x: MALL.x + 20, y: MALL.y + 150, w: 1060, h: 290, row: ROWS[0] },
            { id: "P", label: "כיכר המזרקה", x: MALL.x + 60, y: MALL.y + 452, w: 980, h: 476, row: ROWS[1] },
            { id: "B", label: ZONES.B.name, x: MALL.x + 236, y: MALL.y + 960, w: 628, h: 256, row: ROWS[2] },
            { id: "C", label: "שטח לרחוב חדש", x: MALL.x + 120, y: MALL.y + 1240, w: 860, h: 150, row: ROWS[3] },
          ].map((z) => (
            <button
              key={z.id} type="button" className="wl-hit" data-lv="2" tabIndex={level === 2 ? 0 : -1}
              aria-label={`להיכנס אל ${z.label}`}
              style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
              onClick={(e) => {
                const m = e.detail === 0 ? { x: z.x + z.w / 2 } : worldAt(e.clientX, e.clientY);
                go(3, m.x, z.row);
              }}
              data-testid={`wl-hit-zone-${z.id}`}
            />
          ))}

          {/* הדוכנים והמקומות הפנויים */}
          {plots.map((p) => {
            const lod = lodOf(p);
            const st = p.kind === "stall" ? storeOf(p.store!.id)! : null;
            const style: React.CSSProperties = { left: p.cx - STALL.w / 2, top: p.by - STALL.ground, width: STALL.w, height: STALL.h };
            if (p.kind === "garden") {
              return (
                <div key={p.id} className="wl-plot" data-kind="garden" style={style} aria-hidden>
                  <GardenPlot lod={lod} />
                </div>
              );
            }
            const vars = st ? ({ "--aw": st.awning, "--lavender": st.awning } as React.CSSProperties) : {};
            return (
              <button
                key={p.id}
                type="button"
                className="wl-plot"
                data-kind={p.kind}
                data-lod={lod}
                data-mine={st?.mine ? "1" : undefined}
                data-tier={st ? st.tier ?? 1 : undefined}
                data-fest={st && festOf(st) ? "1" : undefined}
                data-lv="3 4"
                data-testid={`wl-plot-${p.id}`}
                tabIndex={level >= 3 ? 0 : -1}
                aria-label={
                  st
                    ? `${st.name}, ${TIERS[(st.tier ?? 1) - 1].name}${st.owner ? ` של ${st.owner}` : ""}${st.mine ? ", שלי" : ""}. ${level === 4 && focus?.id === p.id ? "להיכנס לחנות" : "להתקרב"}`
                    : `מקום פנוי${isInvited(p.id) ? ", הזמנה נשלחה" : ""}. ${level === 4 && focus?.id === p.id ? "להזמין לפתוח כאן דוכן" : "להתקרב"}`
                }
                style={{ ...style, ...vars }}
                onClick={() => tapPlot(p)}
                onFocus={() => {
                  // מקלדת: דוכן שמקבל מיקוד מחוץ למסך. המצלמה זזה אליו, במקום שהדפדפן יגלול את העולם.
                  const cam = camRef.current;
                  if (cam.lv >= 3 && Math.abs(p.cx - cam.x) * cam.s > vp.current.w / 2 - 40) go(3, p.cx, nearestRow(p.by));
                }}
              >
                {st ? <WorldStall store={st} lod={lod} grew={st.mine && grew === st.tier} fest={festOf(st)} /> : <EmptyPlot lod={lod} invited={isInvited(p.id)} />}
              </button>
            );
          })}

          </div>

          <ForegroundMemo catJump={fx.cat} live={here} market={market === "on"} />

          {[false, true].map((inMall) => (
            <div key={String(inMall)} className={inMall ? "wl-mall-layer" : undefined} style={inMall ? { transform: `translate(${off.x}px, ${off.y}px)` } : { display: "contents" }}>
              {SURPRISES.filter((s) => (s.from >= 3) === inMall).map((s) => (
            <button
              key={s.id}
              type="button"
              className="wl-hit wl-surprise"
              data-lv={Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i).join(" ")}
              data-found={found.includes(s.id) ? "1" : undefined}
              tabIndex={level >= s.from && level <= s.to ? 0 : -1}
              aria-label={surpriseOf(s).label}
              style={{ left: s.x - s.r, top: s.y - s.r, width: s.r * 2, height: s.r * 2 }}
              onClick={() => trigger(s.id)}
              data-testid={`wl-surprise-${s.id}`}
            />
              ))}
            </div>
          ))}

          {/* תוויות. גודל קבוע על המסך, בלי קשר לזום. */}
          <span className="wl-label wl-label-pin" data-lv="0" style={{ left: SCHOOL_C.x, top: CAMPUS.y - 30 }}>{com.place}</span>
          <span className="wl-label" data-lv="0" style={{ left: cityPt(2110, 0).x, top: cityPt(0, 925).y }}>הספרייה</span>
          <span className="wl-label" data-lv="0" style={{ left: cityPt(300, 0).x, top: cityPt(0, 1620).y }}>הפארק</span>
          <span className="wl-label" data-lv="0" style={{ left: cityPt(1200, 0).x, top: cityPt(0, 3380).y }}>{far === 0 ? com.otherPlace : com.emptyPlace}</span>
          <span className="wl-label" data-lv="0" style={{ left: cityPt(1200, 0).x, top: cityPt(0, 4000).y }}>הים</span>
          {GRADE_ROWS.map((g, i) => com.rows[i] && (
            <span key={g.name} className="wl-label wl-grade" data-lv="1" style={{ left: CAMPUS.x + CAMPUS.w - 250, top: g.y }}>{com.rows[i]}</span>
          ))}
          {CLASSES.map((cl) => {
            const n = cl.mine ? homeCount : othersOpen ? cl.stalls : 0;
            return (
              <span key={cl.id} className="wl-label wl-class" data-lv="1" data-mine={cl.mine ? "1" : undefined} style={{ left: cl.x + cl.w / 2, top: cl.y + cl.h / 2 - 60 }} data-testid={`wl-class-${cl.id}`}>
                <b>{com.lots[cl.id]}</b>
                <span>{n > 0 ? `${n} דוכנים` : "מקום פנוי"}</span>
              </span>
            );
          })}
          <div className="wl-mall-layer" style={{ transform: `translate(${off.x}px, ${off.y}px)` }}>
          <span className="wl-label" data-lv="2" style={{ left: MALL_C.x, top: MALL.y + 345 }}>{ZONES.A.name}</span>
          <span className="wl-label" data-lv="2" style={{ left: MALL_C.x, top: MALL.y + 760 }}>כיכר המזרקה</span>
          <span className="wl-label" data-lv="2" style={{ left: MALL_C.x, top: MALL.y + 1140 }}>{ZONES.B.name}{alleyOpen(liveSize) ? "" : " · נפתחת ב־8 דוכנים"}</span>
          {plots.filter((p) => p.kind === "stall").map((p) => {
            const st = storeOf(p.store!.id)!;
            return (
              <span key={p.id} className="wl-label wl-plate" data-lv="3" data-mine={st.mine ? "1" : undefined} style={{ left: p.cx, top: p.by + 9 }}>
                <span>{st.name}</span>
                {(showOwner(st) || st.mine || st.fresh) && (
                  <em>
                    {showOwner(st) && <i>{st.owner}</i>}
                    {st.mine && <b>שלי</b>}
                    {st.fresh && <b>חדש</b>}
                  </em>
                )}
              </span>
            );
          })}
          <span className="wl-label" data-lv="3" style={{ left: MALL.x + 205, top: MALL.y + 884 }}>{com.garden}</span>
          {market !== "off" && (
            <span className="wl-label wl-market" data-lv={level === 3 ? "3" : "2"} data-on={market === "on" ? "1" : undefined} style={{ left: MALL_C.x, top: MALL.y + 520 }} data-testid="wl-market-label">
              {market === "on" ? `${com.marketName} היום` : `${com.marketName}: ${com.marketWhen}`}
            </span>
          )}
          </div>
        </div>
        </div>
      </div>

      <div className="wl-dusk" aria-hidden />

      {/* ── ממשק ── */}
      <div className="wl-hud" inert={!!storeOpen}>
        <div className="wl-top">
          <div className="wl-top-side">
            <button type="button" className="wl-btn wl-chip" onClick={() => setSheet("lab")} data-testid="wl-lab">ניסוי</button>
          </div>
          <div className="wl-place" aria-live="polite" data-testid="wl-place">{place}</div>
          <div className="wl-top-side wl-top-end">
            <span className="wl-found" data-testid="wl-found" aria-label={`מצאתם ${found.length} הפתעות מתוך ${SURPRISES.length}`}>
              <Icon name="star" size={18} tone="var(--warning)" />
              {found.length}/{SURPRISES.length}
            </span>
          </div>
        </div>

        <nav className="wl-ladder" aria-label="כמה קרוב מסתכלים">
          {com.levels.map((label, i) => {
            if (review && i < far) return null;
            const locked = i < far;
            return (
              <button
                key={label} type="button" className="wl-btn wl-step-btn" aria-current={level === i ? "true" : undefined}
                data-locked={locked ? "1" : undefined}
                aria-label={locked ? `${label}, עוד לא נפתח` : label}
                onClick={() => goLevel(i as Level)} data-testid={`wl-level-${i}`}
              >
                {locked ? <Icon name="lock" size={20} /> : <LevelIcon level={i as Level} />}
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="wl-bottom">
          {level === 4 && !moving && focus && !sheet && cardOff !== focus.id && (
            <div className="wl-card" data-testid="wl-card">
              <button type="button" className="wl-x" onClick={() => setCardOff(focus.id)} aria-label="לסגור" data-testid="wl-card-x"><XIcon /></button>
              {focusStore ? (
                <>
                  <div className="wl-card-title">{focusStore.name}</div>
                  <div className="wl-card-sub">{TIERS[(focusStore.tier ?? 1) - 1].name}{!visiting && focusStore.owner ? ` של ${focusStore.owner}` : ""}. {focusStore.tagline}</div>
                  {focusStore.mine && !review && (
                    <button type="button" className="wl-points" onClick={() => { setGrowMsg(""); setSheet("grow"); }} data-testid="wl-points" aria-label={`${points} נקודות. ${nextTier ? `עוד ${nextTier.at - points} עד ${nextTier.name}` : "הגעת לחנות הגדולה"}. איך גדלים`}>
                      <span className="wl-points-bar" aria-hidden><i style={{ width: `${Math.round(tierProgress * 100)}%` }} /></span>
                      <span className="wl-points-text">
                        <b>{points}</b> נקודות{nextTier ? ` · עוד ${nextTier.at - points} עד ${nextTier.name}` : ""}
                      </span>
                    </button>
                  )}
                  <div className="wl-card-actions">
                    <button type="button" className="wl-btn wl-primary" onClick={() => openStore(focusStore.id)} data-testid="wl-enter">להיכנס לחנות</button>
                    {focusStore.mine && (
                      <button type="button" className="wl-btn" onClick={() => { setSheet("decorate"); go(4, focus.cx, focus.by + 8); }} data-testid="wl-decorate">
                        <Icon name="palette" size={20} tone="var(--lavender)" />
                        לעצב
                      </button>
                    )}
                    {focusStore.mine && !review && !visiting && (
                      <button type="button" className="wl-btn" onClick={openShare} data-testid="wl-share">
                        <ShareIcon />
                        להזמין
                      </button>
                    )}
                  </div>
                  {focusStore.mine && !review && market !== "off" && (
                    marketIn
                      ? <div className="wl-card-note" data-testid="wl-market-in">נרשמתם ל{com.marketName}.</div>
                      : <button type="button" className="wl-btn wl-wide" onClick={joinMarket} data-testid="wl-market-join">להירשם ל{com.marketName}</button>
                  )}
                </>
              ) : (
                <>
                  <div className="wl-card-title">{isInvited(focus.id) ? "הזמנה ממתינה" : "מקום פנוי"}</div>
                  <div className="wl-card-sub">
                    {visiting ? `למקום פנוי מזמינים רק מי שהדוכן שלהם ב${com.mallOf(com.lots[here]).slice(1)}.`
                      : isInvited(focus.id) ? "הקישור מיועד לחבר או חברה אחת, ותקף לשבוע." : `כאן יכול לקום דוכן של ${com.neighbor}.`}
                  </div>
                  <div className="wl-card-actions">
                    {visiting ? null : isInvited(focus.id) ? (
                      <>
                        <button type="button" className="wl-btn wl-primary" onClick={() => setInviteView(focus.id)} data-testid="wl-invite-view">לראות את הצד השני</button>
                        <button type="button" className="wl-btn" onClick={() => setInvited((v) => v.filter((x) => x !== focus.id))} data-testid="wl-invite-cancel">לבטל</button>
                      </>
                    ) : (
                      <button type="button" className="wl-btn wl-primary" onClick={() => { setInvitePlot(focus.id); setSheet("invite"); }} data-testid="wl-invite">
                        להזמין לפתוח כאן דוכן
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {bubble && !sheet && (
            <div className="wl-bubble" role="status" key={bubble.k} data-testid="wl-bubble">
              <Icon name="sparkle" size={20} tone="var(--warning)" />
              <span>{bubble.text}</span>
              <button type="button" className="wl-x" onClick={() => setBubble(null)} aria-label="לסגור" data-testid="wl-bubble-x"><XIcon /></button>
            </div>
          )}
          {hint && !bubble && <div className="wl-hint">{hint}</div>}
          <div className="wl-bottom-row">
            {review ? (
              <span />
            ) : (
              <button type="button" className="wl-btn wl-home" onClick={goHome} data-testid="wl-home">
                <Icon name="stall" size={22} tone="var(--lavender)" />
                הדוכן שלי
              </button>
            )}
            {level > far && (
              <button type="button" className="wl-btn wl-out" onClick={zoomOut} data-testid="wl-out">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <circle cx="10.500" cy="10.500" r="6.500" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M15.500 15.500L20 20M7.500 10.500h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                להתרחק
              </button>
            )}
          </div>
          <div className="wl-proto">{review ? "סקירה פרטית · חנויות מקובץ מקומי" : "אב־טיפוס · כל החנויות והשמות בדויים"}</div>
        </div>
      </div>

      {/* ── גיליונות ── */}
      {sheet && (
        <div className="wl-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="wl-sheet" role="dialog" aria-modal="true" aria-label={sheet === "decorate" ? "עיצוב הדוכן" : sheet === "invite" ? "הזמנה לפתוח דוכן" : sheet === "notices" ? "לוח המודעות" : sheet === "grow" ? "איך הדוכן גדל" : "הגדרות הניסוי"} data-testid={`wl-sheet-${sheet}`}>
            <button type="button" className="wl-sheet-x" onClick={() => setSheet(null)} aria-label="לסגור" autoFocus>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>

            {sheet === "decorate" && (
              <>
                <h2>מעצבים את הדוכן</h2>
                <div className="wl-field">
                  <span className="wl-field-label">צבע הסוכך</span>
                  <div className="wl-swatches" role="radiogroup" aria-label="צבע הסוכך">
                    {AWNINGS.map((a) => (
                      <button
                        key={a.key} type="button" role="radio" aria-checked={mine.awning === a.color} aria-label={a.label}
                        className="wl-swatch" style={{ background: a.color }}
                        onClick={() => setMine((m) => ({ ...m, awning: a.color }))}
                        data-testid={`wl-awning-${a.key}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="wl-field">
                  <span className="wl-field-label">קישוטים</span>
                  <div className="wl-toggles">
                    {([["flowers", "עציץ פרחים"], ["openSign", "שלט \"פתוח!\""], ["cat", "חתול"]] as const).map(([k, label]) => (
                      <button
                        key={k} type="button" className="wl-btn wl-toggle" aria-pressed={mine.deco[k]}
                        onClick={() => setMine((m) => ({ ...m, deco: { ...m.deco, [k]: !m.deco[k] } }))}
                        data-testid={`wl-deco-${k}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="wl-sheet-note">בהדמיה הכול פתוח. באפליקציה, קישוטים קונים במטבעות מהמשחק של הדוכן.</p>
              </>
            )}

            {sheet === "grow" && (
              <>
                <h2>ככה הדוכן גדל</h2>
                <ol className="wl-tiers">
                  {TIERS.map((t, i) => (
                    <li key={t.name} data-on={myTier >= i + 1 ? "1" : undefined} data-now={myTier === i + 1 ? "1" : undefined}>
                      <b>{t.name}</b>
                      <span>{t.at === 0 ? "מההתחלה" : `${t.at} נקודות`}</span>
                    </li>
                  ))}
                </ol>
                <p className="wl-grow-now" data-testid="wl-grow-now">
                  <b>{points}</b> נקודות{nextTier ? ` · עוד ${nextTier.at - points} עד ${nextTier.name}` : ""}
                </p>
                <ul className="wl-sources">
                  {POINT_SOURCES.map((x) => (
                    <li key={x.key} data-testid={`wl-src-${x.key}`}>
                      <span>{x.label}{x.cap ? <em>{x.cap}</em> : null}</span>
                      <i>{counts[x.key]} × {x.points}</i>
                      <b>{counts[x.key] * x.points}</b>
                    </li>
                  ))}
                </ul>
                <p className="wl-sheet-note">מכירות לא נספרות. את הנקודות רואה רק מי שהדוכן שלה, וכל השאר רואים רק את המבנה.</p>
                <div className="wl-toggles">
                  <button type="button" className="wl-btn wl-toggle" onClick={() => simEarn("עבר עוד שבוע.", "week")} data-testid="wl-sim-week">הדמיה: עבר שבוע</button>
                  <button type="button" className="wl-btn wl-toggle" onClick={() => simEarn("הוספתם מוצר עם תמונה.", "product")} data-testid="wl-sim-product">הדמיה: מוצר חדש</button>
                  <button type="button" className="wl-btn wl-toggle" onClick={() => simEarn("חמישה נכנסו לדוכן מהקישור שלכם.", "visit", 5)} data-testid="wl-sim-visits">הדמיה: 5 נכנסו מהקישור</button>
                </div>
                {growMsg && <p className="wl-grow-msg" role="status" data-testid="wl-grow-msg">{growMsg}</p>}
              </>
            )}

            {sheet === "invite" && (
              <>
                <h2>מזמינים לפתוח דוכן</h2>
                <div className="wl-msg">היי, זו {myName}. יש מקום פנוי ב{com.mall} של {com.unit} שלנו, ממש ליד הדוכן שלי. רוצה לפתוח שם דוכן?</div>
                <ul className="wl-rules">
                  <li>הקישור מיועד לחבר או חברה אחת, ותקף לשבוע.</li>
                  <li>מי שפותח אותו רואה רק מי הזמין ולאן. לא את החנויות.</li>
                  <li>מצטרפים רק אחרי שהורה אישר.</li>
                  <li>אפשר להצטרף גם רק כדי לבקר, בלי לפתוח דוכן.</li>
                </ul>
                <button
                  type="button" className="wl-btn wl-primary wl-wide"
                  onClick={() => {
                    if (invitePlot && !invited.includes(invitePlot)) setInvited((v) => [...v, invitePlot]);
                    setSheet(null);
                    say("ההזמנה סומנה על המקום הפנוי. בהדמיה לא נשלחת הודעה אמיתית. אפשר לראות את הצד השני.");
                  }}
                  data-testid="wl-invite-send"
                >
                  שליחה בוואטסאפ (הדמיה)
                </button>
              </>
            )}

            {sheet === "notices" && (
              <>
                <h2>{com.board}</h2>
                <ul className="wl-notices">
                  {market !== "off" && <li data-testid="wl-notice-market">{market === "on" ? `${com.marketName} היום. מי שנרשם, הדוכן שלו מקושט.` : `${com.marketName}: ${com.marketWhen}. נרשמים מהדוכן.`}</li>}
                  {NOTICES.map((n) => <li key={n}>{n}</li>)}
                </ul>
                <p className="wl-sheet-note">מודעות לדוגמה.</p>
              </>
            )}

            {sheet === "lab" && (
              <>
                <h2>הגדרות הניסוי</h2>
                {review && (
                  <div className="wl-field">
                    <span className="wl-field-label">איזו קבוצת חנויות להציג</span>
                    <div className="wl-toggles" role="radiogroup" aria-label="איזו קבוצת חנויות להציג">
                      {Array.from({ length: groups }, (_, i) => (
                        <button key={i} type="button" role="radio" aria-checked={group === i} className="wl-btn wl-toggle" onClick={() => setGroup(i)} data-testid={`wl-group-${i}`}>
                          קבוצה {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!review && (
                  <div className="wl-field">
                    <span className="wl-field-label">שלב הצמיחה</span>
                    <div className="wl-stages" role="radiogroup" aria-label="שלב הצמיחה">
                      {STAGES.map((st, i) => (
                        <button key={st.label} type="button" role="radio" aria-checked={stage === i} className="wl-btn wl-toggle" onClick={() => setStage(i)} data-testid={`wl-stage-${i + 1}`}>
                          <span className="wl-stage-n">{i + 1}</span>
                          {com.stages[i]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!review && !visiting && (
                  <button type="button" className="wl-btn wl-wide" onClick={() => { setSheet(null); setPlaceOpen(true); }} data-testid="wl-place-open">לבחור איפה הדוכן יעמוד</button>
                )}
                {!review && (
                  <div className="wl-field">
                    <span className="wl-field-label">סוג הקהילה</span>
                    <div className="wl-toggles" role="radiogroup" aria-label="סוג הקהילה">
                      {([["class", "כיתה בבית ספר"], ["hood", "כיכר בשכונה"]] as const).map(([k, label]) => (
                        <button key={k} type="button" role="radio" aria-checked={kind === k} className="wl-btn wl-toggle" onClick={() => setKind(k)} data-testid={`wl-kind-${k}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {!review && (
                  <div className="wl-field">
                    <span className="wl-field-label">יום שוק</span>
                    <div className="wl-toggles" role="radiogroup" aria-label="יום שוק">
                      {([["off", "אין"], ["soon", "בקרוב"], ["on", "היום"]] as const).map(([k, label]) => (
                        <button key={k} type="button" role="radio" aria-checked={market === k} className="wl-btn wl-toggle" onClick={() => setMarket(k)} data-testid={`wl-market-${k}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="wl-field">
                  <span className="wl-field-label">אור</span>
                  <div className="wl-toggles" role="radiogroup" aria-label="אור">
                    {([["auto", "לפי השעה"], ["day", "יום"], ["night", "לילה"]] as const).map(([k, label]) => (
                      <button key={k} type="button" role="radio" aria-checked={timeMode === k} className="wl-btn wl-toggle" onClick={() => setTimeMode(k)} data-testid={`wl-time-${k}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="wl-field">
                  <span className="wl-field-label">תנועה</span>
                  <div className="wl-toggles">
                    <button type="button" className="wl-btn wl-toggle" aria-pressed={calm} onClick={() => setCalm((v) => !v)} data-testid="wl-calm">פחות תנועה</button>
                    <button
                      type="button" className="wl-btn wl-toggle" aria-pressed={sharp} data-testid="wl-sharp"
                      onClick={() => {
                        const v = !sharp;
                        sharpRef.current = v;
                        setSharp(v);
                        applyCam(camRef.current, false);
                        if (v) rest();
                      }}
                    >
                      חידוד מקרוב
                    </button>
                    <button type="button" className="wl-btn wl-toggle" onClick={() => { setSheet(null); setNews(true); }} data-testid="wl-news-again">להציג את ״מה חדש״</button>
                    <button type="button" className="wl-btn wl-toggle" onClick={() => { setFound([]); setFx({ splash: 0, hop: 0, cat: 0, watered: 0 }); setInvited([]); setJoined({}); setPlaced(null); setCounts(MY_START_COUNTS); setGrew(0); setMarketIn(false); }}>לאפס הפתעות, הזמנות ונקודות</button>
                  </div>
                </div>
                <p className="wl-sheet-note">"חידוד מקרוב" נדלק לבד באייפון. אם התמונה מטושטשת כשמתקרבים, או שמשהו זז ממקומו, כדאי להחליף את ההגדרה הזו.</p>
                <p className="wl-sheet-note">הכול כאן נשמר רק עד שסוגרים את הדף. אין חיבור לחנויות אמיתיות.</p>
              </>
            )}
          </div>
        </div>
      )}

      {inviteView && <InviteSim inviter={myName} com={com} onDone={finishInvite} onClose={() => setInviteView(null)} />}

      {placeOpen && (
        <PlaceSim
          store={homeStores.find((x) => x.mine) ?? homeStores[0]}
          neighbor={homeStores.find((x) => !x.mine) ?? homeStores[0]}
          onDone={finishPlace}
          onClose={() => setPlaceOpen(false)}
        />
      )}

      {news && (
        <WhatsNew
          store={homeStores.find((x) => x.mine) ?? homeStores[0]}
          neighbor={homeStores.find((x) => !x.mine) ?? homeStores[0]}
          onClose={closeNews}
          onGo={() => { closeNews(); if (storeOpen) closeStore(); }}
        />
      )}

      {/* ── החנות ── */}
      <div
        className="wl-store"
        data-open={storeOpen ? "1" : "0"}
        aria-hidden={storeOpen ? undefined : true}
        inert={!storeOpen || news}
      >
        <StoreSim store={(storeOf(storeShown) ?? homeStores.find((x) => x.id === storeShown) ?? homeStores[0]) as LabStore} onExit={closeStore} fromWorld={fromWorld} />
      </div>
    </div>
  );
}
