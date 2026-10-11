"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { displayPhone } from "@/lib/phone";
import { loginLinkWhatsapp } from "./no-sms-login";

/**
 * "כניסות" — הרצף של מי שמנסה להיכנס, במקום אחד.
 *
 * מרינה: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין קשה לי
 * לתת להם מענה כי אין לי פלואו רציף." עד עכשיו החמ"ל הראה רק כמה בקשות קוד
 * היו. עכשיו:
 *   • תמונת מצב ל-24 שעות (ניסו / נכנסו / הסמס נכשל / קוד שגוי), ובאנר אדום
 *     כשהספק נכשל אצל כמה מספרים ביחד — זו תקלה כללית, לא ילדה אחת.
 *   • מי צריכה עזרה עכשיו, עם משפט אחד על מה קרה.
 *   • חיפוש מספר (גם חלקי, וגם מספר לא תקין שהוקלד) → ציר זמן + מה קרה ומה עושים.
 *
 * כפתור הוואטסאפ הוא קישור רגיל (<a>), לא window.open אחרי await — בספארי
 * באייפון חלון שנפתח אחרי המתנה לשרת נחסם.
 */

type Tone = "ok" | "bad" | "neutral";
type Ev = { at: string; kind: string; label: string; tone: Tone; detail: string | null; client: string | null };
type Diagnosis = { headline: string; hint: string; action: "link" | "wait" | "none"; state: "ok" | "bad" };
type Flow = {
  phone: string;
  events: Ev[];
  diagnosis: Diagnosis;
  store: { name: string; emoji: string } | null;
  openLink?: string | null;
  notFound?: boolean;
};
type Overview = {
  health: { hours: number; tried: number; entered: number; smsFailed: number; wrong: number };
  outage: { reason: string; phones: number; lastAt: string } | null;
  needHelp: { phone: string; valid: boolean; headline: string; action: string; lastAt: string; store: { name: string } | null }[];
};

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return today ? t : `${d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${t}`;
};

const TONE_BG: Record<Tone, string> = { ok: "var(--olive)", bad: "var(--danger)", neutral: "var(--stone)" };

