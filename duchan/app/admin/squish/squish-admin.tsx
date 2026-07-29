"use client";

import { useCallback, useEffect, useState } from "react";
import { REPORT_REASONS } from "@/lib/squish-trade";

/**
 * סקוויש קלאב — חמ"ל.
 *
 * **מה השתנה כאן ולמה.** המסך היה רשימות אחת מתחת לשנייה, וכשאין
 * דיווחים ואין טריידים תקועים — כלומר ברוב הימים — הוא היה שלושה
 * מלבנים לבנים ריקים. מסך שנראה ככה בימים טובים לא נפתח בימים רעים.
 *
 * הסדר עכשיו הוא סדר הדחיפות האמיתי: **פיילוט קודם**, כי שם יושבת
 * ילדה מול מסך *עכשיו* ואפשר לאבד אותה בדקה. דיווחים וטריידים תקועים
 * הם דברים שקורים פעם בשבוע ואפשר לטפל בהם בערב.
 *
 * מה שאין כאן במכוון: טלפונים, מדיה, שמות פריטים. זה מד לחץ תפעולי,
 * לא מסך מעקב אחרי ילדה.
 */

const ITEM_REASON_LABELS: Record<string, string> = {
  not_squishy: "לא סקווישי",
  inappropriate: "תוכן לא מתאים",
  someone_elses_photo: "תמונה של מישהי אחרת",
  shows_a_person: "מופיע בה אדם",
  other: "אחר",
};
const TRADE_REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));
const STATE_LABEL: Record<string, string> = { open: "פתוח", reviewed: "נבדק", resolved: "טופל" };

/** מצב הפיילוט — תווית וצבע במקום אחד, כדי ששני מקומות לא יתפצלו. */
const PILOT_STATUS: Record<string, { label: string; tone: string }> = {
  onboarding:      { label: "בונה אוסף",          tone: "bg-[var(--sub)] text-[var(--ink)]" },
  building:        { label: "בונה אוסף",          tone: "bg-[var(--sub)] text-[var(--ink)]" },
  awaiting_parent: { label: "מחכה לאישור הורה",   tone: "bg-[var(--warn-bg)] text-[var(--warn-ink)]" },
  approved:        { label: "מאושר",              tone: "bg-[var(--ok-bg)] text-[var(--ok-ink)]" },
  stalled:         { label: "נעצרה באמצע",        tone: "bg-[var(--warn-bg)] text-[var(--warn-ink)]" },
  write_error:     { label: "הייתה שגיאת שמירה",  tone: "bg-[var(--danger-bg)] text-[var(--danger)]" },
};

interface Report {
  kind: "trade" | "item"; id: string; targetId: string; reporter: string; reported: string;
  reportedUser: string | null; reason: string; details: string | null; state: string;
  admin_note: string | null; created_at: string;
}
interface Repeat { user_id: string; nickname: string; code: string | null; reports: number; suspended: boolean }
interface Stuck {
  id: string; sender: string; receiver: string; reserved_at: string;
  items: { name: string; now: string; back_to: string }[];
}
interface Account { user_id: string; nickname: string; code: string; suspended_at: string; reason: string | null }
interface Action { id: string; admin_label: string; action: string; target: string; note: string | null; created_at: string }
interface Data { reports: Report[]; repeat: Repeat[]; stuck: Stuck[]; accounts: Account[]; actions: Action[] }
interface Pilot {
  userId: string; nickname: string; startedAt: string | null; status: string;
  onboardingCompleted: boolean; items: number; failedWrites: number; lastSavedAt: string | null;
  parentApprovedAt: string | null; parentRequestSentAt: string | null; parentLink: string | null;
  childDeclaredAt: string | null;
}
type Filter = "open" | "reviewed" | "resolved" | "all";

const time = (s: string | null) => (s ? new Date(s).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—");
const dateTime = (s: string) => new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const daysSince = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 86400000);

