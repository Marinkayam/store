"use client";

import { useCallback, useEffect, useState } from "react";
import InstallCard from "@/app/install-card";
import VSteps from "@/app/v-steps";

/**
 * "לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה" (0061).
 *
 * שני צעדים, לפי הסדר:
 *   1. לשמור את הדוכן במסך הבית — ההוראות של InstallCard, לפי הטלפון.
 *   2. להפעיל התראות — כפתור אחד. באייפון פוש עובד רק מהאייקון במסך הבית
 *      (iOS 16.4 ומעלה), אז בספארי רגיל מסבירים לפתוח משם ולחזור לכאן,
 *      במקום כפתור שלא יעבוד.
 *
 * כשהכל כבר מוכן (מותקן + התראות פועלות במכשיר הזה) — שורה קטנה אחת, עם
 * כפתור לבדיקה. בלי לחפור.
 */

type Support = "ok" | "ios-browser" | "none";

function b64ToBytes(b64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "אייפון";
  if (/Android/.test(ua)) return "אנדרואיד";
  return "מחשב";
}

export default function OrderAlerts({ storeId, cta }: { storeId: string; cta?: string }) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [support, setSupport] = useState<Support>("ok");
  const [perm, setPerm] = useState<NotificationPermission | "unknown">("unknown");
  const [key, setKey] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [mine, setMine] = useState<string | null>(null); // ה-endpoint של המכשיר הזה, אם רשום לדוכן
  const [open, setOpen] = useState(!cta);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/push?storeId=${encodeURIComponent(storeId)}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setKey(d?.publicKey ?? null);
    setAvailable(!!d?.available);
    let endpoint: string | null = null;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
      endpoint = (await reg?.pushManager?.getSubscription().catch(() => null))?.endpoint ?? null;
    }
    setMine(endpoint && (d?.endpoints ?? []).includes(endpoint) ? endpoint : null);
    setReady(true);
  }, [storeId]);

  useEffect(() => {
    const sa =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setStandalone(sa);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!hasPush) setSupport(ios && !sa ? "ios-browser" : "none");
    else setPerm(Notification.permission);
    load();
  }, [load]);

  async function enable() {
    if (!key) return;
    setBusy("enable");
    setMsg("");
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setMsg("לא אישרתם התראות. אפשר לשנות בהגדרות הטלפון ← התראות.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, subscription: sub.toJSON(), device: deviceName() }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(d?.error ?? "לא הצלחנו להדליק התראות");
        return;
      }
      setMine(sub.endpoint);
      setMsg("מעולה! מעכשיו כל הזמנה חדשה תקפוץ לכם בטלפון.");
    } catch {
      setMsg("לא הצלחנו להדליק התראות. לנסות שוב בעוד רגע");
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setMsg("");
    const r = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, test: true, endpoint: mine }),
    }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setBusy("");
    setMsg(d?.sent ? "נשלחה התראת בדיקה. היא אמורה לקפוץ עוד רגע." : "ההתראה לא יצאה. אפשר לכבות ולהדליק שוב");
  }

  async function disable() {
    if (!mine) return;
    setBusy("off");
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, endpoint: mine }),
    }).catch(() => {});
    // לא מבטלים את המנוי בדפדפן: אותו מכשיר אולי מקבל התראות מדוכן אחר
    setMine(null);
    setBusy("");
    setMsg("ההתראות כבויות בטלפון הזה");
  }

  if (!ready) return null;
  const on = !!mine && perm === "granted";
  const installedOrNotNeeded = standalone;

  if (on && installedOrNotNeeded && cta) {
    return (
      <div className="text-[13px] text-[var(--ok-ink)] font-semibold" data-testid="alerts-on">
        ✓ הדוכן במסך הבית וההתראות פועלות. כשתגיע הזמנה, זה יקפוץ לכם.
      </div>
    );
  }

  if (!open && cta) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full text-[14px] leading-snug" data-testid="alerts-open">
        {cta}
      </button>
    );
  }

  const enableBody = !available ? (
    <p className="text-[12.5px] text-[var(--muted)]" data-testid="alerts-unavailable">
      ההתראות עוד לא זמינות. נסו שוב מאוחר יותר.
    </p>
  ) : support === "ios-browser" ? (
    <p className="text-[12.5px] leading-relaxed" data-testid="alerts-ios-howto">
      באייפון התראות עובדות רק מהאייקון: אחרי ששמרתם, פותחים את הדוכן <b>מהאייקון החדש במסך הבית</b>, ולוחצים כאן
      &quot;להפעיל התראות&quot;.
    </p>
  ) : support === "none" ? (
    <p className="text-[12.5px] text-[var(--muted)]">
      הדפדפן הזה לא תומך בהתראות. בטלפון זה עובד בכרום (אנדרואיד) או מהאייקון במסך הבית (אייפון).
    </p>
  ) : perm === "denied" ? (
    <p className="text-[12.5px] text-[var(--warn-ink)]" data-testid="alerts-denied">
      ההתראות חסומות בטלפון. כדי להדליק: הגדרות ← התראות ← דוכן.
    </p>
  ) : on ? (
    <div className="flex gap-2">
      <button
        onClick={test}
        disabled={busy === "test"}
        data-testid="alerts-test"
        className="flex-1 border-[1.5px] border-[var(--ink)] py-2.5 text-[13px] font-bold disabled:opacity-50"
      >
        {busy === "test" ? "שולחים…" : "לשלוח התראת בדיקה"}
      </button>
      <button onClick={disable} disabled={busy === "off"} className="border border-[var(--line)] px-3 text-[12.5px]" data-testid="alerts-off">
        לכבות
      </button>
    </div>
  ) : (
    <button onClick={enable} disabled={busy === "enable"} data-testid="alerts-enable" className="btn btn-primary w-full disabled:opacity-60">
      {busy === "enable" ? "רגע…" : "להפעיל התראות"}
    </button>
  );

  return (
    <div data-testid="order-alerts">
      <VSteps
        compact
        steps={[
          {
            key: "install",
            testid: "alerts-step-install",
            state: installedOrNotNeeded ? "done" : "current",
            title: "לשמור את הדוכן במסך הבית",
            sub: installedOrNotNeeded ? undefined : "ככה הדוכן נפתח כמו אפליקציה, בלחיצה אחת.",
            body: installedOrNotNeeded ? undefined : <InstallCard force />,
          },
          {
            key: "push",
            testid: "alerts-step-push",
            state: on ? "done" : installedOrNotNeeded || support === "ok" ? "current" : "later",
            title: on ? "ההתראות פועלות בטלפון הזה" : "להפעיל התראות",
            sub: on ? "כל הזמנה חדשה תקפוץ לכם, גם כשהדוכן סגור." : "כשמישהו מזמין, הטלפון מצלצל. בלי לבדוק כל הזמן.",
            body: enableBody,
          },
        ]}
      />
      {msg && (
        <p role="status" className="text-[12.5px] mt-2" data-testid="alerts-msg">
          {msg}
        </p>
      )}
    </div>
  );
}
