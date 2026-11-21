"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/app/icons";
import {
  AWNINGS, CLASS_NAME, LEVEL_LABELS, LEVEL_NAMES, MALL, NOTICES, STALL, STORES, SURPRISES, WORLD, ZONES,
  alleyOpen, layout, type ClassSize, type Deco, type LabStore, type Level, type Plot,
} from "./data";
import { Foreground, Scenery } from "./scenery";
import { EmptyPlot, GardenPlot, WorldStall, type Lod } from "./stalls";
import StoreSim from "./store-sim";

/**
 * עולם דוכן — אב־טיפוס.
 *
 * עולם אחד, מצלמה אחת. המישור כולו (עיר, קניון, רחובות, דוכנים) מצויר
 * פעם אחת, והמצלמה היא transform על המישור: הזזה והגדלה. "רמה" היא גובה
 * מצלמה (עיר, קניון, רחוב, דוכן), לא מסך נפרד — ולכן כשמתרחקים רואים את
 * אותו דוכן קטן יותר בתוך אותו רחוב, ולא עוברים לדף אחר.
 *
 * מה ששומר על זה קל בטלפון:
 *   - תנועת המצלמה היא transform בלבד (המעבד הגרפי), בלי ציור מחדש בכל פריים.
 *   - לכל דוכן שלוש רמות פירוט; רק הדוכן שבמרכז מקבל את הציור המלא.
 *   - בזמן תעופה כל האנימציות הקטנות עוצרות, ופרטים רחוקים לא מונפשים.
 *
 * הכול כאן מצב בזיכרון של הדפדפן. אין קריאה לשרת ואין נתונים אמיתיים.
 */

const DUR = 720;
const CITY_C = { x: WORLD.w / 2, y: 2150 };
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
  return { r: 62, t: 62, b: level === 3 ? Math.min(250, h * 0.3) : 104 };
}

function scaleFor(level: Level, w: number, h: number): number {
  const i = insets(level, h);
  const fw = w - i.r;
  const fh = h - i.t - i.b;
  if (level === 0) return Math.min(fw / 2400, fh / 4300);
  if (level === 1) return Math.min(fw / 1150, fh / 1540);
  if (level === 2) return Math.min(fw / 270, fh / 430, 1.9);
  return Math.min(fw / 108, fh / 96, 5.6);
}

function clampCam(level: Level, x: number, y: number) {
  const box =
    level === 0 ? [700, 1700, 1300, 3300]
    : level === 1 ? [MALL_C.x - 260, MALL_C.x + 260, MALL_C.y - 380, MALL_C.y + 380]
    : [MALL.x + 50, MALL.x + MALL.w - 50, MALL.y + 180, MALL.y + MALL.h - 40];
  return { x: Math.min(box[1], Math.max(box[0], x)), y: Math.min(box[3], Math.max(box[2], y)) };
}

const nearestRow = (y: number) => ROWS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));

const SceneryMemo = memo(Scenery);
const ForegroundMemo = memo(Foreground);

type SheetKind = "decorate" | "invite" | "notices" | "lab" | null;

/* אייקונים קטנים לסולם הרמות */
function LevelIcon({ level }: { level: Level }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {level === 0 && <path d="M3 20V11l4-3 4 3v9M11 20V6l5-3v17M16 9h5v11M3 20h18M6.500 14h1M6.500 17h1M13.500 9h.5M13.500 13h.5" {...p} />}
      {level === 1 && <path d="M3 20V12a9 9 0 0 1 18 0v8M3 20h18M9 20v-6h6v6M7 9.500h10" {...p} />}
      {level === 2 && <path d="M2 8h9v3a1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0zM13 8h9v3a1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0 1.500 1.500 0 0 1-3 0zM3.500 12.500V19M9.500 12.500V19M14.500 12.500V19M20.500 12.500V19M1.500 19h21" {...p} />}
      {level === 3 && <path d="M3 6h18v2H3zM3 8h4.500v3a2.250 2 0 0 1-4.500 0zM7.500 8H12v3a2.250 2 0 0 1-4.500 0zM12 8h4.500v3a2.250 2 0 0 1-4.500 0zM16.500 8H21v3a2.250 2 0 0 1-4.500 0zM5 11v8M19 11v8M3 18h18" {...p} />}
    </svg>
  );
}

