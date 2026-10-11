"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { displayPhone } from "@/lib/phone";
import { loginLinkWhatsapp } from "./no-sms-login";

/**
 * טאב "כניסות" בחמ"ל — הכל על מי שמנסה להיכנס, במקום אחד.
 *
 * מרינה: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין קשה לי
 * לתת להם מענה כי אין לי פלואו רציף." ואחר כך: "צריך לשפר את האדמין, יש שם
 * כפילויות". קודם היו כאן שלושה כרטיסים על אותן ילדות ("כניסות", "לא
 * מצליחים להיכנס", "כניסה בלי סמס"). עכשיו:
 *   • שורת מצב ל-24 שעות, ובאנר אדום כשהספק נכשל אצל כמה מספרים ביחד.
 *   • רשימה אחת של "צריכות עזרה" (יומן הכניסות + phone_otps, בשרת), ולכל
 *     שורה: מה קרה, ציר זמן, וקישור כניסה בוואטסאפ.
 *   • חיפוש מספר (גם חלקי, וגם מספר לא תקין שהוקלד) → ציר זמן + מה עושים.
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
type Need = {
  phone: string;
  valid: boolean;
  headline: string;
  action: string;
  lastAt: string;
  requests: number | null;
  wrongCodes: number | null;
  helpAt: string | null;
  linkSentAt: string | null;
  store: { name: string } | null;
};
type Overview = {
  missing?: boolean;
  health: { hours: number; tried: number; entered: number; smsFailed: number; wrong: number } | null;
  outage: { reason: string; phones: number; lastAt: string } | null;
  needHelp: Need[];
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
const isReal = (p: string) => /^972\d{9}$/.test(p);

/** יצירת קישור כניסה + שליחה בוואטסאפ. אותו רכיב בשורה וברשימה ובציר. */
function LinkActions({
  phone,
  label,
  testids,
  onMinted,
  secondary = false,
}: {
  phone: string;
  label: string;
  testids: { mint: string; whatsapp: string };
  onMinted?: () => void;
  secondary?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, for: "store" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.url) return setErr(d?.error ?? "יצירת הקישור נכשלה");
      setUrl(d.url);
      onMinted?.();
    } finally {
      setBusy(false);
    }
  }

  if (url)
    return (
      <div className="flex gap-2">
        <a
          href={loginLinkWhatsapp(phone, url)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={testids.whatsapp}
          className="flex-1 text-center bg-[var(--whatsapp)] text-white px-3 py-2.5 text-[13px] font-bold"
        >
          לשלוח בוואטסאפ
        </a>
        <button
          onClick={() =>
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }, () => {})
          }
          className="border border-[var(--line)] bg-white px-3 text-[12.5px]"
        >
          {copied ? "הועתק" : "להעתיק"}
        </button>
      </div>
    );
  return (
    <>
      <button
        onClick={mint}
        disabled={busy}
        data-testid={testids.mint}
        className={
          secondary
            ? "w-full min-h-11 text-[12.5px] underline text-[var(--muted)] disabled:opacity-50"
            : "w-full bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold disabled:opacity-50"
        }
      >
        {busy ? "רגע…" : label}
      </button>
      {err && <p role="alert" className="text-[12px] text-[var(--danger)] mt-1">{err}</p>}
    </>
  );
}

