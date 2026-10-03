"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 🔔 התראות לטלפון של המנהלת.
 *
 * מה מגיע: דוכן חדש · תשלום שמחכה לאישור · מישהי שלא מצליחה להיכנס ·
 * סמס שלא נשלח. מתחת — "מה קרה לאחרונה", אותן התראות כרשימה, כדי שמה
 * שפוספס בטלפון לא ילך לאיבוד.
 *
 * באייפון פוש עובד רק מאפליקציה במסך הבית (iOS 16.4+), ולכן כשהחמ"ל
 * פתוח בספארי רגיל הכרטיס מסביר בדיוק איך מוסיפים — במקום כפתור שלא
 * יעבוד.
 */

type Recent = { kind: string; title: string; body: string | null; url: string | null; sent_to: number; created_at: string };
type State = { available: boolean; publicKey: string | null; devices: { endpoint: string; device: string | null }[]; recent: Recent[] };

const KINDS = [
  { icon: "🆕", label: "דוכן חדש נפתח" },
  { icon: "💰", label: "תשלום מחכה לאישור" },
  { icon: "📵", label: "מישהי לא מצליחה להיכנס" },
  { icon: "⚠️", label: "סמס לא נשלח" },
];

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

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}

export default function AdminPush() {
  const [st, setSt] = useState<State | null>(null);
  const [support, setSupport] = useState<"ok" | "ios-browser" | "none">("ok");
  const [perm, setPerm] = useState<NotificationPermission | "unknown">("unknown");
  const [mine, setMine] = useState<string | null>(null); // ה-endpoint של המכשיר הזה, אם רשום
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/push", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setSt(d ?? { available: false, publicKey: null, devices: [], recent: [] });
  }, []);

  useEffect(() => {
    const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!hasPush) setSupport(ios && !standalone ? "ios-browser" : "none");
    else {
      setPerm(Notification.permission);
      navigator.serviceWorker.getRegistration("/").then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setMine(sub?.endpoint ?? null);
      });
    }
    load();
  }, [load]);

  async function enable() {
    if (!st?.publicKey) return;
    setBusy("enable");
    setMsg("");
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setMsg("לא אישרת התראות. אפשר לשנות בהגדרות הטלפון ← התראות.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(st.publicKey) }));
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(d?.error ?? "ההפעלה נכשלה");
        return;
      }
      setMine(sub.endpoint);
      setMsg("🎉 מעכשיו כל דבר חשוב יקפוץ לך בטלפון");
      await load();
    } catch (e) {
      setMsg(`ההפעלה נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setMsg("");
    const r = await fetch("/api/admin/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setBusy("");
    setMsg(d?.sent ? `נשלחה התראת בדיקה ל-${d.sent} ${d.sent === 1 ? "מכשיר" : "מכשירים"} 🔔` : "ההתראה לא יצאה. לנסות לכבות ולהדליק שוב");
  }

  async function disable() {
    if (!mine) return;
    setBusy("off");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    await fetch("/api/admin/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: mine }),
    }).catch(() => {});
    await sub?.unsubscribe().catch(() => {});
    setMine(null);
    setBusy("");
    setMsg("ההתראות כבויות במכשיר הזה");
    load();
  }

  if (!st) return null;
  const on = !!mine && perm === "granted";
  const others = st.devices.filter((d) => d.endpoint !== mine).length;

  return (
    <section className="bg-white border border-[var(--line)] overflow-hidden" data-testid="admin-push">
      <div className="p-3.5 flex items-start gap-3">
        <span
          className="w-11 h-11 shrink-0 flex items-center justify-center text-[21px]"
          style={{ background: on ? "var(--ok-bg)" : "var(--blush)" }}
          aria-hidden
        >
          <span className={on ? "" : "fx-wiggle"}>🔔</span>
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold">
            {on ? "התראות פעילות בטלפון הזה" : "התראות לטלפון"}
          </h2>
          <p className="text-[12px] text-[var(--muted)] leading-snug mt-0.5">
            {on
              ? `כל דבר חשוב יקפוץ לך${others ? ` · ועוד ${others} ${others === 1 ? "מכשיר" : "מכשירים"}` : ""}.`
              : "לדעת מיד כשקורה משהו — בלי לפתוח את החמ\"ל."}
          </p>
        </div>
      </div>

      <div className="px-3.5 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <span key={k.label} className="text-[11.5px] bg-[var(--canvas)] border border-[var(--sand)] px-2.5 py-1">
            {k.icon} {k.label}
          </span>
        ))}
      </div>

      <div className="p-3.5 flex flex-col gap-2">
        {!st.available ? (
          <p className="text-[12.5px] text-[var(--warn-ink)]" data-testid="push-unavailable">
            ההתראות עוד לא זמינות בשרת (מיגרציה 0055).
          </p>
        ) : support === "ios-browser" ? (
          <div className=" bg-[var(--warn-bg)] p-3 text-[12.5px] leading-relaxed" data-testid="push-ios-howto">
            <b>באייפון זה עובד מהמסך הבית:</b>
            <ol className="mt-1 flex flex-col gap-0.5">
              <li>1. בספארי, כפתור השיתוף <span aria-hidden>⬆️</span> ← &quot;הוספה למסך הבית&quot;</li>
              <li>2. פותחים את &quot;חמ&quot;ל&quot; מהמסך הבית</li>
              <li>3. לוחצים כאן &quot;להפעיל התראות&quot;</li>
            </ol>
          </div>
        ) : support === "none" ? (
          <p className="text-[12.5px] text-[var(--muted)]">הדפדפן הזה לא תומך בהתראות. בטלפון זה עובד בכרום (אנדרואיד) או מהמסך הבית (אייפון).</p>
        ) : perm === "denied" ? (
          <p className="text-[12.5px] text-[var(--warn-ink)]">ההתראות חסומות. כדי להדליק: הגדרות הטלפון ← התראות ← דוכן.</p>
        ) : on ? (
          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={busy === "test"}
              data-testid="push-test"
              className="fx-press flex-1 bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold disabled:opacity-50"
            >
              {busy === "test" ? "שולחת…" : "🔔 לשלוח התראת בדיקה"}
            </button>
            <button onClick={disable} disabled={busy === "off"} className=" border border-[var(--line)] px-3 text-[12.5px]">
              לכבות
            </button>
          </div>
        ) : (
          <button
            onClick={enable}
            disabled={busy === "enable"}
            data-testid="push-enable"
            className="fx-press fx-shine w-full text-white py-3 text-[14px] font-bold disabled:opacity-60"
            style={{ background: "var(--ink)" }}
          >
            {busy === "enable" ? "רגע…" : "🔔 להפעיל התראות בטלפון"}
          </button>
        )}
        {msg && <p role="status" className="text-[12.5px] text-[var(--ink)]">{msg}</p>}
      </div>

      {st.recent.length > 0 && (
        <div className="border-t border-[var(--sand)] px-3.5 py-3" data-testid="push-recent">
          <div className="text-[12px] font-bold text-[var(--faint)] mb-1.5">מה קרה לאחרונה</div>
          <ul className="flex flex-col">
            {st.recent.slice(0, 6).map((r, i) => (
              <li key={i} className={i ? "border-t border-[var(--sand)]" : ""}>
                <a href={r.url ?? "/admin"} className="flex items-start gap-2 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{r.title}</span>
                    {r.body && <span className="block text-[11.5px] text-[var(--muted)] truncate">{r.body}</span>}
                  </span>
                  <span className="text-[11px] text-[var(--faint)] shrink-0 mt-0.5">{ago(r.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