export default function World() {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const vp = useRef({ w: 390, h: 800 });
  const camRef = useRef<Cam>({ x: 0, y: 0, s: 1, lv: 3 });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef(0);
  const selfHash = useRef(false);

  const [size, setSize] = useState<ClassSize>(8);
  const [night, setNight] = useState(false);
  const [dusk, setDusk] = useState(false);
  const [calm, setCalm] = useState(false);
  const [level, setLevel] = useState<Level>(3);
  const [moving, setMoving] = useState(false);
  const [, setTick] = useState(0); // המצלמה עצמה חיה ב-ref; זה רק מבקש ציור מחדש
  const [ready, setReady] = useState(false);
  const [storeOpen, setStoreOpen] = useState<string | null>("noa");
  const [storeShown, setStoreShown] = useState<string>("noa");
  const [fromWorld, setFromWorld] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [mine, setMine] = useState<{ awning: string; deco: Deco }>(() => {
    const s = STORES.find((x) => x.mine)!;
    return { awning: s.awning, deco: s.deco };
  });
  const [invited, setInvited] = useState<string[]>([]);
  const [invitePlot, setInvitePlot] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [bubble, setBubble] = useState<{ text: string; k: number } | null>(null);
  const [fx, setFx] = useState({ splash: 0, hop: 0, cat: 0, watered: 0 });

  const plots = useMemo(() => layout(size), [size]);
  const stores = useMemo(() => STORES.map((s) => (s.mine ? { ...s, awning: mine.awning, deco: mine.deco } : s)), [mine]);
  const storeOf = useCallback((id: string | undefined) => stores.find((s) => s.id === id), [stores]);
  const myPlot = useMemo(() => plots.find((p) => p.store?.mine)!, [plots]);
  const stallCount = plots.filter((p) => p.kind === "stall").length;

  /* ── מצלמה ── */

  const applyCam = useCallback((c: Cam, animate: boolean) => {
    const el = planeRef.current;
    if (!el) return;
    const { w, h } = vp.current;
    const i = insets(c.lv, h);
    const ox = (w - i.r) / 2;
    const oy = i.t + (h - i.t - i.b) / 2;
    el.style.transition = animate ? `transform ${DUR}ms cubic-bezier(.33,.02,.18,1)` : "none";
    el.style.transform = `translate3d(${ox - c.x * c.s}px, ${oy - c.y * c.s}px, 0) scale(${c.s})`;
    el.style.setProperty("--s", String(c.s));
  }, []);

  const go = useCallback(
    (lv: Level, x?: number, y?: number) => {
      const { w, h } = vp.current;
      const p = clampCam(lv, x ?? camRef.current.x, y ?? camRef.current.y);
      camRef.current = { x: p.x, y: p.y, s: scaleFor(lv, w, h), lv };
      setLevel(lv);
      setMoving(true);
      applyCam(camRef.current, !calm);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        setMoving(false);
        setTick((t) => t + 1);
      }, calm ? 30 : DUR + 40);
    },
    [applyCam, calm]
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
      if (level === 0) return go(1, MALL_C.x, MALL_C.y);
      if (level === 1) return go(2, atX ?? c.x, nearestRow(atY ?? c.y));
      if (level === 2) {
        const p = nearestPlot(atX ?? c.x, atY ?? c.y);
        return p ? go(3, p.cx, p.by - 24) : go(3, atX ?? c.x, atY ?? c.y);
      }
    },
    [go, level, nearestPlot]
  );

  const zoomOut = useCallback(() => {
    chain.current++;
    const c = camRef.current;
    if (level === 3) return go(2, c.x, nearestRow(c.y + 60));
    if (level === 2) return go(1, MALL_C.x, MALL_C.y);
    if (level === 1) return go(0, CITY_C.x, CITY_C.y);
  }, [go, level]);

  /** תעופה רמה אחרי רמה אל נקודה — ככה גם קפיצה רחוקה מרגישה כמו מסע */
  const flyTo = useCallback(
    async (target: Level, x: number, y: number, then?: () => void) => {
      const id = ++chain.current;
      const wait = () => new Promise((r) => setTimeout(r, calm ? 40 : DUR + 60));
      let lv = level;
      while (lv !== target) {
        lv = (lv < target ? lv + 1 : lv - 1) as Level;
        if (lv === 0) go(0, CITY_C.x, CITY_C.y);
        else if (lv === 1) go(1, MALL_C.x, MALL_C.y);
        else if (lv === 2) go(2, x, nearestRow(y + 60));
        else go(3, x, y);
        await wait();
        if (chain.current !== id) return;
      }
      if (lv === target && target === 3) go(3, x, y);
      then?.();
    },
    [calm, go, level]
  );

  const goLevel = useCallback(
    (t: Level) => {
      if (t === level) return;
      const c = camRef.current;
      if (t < level) {
        // החוצה: נשארים מעל אותו מקום
        void flyTo(t, c.x, c.y);
      } else {
        const near = level >= 2 ? nearestPlot(c.x, c.y, 200, 300) : null;
        const p = near ?? myPlot;
        void flyTo(t, p.cx, p.by - 24);
      }
    },
    [flyTo, level, myPlot, nearestPlot]
  );

  /** יום ולילה: המסך מחשיך לרגע, הצבעים מתחלפים מאחוריו, והוא מתבהר */
  const toggleNight = useCallback(() => {
    if (calm) return setNight((n) => !n);
    setDusk(true);
    setTimeout(() => {
      setNight((n) => !n);
      requestAnimationFrame(() => requestAnimationFrame(() => setDusk(false)));
    }, 250);
  }, [calm]);

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
  }, [applyCam, calm]);

  const goHome = useCallback(() => {
    setSheet(null);
    if (storeOpen) {
      if (storeOpen === "noa") return;
      closeStore();
    }
    void flyTo(3, myPlot.cx, myPlot.by - 24, () => openStore("noa"));
  }, [closeStore, flyTo, myPlot, openStore, storeOpen]);

  /* ── התחלה, שינוי גודל מסך ── */

  useEffect(() => {
    const measure = () => {
      const r = viewRef.current?.getBoundingClientRect();
      if (r) vp.current = { w: r.width, h: r.height };
    };
    measure();
    const hash = typeof location !== "undefined" ? location.hash.slice(1) : "";
    const idx = (LEVEL_NAMES as readonly string[]).indexOf(hash);
    const start: Level = idx >= 0 ? (idx as Level) : 3;
    const { w, h } = vp.current;
    const at = start === 0 ? CITY_C : start === 1 ? MALL_C : start === 2 ? { x: myPlot.cx, y: ROWS[0] } : { x: myPlot.cx, y: myPlot.by - 24 };
    camRef.current = { ...at, s: scaleFor(start, w, h), lv: start };
    setLevel(start);
    if (idx >= 0) setStoreOpen(null);
    applyCam(idx >= 0 ? camRef.current : { ...camRef.current, s: camRef.current.s * 1.8 }, false);
    const hour = new Date().getHours();
    setNight(hour >= 19 || hour < 6);
    setCalm(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    setReady(true);

    const onResize = () => {
      measure();
      setLevel((lv) => {
        camRef.current = { ...camRef.current, s: scaleFor(lv, vp.current.w, vp.current.h) };
        applyCam(camRef.current, false);
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
        if (!st.storeOpen) actions.current.openStore("noa");
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
        setTick((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyCam, calm, closeStore, level, sheet, storeOpen, zoomIn, zoomOut]);

  /* ── הפתעות ── */

  const say = useCallback((text: string) => setBubble({ text, k: Date.now() }), []);
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 5200);
    return () => clearTimeout(t);
  }, [bubble]);

  const trigger = (id: string) => {
    const s = SURPRISES.find((x) => x.id === id)!;
    const isNew = !found.includes(id);
    const next = isNew ? [...found, id] : found;
    if (isNew) setFound(next);
    if (id === "fountain") setFx((f) => ({ ...f, splash: f.splash + 1 }));
    if (id === "hopscotch") setFx((f) => ({ ...f, hop: f.hop + 1 }));
    if (id === "cat") setFx((f) => ({ ...f, cat: f.cat + 1 }));
    if (id === "garden") setFx((f) => ({ ...f, watered: Math.min(5, f.watered + 1) }));
    if (id === "board") setSheet("notices");
    say(isNew && next.length === SURPRISES.length ? `${s.text} מצאת את כל ההפתעות!` : s.text);
  };

  /* ── מה רואים עכשיו ── */

  const c = camRef.current;
  const focus = level === 3 ? nearestPlot(c.x, c.y, 42, 60) : null;
  const focusStore = focus?.kind === "stall" ? storeOf(focus.store!.id) ?? null : null;

  const lodOf = (p: Plot): Lod => {
    if (level < 2) return "far";
    if (Math.abs(p.cx - c.x) > 560 || Math.abs(p.by - c.y) > 640) return "far";
    return level === 3 && !moving && focus?.id === p.id ? "near" : "mid";
  };

  const place = (() => {
    if (level === 0) return "העיר";
    if (level === 1) return `הקניון של ${CLASS_NAME}`;
    const ly = c.y - MALL.y;
    const zone = ly < 580 ? ZONES.A.name : ly < 960 ? "כיכר המזרקה" : ly < 1235 ? ZONES.B.name : "שטח לרחוב חדש";
    if (level === 3 && focus) return focus.kind === "stall" ? focusStore?.name ?? zone : "מקום פנוי";
    return zone;
  })();

  const hint =
    level === 0 ? "נוגעים בקניון כדי להתקרב"
    : level === 1 ? "נוגעים ברחוב כדי להיכנס אליו"
    : level === 2 ? "נוגעים בדוכן כדי להתקרב אליו"
    : focus ? "" : "גוררים כדי להסתכל מסביב";

  const tapPlot = (p: Plot) => {
    if (level === 2 || focus?.id !== p.id) return go(3, p.cx, p.by - 24);
    if (p.kind === "stall") return openStore(p.store!.id);
    if (p.kind === "empty") { setInvitePlot(p.id); setSheet("invite"); }
  };

  const worldBusy = !!storeOpen || !!sheet;
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
        inert={worldBusy}
      >
        <div ref={planeRef} className="wl-plane" style={{ width: WORLD.w, height: WORLD.h }}>
          <SceneryMemo size={size} flowers={stallCount + fx.watered} alley={alleyOpen(size)} splash={fx.splash} hop={fx.hop} />

          {/* אזורי נגיעה: הקניון (מהעיר), הרחובות (מהקניון), ההפתעות */}
          <button
            type="button" className="wl-hit" data-lv="0" tabIndex={level === 0 ? 0 : -1}
            aria-label={`להתקרב אל הקניון של ${CLASS_NAME}`}
            style={{ left: MALL.x, top: MALL.y, width: MALL.w, height: MALL.h }}
            onClick={() => go(1, MALL_C.x, MALL_C.y)}
            data-testid="wl-hit-mall"
          />
          {[
            { id: "A", label: ZONES.A.name, x: MALL.x + 20, y: MALL.y + 150, w: 1060, h: 290, row: ROWS[0] },
            { id: "P", label: "כיכר המזרקה", x: MALL.x + 60, y: MALL.y + 452, w: 980, h: 476, row: ROWS[1] },
            { id: "B", label: ZONES.B.name, x: MALL.x + 236, y: MALL.y + 960, w: 628, h: 256, row: ROWS[2] },
            { id: "C", label: "שטח לרחוב חדש", x: MALL.x + 120, y: MALL.y + 1240, w: 860, h: 150, row: ROWS[3] },
          ].map((z) => (
            <button
              key={z.id} type="button" className="wl-hit" data-lv="1" tabIndex={level === 1 ? 0 : -1}
              aria-label={`להיכנס אל ${z.label}`}
              style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
              onClick={(e) => {
                const m = e.detail === 0 ? { x: z.x + z.w / 2 } : worldAt(e.clientX, e.clientY);
                go(2, m.x, z.row);
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
                data-lv="2 3"
                data-testid={`wl-plot-${p.id}`}
                tabIndex={level >= 2 ? 0 : -1}
                aria-label={
                  st
                    ? `${st.name}${st.mine ? ", הדוכן שלי" : ""}. ${level === 3 && focus?.id === p.id ? "להיכנס לחנות" : "להתקרב"}`
                    : `מקום פנוי${isInvited(p.id) ? ", הזמנה נשלחה" : ""}. ${level === 3 && focus?.id === p.id ? "להזמין לפתוח כאן דוכן" : "להתקרב"}`
                }
                style={{ ...style, ...vars }}
                onClick={() => tapPlot(p)}
              >
                {st ? <WorldStall store={st} lod={lod} /> : <EmptyPlot lod={lod} invited={isInvited(p.id)} />}
              </button>
            );
          })}

          <ForegroundMemo catJump={fx.cat} />

          {SURPRISES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="wl-hit wl-surprise"
              data-lv={Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i).join(" ")}
              data-found={found.includes(s.id) ? "1" : undefined}
              tabIndex={level >= s.from && level <= s.to ? 0 : -1}
              aria-label={s.label}
              style={{ left: s.x - s.r, top: s.y - s.r, width: s.r * 2, height: s.r * 2 }}
              onClick={() => trigger(s.id)}
              data-testid={`wl-surprise-${s.id}`}
            />
          ))}

          {/* תוויות. גודל קבוע על המסך, בלי קשר לזום. */}
          <span className="wl-label wl-label-pin" data-lv="0" style={{ left: MALL_C.x, top: MALL.y - 10 }}>הקניון של {CLASS_NAME}</span>
          <span className="wl-label" data-lv="0" style={{ left: 2110, top: 1345 }}>בית הספר</span>
          <span className="wl-label" data-lv="0" style={{ left: 300, top: 1620 }}>הפארק</span>
          <span className="wl-label" data-lv="0" style={{ left: 1200, top: 3130 }}>מתחם פנוי לכיתה נוספת</span>
          <span className="wl-label" data-lv="0" style={{ left: 1200, top: 4000 }}>הים</span>
          <span className="wl-label" data-lv="1" style={{ left: MALL_C.x, top: MALL.y + 345 }}>{ZONES.A.name}</span>
          <span className="wl-label" data-lv="1" style={{ left: MALL_C.x, top: MALL.y + 760 }}>כיכר המזרקה</span>
          <span className="wl-label" data-lv="1" style={{ left: MALL_C.x, top: MALL.y + 1140 }}>{ZONES.B.name}{alleyOpen(size) ? "" : " · נפתחת ב־8 דוכנים"}</span>
          {plots.filter((p) => p.kind === "stall").map((p) => {
            const st = storeOf(p.store!.id)!;
            return (
              <span key={p.id} className="wl-label wl-plate" data-lv="2" data-mine={st.mine ? "1" : undefined} style={{ left: p.cx, top: p.by + 9 }}>
                {st.name}
                {st.mine && <b>שלי</b>}
              </span>
            );
          })}
          <span className="wl-label" data-lv="2" style={{ left: MALL.x + 205, top: MALL.y + 884 }}>הגינה של הכיתה</span>
        </div>
      </div>

      <div className="wl-dusk" aria-hidden />

      {/* ── ממשק ── */}
      <div className="wl-hud" inert={!!storeOpen}>
        <div className="wl-top">
          <div className="wl-top-side">
            <button type="button" className="wl-btn wl-sq" onClick={toggleNight} aria-pressed={night} aria-label={night ? "לעבור ליום" : "לעבור ללילה"} data-testid="wl-night">
              <Icon name={night ? "sun" : "moon"} size={22} tone={night ? "var(--warning)" : "var(--lavender)"} />
            </button>
            <button type="button" className="wl-btn wl-chip" onClick={() => setSheet("lab")} data-testid="wl-lab">ניסוי</button>
          </div>
          <div className="wl-place" aria-live="polite" data-testid="wl-place">{place}</div>
          <div className="wl-top-side wl-top-end">
            <span className="wl-found" data-testid="wl-found" aria-label={`מצאת ${found.length} הפתעות מתוך ${SURPRISES.length}`}>
              <Icon name="star" size={18} tone="var(--warning)" />
              {found.length}/{SURPRISES.length}
            </span>
          </div>
        </div>

        <nav className="wl-ladder" aria-label="כמה קרוב מסתכלים">
          {LEVEL_LABELS.map((label, i) => (
            <button
              key={label} type="button" className="wl-btn wl-step-btn" aria-current={level === i ? "true" : undefined}
              onClick={() => goLevel(i as Level)} data-testid={`wl-level-${i}`}
            >
              <LevelIcon level={i as Level} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="wl-bottom">
          {level === 3 && !moving && focus && !sheet && (
            <div className="wl-card" data-testid="wl-card">
              {focusStore ? (
                <>
                  <div className="wl-card-title">{focusStore.name}</div>
                  <div className="wl-card-sub">{focusStore.tagline}</div>
                  <div className="wl-card-actions">
                    <button type="button" className="wl-btn wl-primary" onClick={() => openStore(focusStore.id)} data-testid="wl-enter">להיכנס לחנות</button>
                    {focusStore.mine && (
                      <button type="button" className="wl-btn" onClick={() => { setSheet("decorate"); go(3, focus.cx, focus.by + 8); }} data-testid="wl-decorate">
                        <Icon name="palette" size={20} tone="var(--lavender)" />
                        לעצב
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="wl-card-title">{isInvited(focus.id) ? "הזמנה נשלחה" : "מקום פנוי"}</div>
                  <div className="wl-card-sub">כאן יכול לקום דוכן של חברה או חבר מהכיתה.</div>
                  <div className="wl-card-actions">
                    <button type="button" className="wl-btn wl-primary" onClick={() => { setInvitePlot(focus.id); setSheet("invite"); }} data-testid="wl-invite">
                      {isInvited(focus.id) ? "להזמין עוד מישהו" : "להזמין לפתוח כאן דוכן"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {bubble && !sheet && (
            <div className="wl-bubble" role="status" key={bubble.k} data-testid="wl-bubble">
              <Icon name="sparkle" size={20} tone="var(--warning)" />
              <span>{bubble.text}</span>
            </div>
          )}
          {hint && !bubble && <div className="wl-hint">{hint}</div>}
          <div className="wl-bottom-row">
            <button type="button" className="wl-btn wl-home" onClick={goHome} data-testid="wl-home">
              <Icon name="stall" size={22} tone="var(--lavender)" />
              הדוכן שלי
            </button>
            {level > 0 && (
              <button type="button" className="wl-btn wl-out" onClick={zoomOut} data-testid="wl-out">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <circle cx="10.500" cy="10.500" r="6.500" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M15.500 15.500L20 20M7.500 10.500h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                להתרחק
              </button>
            )}
          </div>
          <div className="wl-proto">אב־טיפוס · כל החנויות והשמות בדויים</div>
        </div>
      </div>

      {/* ── גיליונות ── */}
      {sheet && (
        <div className="wl-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="wl-sheet" role="dialog" aria-modal="true" aria-label={sheet === "decorate" ? "עיצוב הדוכן" : sheet === "invite" ? "הזמנה לפתוח דוכן" : sheet === "notices" ? "לוח המודעות" : "הגדרות הניסוי"} data-testid={`wl-sheet-${sheet}`}>
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

            {sheet === "invite" && (
              <>
                <h2>מזמינים לפתוח דוכן</h2>
                <div className="wl-msg">היי! יש מקום פנוי בקניון של הכיתה שלנו, ממש ליד הדוכן שלי. רוצה לפתוח שם דוכן?</div>
                <p className="wl-sheet-note">הקישור מוביל לתהליך הצטרפות באישור הורה. הוא לא מציג את החנויות של הכיתה למי שעוד לא הצטרף.</p>
                <button
                  type="button" className="wl-btn wl-primary wl-wide"
                  onClick={() => {
                    if (invitePlot && !invited.includes(invitePlot)) setInvited((v) => [...v, invitePlot]);
                    setSheet(null);
                    say("ההזמנה סומנה על המקום הפנוי. בהדמיה לא נשלחת הודעה אמיתית.");
                  }}
                  data-testid="wl-invite-send"
                >
                  שליחה בוואטסאפ (הדמיה)
                </button>
              </>
            )}

            {sheet === "notices" && (
              <>
                <h2>לוח המודעות של הכיתה</h2>
                <ul className="wl-notices">
                  {NOTICES.map((n) => <li key={n}>{n}</li>)}
                </ul>
                <p className="wl-sheet-note">מודעות לדוגמה.</p>
              </>
            )}

            {sheet === "lab" && (
              <>
                <h2>הגדרות הניסוי</h2>
                <div className="wl-field">
                  <span className="wl-field-label">כמה דוכנים יש בכיתה</span>
                  <div className="wl-toggles" role="radiogroup" aria-label="כמה דוכנים יש בכיתה">
                    {([3, 8, 11] as ClassSize[]).map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={size === n} className="wl-btn wl-toggle" onClick={() => setSize(n)} data-testid={`wl-size-${n}`}>
                        {n} דוכנים
                      </button>
                    ))}
                  </div>
                </div>
                <div className="wl-field">
                  <span className="wl-field-label">תנועה</span>
                  <div className="wl-toggles">
                    <button type="button" className="wl-btn wl-toggle" aria-pressed={calm} onClick={() => setCalm((v) => !v)} data-testid="wl-calm">פחות תנועה</button>
                    <button type="button" className="wl-btn wl-toggle" onClick={() => { setFound([]); setFx({ splash: 0, hop: 0, cat: 0, watered: 0 }); setInvited([]); }}>לאפס הפתעות והזמנות</button>
                  </div>
                </div>
                <p className="wl-sheet-note">הכול כאן נשמר רק עד שסוגרים את הדף. אין חיבור לחנויות אמיתיות.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── החנות ── */}
      <div
        className="wl-store"
        data-open={storeOpen ? "1" : "0"}
        aria-hidden={storeOpen ? undefined : true}
        inert={!storeOpen}
      >
        <StoreSim store={storeOf(storeShown) as LabStore} onExit={closeStore} fromWorld={fromWorld} />
      </div>
    </div>
  );
}