export default function LoginFlow() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [q, setQ] = useState("");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/login-flow", { cache: "no-store" }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    if (d) {
      setOv(d);
      setMissing(!!d.missing);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const search = useCallback(async (value: string) => {
    const phone = value.trim();
    if (!phone) return;
    setSearching(true);
    setErr("");
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
      setTimeout(() => timeline.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } finally {
      setSearching(false);
    }
  }, []);

  const openTimeline = (phone: string) => {
    setQ(isReal(phone) ? displayPhone(phone) : phone);
    search(phone);
  };

  const h = ov?.health;
  const needHelp = ov?.needHelp ?? [];
  const validPhone = !!flow && isReal(flow.phone);

  return (
    <div className="flex flex-col gap-3" data-testid="login-flow">
      {/* ── מצב ── */}
      <section className="bg-white border border-[var(--line)] p-3">
        <h2 className="text-sm font-bold">כניסות</h2>
        {h && (
          <p className="text-[12.5px] text-[var(--muted)] mt-0.5" data-testid="login-health">
            {h.hours} שעות אחרונות: ניסו {h.tried} · נכנסו {h.entered}
            {h.smsFailed > 0 && ` · הסמס נכשל ${h.smsFailed}`}
            {h.wrong > 0 && ` · קוד שגוי ${h.wrong}`}
          </p>
        )}
        {missing && (
          <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed" data-testid="login-flow-missing">
            יומן הכניסות עוד לא פעיל (מיגרציה 0063). עד אז הרשימה מבוססת רק על בקשות קוד.
          </p>
        )}
        {ov?.outage && (
          <div role="alert" className="mt-2 bg-[var(--danger-bg)] border border-[var(--danger-line)] text-[var(--danger)] p-2.5 text-[12.5px] leading-relaxed" data-testid="login-outage">
            <b>הספק לא שולח סמסים:</b> {ov.outage.reason}, אצל {ov.outage.phones} מספרים בשעה האחרונה ({ago(ov.outage.lastAt)}).
            זו תקלה כללית ולא של ילדה אחת — לשלוח לכולן קישור כניסה, ולבדוק את החשבון ב-sms4free.
          </div>
        )}
      </section>

      {/* ── צריכות עזרה: רשימה אחת ── */}
      <section className="bg-white border border-[var(--line)] p-3" data-testid="stuck-logins">
        <h2 className="text-sm font-bold">
          צריכות עזרה עכשיו
          {needHelp.length > 0 && (
            <span className="bg-[var(--danger)] text-white text-[11px] px-1.5 py-0.5 mr-1.5">{needHelp.length}</span>
          )}
        </h2>
        {ov && needHelp.length === 0 && (
          <p className="text-[12.5px] text-[var(--muted)] mt-1">אף אחת לא תקועה עכשיו.</p>
        )}
        <div className="flex flex-col mt-1">
          {needHelp.map((n) => (
            <div key={n.phone} data-testid="stuck-row" data-phone={n.phone} className="border-t border-[var(--line)] first:border-t-0 py-2.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold" dir="ltr" style={{ textAlign: "right" }}>
                    {n.valid ? displayPhone(n.phone) : `${n.phone} (לא תקין)`}
                  </div>
                  <div className="text-[12px] text-[var(--muted)]">
                    {n.store ? n.store.name : "עוד בלי דוכן"}
                    {n.requests ? ` · ${n.requests} בקשות קוד` : ""}
                    {n.wrongCodes ? ` · ${n.wrongCodes} קוד שגוי` : ""}
                    {" · "}
                    {ago(n.lastAt)}
                  </div>
                  <div className="text-[12.5px] mt-1 leading-snug" data-testid="stuck-headline">{n.headline}</div>
                  {n.helpAt && (
                    <div className="inline-block mt-1 bg-[var(--danger)] text-white text-[11.5px] font-bold px-1.5 py-0.5" data-testid="stuck-help">
                      לחצה &quot;לא קיבלתי קוד&quot; {ago(n.helpAt)}
                    </div>
                  )}
                  {n.linkSentAt && (
                    <div className="text-[11.5px] text-[var(--wood)] mt-0.5" data-testid="stuck-link-sent">
                      כבר נוצר קישור {ago(n.linkSentAt)} · עוד לא נכנסה
                    </div>
                  )}
                </div>
                <button
                  onClick={() => openTimeline(n.phone)}
                  data-testid="stuck-timeline"
                  className="shrink-0 border border-[var(--line)] bg-white px-2.5 py-2 text-[12px]"
                >
                  ציר זמן
                </button>
              </div>
              {n.valid && (
                <LinkActions
                  phone={n.phone}
                  label={n.linkSentAt ? "קישור כניסה חדש" : "ליצור קישור כניסה"}
                  testids={{ mint: "stuck-mint", whatsapp: "stuck-whatsapp" }}
                  onMinted={() => setTimeout(loadOverview, 1500)}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── חיפוש מספר + ציר זמן ── */}
      <section className="bg-white border border-[var(--line)] p-3">
        <h2 className="text-sm font-bold">חיפוש מספר</h2>
        <p className="text-[12px] text-[var(--muted)] mt-0.5">מה קרה לה בכל שלב, ומה עושים. גם חלקי, וגם כפי שהוקלד.</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="חיפוש מספר בכניסות"
            placeholder="למשל 052-1234567 או 4567"
            inputMode="tel"
            className="flex-1 min-w-0 border border-[var(--line)] px-3 py-2.5 text-[13px]"
            data-testid="login-search-input"
          />
          <button
            disabled={searching || !q.trim()}
            className="shrink-0 bg-[var(--ink)] text-white px-4 text-[13px] font-bold disabled:opacity-50"
            data-testid="login-search"
          >
            {searching ? "רגע…" : "חיפוש"}
          </button>
        </form>
        {err && <p role="alert" className="text-[12px] text-[var(--danger)] mt-1.5">{err}</p>}

        {candidates && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="login-candidates">
            <span className="text-[12px] text-[var(--muted)] w-full">כמה מספרים מתאימים:</span>
            {candidates.map((c) => (
              <button key={c} onClick={() => openTimeline(c)} className="border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]" dir="ltr">
                {isReal(c) ? displayPhone(c) : c}
              </button>
            ))}
          </div>
        )}

        {flow && (
          <div ref={timeline} className="mt-3 border-t border-[var(--line)] pt-3 scroll-mt-16" data-testid="login-timeline">
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

            {/* קישור כניסה — ראשי כשהאבחון אומר "קישור", ובכל מקרה אפשרי למספר תקין */}
            {validPhone && (
              <div className="mt-2" key={flow.phone}>
                <LinkActions
                  phone={flow.phone}
                  label={flow.openLink ? "קישור כניסה חדש" : flow.diagnosis.action === "link" ? "ליצור קישור כניסה" : "ליצור קישור כניסה בכל זאת"}
                  testids={{ mint: "login-mint", whatsapp: "login-whatsapp" }}
                  secondary={flow.diagnosis.action !== "link"}
                  onMinted={() => setTimeout(loadOverview, 1500)}
                />
                {flow.openLink && (
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
    </div>
  );
}