export default function LoginFlow() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState("");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [minting, setMinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLElement>(null);

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/login-flow", { cache: "no-store" }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    if (d?.missing) setMissing(true);
    else if (d?.health) setOv(d);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const search = useCallback(async (value: string, keepLink = false) => {
    const phone = value.trim();
    if (!phone) return;
    setSearching(true);
    setErr("");
    if (!keepLink) setLink("");
    setCandidates(null);
    try {
      const res = await fetch(`/api/admin/login-flow?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setErr(d?.error ?? "לא הצלחנו לחפש");
      if (d?.missing) return setMissing(true);
      if (d?.candidates) {
        setFlow(null);
        return setCandidates(d.candidates);
      }
      setFlow(d);
    } finally {
      setSearching(false);
    }
  }, []);

  // "ציר זמן" מתוך רשימת התקועות (stuck-logins.tsx)
  useEffect(() => {
    const on = (e: Event) => {
      const phone = (e as CustomEvent<string>).detail;
      if (!phone) return;
      setQ(displayPhone(phone));
      search(phone);
      root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("login-flow-open", on);
    return () => window.removeEventListener("login-flow-open", on);
  }, [search]);

  async function mint() {
    if (!flow) return;
    setMinting(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: flow.phone, for: "store" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.url) return setErr(d?.error ?? "יצירת הקישור נכשלה");
      setLink(d.url);
      // מרעננים את הציר ("נוצר לה קישור") בלי להעלים את הקישור שזה עתה נוצר
      search(flow.phone, true);
    } finally {
      setMinting(false);
    }
  }

  if (missing) {
    return (
      <section className="bg-white border border-[var(--line)] p-3" data-testid="login-flow-missing">
        <h2 className="text-sm font-bold">כניסות</h2>
        <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
          יומן הכניסות עוד לא פעיל. צריך להריץ את מיגרציה 0063 (login_events) בסופרבייס. עד אז הכניסה עצמה עובדת כרגיל.
        </p>
      </section>
    );
  }

  const h = ov?.health;
  const validPhone = !!flow && /^972\d{9}$/.test(flow.phone);

  return (
    <section ref={root} className="bg-white border border-[var(--line)] p-3" data-testid="login-flow">
      <h2 className="text-sm font-bold">כניסות</h2>
      {h && (
        <p className="text-[12.5px] text-[var(--muted)] mt-0.5" data-testid="login-health">
          {h.hours} שעות אחרונות: ניסו {h.tried} · נכנסו {h.entered}
          {h.smsFailed > 0 && ` · הסמס נכשל ${h.smsFailed}`}
          {h.wrong > 0 && ` · קוד שגוי ${h.wrong}`}
        </p>
      )}

      {ov?.outage && (
        <div role="alert" className="mt-2 bg-[var(--danger-bg)] border border-[var(--danger-line)] text-[var(--danger)] p-2.5 text-[12.5px] leading-relaxed" data-testid="login-outage">
          <b>הספק לא שולח סמסים:</b> {ov.outage.reason}, אצל {ov.outage.phones} מספרים בשעה האחרונה ({ago(ov.outage.lastAt)}).
          זו תקלה כללית ולא של ילדה אחת — לשלוח לכולן קישור כניסה, ולבדוק את החשבון ב-sms4free.
        </div>
      )}

      {ov && ov.needHelp.length > 0 && (
        <div className="mt-2.5" data-testid="login-needhelp">
          <div className="text-[12px] font-bold text-[var(--muted)] mb-1">צריכות עזרה עכשיו</div>
          <div className="flex flex-col">
            {ov.needHelp.map((n) => (
              <button
                key={n.phone}
                onClick={() => {
                  setQ(displayPhone(n.phone));
                  search(n.phone);
                }}
                data-testid="login-needhelp-row"
                data-phone={n.phone}
                className="text-right border-t border-[var(--line)] py-2 flex flex-col gap-0.5"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] font-bold" dir="ltr">{n.valid ? displayPhone(n.phone) : `${n.phone} (לא תקין)`}</span>
                  <span className="text-[11.5px] text-[var(--muted)] shrink-0">{ago(n.lastAt)}</span>
                </span>
                <span className="text-[12.5px] leading-snug">{n.store ? `${n.store.name} · ` : ""}{n.headline}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ov && ov.needHelp.length === 0 && !ov.outage && (
        <p className="text-[12.5px] text-[var(--muted)] mt-2">אף אחת לא תקועה עכשיו.</p>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="חיפוש מספר בכניסות"
          placeholder="מספר טלפון, גם חלקי, גם כפי שהוקלד"
          inputMode="tel"
          className="flex-1 min-w-0 border border-[var(--line)] px-3 py-2.5 text-[13px]"
          data-testid="login-search-input"
        />
        <button
          disabled={searching || !q.trim()}
          className="shrink-0 bg-[var(--ink)] text-white px-4 text-[13px] font-bold disabled:opacity-50"
          data-testid="login-search"
        >
          {searching ? "רגע…" : "הציר"}
        </button>
      </form>
      {err && <p role="alert" className="text-[12px] text-[var(--danger)] mt-1.5">{err}</p>}

      {candidates && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="login-candidates">
          <span className="text-[12px] text-[var(--muted)] w-full">כמה מספרים מתאימים:</span>
          {candidates.map((c) => (
            <button key={c} onClick={() => { setQ(c); search(c); }} className="border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]" dir="ltr">
              {/^972\d{9}$/.test(c) ? displayPhone(c) : c}
            </button>
          ))}
        </div>
      )}

      {flow && (
        <div className="mt-3 border-t border-[var(--line)] pt-3" data-testid="login-timeline">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold" dir="ltr">{validPhone ? displayPhone(flow.phone) : flow.phone}</span>
            <span className="text-[12px] text-[var(--muted)]">{flow.store ? flow.store.name : "עוד בלי דוכן"}</span>
          </div>

          <div
            className={`mt-2 p-2.5 border ${flow.diagnosis.state === "ok" ? "bg-[var(--ok-bg)] border-[var(--ok-line)]" : "bg-[var(--warn-bg)] border-[var(--warn-line)]"}`}
            data-testid="login-diagnosis"
            data-state={flow.diagnosis.state}
          >
            <div className="text-[13.5px] font-bold leading-snug">{flow.diagnosis.headline}</div>
            <p className="text-[12.5px] leading-relaxed mt-1">{flow.diagnosis.hint}</p>
          </div>

          {validPhone && flow.diagnosis.action === "link" && (
            <div className="mt-2">
              {!link ? (
                <button
                  onClick={mint}
                  disabled={minting}
                  data-testid="login-mint"
                  className="w-full bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold disabled:opacity-50"
                >
                  {minting ? "רגע…" : flow.openLink ? "קישור כניסה חדש" : "ליצור קישור כניסה"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <a
                    href={loginLinkWhatsapp(flow.phone, link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="login-whatsapp"
                    className="flex-1 text-center bg-[var(--whatsapp)] text-white px-3 py-2.5 text-[13px] font-bold"
                  >
                    לשלוח בוואטסאפ
                  </a>
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(link).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }, () => {})
                    }
                    className="border border-[var(--line)] bg-white px-3 text-[12.5px]"
                  >
                    {copied ? "הועתק" : "להעתיק"}
                  </button>
                </div>
              )}
              {flow.openLink && !link && (
                <p className="text-[11.5px] text-[var(--muted)] mt-1">כבר נוצר לה קישור {ago(flow.openLink)}, ועוד לא נכנסה.</p>
              )}
            </div>
          )}

          {flow.events.length > 0 && (
            <ol className="mt-3 flex flex-col" data-testid="login-events">
              {flow.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-2.5 py-1.5 border-t border-[var(--sand)] first:border-t-0 items-start" data-kind={e.kind}>
                  <span className="w-2 h-2 mt-[7px] shrink-0" style={{ background: TONE_BG[e.tone] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug">
                      {e.label}
                      {e.detail && <span className="text-[var(--muted)]"> · {e.detail}</span>}
                    </span>
                    <span className="block text-[11.5px] text-[var(--muted)] tabular-nums">
                      {clock(e.at)}
                      {e.client && ` · ${e.client}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {flow.notFound && (
            <p className="text-[12.5px] text-[var(--muted)] mt-2">לא נמצא שום ניסיון כניסה למספר הזה ב-30 הימים האחרונים.</p>
          )}
        </div>
      )}
    </section>
  );
}