export default function SquishAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [pilots, setPilots] = useState<Pilot[] | null>(null);
  const [schema, setSchema] = useState<{ ok: boolean; missingColumns?: string[]; missingFunctions?: string[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [newLink, setNewLink] = useState("");
  const [openPilot, setOpenPilot] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/admin/squish"),
        fetch("/api/admin/squish-pilot"),
        fetch("/api/squish/preflight"),
      ]);
      if (!a.ok) throw new Error("moderation");
      setData(await a.json());
      setPilots(b.ok ? (await b.json()).pilots ?? [] : []);
      setSchema(c.ok ? await c.json() : null);
    } catch {
      setErr("לא הצלחנו לטעון את החמ\"ל");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const show = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy("act");
    const r = await fetch("/api/admin/squish", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy("");
    if (!r.ok) return show("הפעולה נכשלה");
    show(ok);
    await load();
  }

  async function pilotAct(body: Record<string, unknown>) {
    setBusy(String(body.action));
    const r = await fetch("/api/admin/squish-pilot", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    setBusy("");
    if (!r.ok) { show("הפעולה נכשלה"); return null; }
    await load();
    return d;
  }

  async function mintLink() {
    const d = await pilotAct({ action: "link" });
    if (d?.url) {
      setNewLink(d.url);
      navigator.clipboard?.writeText(d.url).catch(() => {});
      show("הקישור הועתק");
    }
  }

  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    show(msg);
  };

  if (err) {
    return (
      <Shell>
        <Empty title="לא הצלחנו לטעון" body={err} action={{ label: "לנסות שוב", onClick: load }} />
      </Shell>
    );
  }
  if (!data || !pilots) {
    return <Shell><p className="t-small text-[var(--muted)] py-10 text-center">רגע…</p></Shell>;
  }

  const reports = data.reports.filter((r) => filter === "all" || r.state === filter);
  const openReports = data.reports.filter((r) => r.state === "open").length;
  const awaitingParent = pilots.filter((p) => !p.parentApprovedAt).length;
  const finished = pilots.filter((p) => p.onboardingCompleted).length;

  return (
    <Shell>
      {schema && !schema.ok && (
        <div data-testid="schema-warning" className="bg-[var(--danger)] text-white p-3.5 text-[13px] leading-relaxed">
          <div className="font-bold">הדאטהבייס מפגר אחרי הקוד</div>
          <p className="opacity-90 mt-1">סקוויש קלאב עלול להיכשל בשקט עד שמריצים את המיגרציות החסרות.</p>
          <p className="opacity-80 mt-1.5 text-[12px]" dir="ltr">
            {[...(schema.missingColumns ?? []), ...(schema.missingFunctions ?? [])].slice(0, 8).join(" · ")}
          </p>
        </div>
      )}

      {/* ── כותרת ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold leading-tight">סקוויש קלאב — חמ״ל</h1>
          <p className="t-small text-[var(--muted)] mt-0.5">פיילוט, בטיחות וטריידים במקום אחד</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} aria-label="רענון" className="border border-[var(--line)] bg-white px-2.5 py-2 text-[12.5px]">
            ↻
          </button>
          <a href="/squish" className="border border-[var(--line)] bg-white px-3 py-2 text-[12.5px]">
            פתיחת סקוויש קלאב
          </a>
          <button
            onClick={mintLink}
            disabled={busy === "link"}
            data-testid="pilot-link"
            className="bg-[var(--lavender)] text-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50"
          >
            {busy === "link" ? "רגע…" : "+ קישור פיילוט חדש"}
          </button>
        </div>
      </header>

      {newLink && (
        <div className="bg-white border-[1.5px] border-[var(--lavender)] p-3">
          <div className="text-[12.5px] font-medium">הועתק. שהילדה תפתח אותו לפני שהיא מתחילה.</div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1 break-all" dir="ltr">{newLink}</div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1">
            חד-פעמי · תקף שבוע · נצמד לחשבון הראשון שמאמת דרכו
          </div>
        </div>
      )}

      {/* ── מספרים ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="משתמשות פיילוט" value={pilots.length} />
        <Stat label="סיימו אונבורדינג" value={finished} />
        <Stat label="מחכות לאישור הורה" value={awaitingParent} warn={awaitingParent > 0} />
        <Stat label="דיווחים פתוחים" value={openReports} warn={openReports > 0} />
        <Stat label="טריידים תקועים" value={data.stuck.length} warn={data.stuck.length > 0} />
      </div>

      {/* ── פיילוט, ראשון ── */}
      <Section title="סשני פיילוט" count={pilots.length}>
        {!pilots.length ? (
          <Empty
            title="אין סשן פיילוט פעיל"
            body="כדי להתחיל, מייצרים קישור חד-פעמי והילדה פותחת אותו לפני האונבורדינג."
            action={{ label: "+ קישור פיילוט חדש", onClick: mintLink }}
          />
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {pilots.map((p) => {
              const st = PILOT_STATUS[p.status] ?? PILOT_STATUS.building;
              return (
                <div key={p.userId} data-testid="pilot-card" className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="text-[14px]">{p.nickname}</b>
                      <div className="t-small text-[var(--muted)]">
                        {p.startedAt ? `התחילה ${time(p.startedAt)}` : "טרם התחילה"}
                      </div>
                    </div>
                    <span className={`text-[11.5px] font-medium px-2 py-1 ${st.tone}`}>{st.label}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center border-y border-[var(--line)] py-2">
                    <Mini label="סקווישים" value={String(p.items)} />
                    <Mini label="שמירה אחרונה" value={time(p.lastSavedAt)} />
                    <Mini label="שמירות שנכשלו" value={String(p.failedWrites)} bad={p.failedWrites > 0} />
                  </div>

                  <div className="t-small text-[var(--muted)] leading-relaxed">
                    {p.parentApprovedAt
                      ? `הורה אישר ${dateTime(p.parentApprovedAt)}`
                      : p.parentRequestSentAt
                        ? "בקשה נשלחה להורה, אין החלטה עדיין"
                        : "עוד לא נשלחה בקשה להורה"}
                    {p.childDeclaredAt && " · הילדה סימנה שההורה יודע"}
                  </div>

                  {openPilot === p.userId && (
                    <dl className="text-[12px] bg-[var(--sub)] p-2.5 flex flex-col gap-1">
                      <Row k="התחילה" v={p.startedAt ? dateTime(p.startedAt) : "—"} />
                      <Row k="סקווישים באוסף" v={String(p.items)} />
                      <Row k="שמירה מוצלחת אחרונה" v={p.lastSavedAt ? dateTime(p.lastSavedAt) : "אין עדיין"} />
                      <Row k="שמירות שנכשלו" v={String(p.failedWrites)} />
                      <Row k="הילדה סימנה שההורה יודע" v={p.childDeclaredAt ? dateTime(p.childDeclaredAt) : "לא"} />
                      <Row k="בקשה נשלחה להורה" v={p.parentRequestSentAt ? dateTime(p.parentRequestSentAt) : "לא נשלחה"} />
                      <Row k="אישור הורה" v={p.parentApprovedAt ? dateTime(p.parentApprovedAt) : "אין"} />
                    </dl>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setOpenPilot(openPilot === p.userId ? "" : p.userId)}
                      className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                    >
                      {openPilot === p.userId ? "סגירת פרטים" : "פתיחת פרטים"}
                    </button>
                    {p.parentLink && (
                      <button
                        onClick={() => copy(p.parentLink!, "קישור ההורה הועתק")}
                        className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                      >
                        העתקת קישור הורה
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`למחוק את כל אוסף הסקוויש של ${p.nickname}?\nחשבון הכניסה, הדוכנים וההזמנות לא ייגעו.`)) return;
                        const d = await pilotAct({ action: "reset", userId: p.userId });
                        if (d?.result) show(`נמחקו ${d.result.items_removed} · דוכנים ${d.result.stores_intact} · הזמנות ${d.result.orders_intact}`);
                      }}
                      disabled={busy === "reset"}
                      className="border border-[var(--danger-line)] text-[var(--danger)] px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                    >
                      איפוס פיילוט
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── דיווחים ── */}
      <Section
        title="דיווחים"
        count={openReports}
        right={
          <div className="flex gap-1">
            {(["open", "reviewed", "resolved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[12px] border ${
                  filter === f ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {f === "all" ? "הכל" : STATE_LABEL[f]}
              </button>
            ))}
          </div>
        }
      >
        {!reports.length ? (
          <Empty
            title={filter === "open" ? "אין דיווחים פתוחים" : "אין דיווחים בסינון הזה"}
            body={filter === "open" ? "נראה שהכול רגוע כרגע." : "אפשר לנסות סינון אחר."}
          />
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {reports.map((r) => (
              <div key={r.id} className="bg-white border border-[var(--line)] p-3 flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[11.5px] text-[var(--muted)]">
                  <span>{r.kind === "trade" ? "טרייד" : "פריט"} · {dateTime(r.created_at)}</span>
                  <span className="font-medium">{STATE_LABEL[r.state] ?? r.state}</span>
                </div>
                <div className="text-[13.5px]">
                  {r.reporter === "—" ? (
                    <>דיווח שנשאר אחרי מחיקת חשבון · על <b>{r.reported}</b></>
                  ) : (
                    <><b>{r.reporter}</b> דיווחה על <b>{r.reported}</b></>
                  )}
                </div>
                <div className="text-[13px]">
                  סיבה: {(r.kind === "trade" ? TRADE_REASON_LABELS[r.reason] : ITEM_REASON_LABELS[r.reason]) ?? "סיבה אחרת"}
                </div>
                {r.details && <div className="text-[12.5px] text-[var(--muted)] italic">&quot;{r.details}&quot;</div>}
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {(["open", "reviewed", "resolved"] as const).filter((s) => s !== r.state).map((s) => (
                    <button
                      key={s}
                      disabled={busy === "act"}
                      onClick={() => act({ action: "report_state", reportId: r.id, kind: r.kind, state: s }, "עודכן")}
                      className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                    >
                      לסמן {STATE_LABEL[s]}
                    </button>
                  ))}
                  {r.kind === "trade" && (
                    <button
                      disabled={busy === "act"}
                      onClick={() => act({ action: "cancel_trade", proposalId: r.targetId, note: `מדיווח ${r.id.slice(0, 8)}` }, "בוטל ושוחרר")}
                      className="border border-[var(--danger-line)] text-[var(--danger)] px-2.5 py-1.5 text-[12px]"
                    >
                      לבטל ולשחרר
                    </button>
                  )}
                  {r.reportedUser && (
                    <button
                      disabled={busy === "act"}
                      onClick={() => {
                        const note = prompt("סיבת ההשהיה (נשמרת ביומן):") ?? "";
                        if (note) act({ action: "suspend", userId: r.reportedUser, note }, "החשבון הושהה");
                      }}
                      className="border border-[var(--danger-line)] text-[var(--danger)] px-2.5 py-1.5 text-[12px]"
                    >
                      להשהות
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── טריידים תקועים ── */}
      <Section title="טריידים תקועים" count={data.stuck.length}>
        {!data.stuck.length ? (
          <Empty title="אין טריידים תקועים" body="כל מה ששמור עכשיו נשמר בשלושת הימים האחרונים." />
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {data.stuck.map((s) => (
              <div key={s.id} className="bg-white border border-[var(--line)] p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13.5px]"><b>{s.sender}</b> ↔ <b>{s.receiver}</b></div>
                  <span className="text-[11.5px] px-2 py-1 bg-[var(--warn-bg)] text-[var(--warn-ink)]">
                    {daysSince(s.reserved_at)} ימים
                  </span>
                </div>
                {/* מה בדיוק ישתחרר ולאן — כדי שלא יהיו הפתעות */}
                <div className="text-[12.5px] flex flex-col gap-0.5 border-t border-[var(--line)] pt-1.5">
                  {s.items.map((i, k) => (
                    <span key={k}>{i.name}: {i.now} → <b>{i.back_to}</b></span>
                  ))}
                </div>
                <button
                  disabled={busy === "act"}
                  onClick={() => {
                    const note = prompt("הערה לשחרור (נשמרת ביומן):") ?? "";
                    act({ action: "cancel_trade", proposalId: s.id, note }, "שוחרר");
                  }}
                  className="border border-[var(--line)] px-3 py-2 text-[12.5px] self-start"
                >
                  לשחרר את הטרייד
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {data.repeat.length > 0 && (
        <Section title="חשבונות עם יותר מדיווח אחד" count={data.repeat.length}>
          <div className="bg-white border border-[var(--line)] divide-y divide-[var(--line)]">
            {data.repeat.map((a) => (
              <div key={a.user_id} className="p-2.5 flex items-center gap-2 text-[13px]">
                <span className="flex-1"><b>{a.nickname}</b> · {a.reports} דיווחים
                  {a.suspended && <span className="text-[var(--danger)]"> · מושהית</span>}</span>
                {a.code && <a href={`/squish/c/${a.code}`} target="_blank" rel="noreferrer" className="text-[12px] underline">לאוסף</a>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.accounts.length > 0 && (
        <Section title="חשבונות מושהים" count={data.accounts.length}>
          <div className="bg-white border border-[var(--line)] divide-y divide-[var(--line)]">
            {data.accounts.map((a) => (
              <div key={a.user_id} className="p-2.5 flex items-center gap-2 text-[13px]">
                <span className="flex-1"><b>{a.nickname}</b>{a.reason && <span className="text-[var(--muted)]"> · {a.reason}</span>}</span>
                <button
                  disabled={busy === "act"}
                  onClick={() => act({ action: "restore", userId: a.user_id }, "החשבון הוחזר")}
                  className="border border-[var(--line)] px-3 py-1.5 text-[12px]"
                >
                  להחזיר
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── יומן, ציר זמן דחוס ── */}
      <Section title="יומן פעולות" count={data.actions.length}>
        {!data.actions.length ? (
          <Empty title="עוד לא נעשו פעולות" body="כל פעולה מהמסך הזה תירשם כאן." />
        ) : (
          <ol className="bg-white border border-[var(--line)] divide-y divide-[var(--line)]">
            {data.actions.slice(0, 8).map((a) => (
              <li key={a.id} className="px-3 py-1.5 flex gap-2 text-[12.5px] items-baseline">
                <span className="text-[var(--faint)] tabular-nums shrink-0">{dateTime(a.created_at)}</span>
                <span className="font-medium shrink-0">{a.action}</span>
                <span className="text-[var(--muted)] truncate">{a.target}{a.note && ` · ${a.note}`}</span>
              </li>
            ))}
          </ol>
        )}
        {data.actions.length > 8 && (
          <p className="t-small text-[var(--faint)]">
            מוצגות שמונה האחרונות מתוך {data.actions.length}.
          </p>
        )}
      </Section>

      {toast && (
        <div className="fixed bottom-8 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </Shell>
  );
}

/* ══════════ חלקים ══════════ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <div className="max-w-[1200px] mx-auto p-4 md:p-6 flex flex-col gap-5 pb-16">{children}</div>
    </div>
  );
}

function Section({
  title, count, right, children,
}: { title: string; count?: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {typeof count === "number" && count > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 bg-[var(--sub)] text-[var(--muted)]">{count}</span>
        )}
        {right && <div className="mr-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="bg-white border border-[var(--line)] px-3 py-2.5">
      <div className={`text-[22px] font-bold leading-none ${warn ? "text-[var(--danger)]" : ""}`}>{value}</div>
      <div className="text-[11.5px] text-[var(--muted)] mt-1 leading-tight">{label}</div>
    </div>
  );
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className={`text-[14px] font-bold leading-none ${bad ? "text-[var(--danger)]" : ""}`}>{value}</div>
      <div className="text-[11px] text-[var(--muted)] mt-0.5">{label}</div>
    </div>
  );
}

/**
 * מצב ריק מעוצב, ולא מלבן לבן.
 *
 * ברוב הימים אין דיווחים ואין טריידים תקועים — וזה בדיוק המצב שהמסך
 * צריך להיראות בו טוב, אחרת מפסיקים להיכנס אליו.
 */
function Empty({
  title, body, action,
}: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="bg-white border border-dashed border-[var(--line)] px-4 py-6 text-center flex flex-col items-center gap-1">
      <div className="text-[13.5px] font-medium">{title}</div>
      <p className="text-[12.5px] text-[var(--muted)] max-w-sm leading-relaxed">{body}</p>
      {action && (
        <button onClick={action.onClick} className="mt-2 bg-[var(--lavender)] text-white px-3.5 py-2 text-[12.5px] font-bold">
          {action.label}
        </button>
      )}
    </div>
  );
}
